/**
 * social-post.mjs
 * Cross-posts the latest (or a specified) article to Bluesky, Mastodon, and X.
 *
 * Usage:
 *   import { postArticle } from './social-post.mjs';
 *   await postArticle({ slug: '2026-05-09-some-slug' }); // specific article
 *   await postArticle();                                  // latest article
 *
 * Credentials come from environment variables (see ops/SOCIAL_SETUP.md).
 * Any platform whose env vars are absent is silently skipped.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import matter from 'gray-matter';

const ARTICLES_DIR = path.resolve('src/content/articles');
const SITE_URL = 'https://realdailyreview.com';

// ---------------------------------------------------------------------------
// Article resolution
// ---------------------------------------------------------------------------

/** Return parsed frontmatter + slug for the newest non-draft article. */
async function getLatestArticle() {
  const files = (await fs.readdir(ARTICLES_DIR))
    .filter((f) => f.endsWith('.md'))
    .sort()
    .reverse(); // newest date prefix first

  for (const file of files) {
    const raw = await fs.readFile(path.join(ARTICLES_DIR, file), 'utf8');
    const { data } = matter(raw);
    if (data.draft) continue;
    const slug = file.replace(/\.md$/, '');
    return { slug, data };
  }
  throw new Error('No published articles found in ' + ARTICLES_DIR);
}

/** Return parsed frontmatter + slug for a specific slug. */
async function getArticleBySlug(slug) {
  const file = path.join(ARTICLES_DIR, `${slug}.md`);
  const raw = await fs.readFile(file, 'utf8');
  const { data } = matter(raw);
  return { slug, data };
}

// ---------------------------------------------------------------------------
// Post text formatting
// ---------------------------------------------------------------------------

/**
 * Build a platform post string.
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.description
 * @param {string} opts.url
 * @param {number} opts.maxChars  - hard limit (URL counts as ~23 on X)
 */
function buildPostText({ title, description, url, maxChars }) {
  // Reserve space for URL + newlines
  const urlPart = `\n\n${url}`;
  const reserved = urlPart.length + 2;
  const budget = maxChars - reserved;

  let body = title;
  if (description && body.length + 3 + description.length <= budget) {
    body += `\n${description}`;
  } else if (description) {
    // Truncate description to fit
    const room = budget - body.length - 4;
    if (room > 20) body += `\n${description.slice(0, room)}…`;
  }
  return body + urlPart;
}

// ---------------------------------------------------------------------------
// Bluesky (AT Protocol)
// ---------------------------------------------------------------------------

async function postToBluesky({ title, description, url }) {
  const handle = process.env.BLUESKY_HANDLE;
  const appPassword = process.env.BLUESKY_APP_PASSWORD;
  if (!handle || !appPassword) {
    console.log('[bluesky] skipped — BLUESKY_HANDLE / BLUESKY_APP_PASSWORD not set');
    return null;
  }

  // 1. Create session
  const sessionRes = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: handle, password: appPassword }),
  });
  if (!sessionRes.ok) {
    const err = await sessionRes.text();
    throw new Error(`[bluesky] session failed: ${err}`);
  }
  const { accessJwt, did } = await sessionRes.json();

  // 2. Build post record (300 char limit)
  const text = buildPostText({ title, description, url, maxChars: 300 });

  // 3. Build facets so the URL is a clickable link
  const urlStart = Buffer.byteLength(text.slice(0, text.lastIndexOf(url)), 'utf8');
  const urlEnd = urlStart + Buffer.byteLength(url, 'utf8');
  const record = {
    $type: 'app.bsky.feed.post',
    text,
    createdAt: new Date().toISOString(),
    facets: [
      {
        index: { byteStart: urlStart, byteEnd: urlEnd },
        features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }],
      },
    ],
  };

  // 4. Create record
  const postRes = await fetch('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessJwt}` },
    body: JSON.stringify({ repo: did, collection: 'app.bsky.feed.post', record }),
  });
  if (!postRes.ok) {
    const err = await postRes.text();
    throw new Error(`[bluesky] createRecord failed: ${err}`);
  }
  const result = await postRes.json();
  console.log(`[bluesky] posted → ${result.uri}`);
  return result.uri;
}

// ---------------------------------------------------------------------------
// Mastodon
// ---------------------------------------------------------------------------

async function postToMastodon({ title, description, url }) {
  const instance = process.env.MASTODON_INSTANCE; // e.g. https://mastodon.social
  const token = process.env.MASTODON_ACCESS_TOKEN;
  if (!instance || !token) {
    console.log('[mastodon] skipped — MASTODON_INSTANCE / MASTODON_ACCESS_TOKEN not set');
    return null;
  }

  // 500 char limit on most instances
  const status = buildPostText({ title, description, url, maxChars: 500 });

  const res = await fetch(`${instance.replace(/\/$/, '')}/api/v1/statuses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status, visibility: 'public' }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[mastodon] post failed: ${err}`);
  }
  const result = await res.json();
  console.log(`[mastodon] posted → ${result.url}`);
  return result.url;
}

// ---------------------------------------------------------------------------
// X / Twitter (OAuth 1.0a, v2 API)
// ---------------------------------------------------------------------------

/** Percent-encode per RFC 3986 (Twitter spec). */
function rfc3986Encode(str) {
  return encodeURIComponent(String(str)).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** Build OAuth 1.0a Authorization header. */
function buildOAuthHeader({ method, url, params, apiKey, apiSecret, accessToken, accessSecret }) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const oauthParams = {
    oauth_consumer_key: apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: accessToken,
    oauth_version: '1.0',
  };

  // Collect all params for signature base
  const allParams = { ...params, ...oauthParams };
  const paramStr = Object.keys(allParams)
    .sort()
    .map((k) => `${rfc3986Encode(k)}=${rfc3986Encode(allParams[k])}`)
    .join('&');

  const baseStr = [
    method.toUpperCase(),
    rfc3986Encode(url),
    rfc3986Encode(paramStr),
  ].join('&');

  const signingKey = `${rfc3986Encode(apiSecret)}&${rfc3986Encode(accessSecret)}`;
  const signature = crypto.createHmac('sha1', signingKey).update(baseStr).digest('base64');

  oauthParams.oauth_signature = signature;

  const headerValue = 'OAuth ' +
    Object.keys(oauthParams)
      .sort()
      .map((k) => `${rfc3986Encode(k)}="${rfc3986Encode(oauthParams[k])}"`)
      .join(', ');

  return headerValue;
}

async function postToTwitter({ title, description, url }) {
  const apiKey = process.env.TWITTER_API_KEY;
  const apiSecret = process.env.TWITTER_API_SECRET;
  const accessToken = process.env.TWITTER_ACCESS_TOKEN;
  const accessSecret = process.env.TWITTER_ACCESS_SECRET;

  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    console.log('[twitter] skipped — TWITTER_API_KEY / _SECRET / _ACCESS_TOKEN / _ACCESS_SECRET not set');
    return null;
  }

  // X counts URLs as 23 chars regardless of actual length; 280 char limit
  const text = buildPostText({ title, description, url, maxChars: 257 }); // 280 - 23 for URL

  const endpoint = 'https://api.twitter.com/2/tweets';
  const body = JSON.stringify({ text });

  const authHeader = buildOAuthHeader({
    method: 'POST',
    url: endpoint,
    params: {},
    apiKey,
    apiSecret,
    accessToken,
    accessSecret,
  });

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    },
    body,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[twitter] post failed: ${err}`);
  }
  const result = await res.json();
  const tweetId = result?.data?.id;
  const tweetUrl = tweetId ? `https://twitter.com/i/web/status/${tweetId}` : '(unknown)';
  console.log(`[twitter] posted → ${tweetUrl}`);
  return tweetUrl;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Post an article to all configured social platforms.
 * @param {object} [opts]
 * @param {string} [opts.slug]  - specific article slug; omit for latest
 * @returns {Promise<{bluesky,mastodon,twitter}>} - posted URLs (null if skipped/failed)
 */
export async function postArticle(opts = {}) {
  const { slug } = opts;

  const article = slug ? await getArticleBySlug(slug) : await getLatestArticle();
  const { data, slug: resolvedSlug } = article;

  const url = `${SITE_URL}/articles/${resolvedSlug}`;
  const payload = {
    title: data.title,
    description: data.description || '',
    url,
  };

  console.log(`[social-post] posting: "${data.title}"`);
  console.log(`[social-post] url: ${url}`);

  const results = { bluesky: null, mastodon: null, twitter: null };
  const errors = [];

  await Promise.allSettled([
    postToBluesky(payload).then((r) => { results.bluesky = r; }).catch((e) => errors.push(e.message)),
    postToMastodon(payload).then((r) => { results.mastodon = r; }).catch((e) => errors.push(e.message)),
    postToTwitter(payload).then((r) => { results.twitter = r; }).catch((e) => errors.push(e.message)),
  ]);

  if (errors.length) {
    console.error('[social-post] some platforms failed:');
    errors.forEach((e) => console.error(' •', e));
  }

  return results;
}
