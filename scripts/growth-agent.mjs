#!/usr/bin/env node
/**
 * Ravi Sharma — CMO (Growth)
 *
 * Daily run: pulls recent articles, drafts platform-specific social posts
 * for X / Bluesky / Mastodon / Reddit / HN, and saves them to
 * ops/social-drafts/YYYY-MM-DD.md. Once shareholder creates the social
 * accounts, a sub-agent (social-poster) will publish these drafts.
 *
 * Also tracks which articles haven't been promoted yet and flags candidate
 * pitches for Hacker News (the highest-variance traffic lever we have).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import Anthropic from '@anthropic-ai/sdk';
import { appendActivity } from './lib/activity-log.mjs';

const ARTICLES_DIR = path.resolve('src/content/articles');
const DRAFTS_DIR = path.resolve('ops/social-drafts');
const AGENT = 'ravi-sharma';

async function recentArticles(hours = 24) {
  const cutoff = Date.now() - hours * 3600 * 1000;
  const files = (await fs.readdir(ARTICLES_DIR).catch(() => [])).filter((f) => f.endsWith('.md'));
  const out = [];
  for (const f of files) {
    const raw = await fs.readFile(path.join(ARTICLES_DIR, f), 'utf8');
    const { data, content } = matter(raw);
    if (Date.parse(data.pubDate) >= cutoff) {
      out.push({ slug: f.replace(/\.md$/, ''), data, body: content.slice(0, 600) });
    }
  }
  return out.sort((a, b) => Date.parse(b.data.pubDate) - Date.parse(a.data.pubDate));
}

async function draftSocialPosts(articles) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const flagshipBatch = articles.slice(0, 6);
  if (flagshipBatch.length === 0) return [];

  const articlesContext = flagshipBatch.map((a) => `=== /articles/${a.slug} ===
title: ${a.data.title}
desc: ${a.data.description}
section: ${a.data.section}
tags: ${(a.data.tags || []).join(', ')}
body: ${a.body.slice(0, 400)}`).join('\n\n');

  const prompt = `You are Ravi Sharma, CMO of Real Daily Review (https://realdailyreview.com — a balanced AI-driven daily news brief). For each article below, draft platform-native social copy. Goal: drive clicks back to realdailyreview.com.

Constraints per platform:
- X (Twitter): ≤270 chars, no hashtag spam (max 2), one URL, one hook
- Bluesky: ≤300 chars, conversational, can use 1-2 hashtags
- Mastodon: ≤500 chars, neutral tone (Mastodon community dislikes hype)
- Reddit (one specific subreddit per article): pick the SUBREDDIT most appropriate (r/news, r/worldnews, r/technews, r/geopolitics, r/business, etc.). Title should NOT be "click here" — it should be a clear factual headline. NO self-promotion language; Reddit auto-flags it. Body comment: 2-3 sentences sourced summary + the link.
- Hacker News (only if the story is actually HN-relevant — tech, science, geopolitics, AI, startups; SKIP otherwise): a clean factual title, no editorializing.

Output a JSON array between <json>...</json> tags:
[
  {
    "article_slug": "2026-05-08-...",
    "x": "...",
    "bluesky": "...",
    "mastodon": "...",
    "reddit": { "subreddit": "r/...", "title": "...", "comment": "..." },
    "hn": { "applicable": true|false, "title": "...", "url": "https://realdailyreview.com/articles/<slug>" }
  }, ...
]

ARTICLES:
${articlesContext}`;

  const r = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 3500,
    temperature: 0.5,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  const m = text.match(/<json>([\s\S]*?)<\/json>/);
  if (!m) throw new Error('Model did not return JSON block');
  return { drafts: JSON.parse(m[1]), usage: r.usage };
}

function renderDraftsMarkdown(drafts, dateStr) {
  const lines = [
    `# Social drafts — ${dateStr}`,
    '',
    `_Drafted by Ravi Sharma (CMO). Ready for shareholder to post once accounts exist, OR for a future social-poster sub-agent to fire automatically._`,
    '',
  ];
  for (const d of drafts) {
    const url = `https://realdailyreview.com/articles/${d.article_slug}`;
    lines.push(`## ${d.article_slug}`);
    lines.push(`URL: ${url}`);
    lines.push('');
    if (d.x) lines.push(`### X / Twitter\n\`\`\`\n${d.x}\n\`\`\``);
    if (d.bluesky) lines.push(`### Bluesky\n\`\`\`\n${d.bluesky}\n\`\`\``);
    if (d.mastodon) lines.push(`### Mastodon\n\`\`\`\n${d.mastodon}\n\`\`\``);
    if (d.reddit?.title) lines.push(`### Reddit ${d.reddit.subreddit}\n**Title:** ${d.reddit.title}\n\n**First comment:** ${d.reddit.comment}`);
    if (d.hn?.applicable) lines.push(`### Hacker News\n**Title:** ${d.hn.title}\n**URL:** ${d.hn.url}`);
    lines.push('\n---\n');
  }
  return lines.join('\n');
}

async function main() {
  await fs.mkdir(DRAFTS_DIR, { recursive: true });
  const articles = await recentArticles(24);
  if (articles.length === 0) {
    console.log('[ravi-sharma] no recent articles to draft for');
    await appendActivity({
      agentSlug: AGENT, action: 'social drafts skipped',
      summary: 'No new articles in last 24h.', status: 'no-op',
    });
    return;
  }
  console.log(`[ravi-sharma] drafting social copy for ${articles.length} articles…`);
  const { drafts, usage } = await draftSocialPosts(articles);
  const today = new Date().toISOString().slice(0, 10);
  const file = path.join(DRAFTS_DIR, `${today}.md`);
  await fs.writeFile(file, renderDraftsMarkdown(drafts, today), 'utf8');
  console.log(`[ravi-sharma] wrote ${file} with ${drafts.length} draft sets`);

  await appendActivity({
    agentSlug: AGENT,
    action: 'social drafts batch',
    status: 'completed',
    summary: `Drafted social copy for ${drafts.length} articles across X/Bluesky/Mastodon/Reddit. ${drafts.filter(d => d.hn?.applicable).length} Hacker News candidates flagged.`,
    links: { 'drafts file': file, 'tokens used': String((usage?.input_tokens || 0) + (usage?.output_tokens || 0)) },
  });
}

main().catch(async (err) => {
  console.error(err);
  await appendActivity({ agentSlug: AGENT, action: 'social drafts batch', status: 'failed', summary: err.message }).catch(() => {});
  process.exit(1);
});
