#!/usr/bin/env node
// Daily content generator. Runs in GitHub Actions on cron at 5am ET weekdays.
// Output: writes Markdown files into src/content/articles/. Caller (CI) commits & pushes.
//
// Modes:
//   - normal: full run, calls Anthropic API, writes files
//   - DRY_RUN=1: pulls headlines + clusters, prints what it WOULD write, no API calls, no files
//
// Reliability:
//   - Any single article failure does not abort the digest or other articles.
//   - All errors logged; exit code is 1 only if zero articles were written.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { fetchAllHeadlines, clusterStories, rankClusters, topPerSection, clusterMatchesExistingTitles } from './lib/fetch-headlines.mjs';
import { draftStandaloneArticle, draftDigest } from './lib/anthropic.mjs';
import { writeArticle } from './lib/publish.mjs';

// Read titles of articles published in the last `hours` hours so we can dedup.
async function recentlyPublishedTitles(hours = 36) {
  const dir = path.resolve('src/content/articles');
  const cutoff = Date.now() - hours * 3600 * 1000;
  const files = await fs.readdir(dir).catch(() => []);
  const titles = [];
  for (const f of files) {
    if (!f.endsWith('.md')) continue;
    try {
      const raw = await fs.readFile(path.join(dir, f), 'utf8');
      const { data } = matter(raw);
      if (Date.parse(data.pubDate) >= cutoff) {
        titles.push(data.title);
      }
    } catch {}
  }
  return titles;
}

const DRY_RUN = process.env.DRY_RUN === '1';
const MAX_STANDALONE_PER_SECTION = Number(process.env.PER_SECTION ?? 2);
const SECTIONS = ['politics', 'elections', 'economy', 'national', 'opinion'];

function bytesUsed(usage) {
  if (!usage) return 0;
  return (usage.input_tokens || 0) + (usage.output_tokens || 0);
}

async function main() {
  const startedAt = new Date();
  console.log(`[generate-daily] start ${startedAt.toISOString()} dryRun=${DRY_RUN}`);

  console.log('[generate-daily] fetching headlines…');
  const headlines = await fetchAllHeadlines();
  console.log(`[generate-daily] pulled ${headlines.length} headlines from ${new Set(headlines.map((h) => h.source)).size} sources`);

  if (headlines.length < 10) {
    console.error('[generate-daily] too few headlines fetched — aborting');
    process.exit(1);
  }

  console.log('[generate-daily] clustering…');
  const clusters = rankClusters(clusterStories(headlines));
  console.log(`[generate-daily] ${clusters.length} clusters; top scored cluster: "${clusters[0].title}" (sources=${clusters[0].sourceCount})`);

  // Pull recently-published titles for dedup (avoid re-publishing same story across daily cron runs)
  const recentTitles = await recentlyPublishedTitles(36);
  console.log(`[generate-daily] ${recentTitles.length} titles published in last 36h to dedup against`);

  // Filter out clusters that match an already-published story
  const fresh = clusters.filter((c) => {
    const dup = clusterMatchesExistingTitles(c, recentTitles);
    if (dup) console.log(`  - skipping (already covered): "${c.title}"`);
    return !dup;
  });
  console.log(`[generate-daily] ${fresh.length} clusters after dedup (was ${clusters.length})`);

  // Top per section, only clusters with at least 2 independent sources
  const bySection = topPerSection(fresh.filter((c) => c.sourceCount >= 2), MAX_STANDALONE_PER_SECTION);

  if (DRY_RUN) {
    console.log('\n=== DRY RUN — would write the following ===');
    console.log('Daily digest from top 8 clusters:');
    for (const c of clusters.slice(0, 8)) console.log(`  - [${c.items[0].section}] ${c.title} (${c.sourceCount} outlets)`);
    console.log('\nStandalone articles per section:');
    for (const sec of SECTIONS) {
      const list = bySection.get(sec) || [];
      console.log(`  ${sec}:`);
      for (const c of list) console.log(`    - ${c.title} (${c.sourceCount} outlets, leans: ${c.leans.join(', ')})`);
    }
    return;
  }

  let written = 0;
  let totalTokens = 0;
  const today = startedAt;
  const dateLabel = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  // 1. Generate standalone articles per section
  for (const sec of SECTIONS) {
    const list = bySection.get(sec) || [];
    for (const cluster of list) {
      try {
        console.log(`[generate-daily] drafting [${sec}] "${cluster.title.slice(0, 80)}"`);
        const { body, meta, usage } = await draftStandaloneArticle(cluster);
        // Force section to match what we picked (model may reclassify)
        meta.section = sec;
        const { slug } = await writeArticle({ body, meta, pubDate: today });
        written++;
        totalTokens += bytesUsed(usage);
        console.log(`  ✓ wrote ${slug}`);
      } catch (err) {
        console.warn(`  ✗ skipped: ${err.message}`);
      }
    }
  }

  // 2. Generate the digest from the top scored clusters — but only on the morning run.
  // Subsequent runs (midday/evening) just publish standalones; one digest per day.
  const utcHour = today.getUTCHours();
  const isMorningRun = utcHour < 13; // before 9am ET-ish
  const todayDigestExists = recentTitles.some((t) => /the brief/i.test(t) && t.includes(today.toISOString().slice(0,10).replace(/-/g,'') === today.toISOString().slice(0,10).replace(/-/g,'') ? '' : ''));
  // Safer dedup: just check if any digest-like title exists in the last 18 hours
  const digestSeenRecently = (await recentlyPublishedTitles(18)).some((t) => /^the brief/i.test(t));

  if (isMorningRun && !digestSeenRecently) {
    try {
      console.log('[generate-daily] drafting digest (morning run)…');
      const { body, meta, usage } = await draftDigest(fresh.slice(0, 10), dateLabel);
      meta.section = 'digest';
      const { slug } = await writeArticle({ body, meta, pubDate: today });
      written++;
      totalTokens += bytesUsed(usage);
      console.log(`  ✓ wrote digest ${slug}`);
    } catch (err) {
      console.warn(`  ✗ digest skipped: ${err.message}`);
    }
  } else {
    console.log(`[generate-daily] skipping digest (utcHour=${utcHour}, digestSeenRecently=${digestSeenRecently}) — only morning run produces a digest`);
  }

  const elapsed = ((Date.now() - startedAt.getTime()) / 1000).toFixed(1);
  console.log(`[generate-daily] DONE — wrote ${written} articles in ${elapsed}s, ~${totalTokens} tokens`);

  if (written === 0) {
    console.error('[generate-daily] no articles written — failing');
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error('[generate-daily] FATAL', err);
  // Surface Anthropic credit / quota errors loudly so the shareholder sees the
  // shutdown in the queue + next standup instead of "huh, where's content?"
  const msg = String(err && err.message || err);
  const creditOut = /credit balance is too low|insufficient_quota|429|rate_limit_error/i.test(msg);
  if (creditOut) {
    try {
      const { promises: fs } = await import('node:fs');
      const path = await import('node:path');
      const queueFile = path.resolve('ops/queue.md');
      const queue = await fs.readFile(queueFile, 'utf8').catch(() => '# Sprint Queue\n\n');
      const flag = '[NEEDS-SHAREHOLDER] Anthropic credit balance depleted';
      if (!queue.includes(flag)) {
        await fs.writeFile(
          queueFile,
          queue.trimEnd() + `\n- [ ] ${flag} — content generation halted, top up at https://console.anthropic.com/settings/billing  _surfaced ${new Date().toISOString()}_\n`,
          'utf8'
        );
        console.error('[generate-daily] queued shareholder alert: credits depleted');
      }
    } catch (e) {
      console.error('[generate-daily] failed to surface credit alert:', e.message);
    }
  }
  process.exit(1);
});
