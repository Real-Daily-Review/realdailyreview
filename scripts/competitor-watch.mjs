#!/usr/bin/env node
/**
 * Competitor watch — daily deep-dive on competing daily-news brief sites.
 *
 * For each competitor:
 *   - Fetches homepage HTML (lightweight)
 *   - Parses headlines, story count, layout patterns
 *   - Notes RSS feed cadence (last N posts, time gaps)
 *
 * Then asks Anthropic to compare against Real Daily Review and:
 *   - Identify what each competitor does well
 *   - Identify what we're missing or could improve
 *   - Surface 1-3 concrete actionable items
 *
 * Output:
 *   - ops/competitive/YYYY-MM-DD.md (full report)
 *   - Appends top 1-2 actions to ops/queue.md (so feature-builder can pick up)
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import Parser from 'rss-parser';
import Anthropic from '@anthropic-ai/sdk';

const ROOT = path.resolve('.');
const COMPETITIVE_DIR = path.join(ROOT, 'ops/competitive');
const QUEUE_FILE = path.join(ROOT, 'ops/queue.md');

const COMPETITORS = [
  { name: 'Axios',         url: 'https://www.axios.com',           rss: 'https://api.axios.com/feed/' },
  { name: 'Morning Brew',  url: 'https://www.morningbrew.com',     rss: 'https://www.morningbrew.com/daily/feed' },
  { name: '1440',          url: 'https://join1440.com',            rss: null },
  { name: 'Semafor',       url: 'https://www.semafor.com',         rss: 'https://www.semafor.com/feed/index.xml' },
  { name: 'The Skimm',     url: 'https://www.theskimm.com',        rss: null },
  { name: 'Tangle',        url: 'https://www.readtangle.com',      rss: 'https://www.readtangle.com/rss/' },
  { name: 'Ground News',   url: 'https://ground.news',             rss: null },
  { name: 'Smartr Daily',  url: 'https://www.smartr.me',           rss: null },
  { name: 'The Hustle',    url: 'https://thehustle.co',            rss: 'https://thehustle.co/feed/' },
  { name: 'Punchbowl',     url: 'https://punchbowl.news',          rss: null },
];

const parser = new Parser({
  timeout: 8000,
  headers: { 'User-Agent': 'RealDailyReviewBot/1.0 (+https://realdailyreview.com)' },
});

function ymd(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

async function fetchText(url, timeoutMs = 8000) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'RealDailyReviewBot/1.0 (+https://realdailyreview.com)' },
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!r.ok) return null;
    return await r.text();
  } catch (err) {
    return null;
  }
}

function extractHeadlines(html, limit = 10) {
  if (!html) return [];
  // Pull <title> tags + <h1>/<h2>/<h3> contents. Strip HTML, dedupe, limit.
  const found = [];
  for (const m of html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)) {
    const txt = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (txt && txt.length >= 12 && txt.length <= 200 && !found.includes(txt)) {
      found.push(txt);
      if (found.length >= limit) break;
    }
  }
  return found;
}

function inferStructure(html) {
  if (!html) return {};
  return {
    has_newsletter_signup: /newsletter|subscribe|sign\s*up|email/i.test(html),
    has_paywall: /\bpaywall\b|metered|subscribe to read|premium subscription/i.test(html),
    has_login: /\blog\s*in\b|sign\s*in/i.test(html),
    has_dark_mode: /prefers-color-scheme|dark[-_ ]mode/i.test(html),
    word_count_approx: html.replace(/<[^>]+>/g, ' ').split(/\s+/).length,
    body_length_kb: Math.round(html.length / 1024),
  };
}

async function rssCadence(rssUrl) {
  if (!rssUrl) return null;
  try {
    const feed = await parser.parseURL(rssUrl);
    const items = (feed.items || []).slice(0, 20);
    if (items.length < 2) return null;
    const dates = items.map((i) => Date.parse(i.isoDate || i.pubDate || '')).filter(Boolean).sort((a, b) => b - a);
    const gaps = [];
    for (let i = 0; i < dates.length - 1; i++) {
      gaps.push((dates[i] - dates[i + 1]) / 1000 / 3600); // hours
    }
    const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;
    return {
      items_recent: items.length,
      newest_at: items[0]?.isoDate || items[0]?.pubDate || null,
      avg_gap_hours: avgGap ? Math.round(avgGap * 10) / 10 : null,
      sample_titles: items.slice(0, 5).map((i) => i.title),
    };
  } catch {
    return null;
  }
}

async function analyzeCompetitor(c) {
  const html = await fetchText(c.url);
  const headlines = extractHeadlines(html, 12);
  const structure = inferStructure(html);
  const rss = await rssCadence(c.rss);
  return {
    name: c.name,
    url: c.url,
    fetched_ok: !!html,
    headlines,
    structure,
    rss,
  };
}

async function readOurSiteSnapshot() {
  // Snapshot of our own state for comparison
  const articlesDir = path.join(ROOT, 'src/content/articles');
  const files = (await fs.readdir(articlesDir).catch(() => [])).filter((f) => f.endsWith('.md'));
  const last24h = Date.now() - 24 * 3600 * 1000;
  let recent = 0;
  for (const f of files) {
    try {
      const stat = await fs.stat(path.join(articlesDir, f));
      if (stat.mtimeMs >= last24h) recent++;
    } catch {}
  }
  return {
    site: 'realdailyreview.com',
    total_articles: files.length,
    articles_last_24h: recent,
    has_newsletter: true,
    has_phone_collection: true,
    has_dark_mode: true,
    monetization: 'Skimlinks (live), BMaC (live), Ezoic Incubator (in review), AdSense (pending Day 14)',
    daily_publish_cadence: '5x/day cron (every 4-6h)',
    standup_cadence: '4x/day',
    days_old: Math.floor((Date.now() - Date.parse('2026-05-06')) / (24 * 3600 * 1000)),
  };
}

async function aiCompare(ours, competitors) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = `You are a competitive analyst for Real Daily Review (a brand-new AI-driven daily news brief at realdailyreview.com). Compare us to direct competitors and produce a tight Markdown report.

OUR STATE:
${JSON.stringify(ours, null, 2)}

COMPETITORS (data fetched today):
${JSON.stringify(competitors, null, 2)}

Produce a report with these sections:

## What competitors do well (top 5)
- bullet list, name + specific tactic, ≤25 words each

## Where we lag (top 5, ranked by leverage)
- bullet list, what we're missing + estimated ROI on closing the gap

## Differentiation opportunities (top 3)
- specific things we could do that NO competitor in the list does. AI-native production is one obvious lever. Brevity is another. Find more.

## Concrete actions for the queue (top 3, AUTONOMOUS-BUILDABLE only)
- Each item must be:
  - implementable as code (not "create a podcast" or "hire writers")
  - completable in <1 day of autonomous work
  - tagged (dev), (content), (growth), or (monetization)
  - prefixed [BUILD-NOW] for the actions you most recommend
  - phrased as a self-contained queue item (e.g., "(growth) Add 'Read this in 2 minutes' time-to-read indicator at the top of every article")
  - NO items that require shareholder accounts, payment, or identity verification

Keep total under 800 words. Be specific. No fluff.`;

  const r = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2500,
    temperature: 0.4,
    messages: [{ role: 'user', content: prompt }],
  });
  return r.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

function extractActionsFromReport(report) {
  // Match any line that contains [BUILD-NOW] (with or without bold/list markers).
  // Strip leading list markers, bold markers, and the [BUILD-NOW] tag itself.
  const out = [];
  for (const line of report.split('\n')) {
    if (!/\[BUILD-NOW\]/i.test(line)) continue;
    let cleaned = line
      .replace(/^[-*]\s+/, '')           // leading list marker
      .replace(/\*\*\[BUILD-NOW\]\*\*\s*/i, '')
      .replace(/\[BUILD-NOW\]\s*/i, '')
      .replace(/^\*\*([^*]+)\*\*/, '$1') // remove leading bold
      .replace(/^`([^`]+)`/, '$1')       // remove leading inline-code
      .trim();
    // Skip header lines like "## Concrete actions [BUILD-NOW]"
    if (/^#+\s/.test(cleaned)) continue;
    if (cleaned.length < 12) continue;
    out.push(cleaned);
  }
  return out;
}

async function appendActionsToQueue(actions) {
  if (actions.length === 0) return;
  const queue = await fs.readFile(QUEUE_FILE, 'utf8').catch(() => '# Sprint Queue\n\n');
  const today = ymd();
  // Skip actions already in queue (substring match on first 30 chars)
  const fresh = actions.filter((a) => !queue.toLowerCase().includes(a.toLowerCase().slice(0, 30)));
  if (fresh.length === 0) return;
  const block = '\n' + fresh.map((a) => `- [ ] ${a}  _from competitor-watch ${today}_`).join('\n') + '\n';
  await fs.writeFile(QUEUE_FILE, queue.trimEnd() + block, 'utf8');
}

async function main() {
  await fs.mkdir(COMPETITIVE_DIR, { recursive: true });

  console.log('[competitor-watch] analyzing…');
  const ours = await readOurSiteSnapshot();
  const competitors = [];
  for (const c of COMPETITORS) {
    const res = await analyzeCompetitor(c);
    competitors.push(res);
    console.log(`  ${res.name}: ${res.fetched_ok ? `${res.headlines.length} headlines` : 'FAILED to fetch'}`);
  }

  console.log('[competitor-watch] running AI compare…');
  const report = await aiCompare(ours, competitors);

  const date = ymd();
  const reportPath = path.join(COMPETITIVE_DIR, `${date}.md`);
  const file = `# Competitive deep-dive — ${date}

_Generated by competitor-watch.yml. Compares Real Daily Review against ${competitors.length} direct competitors._

## Our state
\`\`\`json
${JSON.stringify(ours, null, 2)}
\`\`\`

## Competitors fetched
${competitors.map((c) => `- **${c.name}** (${c.url}) — ${c.fetched_ok ? `${c.headlines.length} headlines` : 'fetch failed'}`).join('\n')}

---

${report}
`;
  await fs.writeFile(reportPath, file, 'utf8');
  console.log(`[competitor-watch] wrote ${reportPath}`);

  const actions = extractActionsFromReport(report);
  if (actions.length > 0) {
    await appendActionsToQueue(actions);
    console.log(`[competitor-watch] appended ${actions.length} action(s) to queue.md`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
