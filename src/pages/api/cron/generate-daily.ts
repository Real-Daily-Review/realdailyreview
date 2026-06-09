// Vercel Cron: content generation (replaces daily-publish.yml)
// Schedule: 8x/day — see vercel.json
// maxDuration: 300s
//
// Deps are bundled into the Lambda by nft at build time.
// The subprocess finds them via NODE_PATH=/var/task/node_modules — no npm install needed.
export const prerender = false;

// Force nft to bundle these deps so subprocess can use them via NODE_PATH
import '@anthropic-ai/sdk';
import 'gray-matter';
import 'rss-parser';
import 'slugify';
import 'sanitize-html';

import type { APIRoute } from 'astro';
import { verifyCron, runScript } from '../../../lib/cron-runner';

export const GET: APIRoute = async ({ request }) => {
  if (!verifyCron(request)) return new Response('Unauthorized', { status: 401 });

  try {
    await runScript({
      installCmd: null,  // deps bundled in Lambda via NODE_PATH
      scriptCmd: 'node scripts/generate-daily.mjs',
      gitAddPaths: ['src/content/articles/', 'ops/runs/', 'public/og/'],
      commitMsg: `content: auto-publish ${new Date().toISOString().slice(0, 16)}Z [vercel-cron]`,
      authorName: 'Real Daily Review Bot',
      authorEmail: 'bot@realdailyreview.com',
      env: {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        PER_SECTION: '1',
      },
      scriptTimeout: 250_000,
    });
    return new Response('OK', { status: 200 });
  } catch (e: any) {
    console.error('[generate-daily]', e.message?.slice(0, 500));
    return new Response(e.message?.slice(0, 1000) ?? 'error', { status: 500 });
  }
};
