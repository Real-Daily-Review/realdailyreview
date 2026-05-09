#!/usr/bin/env node
/**
 * social-post-runner.mjs
 * CLI entry point for the social cross-poster.
 *
 * Usage:
 *   node scripts/lib/social-post-runner.mjs
 *   node scripts/lib/social-post-runner.mjs --slug 2026-05-09-some-article-slug
 *
 * Exit codes:
 *   0 — at least one platform posted successfully (or all skipped due to missing creds)
 *   1 — hard failure (article not found, all platforms errored, etc.)
 */

import { postArticle } from './social-post.mjs';

const args = process.argv.slice(2);
const slugIdx = args.indexOf('--slug');
const slug = slugIdx !== -1 ? args[slugIdx + 1] : undefined;

if (slugIdx !== -1 && !slug) {
  console.error('Error: --slug flag requires a value');
  process.exit(1);
}

try {
  const results = await postArticle({ slug });
  const posted = Object.values(results).filter(Boolean);
  if (posted.length === 0) {
    console.log('[social-post-runner] No platforms posted (all skipped or no credentials configured).');
    console.log('[social-post-runner] Set env vars per ops/SOCIAL_SETUP.md to enable posting.');
  } else {
    console.log(`[social-post-runner] Done. Posted to ${posted.length} platform(s).`);
  }
  process.exit(0);
} catch (err) {
  console.error('[social-post-runner] Fatal error:', err.message);
  process.exit(1);
}
