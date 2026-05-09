#!/usr/bin/env node
/**
 * Bluesky cross-poster.
 *
 * For each article published in the last N hours that hasn't been posted to
 * Bluesky yet, posts a short hook + URL using the user's app password.
 * Tracks posted slugs in ops/social-posted/bluesky.json to avoid duplicates.
 *
 * Required env (all in GH Actions Secrets, no shareholder ID verification):
 *   BLUESKY_HANDLE     — e.g. "realdailyreview.bsky.social"
 *   BLUESKY_APP_PASSWORD — generate at bsky.app → Settings → Privacy and security → App passwords
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const ARTICLES_DIR = path.resolve('src/content/articles');
const POSTED_FILE = path.resolve('ops/social-posted/bluesky.json');
const SITE_URL = 'https://realdailyreview.com';
const LOOKBACK_HOURS = 6;
const MAX_POSTS_PER_RUN = 4;

async function readPosted() {
  try { return JSON.parse(await fs.readFile(POSTED_FILE, 'utf8')); } catch { return { slugs: [] }; }
}
async function writePosted(state) {
  await fs.mkdir(path.dirname(POSTED_FILE), { recursive: true });
  await fs.writeFile(POSTED_FILE, JSON.stringify(state, null, 2), 'utf8');
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

async function bskyAuth(handle, password) {
  const r = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: handle, password }),
  });
  if (!r.ok) throw new Error(`bsky auth ${r.status}: ${await r.text()}`);
  return await r.json();  // {accessJwt, did, ...}
}

function buildPost(article) {
  const url = `${SITE_URL}/articles/${article.slug}`;
  const title = article.data.title;
  const desc = article.data.description;
  // Bluesky cap is 300 chars. Use title + URL; add desc if it fits.
  let text = `${title}\n${url}`;
  if (text.length + desc.length + 2 < 290) text = `${title}\n\n${desc}\n${url}`;
  return text.length > 300 ? text.slice(0, 297) + '…' : text;
}

function parseFacets(text) {
  // Find URL byte-ranges so they render as clickable links.
  const facets = [];
  const enc = new TextEncoder();
  const bytes = enc.encode(text);
  const re = /https?:\/\/[^\s]+/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const before = enc.encode(text.slice(0, m.index)).length;
    const url = m[0];
    const after = before + enc.encode(url).length;
    facets.push({
      index: { byteStart: before, byteEnd: after },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }],
    });
  }
  return facets;
}

async function bskyPost({ session, text }) {
  const r = await fetch('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.accessJwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      repo: session.did,
      collection: 'app.bsky.feed.post',
      record: {
        $type: 'app.bsky.feed.post',
        text,
        createdAt: new Date().toISOString(),
        facets: parseFacets(text),
      },
    }),
  });
  if (!r.ok) throw new Error(`bsky post ${r.status}: ${await r.text()}`);
  return await r.json();
}

async function main() {
  const handle = process.env.BLUESKY_HANDLE;
  const password = process.env.BLUESKY_APP_PASSWORD;
  if (!handle || !password) {
    console.log('[bluesky] BLUESKY_HANDLE or BLUESKY_APP_PASSWORD not set — skipping');
    return;
  }
  const posted = await readPosted();
  const recent = await recentArticles();
  const candidates = recent.filter((a) => !posted.slugs.includes(a.slug));
  if (candidates.length === 0) {
    console.log('[bluesky] nothing new to post');
    return;
  }
  const session = await bskyAuth(handle, password);
  let posts = 0;
  for (const a of candidates.slice(0, MAX_POSTS_PER_RUN)) {
    const text = buildPost(a);
    try {
      const res = await bskyPost({ session, text });
      console.log(`[bluesky] posted ${a.slug} → ${res.uri}`);
      posted.slugs.push(a.slug);
      posts++;
      await new Promise((r) => setTimeout(r, 4000)); // rate respect
    } catch (err) {
      console.warn(`[bluesky] failed ${a.slug}: ${err.message}`);
    }
  }
  posted.slugs = posted.slugs.slice(-500);
  await writePosted(posted);
  console.log(`[bluesky] posted ${posts}/${candidates.length}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
