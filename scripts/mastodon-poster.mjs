#!/usr/bin/env node
/**
 * Mastodon cross-poster.
 *
 * Same pattern as bluesky-poster.mjs — posts every new article every 2h.
 * Inert until MASTODON_INSTANCE + MASTODON_ACCESS_TOKEN are set.
 *
 * Token: log into the instance (e.g. mastodon.social), then Settings →
 * Development → New Application → name "realdailyreview", scopes write:statuses,
 * read:accounts → save → copy "Your access token". 30 sec, no phone.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const ARTICLES_DIR = path.resolve('src/content/articles');
const POSTED_FILE = path.resolve('ops/social-posted/mastodon.json');
const SITE_URL = 'https://realdailyreview.com';
const LOOKBACK_HOURS = 6;
const MAX_POSTS_PER_RUN = 1;  // one per cron tick — staggered cadence like a real outlet

async function readPosted() {
  try { return JSON.parse(await fs.readFile(POSTED_FILE, 'utf8')); } catch { return { slugs: [] }; }
}
async function writePosted(state) {
  await fs.mkdir(path.dirname(POSTED_FILE), { recursive: true });
  await fs.writeFile(POSTED_FILE, JSON.stringify(state, null, 2), 'utf8');
}
async function writeStatus(status) {
  await fs.mkdir(path.dirname(POSTED_FILE), { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  await fs.writeFile(
    path.resolve('ops/social-posted', `mastodon-status-${today}.json`),
    JSON.stringify({ ...status, written_at: new Date().toISOString() }, null, 2),
    'utf8'
  );
}

async function recentArticles() {
  const cutoff = Date.now() - LOOKBACK_HOURS * 3600 * 1000;
  const files = (await fs.readdir(ARTICLES_DIR).catch(() => [])).filter((f) => f.endsWith('.md'));
  const out = [];
  for (const f of files) {
    const raw = await fs.readFile(path.join(ARTICLES_DIR, f), 'utf8');
    const { data } = matter(raw);
    if (Date.parse(data.pubDate) >= cutoff && !data.draft) {
      out.push({ slug: f.replace(/\.md$/, ''), data });
    }
  }
  return out.sort((a, b) => Date.parse(b.data.pubDate) - Date.parse(a.data.pubDate));
}

function buildPost(article) {
  const url = `${SITE_URL}/articles/${article.slug}`;
  const title = article.data.title;
  const desc = article.data.description;
  // Mastodon caps at 500 chars by default; we use 480 to leave room.
  let text = `${title}\n\n${desc}\n\n${url}`;
  return text.length > 480 ? text.slice(0, 477) + '…' : text;
}

async function mastodonPost({ instance, token, status }) {
  const r = await fetch(`https://${instance}/api/v1/statuses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, visibility: 'public' }),
  });
  if (!r.ok) throw new Error(`mastodon ${r.status}: ${await r.text()}`);
  return await r.json();
}

async function main() {
  const instance = process.env.MASTODON_INSTANCE; // e.g. 'mastodon.social'
  const token = process.env.MASTODON_ACCESS_TOKEN;
  const presence = { has_instance: !!instance, has_token: !!token, instance: instance || null };

  if (!instance || !token) {
    console.log('[mastodon] secrets missing — skipping');
    await writeStatus({ outcome: 'skipped', reason: 'secrets missing', ...presence });
    return;
  }
  const posted = await readPosted();
  const recent = await recentArticles();
  const candidates = recent.filter((a) => !posted.slugs.includes(a.slug));
  if (candidates.length === 0) {
    await writeStatus({ outcome: 'no-candidates', reason: 'all recent already posted', ...presence });
    return;
  }
  let posts = 0;
  const failures = [];
  for (const a of candidates.slice(0, MAX_POSTS_PER_RUN)) {
    const status = buildPost(a);
    try {
      const res = await mastodonPost({ instance, token, status });
      console.log(`[mastodon] posted ${a.slug} → ${res.url || res.id}`);
      posted.slugs.push(a.slug);
      posts++;
      await new Promise((r) => setTimeout(r, 4000));
    } catch (err) {
      console.warn(`[mastodon] failed ${a.slug}: ${err.message}`);
      failures.push({ slug: a.slug, error: err.message });
    }
  }
  posted.slugs = posted.slugs.slice(-500);
  await writePosted(posted);
  await writeStatus({ outcome: 'sent', candidates: candidates.length, posted: posts, failures, ...presence });
  console.log(`[mastodon] posted ${posts}/${candidates.length}`);
}

main().catch(async (err) => {
  console.error(err);
  await writeStatus({ outcome: 'crashed', error: err.message }).catch(() => {});
  process.exit(1);
});
