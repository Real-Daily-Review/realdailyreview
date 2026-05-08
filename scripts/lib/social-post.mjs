#!/usr/bin/env node
/**
 * social-post.mjs — cross-post a single article to Bluesky, Mastodon, and X.
 *
 * Usage (from CI or shell):
 *   ARTICLE_SLUG="2026-05-08-ai-takes-over" \
 *   ARTICLE_TITLE="AI Takes Over" \
 *   ARTICLE_DESCRIPTION="A short dek here." \
 *   ARTICLE_SECTION="tech" \
 *   node scripts/lib/social-post.mjs
 *
 * Each platform is skipped gracefully when its credentials are absent.
 * The script always exits 0 — a social post failure must never block a deploy.
 *
 * Zero new npm deps: uses Node 18+ native fetch only.
 */

import { createHmac } from 'node:crypto';

const SITE_URL = 'https://realdailyreview.com';

// ── helpers ──────────────────────────────────────────────────────────────────

function env(key) {
  return (process.env[key] || '').trim();
}

/** Build the canonical article URL from slug. */
function articleUrl(slug) {
  return `${SITE_URL}/articles/${slug}`;
}

/**
 * Truncate text to maxLen, appending ellipsis if needed.
 * Breaks on word boundary where possible.
 */
function truncate(text, maxLen) {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > maxLen * 0.6 ? cut.slice(0, lastSpace) : cut) + '\u2026';
}

/** Build the post body shared across platforms (before URL). */
function buildPostText(title, description, section, url, maxBody) {
  const tag = `#${section.charAt(0).toUpperCase() + section.slice(1)}`;
  // Format: "Title\n\nDek #Section\n\nURL"
  const urlPart = `\n\n${url}`;
  const tagPart = ` ${tag}`;
  const body = `${title}\n\n${description}${tagPart}`;
  const truncated = truncate(body, maxBody - urlPart.length);
  return truncated + urlPart;
}

// ── Bluesky (AT Protocol) ────────────────────────────────────────────────────

async function postBluesky(title, description, section, url) {
  const identifier = env('BSKY_IDENTIFIER');
  const password = env('BSKY_PASSWORD');
  if (!identifier || !password) {
    console.log('[bluesky] skipped — BSKY_IDENTIFIER / BSKY_PASSWORD not set');
    return;
  }

  const PDS = 'https://bsky.social';

  // 1. Create session
  const sessionRes = await fetch(`${PDS}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  if (!sessionRes.ok) {
    console.error('[bluesky] auth failed:', await sessionRes.text());
    return;
  }
  const { accessJwt, did } = await sessionRes.json();

  // Bluesky post limit: 300 grapheme clusters. We target 280 to be safe.
  const text = buildPostText(title, description, section, url, 280);

  // Build facets for the URL link so Bluesky renders it as a card
  const urlStart = Buffer.byteLength(text.slice(0, text.lastIndexOf(url)), 'utf8');
  const urlEnd = urlStart + Buffer.byteLength(url, 'utf8');

  const record = {
    $type: 'app.bsky.feed.post',
    text,
    facets: [
      {
        index: { byteStart: urlStart, byteEnd: urlEnd },
        features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }],
      },
    ],
    createdAt: new Date().toISOString(),
    langs: ['en'],
  };

  // 2. Create post record
  const postRes = await fetch(`${PDS}/xrpc/com.atproto.repo.createRecord`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessJwt}`,
    },
    body: JSON.stringify({ repo: did, collection: 'app.bsky.feed.post', record }),
  });
  if (postRes.ok) {
    const { uri } = await postRes.json();
    console.log('[bluesky] posted:', uri);
  } else {
    console.error('[bluesky] post failed:', await postRes.text());
  }
}

// ── Mastodon ─────────────────────────────────────────────────────────────────

async function postMastodon(title, description, section, url) {
  const baseUrl = env('MASTODON_BASE_URL');       // e.g. https://mastodon.social
  const token = env('MASTODON_ACCESS_TOKEN');
  if (!baseUrl || !token) {
    console.log('[mastodon] skipped — MASTODON_BASE_URL / MASTODON_ACCESS_TOKEN not set');
    return;
  }

  // Mastodon limit: 500 chars
  const text = buildPostText(title, description, section, url, 500);

  const res = await fetch(`${baseUrl}/api/v1/statuses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status: text, visibility: 'public' }),
  });
  if (res.ok) {
    const { url: statusUrl } = await res.json();
    console.log('[mastodon] posted:', statusUrl);
  } else {
    console.error('[mastodon] post failed:', await res.text());
  }
}

// ── X / Twitter (v2) ─────────────────────────────────────────────────────────
// Uses OAuth 1.0a user-context (required for tweet creation on free tier).

function oauthSign(method, url, params, apiKey, apiSecret, accessToken, accessSecret) {
  const oauthParams = {
    oauth_consumer_key: apiKey,
    oauth_nonce: Math.random().toString(36).slice(2) + Date.now().toString(36),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: '1.0',
    ...params,
  };
  const sortedKeys = Object.keys(oauthParams).sort();
  const paramStr = sortedKeys
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(oauthParams[k])}`)
    .join('&');
  const base = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(paramStr),
  ].join('&');
  const signingKey = `${encodeURIComponent(apiSecret)}&${encodeURIComponent(accessSecret)}`;
  const sig = createHmac('sha1', signingKey).update(base).digest('base64');
  oauthParams.oauth_signature = sig;
  const header = 'OAuth ' + Object.keys(oauthParams)
    .filter((k) => k.startsWith('oauth_'))
    .sort()
    .map((k) => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
    .join(', ');
  return header;
}

async function postTwitter(title, description, section, url) {
  const apiKey = env('TWITTER_API_KEY');
  const apiSecret = env('TWITTER_API_SECRET');
  const accessToken = env('TWITTER_ACCESS_TOKEN');
  const accessSecret = env('TWITTER_ACCESS_SECRET');
  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    console.log('[twitter] skipped — TWITTER_API_KEY / _SECRET / _ACCESS_TOKEN / _ACCESS_SECRET not set');
    return;
  }

  // X limit: 280 chars
  const text = buildPostText(title, description, section, url, 280);

  const endpoint = 'https://api.twitter.com/2/tweets';
  const authHeader = oauthSign('POST', endpoint, {}, apiKey, apiSecret, accessToken, accessSecret);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    },
    body: JSON.stringify({ text }),
  });
  if (res.ok) {
    const { data } = await res.json();
    console.log('[twitter] posted: https://x.com/i/web/status/' + data.id);
  } else {
    console.error('[twitter] post failed:', await res.text());
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const slug = env('ARTICLE_SLUG');
  const title = env('ARTICLE_TITLE');
  const description = env('ARTICLE_DESCRIPTION');
  const section = env('ARTICLE_SECTION') || 'world';

  if (!slug || !title) {
    console.error('[social-post] ARTICLE_SLUG and ARTICLE_TITLE are required');
    process.exit(0); // still exit 0 — never block a deploy
  }

  const url = articleUrl(slug);
  console.log(`[social-post] posting article: ${url}`);

  await Promise.allSettled([
    postBluesky(title, description, section, url),
    postMastodon(title, description, section, url),
    postTwitter(title, description, section, url),
  ]);

  console.log('[social-post] done');
}

main().catch((err) => {
  // Log but never crash the CI pipeline
  console.error('[social-post] unexpected error:', err);
  process.exit(0);
});
