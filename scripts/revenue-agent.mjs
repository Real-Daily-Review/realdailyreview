#!/usr/bin/env node
/**
 * Mei Tanaka — CFO (Revenue)
 *
 * Daily run: audits the revenue stack, spots opportunities, and writes a
 * revenue brief to ops/revenue/YYYY-MM-DD.md. Surfaces concrete actionable
 * items into the queue so feature-build picks them up.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import Anthropic from '@anthropic-ai/sdk';
import { appendActivity } from './lib/activity-log.mjs';

const ARTICLES_DIR = path.resolve('src/content/articles');
const REVENUE_DIR = path.resolve('ops/revenue');
const QUEUE_FILE = path.resolve('ops/queue.md');
const AGENT = 'mei-tanaka';

async function snapshot() {
  const articles = (await fs.readdir(ARTICLES_DIR).catch(() => [])).filter((f) => f.endsWith('.md'));
  let totalLinks = 0;
  let totalCommerceMentions = 0;
  for (const f of articles.slice(0, 60)) {
    const raw = await fs.readFile(path.join(ARTICLES_DIR, f), 'utf8');
    const { content } = matter(raw);
    totalLinks += (content.match(/\[[^\]]+\]\(http/g) || []).length;
    totalCommerceMentions += (content.match(/\b(amazon|apple|google|nintendo|spirit|airline|tesla|spacex|microsoft|switch|iphone)\b/gi) || []).length;
  }
  const config = await fs.readFile(path.resolve('src/config.ts'), 'utf8').catch(() => '');
  return {
    article_count: articles.length,
    total_outbound_links: totalLinks,
    total_commerce_mentions_proxy: totalCommerceMentions,
    skimlinks_enabled: /skimlinksEnabled:\s*true/.test(config),
    adsense_enabled: /adsenseEnabled:\s*true/.test(config),
    ezoic_incubator_enabled: /ezoicIncubatorEnabled:\s*true/.test(config),
    tip_jar_enabled: /tipJarEnabled:\s*true/.test(config),
    days_old: Math.floor((Date.now() - Date.parse('2026-05-06')) / (24 * 3600 * 1000)),
  };
}

async function aiAudit(snap) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = `You are Mei Tanaka, CFO of Real Daily Review. Audit our revenue stack and identify the next highest-leverage moves. Be ruthless: traffic is small; every visitor must work harder.

CURRENT STATE:
${JSON.stringify(snap, null, 2)}

Active rails: Skimlinks (auto-affiliate every commerce link), Buy Me a Coffee tip jar, Ezoic Incubator (in review), AdSense (apply Day 14 = 2026-05-20).

Produce a tight Markdown brief, ≤400 words, with these sections:

## Daily revenue snapshot
- One-line summary: "$X earned today across N rails" (write \`(no payout data yet)\` if pre-revenue)

## Conversion gaps
- Top 3 things on the site that are leaving money on the table (e.g., "tip jar only at end of articles", "no inline affiliate prompts")

## [BUILD-NOW] actions for the queue (max 3, all autonomous)
- Format: \`(monetization) <concrete buildable change>\`. Code-only. No new accounts/payments.

## Risks
- Anything that could blow up the revenue stack (e.g., AdSense rejection, policy changes, ad-blocker rates)

End with one sentence: a single concrete commit-ready code change YOU recommend Ada Park (CTO) prioritize tomorrow.`;

  const r = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    temperature: 0.4,
    messages: [{ role: 'user', content: prompt }],
  });
  return {
    text: r.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim(),
    usage: r.usage,
  };
}

function extractBuildNowActions(report) {
  const out = [];
  for (const line of report.split('\n')) {
    if (!/\[BUILD-NOW\]/i.test(line)) continue;
    let cleaned = line.replace(/^[-*]\s+/, '').replace(/\*\*\[BUILD-NOW\]\*\*\s*/i, '').replace(/\[BUILD-NOW\]\s*/i, '').replace(/^\*\*([^*]+)\*\*/, '$1').replace(/^`([^`]+)`/, '$1').trim();
    if (/^#+\s/.test(cleaned)) continue;
    if (cleaned.length < 12) continue;
    out.push(cleaned);
  }
  return out;
}

async function appendActionsToQueue(actions) {
  if (actions.length === 0) return;
  const queue = await fs.readFile(QUEUE_FILE, 'utf8').catch(() => '# Sprint Queue\n\n');
  const today = new Date().toISOString().slice(0, 10);
  const fresh = actions.filter((a) => !queue.toLowerCase().includes(a.toLowerCase().slice(0, 30)));
  if (fresh.length === 0) return;
  const block = '\n' + fresh.map((a) => `- [ ] ${a}  _from mei-tanaka ${today}_`).join('\n') + '\n';
  await fs.writeFile(QUEUE_FILE, queue.trimEnd() + block, 'utf8');
}

async function main() {
  await fs.mkdir(REVENUE_DIR, { recursive: true });
  const snap = await snapshot();
  console.log('[mei-tanaka] snapshot:', JSON.stringify(snap));
  const { text, usage } = await aiAudit(snap);
  const today = new Date().toISOString().slice(0, 10);
  const file = path.join(REVENUE_DIR, `${today}.md`);
  await fs.writeFile(file, `# Revenue brief — ${today}\n\n_Drafted by Mei Tanaka (CFO)._\n\n## State\n\`\`\`json\n${JSON.stringify(snap, null, 2)}\n\`\`\`\n\n${text}\n`, 'utf8');
  const actions = extractBuildNowActions(text);
  if (actions.length > 0) await appendActionsToQueue(actions);
  console.log(`[mei-tanaka] wrote ${file}, queued ${actions.length} actions`);
  await appendActivity({
    agentSlug: AGENT,
    action: 'daily revenue audit',
    status: 'completed',
    summary: `Audited ${snap.article_count} articles. Surfaced ${actions.length} [BUILD-NOW] actions to queue. Tip jar ${snap.tip_jar_enabled ? 'on' : 'off'}, Skimlinks ${snap.skimlinks_enabled ? 'on' : 'off'}.`,
    links: { 'brief': file, 'tokens': String((usage?.input_tokens || 0) + (usage?.output_tokens || 0)) },
  });
}

main().catch(async (err) => {
  console.error(err);
  await appendActivity({ agentSlug: AGENT, action: 'daily revenue audit', status: 'failed', summary: err.message }).catch(() => {});
  process.exit(1);
});
