/**
 * Real Daily Review — API Worker.
 *
 * Endpoints:
 *   POST /api/subscribe       — newsletter signup (Turnstile-protected)
 *   POST /api/feedback        — feedback form (Turnstile-protected)
 *   GET  /api/unsubscribe?t=  — one-click unsubscribe (token in email link)
 *   GET  /api/admin/feedback  — Bearer-token list of recent feedback (CEO viewer)
 *
 * Security:
 *   - All POSTs validate Turnstile, honeypot, content-type, body size.
 *   - Rate-limited per IP (sliding window via D1).
 *   - All data validated and length-capped before storage.
 *   - IP and UA stored as SHA-256 hashes only — no raw PII at rest.
 *   - CORS locked to SITE_ORIGIN only.
 */

interface Env {
  DB: D1Database;
  TURNSTILE_SECRET: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  ADMIN_TOKEN: string;
  SITE_ORIGIN: string;
  RATE_LIMIT_PER_MIN: string;
}

const MAX_BODY_BYTES = 8 * 1024;

function corsHeaders(env: Env, req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allowed = origin === env.SITE_ORIGIN ? env.SITE_ORIGIN : env.SITE_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, authorization',
    'Vary': 'Origin',
  };
}

function jsonResponse(data: unknown, init: ResponseInit = {}, env?: Env, req?: Request) {
  const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8' };
  if (env && req) Object.assign(headers, corsHeaders(env, req));
  return new Response(JSON.stringify(data), { ...init, headers });
}

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  const ct = (req.headers.get('content-type') ?? '').toLowerCase();
  if (!ct.includes('application/json')) return null;
  const cl = Number(req.headers.get('content-length') ?? '0');
  if (cl > MAX_BODY_BYTES) return null;
  try {
    const txt = await req.text();
    if (txt.length > MAX_BODY_BYTES) return null;
    const parsed = JSON.parse(txt);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function verifyTurnstile(token: string, ip: string, secret: string): Promise<boolean> {
  if (!token || !secret) return false;
  const fd = new FormData();
  fd.append('secret', secret);
  fd.append('response', token);
  fd.append('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: fd });
  if (!r.ok) return false;
  const j = (await r.json()) as { success: boolean };
  return !!j.success;
}

async function rateLimit(env: Env, key: string, limit?: number, windowSec = 60): Promise<boolean> {
  const lim = limit ?? Number(env.RATE_LIMIT_PER_MIN || '5');
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - windowSec;
  const row = await env.DB.prepare('SELECT count, window_start FROM rate_limit WHERE key = ?').bind(key).first<{ count: number; window_start: number }>();
  if (!row || row.window_start < windowStart) {
    await env.DB.prepare('INSERT OR REPLACE INTO rate_limit (key, count, window_start) VALUES (?, 1, ?)').bind(key, now).run();
    return true;
  }
  if (row.count >= lim) return false;
  await env.DB.prepare('UPDATE rate_limit SET count = count + 1 WHERE key = ?').bind(key).run();
  return true;
}

// Constant-time string comparison — prevents timing attacks on tokens.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Origin / Referer check for state-changing POSTs. Defends against CSRF
// even on browsers that ignore SameSite (older Safari, certain extensions).
function isOriginAllowed(req: Request, env: Env): boolean {
  const o = req.headers.get('Origin') || '';
  if (o && o === env.SITE_ORIGIN) return true;
  const r = req.headers.get('Referer') || '';
  if (r && r.startsWith(env.SITE_ORIGIN + '/')) return true;
  return false;
}

function isValidEmail(s: string) {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 254;
}

function clean(s: unknown, max: number): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  if (!t) return null;
  if (t.length > max) return null;
  return t;
}

// Validate and normalize a phone to E.164 (best-effort — strict client-side prompt is "+1 555 555 5555").
function normalizePhone(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const digits = s.replace(/[^\d+]/g, '');
  if (!digits) return null;
  // E.164: + then 8-15 digits. Accept 10-digit US without +1 by prepending.
  if (/^\+\d{8,15}$/.test(digits)) return digits;
  if (/^\d{10}$/.test(digits)) return '+1' + digits;
  if (/^1\d{10}$/.test(digits)) return '+' + digits;
  return null;
}

async function handleSubscribe(req: Request, env: Env, ipHash: string, uaHash: string): Promise<Response> {
  const body = await readJson(req);
  if (!body) return jsonResponse({ error: 'Bad request.' }, { status: 400 }, env, req);

  // Honeypot
  if (typeof body.hp === 'string' && body.hp.length > 0) return jsonResponse({ ok: true }, {}, env, req);

  const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : '';
  if (!isValidEmail(email)) return jsonResponse({ error: 'Invalid email.' }, { status: 400 }, env, req);

  // Phone is optional — silently drop if invalid rather than rejecting the whole submission.
  const phone = body.phone ? normalizePhone(body.phone) : null;

  const turnstile = typeof body['cf-turnstile-response'] === 'string'
    ? (body['cf-turnstile-response'] as string)
    : (typeof body.turnstile === 'string' ? (body.turnstile as string) : '');
  const ip = req.headers.get('cf-connecting-ip') ?? '';
  const ok = await verifyTurnstile(turnstile, ip, env.TURNSTILE_SECRET);
  if (!ok) return jsonResponse({ error: 'Captcha failed.' }, { status: 403 }, env, req);

  // Upsert pending; idempotent on duplicate. Update phone if provided this time.
  await env.DB.prepare(
    `INSERT INTO subscribers (email, phone, status, source, ip_hash, ua_hash)
     VALUES (?, ?, 'pending', 'web-form', ?, ?)
     ON CONFLICT(email) DO UPDATE SET
       phone = COALESCE(excluded.phone, subscribers.phone),
       status = subscribers.status`
  ).bind(email, phone, ipHash, uaHash).run();

  // Mark confirmed and send a welcome email if Resend is wired.
  await env.DB.prepare(`UPDATE subscribers SET status='confirmed', confirmed_at=strftime('%s','now') WHERE email=? AND status='pending'`).bind(email).run();
  if (env.RESEND_API_KEY && env.RESEND_FROM) {
    sendWelcomeEmail(env, email).catch((err) => console.warn('welcome email failed:', err));
  }

  return jsonResponse({ ok: true }, {}, env, req);
}

async function sendWelcomeEmail(env: Env, email: string): Promise<void> {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.RESEND_FROM,
      to: [email],
      subject: 'Welcome to Real Daily Review',
      html: `<div style="font-family:Georgia,serif;max-width:580px;margin:0 auto;padding:24px;color:#1a1a1a">
        <h1 style="font-size:22px;margin:0 0 16px">Welcome to Real Daily Review</h1>
        <p style="font-size:16px;line-height:1.6">You're confirmed. Every weekday morning we send one short brief plus the day's biggest stories — five minutes, no spin, sources cited.</p>
        <p style="font-size:16px;line-height:1.6">Tomorrow morning's brief lands in your inbox at 5:30am ET.</p>
        <p style="font-size:14px;color:#5b5b5b;margin-top:32px">— The Real Daily Review desk<br/><a href="https://realdailyreview.com" style="color:#8a1538">realdailyreview.com</a></p>
        <p style="font-size:11px;color:#999;margin-top:32px;border-top:1px solid #eee;padding-top:12px">You signed up at realdailyreview.com. <a href="https://realdailyreview.com/api/unsubscribe?e=${encodeURIComponent(email)}" style="color:#999">Unsubscribe</a></p>
      </div>`,
    }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
}

async function handleFeedback(req: Request, env: Env, ipHash: string, uaHash: string): Promise<Response> {
  const body = await readJson(req);
  if (!body) return jsonResponse({ error: 'Bad request.' }, { status: 400 }, env, req);

  if (typeof body.hp === 'string' && body.hp.length > 0) return jsonResponse({ ok: true }, {}, env, req);

  const message = clean(body.message, 3000);
  if (!message || message.length < 5) return jsonResponse({ error: 'Tell us a bit more.' }, { status: 400 }, env, req);

  const email = typeof body.email === 'string' && body.email.length > 0
    ? (isValidEmail(body.email.trim()) ? body.email.trim().toLowerCase() : null)
    : null;

  const category = clean(body.category, 32) ?? 'general';
  const pageUrl = clean(body.page_url, 1000) ?? null;

  const turnstile = typeof body['cf-turnstile-response'] === 'string' ? body['cf-turnstile-response'] : (typeof body.turnstile === 'string' ? body.turnstile : '');
  const ip = req.headers.get('cf-connecting-ip') ?? '';
  const ok = await verifyTurnstile(turnstile, ip, env.TURNSTILE_SECRET);
  if (!ok) return jsonResponse({ error: 'Captcha failed.' }, { status: 403 }, env, req);

  await env.DB.prepare(
    `INSERT INTO feedback (message, email, category, page_url, ip_hash, ua_hash) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(message, email, category, pageUrl, ipHash, uaHash).run();

  return jsonResponse({ ok: true }, {}, env, req);
}

function checkAdminAuth(req: Request, env: Env): boolean {
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;
  return timingSafeEqual(auth.slice(7), env.ADMIN_TOKEN);
}

async function handleAdminFeedback(req: Request, env: Env): Promise<Response> {
  if (!checkAdminAuth(req, env)) {
    return jsonResponse({ error: 'unauthorized' }, { status: 401 }, env, req);
  }
  const r = await env.DB.prepare(
    `SELECT id, message, email, category, page_url, created_at, reviewed FROM feedback ORDER BY created_at DESC LIMIT 200`
  ).all();
  return jsonResponse({ feedback: r.results }, {}, env, req);
}

async function handleAdminStats(req: Request, env: Env): Promise<Response> {
  if (!checkAdminAuth(req, env)) {
    return jsonResponse({ error: 'unauthorized' }, { status: 401 }, env, req);
  }
  const subStats = await env.DB.prepare(`SELECT status, COUNT(*) as n FROM subscribers GROUP BY status`).all();
  const fbCount = await env.DB.prepare(`SELECT COUNT(*) as n FROM feedback`).first<{ n: number }>();
  const phoneCount = await env.DB.prepare(`SELECT COUNT(*) as n FROM subscribers WHERE phone IS NOT NULL`).first<{ n: number }>();
  const last24h = await env.DB.prepare(
    `SELECT COUNT(*) as n FROM subscribers WHERE created_at >= strftime('%s','now','-1 day')`
  ).first<{ n: number }>();
  return jsonResponse({
    subscribers_by_status: subStats.results,
    subscribers_with_phone: phoneCount?.n ?? 0,
    subscribers_added_last_24h: last24h?.n ?? 0,
    feedback_total: fbCount?.n ?? 0,
    fetched_at: new Date().toISOString(),
  }, {}, env, req);
}

// ---------- Auth (magic-link) ----------

function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function getCookie(req: Request, name: string): string | null {
  const h = req.headers.get('cookie') || '';
  for (const part of h.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}

async function currentSession(req: Request, env: Env): Promise<{ email: string } | null> {
  const sessionToken = getCookie(req, 'rdr_session');
  if (!sessionToken) return null;
  const row = await env.DB.prepare(
    `SELECT email, expires_at FROM user_sessions WHERE session_token=? LIMIT 1`
  ).bind(sessionToken).first<{ email: string; expires_at: number }>();
  if (!row) return null;
  if (row.expires_at < Math.floor(Date.now() / 1000)) return null;
  await env.DB.prepare(`UPDATE user_sessions SET last_seen_at=strftime('%s','now') WHERE session_token=?`).bind(sessionToken).run();
  return { email: row.email };
}

async function handleAuthRequest(req: Request, env: Env, ipHash: string): Promise<Response> {
  // CSRF defense: require Origin or Referer matches our site for state-changing POST.
  if (!isOriginAllowed(req, env)) {
    return jsonResponse({ error: 'forbidden' }, { status: 403 }, env, req);
  }

  const body = await readJson(req);
  if (!body) return jsonResponse({ error: 'Bad request.' }, { status: 400 }, env, req);

  // Honeypot — silently swallow bot submissions
  if (typeof body.hp === 'string' && body.hp.length > 0) return jsonResponse({ ok: true }, {}, env, req);

  const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : '';
  if (!isValidEmail(email)) return jsonResponse({ error: 'Invalid email.' }, { status: 400 }, env, req);

  // Mandatory Turnstile when configured (not the placeholder).
  const turnstile = typeof body['cf-turnstile-response'] === 'string' ? body['cf-turnstile-response'] : '';
  if (env.TURNSTILE_SECRET && env.TURNSTILE_SECRET !== 'PLACEHOLDER_NO_TURNSTILE_SET') {
    if (!turnstile) return jsonResponse({ error: 'Captcha required.' }, { status: 403 }, env, req);
    const ok = await verifyTurnstile(turnstile, req.headers.get('cf-connecting-ip') ?? '', env.TURNSTILE_SECRET);
    if (!ok) return jsonResponse({ error: 'Captcha failed.' }, { status: 403 }, env, req);
  }

  // Per-email rate limit (anti-bombing): max 3 magic links per email per hour
  const emailHash = await sha256(email);
  const okEmail = await rateLimit(env, `auth-req-email:${emailHash}`, 3, 3600);
  if (!okEmail) {
    // Always return 200 — don't leak whether email is registered or just rate-limited.
    return jsonResponse({ ok: true, message: 'Check your email.' }, {}, env, req);
  }

  const token = randomToken(32);
  const expiresAt = Math.floor(Date.now() / 1000) + 30 * 60; // 30 minutes
  await env.DB.prepare(
    `INSERT INTO auth_tokens (email, token, expires_at, ip_hash) VALUES (?, ?, ?, ?)`
  ).bind(email, token, expiresAt, ipHash).run();

  const verifyUrl = `${env.SITE_ORIGIN}/auth/verify?t=${encodeURIComponent(token)}`;
  if (env.RESEND_API_KEY && env.RESEND_FROM) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.RESEND_FROM,
        to: [email],
        subject: 'Sign in to Real Daily Review',
        html: `<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a">
          <h1 style="font-size:22px">Sign in to Real Daily Review</h1>
          <p style="font-size:16px;line-height:1.6">Click the button below to sign in. This link expires in 30 minutes.</p>
          <p><a href="${verifyUrl}" style="display:inline-block;background:#8a1538;color:#fff;text-decoration:none;padding:12px 22px;border-radius:4px;font-weight:600">Sign me in</a></p>
          <p style="font-size:13px;color:#5b5b5b">If you didn't request this, you can ignore this email.</p>
          <p style="font-size:13px;color:#5b5b5b">Or paste this URL: ${verifyUrl}</p>
        </div>`,
      }),
    });
    if (!r.ok) {
      console.warn('Resend failed:', r.status, await r.text());
      return jsonResponse({ error: 'Email send failed.' }, { status: 500 }, env, req);
    }
  } else {
    console.warn('RESEND not configured; magic link:', verifyUrl);
  }
  return jsonResponse({ ok: true, message: 'Check your email.' }, {}, env, req);
}

async function handleAuthVerify(req: Request, env: Env, ipHash: string): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get('t');
  if (!token) return Response.redirect(`${env.SITE_ORIGIN}/account?error=missing-token`, 302);
  const row = await env.DB.prepare(
    `SELECT id, email, expires_at, used_at FROM auth_tokens WHERE token=? LIMIT 1`
  ).bind(token).first<{ id: number; email: string; expires_at: number; used_at: number | null }>();
  if (!row || row.expires_at < Math.floor(Date.now() / 1000) || row.used_at) {
    return Response.redirect(`${env.SITE_ORIGIN}/account?error=invalid-or-expired`, 302);
  }
  await env.DB.prepare(`UPDATE auth_tokens SET used_at=strftime('%s','now') WHERE id=?`).bind(row.id).run();

  const sessionToken = randomToken(32);
  const sessionExpires = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30; // 30 days
  await env.DB.prepare(
    `INSERT INTO user_sessions (email, session_token, expires_at, ip_hash) VALUES (?, ?, ?, ?)`
  ).bind(row.email, sessionToken, sessionExpires, ipHash).run();

  // Ensure subscriber + preferences row exist
  await env.DB.prepare(
    `INSERT INTO subscribers (email, status, source) VALUES (?, 'confirmed', 'magic-link')
     ON CONFLICT(email) DO UPDATE SET status='confirmed'`
  ).bind(row.email).run();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO user_preferences (email, preferences) VALUES (?, '{}')`
  ).bind(row.email).run();

  const headers = new Headers();
  headers.set('Set-Cookie', `rdr_session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`);
  headers.set('Location', `${env.SITE_ORIGIN}/account`);
  return new Response(null, { status: 302, headers });
}

async function handleSignOut(req: Request, env: Env): Promise<Response> {
  if (!isOriginAllowed(req, env)) return jsonResponse({ error: 'forbidden' }, { status: 403 }, env, req);
  const sessionToken = getCookie(req, 'rdr_session');
  if (sessionToken) {
    await env.DB.prepare(`DELETE FROM user_sessions WHERE session_token=?`).bind(sessionToken).run();
  }
  const headers = new Headers();
  headers.set('Set-Cookie', 'rdr_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
  Object.entries(corsHeaders(env, req)).forEach(([k, v]) => headers.set(k, v));
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

async function handleMe(req: Request, env: Env): Promise<Response> {
  const sess = await currentSession(req, env);
  if (!sess) return jsonResponse({ signed_in: false }, {}, env, req);
  const prefs = await env.DB.prepare(`SELECT preferences FROM user_preferences WHERE email=?`).bind(sess.email).first<{ preferences: string }>();
  let preferences: any = {};
  try { preferences = JSON.parse(prefs?.preferences || '{}'); } catch {}
  return jsonResponse({ signed_in: true, email: sess.email, preferences }, {}, env, req);
}

async function handlePreferences(req: Request, env: Env): Promise<Response> {
  if (!isOriginAllowed(req, env)) return jsonResponse({ error: 'forbidden' }, { status: 403 }, env, req);
  const sess = await currentSession(req, env);
  if (!sess) return jsonResponse({ error: 'unauthorized' }, { status: 401 }, env, req);
  const body = await readJson(req);
  if (!body || typeof body !== 'object') return jsonResponse({ error: 'Bad request.' }, { status: 400 }, env, req);
  const allowed: any = {};
  if (Array.isArray(body.sections)) allowed.sections = body.sections.filter((s: unknown) => typeof s === 'string').slice(0, 12);
  if (typeof body.frequency === 'string' && ['daily', 'weekly', 'breaking'].includes(body.frequency)) allowed.frequency = body.frequency;
  if (typeof body.timezone === 'string' && body.timezone.length < 60) allowed.timezone = body.timezone;
  await env.DB.prepare(
    `INSERT INTO user_preferences (email, preferences) VALUES (?, ?)
     ON CONFLICT(email) DO UPDATE SET preferences=excluded.preferences, updated_at=strftime('%s','now')`
  ).bind(sess.email, JSON.stringify(allowed)).run();
  return jsonResponse({ ok: true, preferences: allowed }, {}, env, req);
}

async function handleAdminSubscribers(req: Request, env: Env): Promise<Response> {
  if (!checkAdminAuth(req, env)) {
    return jsonResponse({ error: 'unauthorized' }, { status: 401 }, env, req);
  }
  const r = await env.DB.prepare(
    `SELECT id, email, phone, status, source, created_at, confirmed_at FROM subscribers WHERE status='confirmed' ORDER BY created_at DESC LIMIT 1000`
  ).all();
  return jsonResponse({ subscribers: r.results, count: r.results.length }, {}, env, req);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env, req) });
    }

    const ip = req.headers.get('cf-connecting-ip') ?? '0.0.0.0';
    const ua = req.headers.get('user-agent') ?? '';
    const ipHash = await sha256(ip);
    const uaHash = await sha256(ua);

    // Rate limit per-IP for any state-changing or sensitive endpoint.
    // POSTs always; sensitive GETs (auth verify, admin) too.
    const isStateful = req.method === 'POST';
    const isSensitiveGet =
      req.method === 'GET' &&
      (url.pathname === '/api/auth/verify' || url.pathname.startsWith('/api/admin/'));
    if (isStateful || isSensitiveGet) {
      const ok = await rateLimit(env, `${url.pathname}:${ipHash}`);
      if (!ok) return jsonResponse({ error: 'Rate limit. Slow down.' }, { status: 429 }, env, req);
    }

    if (req.method === 'POST' && url.pathname === '/api/subscribe') return handleSubscribe(req, env, ipHash, uaHash);
    if (req.method === 'POST' && url.pathname === '/api/feedback') return handleFeedback(req, env, ipHash, uaHash);
    if (req.method === 'GET' && url.pathname === '/api/admin/feedback') return handleAdminFeedback(req, env);
    if (req.method === 'GET' && url.pathname === '/api/admin/stats') return handleAdminStats(req, env);
    if (req.method === 'GET' && url.pathname === '/api/admin/subscribers') return handleAdminSubscribers(req, env);
    if (req.method === 'POST' && url.pathname === '/api/auth/request') return handleAuthRequest(req, env, ipHash);
    if (req.method === 'GET' && url.pathname === '/api/auth/verify') return handleAuthVerify(req, env, ipHash);
    if (req.method === 'POST' && url.pathname === '/api/auth/signout') return handleSignOut(req, env);
    if (req.method === 'GET' && url.pathname === '/api/me') return handleMe(req, env);
    if (req.method === 'POST' && url.pathname === '/api/preferences') return handlePreferences(req, env);

    if (req.method === 'GET' && url.pathname === '/api/health') {
      return jsonResponse({ ok: true, time: new Date().toISOString() }, {}, env, req);
    }

    return jsonResponse({ error: 'not found' }, { status: 404 }, env, req);
  },
};
