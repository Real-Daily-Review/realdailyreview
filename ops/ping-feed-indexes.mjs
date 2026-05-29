#!/usr/bin/env node
/**
 * ops/ping-feed-indexes.mjs
 *
 * Notifies RSS aggregators and Google News that our feed has updated.
 * Run after a successful deploy:
 *
 *   node ops/ping-feed-indexes.mjs
 *
 * Uses Node 18+ built-in fetch — zero extra dependencies.
 * Non-200 responses are logged but do NOT exit non-zero (deploy should not fail
 * because a third-party ping endpoint is flaky).
 */

const FEED_URL = 'https://realdailyreview.com/feed.xml';
const SITE_URL = 'https://realdailyreview.com';

// ---------------------------------------------------------------------------
// Ping targets
// ---------------------------------------------------------------------------

/**
 * Feedly Cloud — add/refresh a feed in Feedly's index.
 * Docs: https://developer.feedly.com/v3/feeds/#get-the-metadata-about-a-specific-feed
 * A POST to /v3/feeds with feedId causes Feedly to crawl the feed immediately.
 */
async function pingFeedly() {
  const endpoint = 'https://cloud.feedly.com/v3/feeds';
  const feedId = `feed/${FEED_URL}`;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedId }),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text().catch(() => '');
    if (res.ok) {
      console.log(`[ping] Feedly OK (${res.status}):`, text.slice(0, 120));
    } else {
      console.warn(`[ping] Feedly non-OK (${res.status}):`, text.slice(0, 200));
    }
  } catch (err) {
    console.warn('[ping] Feedly error:', err.message);
  }
}

/**
 * Google News Publisher Center — there is no public programmatic submission API;
 * the standard approach is a sitemap ping to Google Search Console.
 * We ping the Google Search Console sitemap endpoint which also triggers
 * Google News crawling for eligible publishers.
 *
 * Endpoint: https://www.google.com/ping?sitemap=<url>
 * This is a GET request (Google's documented ping format).
 */
async function pingGoogleNews() {
  const sitemapUrl = `${SITE_URL}/sitemap-index.xml`;
  const pingUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`;
  try {
    const res = await fetch(pingUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'RealDailyReviewBot/1.0 (+https://realdailyreview.com)' },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      console.log(`[ping] Google News/Search Console OK (${res.status})`);
    } else {
      console.warn(`[ping] Google News/Search Console non-OK (${res.status})`);
    }
  } catch (err) {
    console.warn('[ping] Google News error:', err.message);
  }
}

/**
 * Inoreader — supports the standard WebSub / rssCloud ping via a GET to their
 * ping endpoint. Helps surface the feed to Inoreader's discovery index.
 */
async function pingInoreader() {
  const pingUrl = `https://www.inoreader.com/ping?url=${encodeURIComponent(FEED_URL)}`;
  try {
    const res = await fetch(pingUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'RealDailyReviewBot/1.0 (+https://realdailyreview.com)' },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      console.log(`[ping] Inoreader OK (${res.status})`);
    } else {
      console.warn(`[ping] Inoreader non-OK (${res.status})`);
    }
  } catch (err) {
    console.warn('[ping] Inoreader error:', err.message);
  }
}

/**
 * Superfeedr / WebSub hub — notifies WebSub-compatible aggregators
 * (Feedspot, NewsBlur, etc.) that the feed has new content.
 */
async function pingWebSub() {
  const hubUrl = 'https://pubsubhubbub.appspot.com/';
  const body = new URLSearchParams({
    'hub.mode': 'publish',
    'hub.url': FEED_URL,
  });
  try {
    const res = await fetch(hubUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(10_000),
    });
    // WebSub hub returns 204 No Content on success
    if (res.status === 204 || res.ok) {
      console.log(`[ping] WebSub hub OK (${res.status})`);
    } else {
      const text = await res.text().catch(() => '');
      console.warn(`[ping] WebSub hub non-OK (${res.status}):`, text.slice(0, 200));
    }
  } catch (err) {
    console.warn('[ping] WebSub hub error:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('[ping] Starting feed index pings for', FEED_URL);

await Promise.allSettled([
  pingFeedly(),
  pingGoogleNews(),
  pingInoreader(),
  pingWebSub(),
]);

console.log('[ping] All pings complete.');
