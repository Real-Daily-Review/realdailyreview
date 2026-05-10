#!/usr/bin/env node
/**
 * Daily exec brief to the shareholder.
 *
 * Compiles last-24h state — what shipped (commits), traffic, subscribers,
 * social, queue health — runs through Anthropic for a tight CEO-style memo,
 * sends as HTML email via Resend.
 *
 * Required env:
 *   RESEND_API_KEY    — already in GH Actions Secrets
 *   RESEND_FROM       — e.g. 'Real Daily Review <brief@realdailyreview.com>'
 *   SHAREHOLDER_EMAIL — defaults to ryan@revv.com
 *   ANTHROPIC_API_KEY — for the synthesis call
 *
 * Output: ops/exec-briefs/YYYY-MM-DD.md (committed) + email sent.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import Anthropic from '@anthropic-ai/sdk';

const ROOT = path.resolve('.');
const OUT_DIR = path.join(ROOT, 'ops/exec-briefs');
const SHAREHOLDER_EMAIL = process.env.SHAREHOLDER_EMAIL || 'ryan@revv.com';

function sh(cmd) { try { return execSync(cmd, { encoding: 'utf8' }).trim(); } catch { return ''; } }

async function readJson(p) { try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return null; } }

async function gather() {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const log = sh(`git log --since="${since}" --pretty=format:'%h | %ci | %an | %s' | grep -v '^$'`);
  const commits = log.split('\n').filter(Boolean).map((l) => {
    const [hash, iso, author, ...rest] = l.split(' | ');
    return { hash, iso, author, subject: rest.join(' | ') };
  });

  const articlesDir = path.join(ROOT, 'src/content/articles');
  const allArticles = (await fs.readdir(articlesDir).catch(() => [])).filter((f) => f.endsWith('.md'));
  const cutoff = Date.now() - 24 * 3600 * 1000;
  let articles24h = 0;
  for (const f of allArticles) {
    try {
      const stat = await fs.stat(path.join(articlesDir, f));
      if (stat.mtimeMs >= cutoff) articles24h++;
    } catch {}
  }

  const queue = await fs.readFile(path.join(ROOT, 'ops/queue.md'), 'utf8').catch(() => '');
  const qActive = (queue.match(/^- \[ \]/gm) || []).length;
  const qDone = (queue.match(/^- \[x\]/gm) || []).length;
  const needsShareholder = (queue.match(/\[NEEDS-SHAREHOLDER\]/g) || []).length;

  const metrics = await readJson(path.join(ROOT, 'ops/metrics/latest.json'));
  const bskyStatus = await readJson(path.join(ROOT, 'ops/social-posted/bluesky.json'));
  const bskyEng = await readJson(path.join(ROOT, 'ops/social-posted/bluesky-engagement.json'));

  return {
    date: new Date().toISOString().slice(0, 10),
    commits_24h_count: commits.length,
    commits_24h_sample: commits.slice(0, 12),
    articles_total: allArticles.length,
    articles_24h: articles24h,
    queue: { active: qActive, done: qDone, needs_shareholder: needsShareholder },
    subscribers: metrics?.subscribers ?? null,
    subs_added_24h: metrics?.subscribers_added_last_24h ?? 0,
    visits_7d: metrics?.cloudflare_web_analytics?.daily?.reduce((s, d) => s + (d.visits || 0), 0) || 0,
    pageviews_7d: metrics?.cloudflare_web_analytics?.daily?.reduce((s, d) => s + (d.pageviews || 0), 0) || 0,
    bluesky_total_posts: bskyStatus?.slugs?.length || 0,
    bluesky_top_post: bskyEng?.top10?.[0] || null,
    bluesky_strategy_perf: bskyEng?.by_strategy || null,
  };
}

async function aiBrief(snap) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = `You are Alex Reeve, CEO of Real Daily Review (an AI-driven daily news digest, day 5 since launch). Write the morning brief to the shareholder. Be tight, factual, no fluff. Lead with what changed, then numbers, then what needs them.

DATA:
${JSON.stringify(snap, null, 2)}

Format strictly (Markdown, ≤350 words total):

## What shipped in the last 24h
- bullet list, ≤7 items, most material first; describe what the change UNLOCKS, not just what was changed

## Numbers that matter
- subscribers (delta if any), visits, articles published, queue size, social reach. One line each.

## What's working
- 1-2 specific bullets backed by data

## What's NOT working
- 1-2 specific bullets, honest, with the experiment we'll try next

## Today's focus (top 3)
- 3 concrete deliverables I'm pushing to ship today, each tied to traffic / signups / revenue

## Shareholder asks (only if blocking — empty section is fine)
- bullet only items that need shareholder input today

End with one line: "— Alex"`;

  const r = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    temperature: 0.3,
    messages: [{ role: 'user', content: prompt }],
  });
  return r.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

function mdToHtml(md) {
  // Tiny safe markdown→HTML for our trusted CEO output.
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = md.split('\n');
  const out = [];
  let inList = false;
  for (const line of lines) {
    if (/^## /.test(line)) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h2 style="font-family:Georgia,serif;font-size:18px;font-weight:700;margin:24px 0 8px;color:#1a1a1a">${esc(line.slice(3))}</h2>`);
    } else if (/^[-*]\s+/.test(line)) {
      if (!inList) { out.push('<ul style="padding-left:20px;margin:0 0 8px">'); inList = true; }
      out.push(`<li style="margin:4px 0;line-height:1.55;color:#1a1a1a">${esc(line.replace(/^[-*]\s+/, ''))}</li>`);
    } else if (line.trim() === '') {
      if (inList) { out.push('</ul>'); inList = false; }
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<p style="margin:6px 0;line-height:1.55;color:#1a1a1a">${esc(line)}</p>`);
    }
  }
  if (inList) out.push('</ul>');
  return out.join('\n');
}

async function sendEmail({ subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || 'Real Daily Review <brief@realdailyreview.com>';
  if (!apiKey) {
    console.log('[exec-brief] RESEND_API_KEY missing — skipping send');
    return false;
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [SHAREHOLDER_EMAIL], subject, html, text }),
  });
  if (!r.ok) throw new Error(`resend ${r.status}: ${await r.text()}`);
  return true;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const snap = await gather();
  const md = await aiBrief(snap);

  const today = snap.date;
  const file = path.join(OUT_DIR, `${today}.md`);
  await fs.writeFile(file, `# Exec brief — ${today}\n\n${md}\n\n---\n\n## Raw snapshot\n\`\`\`json\n${JSON.stringify(snap, null, 2)}\n\`\`\`\n`, 'utf8');

  const html = `<div style="max-width:600px;margin:0 auto;padding:24px;background:#fbfaf7;font-family:Georgia,serif">
    <div style="border-bottom:2px solid #1a1a1a;padding-bottom:12px;margin-bottom:20px">
      <div style="font-weight:900;font-size:22px;letter-spacing:-0.5px">Real Daily Review</div>
      <div style="font-family:-apple-system,Inter,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#5b5b5b;margin-top:4px">Exec brief · ${today}</div>
    </div>
    ${mdToHtml(md)}
    <p style="margin-top:24px;font-family:-apple-system,Inter,sans-serif;font-size:12px;color:#5b5b5b;border-top:1px solid #e7e3da;padding-top:12px">
      Auto-generated daily by ceo-exec-brief workflow. <a href="https://github.com/Real-Daily-Review/realdailyreview/blob/main/ops/exec-briefs/${today}.md" style="color:#8a1538">view raw</a>
    </p>
  </div>`;

  const text = md.replace(/\*\*/g, '');
  await sendEmail({
    subject: `Real Daily Review — exec brief — ${today}`,
    html,
    text,
  });
  console.log(`[exec-brief] sent to ${SHAREHOLDER_EMAIL} for ${today}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
