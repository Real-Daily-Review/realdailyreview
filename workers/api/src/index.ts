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

async function rateLimit(env: Env, key: string): Promise<boolean> {
  const limit = Number(env.RATE_LIMIT_PER_MIN || '5');
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - 60;
  const row = await env.DB.prepare('SELECT count, window_start FROM rate_limit WHERE key = ?').bind(key).first<{ count: number; window_start: number }>();
  if (!row || row.window_start < windowStart) {
    await env.DB.prepare('INSERT OR REPLACE INTO rate_limit (key, count, window_start) VALUES (?, 1, ?)').bind(key, now).run();
    return true;
  }
  if (row.count >= limit) return false;
  await env.DB.prepare('UPDATE rate_limit SET count = count + 1 WHERE key = ?').bind(key).run();
  return true;
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

  // TODO: send double-opt-in via Resend once RESEND_API_KEY is set.
  // For now, mark confirmed since we have no email-sending in Phase 0.
  await env.DB.prepare(`UPDATE subscribers SET status='confirmed', confirmed_at=strftime('%s','now') WHERE email=? AND status='pending'`).bind(email).run();

  return jsonResponse({ ok: true }, {}, env, req);
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

async function handleAdminFeedback(req: Request, env: Env): Promise<Response> {
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ') || auth.slice(7) !== env.ADMIN_TOKEN) {
    return jsonResponse({ error: 'unauthorized' }, { status: 401 }, env, req);
  }
  const r = await env.DB.prepare(
    `SELECT id, message, email, category, page_url, created_at, reviewed FROM feedback ORDER BY created_at DESC LIMIT 200`
  ).all();
  return jsonResponse({ feedback: r.results }, {}, env, req);
}

async function handleAdminStats(req: Request, env: Env): Promise<Response> {
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ') || auth.slice(7) !== env.ADMIN_TOKEN) {
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

async function handleAdminSubscribers(req: Request, env: Env): Promise<Response> {
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ') || auth.slice(7) !== env.ADMIN_TOKEN) {
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

    // Rate limit POSTs by IP
    if (req.method === 'POST') {
      const ok = await rateLimit(env, `${url.pathname}:${ipHash}`);
      if (!ok) return jsonResponse({ error: 'Rate limit. Slow down.' }, { status: 429 }, env, req);
    }

    if (req.method === 'POST' && url.pathname === '/api/subscribe') return handleSubscribe(req, env, ipHash, uaHash);
    if (req.method === 'POST' && url.pathname === '/api/feedback') return handleFeedback(req, env, ipHash, uaHash);
    if (req.method === 'GET' && url.pathname === '/api/admin/feedback') return handleAdminFeedback(req, env);
    if (req.method === 'GET' && url.pathname === '/api/admin/stats') return handleAdminStats(req, env);
    if (req.method === 'GET' && url.pathname === '/api/admin/subscribers') return handleAdminSubscribers(req, env);

    if (req.method === 'GET' && url.pathname === '/api/health') {
      return jsonResponse({ ok: true, time: new Date().toISOString() }, {}, env, req);
    }

    return jsonResponse({ error: 'not found' }, { status: 404 }, env, req);
  },
};
