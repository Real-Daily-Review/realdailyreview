// Pull headlines from each RSS feed, deduplicate, score, return top N per section.
// Resilient: any one feed failing doesn't break the run.

import Parser from 'rss-parser';
import { FEEDS } from './sources.mjs';

const parser = new Parser({
  timeout: 8000,
  headers: { 'User-Agent': 'RealDailyReviewBot/1.0 (+https://realdailyreview.com)' },
});

function normalizeTitle(t) {
  return (t || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOPWORDS = new Set([
  'the','and','for','with','from','that','this','but','not','have','has','had',
  'been','were','was','will','would','could','should','says','said','says.',
  'after','about','into','over','under','than','then','also','more','most',
  'their','them','they','there','here','some','many','much','these','those',
]);

// Significant words: length >= 4 and not a stopword.
function sigWords(t) {
  return new Set(
    normalizeTitle(t)
      .split(' ')
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
  );
}

// Two-tier similarity — Jaccard plus a "two long words match = same story" override.
function similar(a, b) {
  const A = sigWords(a);
  const B = sigWords(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  let longMatches = 0;
  for (const w of A) {
    if (B.has(w)) {
      inter++;
      if (w.length >= 6) longMatches++;
    }
  }
  const union = A.size + B.size - inter;
  const jacc = inter / union;
  // Override: two distinctive (≥6-char) words in common → same story regardless of jaccard
  if (longMatches >= 2) return Math.max(jacc, 0.9);
  return jacc;
}

export async function fetchAllHeadlines() {
  const out = [];
  await Promise.all(
    FEEDS.map(async (feed) => {
      try {
        const r = await parser.parseURL(feed.url);
        for (const item of (r.items || []).slice(0, 20)) {
          if (!item.title || !item.link) continue;
          const pub = item.isoDate || item.pubDate || new Date().toISOString();
          out.push({
            title: item.title.trim(),
            link: item.link,
            source: feed.name,
            section: feed.section,
            lean: feed.lean,
            weight: feed.weight,
            published: new Date(pub).toISOString(),
            summary: (item.contentSnippet || item.content || '').replace(/\s+/g, ' ').trim().slice(0, 600),
          });
        }
      } catch (err) {
        console.warn(`[sources] feed failed: ${feed.name} — ${err.message}`);
      }
    })
  );
  return out;
}

// Group similar stories together. Each cluster has one canonical title and N sources.
export function clusterStories(items, threshold = 0.20) {
  const clusters = [];
  for (const item of items) {
    let placed = false;
    for (const c of clusters) {
      if (similar(c.title, item.title) >= threshold) {
        c.items.push(item);
        // Keep canonical title from highest-weight source
        if (item.weight > (c.bestWeight || 0)) {
          c.title = item.title;
          c.bestWeight = item.weight;
        }
        // Track political leans represented
        if (!c.leans.includes(item.lean)) c.leans.push(item.lean);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push({ title: item.title, items: [item], leans: [item.lean], bestWeight: item.weight });
  }
  return clusters;
}

// Score: number of independent sources (after dedup), source weight, lean diversity.
export function rankClusters(clusters) {
  for (const c of clusters) {
    const uniqueSources = new Set(c.items.map((i) => i.source));
    c.sourceCount = uniqueSources.size;
    c.totalWeight = c.items.reduce((s, i) => s + i.weight, 0);
    c.leanDiversity = c.leans.length;
    // Recency: most recent timestamp
    c.mostRecent = Math.max(...c.items.map((i) => new Date(i.published).getTime()));
    // Composite score
    c.score = c.sourceCount * 2 + c.totalWeight + c.leanDiversity * 0.5;
  }
  return clusters.sort((a, b) => b.score - a.score);
}

export function topPerSection(clusters, n = 4) {
  const by = new Map();
  for (const c of clusters) {
    const sec = c.items[0].section;
    if (!by.has(sec)) by.set(sec, []);
    if (by.get(sec).length < n) by.get(sec).push(c);
  }
  return by;
}

// Compare a cluster's headline against all previously-published article titles
// in the lookback window. Returns true if substantially similar to any of them.
export function clusterMatchesExistingTitles(cluster, existingTitles, threshold = 0.30) {
  if (!existingTitles || existingTitles.length === 0) return false;
  for (const title of existingTitles) {
    if (titleSimilarity(cluster.title, title) >= threshold) return true;
    // Also check each item in the cluster
    for (const item of cluster.items) {
      if (titleSimilarity(item.title, title) >= threshold) return true;
    }
  }
  return false;
}

function titleSimilarity(a, b) {
  const A = sigWords(a);
  const B = sigWords(b);
  if (!A.size || !B.size) return 0;
  let inter = 0, longMatches = 0;
  for (const w of A) {
    if (B.has(w)) {
      inter++;
      if (w.length >= 6) longMatches++;
    }
  }
  if (longMatches >= 2) return 0.9;
  return inter / (A.size + B.size - inter);
}
