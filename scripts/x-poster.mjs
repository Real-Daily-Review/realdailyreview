#!/usr/bin/env node
/**
 * X (Twitter) cross-poster for Real Daily Review
 * Posts the best unposted CO article to @codailyreview every 2 hours.
 *
 * Env vars required:
 *   X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET
 *
 * Tracking: ops/social-posted/x-posts.json
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import matter from 'gray-matter';

const ARTICLES_DIR = path.resolve('src/content/articles');
const POSTED_FILE = path.resolve('ops/social-posted/x-posts.json');
const SITE_URL = 'https://realdailyreview.com';

// ── OAuth 1.0a ──────────────────────────────────────────────────────────────

function pct(s) {
  return encodeURIComponent(String(s))
    .replace(/!/g,'%21').replace(/'/g,'%27').replace(/\(/g,'%28')
    .replace(/\)/g,'%29').replace(/\*/g,'%2A');
}

function oauthHeader(method, url, consumerKey, consumerSecret, token, tokenSecret, extra = {}) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const ts = Math.floor(Date.now() / 1000).toString();

  const params = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: ts,
    oauth_token: token,
    oauth_version: '1.0',
    ...extra,
  };

  const allParams = { ...params };
  const sortedStr = Object.keys(allParams).sort()
    .map(k => `${pct(k)}=${pct(allParams[k])}`).join('&');

  const base = `${method.toUpperCase()}&${pct(url)}&${pct(sortedStr)}`;
  const sigKey = `${pct(consumerSecret)}&${pct(tokenSecret)}`;
  const sig = crypto.createHmac('sha1', sigKey).update(base).digest('base64');

  params.oauth_signature = sig;
  const header = 'OAuth ' + Object.keys(params).sort()
    .map(k => `${pct(k)}="${pct(params[k])}"`).join(', ');
  return header;
}

// ── Post tweet ───────────────────────────────────────────────────────────────

async function postTweet(text) {
  const { X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET } = process.env;
  if (!X_API_KEY || !X_API_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_TOKEN_SECRET) {
    throw new Error('Missing X API credentials (X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_TOKEN_SECRET)');
  }

  const url = 'https://api.twitter.com/2/tweets';
  const auth = oauthHeader('POST', url, X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET);

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': auth,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });

  const json = await resp.json();
  if (!resp.ok) throw new Error(`X API error ${resp.status}: ${JSON.stringify(json)}`);
  return json.data;
}

// ── Build tweet text ─────────────────────────────────────────────────────────

function buildTweet(slug, title, description, tags = []) {
  const url = `${SITE_URL}/articles/${slug}`;

  // CO-relevant hashtags
  const tagMap = {
    'colorado': '#Colorado',
    'denver': '#Denver',
    'wildfire': '#Wildfire',
    'elections': '#COPolitics',
    'economy': '#Colorado',
    'education': '#COEducation',
    'i-70': '#I70',
    'emergency-management': '#Colorado',
  };
  const hashtags = [...new Set(
    tags.filter(t => tagMap[t]).map(t => tagMap[t])
  )].slice(0, 2).join(' ');

  // URL counts as ~23 chars on Twitter
  const urlPlaceholder = ' '.repeat(23);
  const maxBody = 280 - urlPlaceholder.length - (hashtags ? hashtags.length + 2 : 0) - 4;

  let body = title;
  if (description && body.length + description.length + 2 < maxBody) {
    body += `\n\n${description}`;
  } else if (body.length > maxBody) {
    body = body.slice(0, maxBody - 1) + '…';
  }

  return [body, url, hashtags].filter(Boolean).join('\n\n');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Load posted log
  let posted = {};
  try {
    posted = JSON.parse(await fs.readFile(POSTED_FILE, 'utf8'));
  } catch { /* first run */ }

  // Read articles, newest first
  const files = (await fs.readdir(ARTICLES_DIR))
    .filter(f => f.endsWith('.md'))
    .sort()
    .reverse();

  // Find best unposted article from last 48h
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  let pick = null;

  for (const file of files) {
    const slug = file.replace(/\.md$/, '');
    if (posted[slug]) continue;

    const raw = await fs.readFile(path.join(ARTICLES_DIR, file), 'utf8');
    const { data } = matter(raw);

    const pub = new Date(data.pubDate).getTime();
    if (pub < cutoff) break; // articles are sorted newest-first, stop when too old

    // Prefer CO-specific articles
    const isCO = (data.tags || []).some(t =>
      ['colorado','denver','i-70','colorado-ag-race','colorado-weather','fire-weather'].includes(t)
    ) || /colorado|denver/i.test(data.title);

    if (!pick || (isCO && !pick.isCO)) {
      pick = { slug, data, isCO };
      if (isCO) break; // best we can find
    }
  }

  if (!pick) {
    console.log('[x-poster] No new articles to post.');
    return;
  }

  const { slug, data } = pick;
  const text = buildTweet(slug, data.title, data.description, data.tags || []);

  console.log(`[x-poster] Posting: ${slug}`);
  console.log(`[x-poster] Tweet:\n${text}\n`);

  const result = await postTweet(text);
  console.log(`[x-poster] Posted tweet id=${result.id}`);

  // Record
  posted[slug] = { tweetId: result.id, postedAt: new Date().toISOString() };
  await fs.mkdir(path.dirname(POSTED_FILE), { recursive: true });
  await fs.writeFile(POSTED_FILE, JSON.stringify(posted, null, 2));
  console.log(`[x-poster] Logged to ${POSTED_FILE}`);
}

main().catch(e => { console.error('[x-poster] FATAL:', e.message); process.exit(1); });
