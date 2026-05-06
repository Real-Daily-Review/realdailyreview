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

import { fetchAllHeadlines, clusterStories, rankClusters, topPerSection } from './lib/fetch-headlines.mjs';
import { draftStandaloneArticle, draftDigest } from './lib/anthropic.mjs';
import { writeArticle } from './lib/publish.mjs';

const DRY_RUN = process.env.DRY_RUN === '1';
const MAX_STANDALONE_PER_SECTION = Number(process.env.PER_SECTION ?? 2);
const SECTIONS = ['politics', 'business', 'world', 'tech'];

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

  // Top per section, only clusters with at least 2 independent sources
  const bySection = topPerSection(clusters.filter((c) => c.sourceCount >= 2), MAX_STANDALONE_PER_SECTION);

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

  // 2. Generate the digest from the top scored clusters
  try {
    console.log('[generate-daily] drafting digest…');
    const { body, meta, usage } = await draftDigest(clusters.slice(0, 12), dateLabel);
    meta.section = 'digest';
    const { slug } = await writeArticle({ body, meta, pubDate: today });
    written++;
    totalTokens += bytesUsed(usage);
    console.log(`  ✓ wrote digest ${slug}`);
  } catch (err) {
    console.warn(`  ✗ digest skipped: ${err.message}`);
  }

  const elapsed = ((Date.now() - startedAt.getTime()) / 1000).toFixed(1);
  console.log(`[generate-daily] DONE — wrote ${written} articles in ${elapsed}s, ~${totalTokens} tokens`);

  if (written === 0) {
    console.error('[generate-daily] no articles written — failing');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[generate-daily] FATAL', err);
  process.exit(1);
});
