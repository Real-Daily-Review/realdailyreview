#!/usr/bin/env node
/**
 * ops/ping-feeds.mjs
 *
 * Run after each deploy to notify feed aggregators that new content is available.
 *
 * Usage:
 *   FEED_URL=https://realdailyreview.com/feed.xml node ops/ping-feeds.mjs
 *
 * If FEED_URL is not set, defaults to the production URL.
 *
 * Targets:
 *   1. Google PubSubHubbub hub (pubsubhubbub.appspot.com) — the WebSub standard
 *      used by Google News, Feedly, Inoreader, NewsBlur, and most modern aggregators.
 *   2. Feedly Cloud feed discovery endpoint — registers/refreshes the feed in
 *      Feedly's index so subscribers see new articles immediately.
 *
 * Both requests are fire-and-forget; failures are logged but do not exit non-zero
 * so they never block a CI deploy.
 */

const FEED_URL = process.env.FEED_URL ?? 'https://realdailyreview.com/feed.xml';
const SITE_URL = process.env.SITE_URL ?? 'https://realdailyreview.com';

// ── 1. WebSub / PubSubHubbub ping ────────────────────────────────────────────
// Standard hub used by Google News crawlers, Feedly, Inoreader, NewsBlur.
async function pingWebSub() {
  const HUB = 'https://pubsubhubbub.appspot.com/';
  const body = new URLSearchParams({
    'hub.mode': 'publish',
    'hub.url': FEED_URL,
  });
  try {
    const res = await fetch(HUB, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (res.ok || res.status === 204) {
      console.log(`[ping-feeds] ✓ WebSub ping accepted (${res.status}) — ${HUB}`);
    } else {
      const text = await res.text().catch(() => '');
      console.warn(`[ping-feeds] ✗ WebSub ping failed (${res.status}): ${text.slice(0, 200)}`);
    }
  } catch (err) {
    console.warn(`[ping-feeds] ✗ WebSub ping error: ${err.message}`);
  }
}

// ── 2. Feedly Cloud feed discovery ───────────────────────────────────────────
// POST to Feedly's /v3/feeds endpoint to register/refresh the feed.
// Feedly returns feed metadata on success (200) or a 400 if already indexed.
async function pingFeedly() {
  const FEEDLY_ENDPOINT = 'https://cloud.feedly.com/v3/feeds';
  const feedId = `feed/${FEED_URL}`;
  try {
    const res = await fetch(FEEDLY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedId }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      console.log(`[ping-feeds] ✓ Feedly indexed: ${json.title ?? feedId}`);
    } else {
      // 400 often means already indexed — not a real error
      console.log(`[ping-feeds] ~ Feedly response (${res.status}): ${JSON.stringify(json).slice(0, 200)}`);
    }
  } catch (err) {
    console.warn(`[ping-feeds] ✗ Feedly ping error: ${err.message}`);
  }
}

// ── 3. Google News Publisher Center note ─────────────────────────────────────
// Google News Publisher Center (publishercenter.google.com) requires a one-time
// manual submission — there is no public POST API. The WebSub ping above (step 1)
// covers the ongoing "notify Google of new content" requirement. The one-time
// submission URL is logged here as a reminder for the shareholder.
function logGoogleNewsReminder() {
  console.log(
    `[ping-feeds] ℹ Google News Publisher Center requires a one-time manual submission.\n` +
    `  → https://publishercenter.google.com\n` +
    `  Feed URL to submit: ${FEED_URL}\n` +
    `  Site URL: ${SITE_URL}`
  );
}

// ── Run ───────────────────────────────────────────────────────────────────────
console.log(`[ping-feeds] Pinging aggregators for feed: ${FEED_URL}`);
await Promise.allSettled([pingWebSub(), pingFeedly()]);
logGoogleNewsReminder();
console.log('[ping-feeds] Done.');
