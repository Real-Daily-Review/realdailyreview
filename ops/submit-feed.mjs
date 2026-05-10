#!/usr/bin/env node
/**
 * ops/submit-feed.mjs
 *
 * Post-deploy feed submission script.
 * Pings:
 *   1. Google PubSubHubbub hub  — notifies Google (and any other hub subscriber)
 *      that /feed.xml has new content. This is the programmatic complement to the
 *      one-time manual submission in Google News Publisher Center.
 *   2. Feedly Cloud index endpoint — asks Feedly to crawl/re-index the feed.
 *
 * Usage:
 *   node ops/submit-feed.mjs
 *
 * Add as a post-build step in Cloudflare Pages or GitHub Actions:
 *   npm run build && node ops/submit-feed.mjs
 *
 * No secrets required — both endpoints are public ping APIs.
 *
 * SHAREHOLDER ACTION REQUIRED:
 *   Submit https://realdailyreview.com/feed.xml manually at:
 *   https://publishercenter.google.com
 *   (one-time step; cannot be automated without OAuth credentials)
 */

const FEED_URL = 'https://realdailyreview.com/feed.xml';

// ── 1. Google PubSubHubbub ────────────────────────────────────────────────────
async function pingPubSubHubbub() {
  const HUB = 'https://pubsubhubbub.appspot.com/';
  const body = new URLSearchParams({
    'hub.mode': 'publish',
    'hub.url': FEED_URL,
  });

  const res = await fetch(HUB, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (res.ok || res.status === 204) {
    console.log(`[submit-feed] ✓ PubSubHubbub ping accepted (${res.status})`);
  } else {
    const text = await res.text().catch(() => '');
    console.warn(`[submit-feed] ✗ PubSubHubbub ping failed (${res.status}): ${text.slice(0, 200)}`);
  }
}

// ── 2. Feedly Cloud index ─────────────────────────────────────────────────────
// Feedly's public feed-discovery endpoint. A GET to this URL causes Feedly to
// crawl and index the feed if it hasn't already, and refreshes it if it has.
// Reference: https://developer.feedly.com/v3/feeds/#get-the-metadata-of-a-feed
async function pingFeedly() {
  const encodedFeed = encodeURIComponent(FEED_URL);
  const url = `https://cloud.feedly.com/v3/feeds/feed%2F${encodedFeed}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': 'RealDailyReviewBot/1.0 (+https://realdailyreview.com)',
    },
  });

  if (res.ok) {
    const json = await res.json().catch(() => ({}));
    console.log(`[submit-feed] ✓ Feedly indexed feed: ${json.title ?? FEED_URL} (${json.subscribers ?? 0} subscribers)`);
  } else {
    console.warn(`[submit-feed] ✗ Feedly index request failed (${res.status})`);
  }
}

// ── 3. Superfeedr / rssping (bonus lightweight pings) ────────────────────────
async function pingRssPing() {
  // rpc.pingomatic.com accepts a simple XML-RPC ping
  const xml = `<?xml version="1.0"?><methodCall><methodName>weblogUpdates.ping</methodName><params><param><value>${'Real Daily Review'}</value></param><param><value>${FEED_URL}</value></param></params></methodCall>`;

  const res = await fetch('https://rpc.pingomatic.com/', {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml' },
    body: xml,
  });

  if (res.ok) {
    console.log(`[submit-feed] ✓ Pingomatic ping sent (${res.status})`);
  } else {
    console.warn(`[submit-feed] ✗ Pingomatic ping failed (${res.status})`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log(`[submit-feed] Submitting feed: ${FEED_URL}`);

await Promise.allSettled([
  pingPubSubHubbub(),
  pingFeedly(),
  pingRssPing(),
]).then((results) => {
  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length) {
    failed.forEach((r) => console.error('[submit-feed] Unhandled error:', r.reason));
  }
  console.log('[submit-feed] Done.');
});
