#!/usr/bin/env node
/**
 * Pulls engagement counts (likes, reposts, replies) for every Bluesky post
 * we've shipped and stores per-post stats keyed by hook strategy. Future
 * iterations of the hook prompt can read this to bias toward what works.
 *
 * Output: ops/social-posted/bluesky-engagement.json
 *   {
 *     posts: [{ slug, uri, strategy, hook, likeCount, repostCount, replyCount, ... }],
 *     by_strategy: { "ai-hook": { posts, avg_likes, avg_reposts, avg_replies } }
 *   }
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

const POSTED_FILE = path.resolve('ops/social-posted/bluesky.json');
const OUT_FILE = path.resolve('ops/social-posted/bluesky-engagement.json');

async function bskyAuth(handle, password) {
  const r = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: handle, password }),
  });
  if (!r.ok) throw new Error(`bsky auth ${r.status}`);
  return await r.json();
}

async function getPostStats(session, uri) {
  // app.bsky.feed.getPosts accepts up to 25 URIs at once.
  const r = await fetch(`https://bsky.social/xrpc/app.bsky.feed.getPosts?uris=${encodeURIComponent(uri)}`, {
    headers: { Authorization: `Bearer ${session.accessJwt}` },
  });
  if (!r.ok) return null;
  const j = await r.json();
  const p = (j.posts || [])[0];
  if (!p) return null;
  return {
    likeCount: p.likeCount ?? 0,
    repostCount: p.repostCount ?? 0,
    replyCount: p.replyCount ?? 0,
    indexedAt: p.indexedAt,
  };
}

async function main() {
  const handle = process.env.BLUESKY_HANDLE;
  const password = process.env.BLUESKY_APP_PASSWORD;
  if (!handle || !password) {
    console.log('[bluesky-eng] secrets missing — skipping');
    return;
  }
  let posted;
  try { posted = JSON.parse(await fs.readFile(POSTED_FILE, 'utf8')); }
  catch { console.log('[bluesky-eng] no posted file yet'); return; }
  const sentLog = posted.posts || [];
  if (sentLog.length === 0) { console.log('[bluesky-eng] no posts to track'); return; }

  const session = await bskyAuth(handle, password);
  const stats = [];
  for (const p of sentLog) {
    if (!p.uri) continue;
    const s = await getPostStats(session, p.uri);
    if (!s) continue;
    stats.push({ ...p, ...s });
    await new Promise((r) => setTimeout(r, 250));
  }

  // Aggregate by strategy
  const by_strategy = {};
  for (const s of stats) {
    const k = s.strategy || 'unknown';
    if (!by_strategy[k]) by_strategy[k] = { posts: 0, total_likes: 0, total_reposts: 0, total_replies: 0 };
    by_strategy[k].posts++;
    by_strategy[k].total_likes += s.likeCount;
    by_strategy[k].total_reposts += s.repostCount;
    by_strategy[k].total_replies += s.replyCount;
  }
  for (const k of Object.keys(by_strategy)) {
    const b = by_strategy[k];
    b.avg_likes = b.posts ? +(b.total_likes / b.posts).toFixed(2) : 0;
    b.avg_reposts = b.posts ? +(b.total_reposts / b.posts).toFixed(2) : 0;
    b.avg_replies = b.posts ? +(b.total_replies / b.posts).toFixed(2) : 0;
  }

  const top10 = [...stats]
    .sort((a, b) => (b.likeCount + 2 * b.repostCount) - (a.likeCount + 2 * a.repostCount))
    .slice(0, 10);

  await fs.writeFile(OUT_FILE, JSON.stringify({
    fetched_at: new Date().toISOString(),
    total_posts_tracked: stats.length,
    by_strategy,
    top10,
    posts: stats,
  }, null, 2), 'utf8');
  console.log(`[bluesky-eng] tracked ${stats.length} posts, top by likes+2*reposts: ${top10[0]?.hook?.slice(0, 60) || '(none)'}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
