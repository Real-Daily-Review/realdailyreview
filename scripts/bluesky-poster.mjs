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
import Anthropic from '@anthropic-ai/sdk';

const ARTICLES_DIR = path.resolve('src/content/articles');
const POSTED_FILE = path.resolve('ops/social-posted/bluesky.json');
const SITE_URL = 'https://realdailyreview.com';
const LOOKBACK_HOURS = 6;
const MAX_POSTS_PER_RUN = 4;
const MAX_CHARS = 290; // Bluesky cap is 300; leave buffer for URL byte calc

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

// Fallback when AI hook fails — beats nothing.
function fallbackPost(article) {
  const url = `${SITE_URL}/articles/${article.slug}`;
  const title = article.data.title;
  let text = `${title}\n${url}`;
  return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS - 3) + '…\n' + url : text;
}

// AI-drafted hook with curiosity gap, specific stakes/numbers, no hashtags.
// Cost per post: ~$0.0005 in Haiku. Worth it for click-through gains.
async function aiHook({ client, article, body }) {
  const url = `${SITE_URL}/articles/${article.slug}`;
  const prompt = `Write a Bluesky post (max ${MAX_CHARS - url.length - 2} chars BEFORE we append the URL on its own line) for the news article below. Goal: make a skeptical, news-savvy reader want to click. Apply ONE of these proven hook styles, picking whichever fits the story best:

1. Sharp stake — lead with the specific number, name, or consequence ("$45B raise from a 14-month-old lab" / "First conviction under the new statute")
2. Contrast / conflict — set up two sides ("Trump says X. Critics say Y.")
3. Curiosity gap — name the surprising detail without resolving it ("The note was sealed for five years. Today a judge unsealed it.")
4. Why-this-matters — quick stake for the reader ("If you fly Spirit, here's what just happened.")

HARD rules:
- No hashtags. No emoji. No "you won't believe", "this changes everything", or other clickbait phrases.
- One sentence, two max. Tight. Punchy.
- Use a specific name, number, or place where the source supports it.
- Don't paraphrase the title verbatim — give us the angle the headline didn't.
- Output ONLY the hook text. NO preamble, NO URL, NO quotes around it.

ARTICLE TITLE: ${article.data.title}
SECTION: ${article.data.section}
DESCRIPTION: ${article.data.description}
BODY (first 700 chars):
${(body || '').replace(/<[^>]+>/g, '').slice(0, 700)}`;

  const r = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 220,
    temperature: 0.6,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim()
    .replace(/^["']|["']$/g, '')   // strip wrapping quotes if any
    .replace(/^\*+|\*+$/g, '')      // strip stray markdown
    .replace(/\n{2,}/g, '\n');
  return text;
}

function assembleWithUrl(hook, url) {
  let text = `${hook}\n${url}`;
  if (text.length > MAX_CHARS) {
    const allowed = MAX_CHARS - url.length - 2;
    text = `${hook.slice(0, allowed - 1).trim()}…\n${url}`;
  }
  return text;
}

async function buildPost({ client, article }) {
  const url = `${SITE_URL}/articles/${article.slug}`;
  // Read body for richer hook context
  let body = '';
  try {
    const raw = await fs.readFile(path.join(ARTICLES_DIR, article.slug + '.md'), 'utf8');
    const parsed = matter(raw);
    body = parsed.content;
  } catch {}
  if (!client) return { text: fallbackPost(article), strategy: 'fallback-no-client' };
  try {
    const hook = await aiHook({ client, article, body });
    if (!hook || hook.length < 12) return { text: fallbackPost(article), strategy: 'fallback-empty-hook' };
    return { text: assembleWithUrl(hook, url), strategy: 'ai-hook', hook };
  } catch (err) {
    console.warn(`[bluesky] aiHook failed for ${article.slug}: ${err.message}`);
    return { text: fallbackPost(article), strategy: 'fallback-ai-error' };
  }
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

async function writeStatus(status) {
  await fs.mkdir(path.dirname(POSTED_FILE), { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const file = path.resolve('ops/social-posted', `bluesky-status-${today}.json`);
  await fs.writeFile(file, JSON.stringify({ ...status, written_at: new Date().toISOString() }, null, 2), 'utf8');
}

async function main() {
  const handle = process.env.BLUESKY_HANDLE;
  const password = process.env.BLUESKY_APP_PASSWORD;
  const presence = { has_handle: !!handle, has_password: !!password, handle: handle || null };

  if (!handle || !password) {
    console.log('[bluesky] BLUESKY_HANDLE or BLUESKY_APP_PASSWORD not set — skipping');
    await writeStatus({ outcome: 'skipped', reason: 'secrets missing', ...presence });
    return;
  }
  const posted = await readPosted();
  const recent = await recentArticles();
  const candidates = recent.filter((a) => !posted.slugs.includes(a.slug));
  if (candidates.length === 0) {
    console.log('[bluesky] nothing new to post');
    await writeStatus({
      outcome: 'no-candidates',
      reason: `${recent.length} articles in last ${LOOKBACK_HOURS}h; all already posted`,
      already_posted_count: posted.slugs.length,
      ...presence,
    });
    return;
  }

  let session;
  try {
    session = await bskyAuth(handle, password);
  } catch (err) {
    console.error('[bluesky] auth failed:', err.message);
    await writeStatus({ outcome: 'auth-failed', error: err.message, ...presence });
    return;
  }

  const aiClient = process.env.ANTHROPIC_API_KEY
    ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    : null;

  let posts = 0;
  const failures = [];
  const sent = [];
  for (const a of candidates.slice(0, MAX_POSTS_PER_RUN)) {
    const built = await buildPost({ client: aiClient, article: a });
    try {
      const res = await bskyPost({ session, text: built.text });
      console.log(`[bluesky] posted ${a.slug} (${built.strategy}) → ${res.uri}`);
      posted.slugs.push(a.slug);
      sent.push({ slug: a.slug, uri: res.uri, strategy: built.strategy, hook: built.hook || null, posted_at: new Date().toISOString() });
      posts++;
      await new Promise((r) => setTimeout(r, 4500));
    } catch (err) {
      console.warn(`[bluesky] failed ${a.slug}: ${err.message}`);
      failures.push({ slug: a.slug, error: err.message });
    }
  }
  posted.slugs = posted.slugs.slice(-500);
  // Append per-post log so we can later tie engagement back to which hook strategy was used.
  posted.posts = (posted.posts || []).concat(sent).slice(-200);
  await writePosted(posted);
  await writeStatus({
    outcome: 'sent',
    candidates: candidates.length,
    posted: posts,
    used_ai_hooks: !!aiClient,
    failures,
    sent,
    ...presence,
  });
  console.log(`[bluesky] posted ${posts}/${candidates.length} (ai=${!!aiClient})`);
}

main().catch((err) => { console.error(err); process.exit(1); });
