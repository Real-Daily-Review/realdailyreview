#!/usr/bin/env node
/**
 * Daily newsletter blast.
 *
 * 1. Pulls today's digest article (section: digest, today's pubDate) from the
 *    repo. If no digest yet today, exits — we only blast on a confirmed digest.
 * 2. Pulls the confirmed subscriber list from /api/admin/subscribers.
 * 3. Sends each subscriber an HTML email via Resend (free tier, 100/day).
 * 4. Writes a delivery log to ops/newsletter/<date>.json.
 *
 * Required env:
 *   RESEND_API_KEY    — from resend.com (free tier, no card)
 *   RESEND_FROM       — verified sender, e.g. 'brief@realdailyreview.com'
 *   ADMIN_TOKEN       — Worker admin token (RDR_ADMIN_TOKEN secret)
 *
 * If RESEND_API_KEY is missing, exits cleanly. Worker collects subs forever;
 * the moment Resend is wired, this fires on the next cron and sends the
 * accumulated audience their first email.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const ARTICLES_DIR = path.resolve('src/content/articles');
const NEWSLETTER_DIR = path.resolve('ops/newsletter');
const SITE_HOST = process.env.SITE_HOST || 'realdailyreview.com';

async function todaysDigest() {
  const files = (await fs.readdir(ARTICLES_DIR).catch(() => [])).filter((f) => f.endsWith('.md'));
  const today = new Date().toISOString().slice(0, 10);
  for (const f of files.filter((f) => f.startsWith(today))) {
    const raw = await fs.readFile(path.join(ARTICLES_DIR, f), 'utf8');
    const { data, content } = matter(raw);
    if (data.section === 'digest') return { slug: f.replace(/\.md$/, ''), data, body: content };
  }
  return null;
}

async function recentStandalones(limit = 6) {
  const files = (await fs.readdir(ARTICLES_DIR).catch(() => [])).filter((f) => f.endsWith('.md'));
  const today = new Date().toISOString().slice(0, 10);
  const out = [];
  for (const f of files.filter((f) => f.startsWith(today)).sort().reverse()) {
    if (out.length >= limit) break;
    const raw = await fs.readFile(path.join(ARTICLES_DIR, f), 'utf8');
    const { data } = matter(raw);
    if (data.section !== 'digest') {
      out.push({ slug: f.replace(/\.md$/, ''), title: data.title, description: data.description, section: data.section });
    }
  }
  return out;
}

async function fetchSubscribers(adminToken) {
  const r = await fetch(`https://${SITE_HOST}/api/admin/subscribers`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (!r.ok) throw new Error(`admin/subscribers ${r.status}`);
  const j = await r.json();
  return j.subscribers || [];
}

function renderEmail({ digest, standalones }) {
  const digestUrl = `https://${SITE_HOST}/articles/${digest.slug}`;
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const standaloneList = standalones.map((s) => {
    const url = `https://${SITE_HOST}/articles/${s.slug}`;
    return `<li style="margin-bottom:14px"><a href="${url}" style="color:#8a1538;font-weight:600;text-decoration:none">${escapeHtml(s.title)}</a><br><span style="color:#5b5b5b;font-size:14px">${escapeHtml(s.description)}</span></li>`;
  }).join('');

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#fbfaf7">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#fbfaf7"><tr><td align="center" style="padding:24px 0">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;background:#ffffff;border:1px solid #e7e3da;border-radius:8px">
<tr><td style="padding:24px 32px;border-bottom:2px solid #1a1a1a">
  <a href="https://${SITE_HOST}" style="font-family:Georgia,serif;font-size:24px;font-weight:900;color:#1a1a1a;text-decoration:none;letter-spacing:-0.5px">Real Daily Review</a>
  <div style="font-family:-apple-system,Inter,sans-serif;font-size:11px;color:#5b5b5b;text-transform:uppercase;letter-spacing:0.1em;margin-top:4px">${today}</div>
</td></tr>
<tr><td style="padding:24px 32px;font-family:Georgia,serif;color:#1a1a1a">
  <h1 style="font-size:22px;font-weight:800;margin:0 0 12px;line-height:1.25">${escapeHtml(digest.data.title)}</h1>
  <p style="font-size:16px;color:#5b5b5b;line-height:1.6;margin:0 0 20px">${escapeHtml(digest.data.description)}</p>
  <a href="${digestUrl}" style="display:inline-block;background:#8a1538;color:#fff;text-decoration:none;padding:10px 20px;border-radius:4px;font-family:-apple-system,Inter,sans-serif;font-weight:600;font-size:14px">Read the full brief →</a>
</td></tr>
${standalones.length ? `<tr><td style="padding:0 32px 24px"><h2 style="font-family:-apple-system,Inter,sans-serif;font-size:13px;text-transform:uppercase;letter-spacing:0.1em;color:#8a1538;margin:24px 0 12px;border-top:1px solid #e7e3da;padding-top:18px">Also today</h2><ul style="list-style:none;padding:0;margin:0;font-family:Georgia,serif">${standaloneList}</ul></td></tr>` : ''}
<tr><td style="padding:24px 32px;background:#fbfaf7;border-top:1px solid #e7e3da;font-family:-apple-system,Inter,sans-serif;font-size:12px;color:#5b5b5b;text-align:center">
  <p style="margin:0 0 8px">You're subscribed to Real Daily Review.</p>
  <p style="margin:0"><a href="https://${SITE_HOST}/api/unsubscribe?e={{EMAIL}}" style="color:#5b5b5b">Unsubscribe</a> · <a href="https://${SITE_HOST}" style="color:#5b5b5b">Web</a></p>
</td></tr>
</table>
</td></tr></table></body></html>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

async function sendOne({ apiKey, from, to, subject, html }) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html: html.replace('{{EMAIL}}', encodeURIComponent(to)) }),
  });
  return { ok: r.ok, status: r.status, body: r.ok ? null : await r.text() };
}

async function main() {
  await fs.mkdir(NEWSLETTER_DIR, { recursive: true });
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || 'Real Daily Review <brief@realdailyreview.com>';
  const adminToken = process.env.ADMIN_TOKEN;

  if (!apiKey) {
    console.log('[newsletter] RESEND_API_KEY not set — skipping. Subscribe form still collects emails.');
    return;
  }
  if (!adminToken) {
    console.log('[newsletter] ADMIN_TOKEN not set — cannot fetch subscribers');
    return;
  }
  const digest = await todaysDigest();
  if (!digest) {
    console.log('[newsletter] no digest article today yet — skipping');
    return;
  }
  const standalones = await recentStandalones(6);
  const subs = await fetchSubscribers(adminToken);
  console.log(`[newsletter] ${subs.length} confirmed subscribers; sending today's digest…`);

  const html = renderEmail({ digest, standalones });
  const subject = digest.data.title;
  const results = [];
  let succeeded = 0, failed = 0;
  for (const s of subs) {
    const res = await sendOne({ apiKey, from, to: s.email, subject, html });
    results.push({ email: s.email, ...res });
    if (res.ok) succeeded++; else failed++;
    // Resend free tier is 100/day; respect rate
    await new Promise((r) => setTimeout(r, 700));
  }
  const log = {
    date: new Date().toISOString().slice(0, 10),
    digest_slug: digest.slug,
    subject,
    audience_size: subs.length,
    succeeded,
    failed,
    failures: results.filter((r) => !r.ok).slice(0, 20),
  };
  await fs.writeFile(path.join(NEWSLETTER_DIR, `${log.date}.json`), JSON.stringify(log, null, 2), 'utf8');
  console.log(`[newsletter] sent ${succeeded}/${subs.length}; ${failed} failures logged`);
}

main().catch((err) => { console.error(err); process.exit(1); });
