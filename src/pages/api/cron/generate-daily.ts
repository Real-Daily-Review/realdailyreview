// Vercel Cron: content generation (replaces daily-publish.yml)
// Schedule: 8x/day — see vercel.json
// maxDuration: 300s (full npm ci + RSS fetch + Anthropic generation)
export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyCron, runScript } from '../../../lib/cron-runner';

export const GET: APIRoute = async ({ request }) => {
  if (!verifyCron(request)) return new Response('Unauthorized', { status: 401 });

  try {
    await runScript({
      installCmd: 'npm ci --prefer-offline --no-audit --no-fund',
      scriptCmd: 'npm run generate:daily',
      gitAddPaths: ['src/content/articles/', 'ops/runs/', 'public/og/'],
      commitMsg: `content: auto-publish ${new Date().toISOString().slice(0, 16)}Z [vercel-cron]`,
      authorName: 'Real Daily Review Bot',
      authorEmail: 'bot@realdailyreview.com',
      env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY },
      scriptTimeout: 240_000,
    });
    return new Response('OK', { status: 200 });
  } catch (e: any) {
    console.error('[generate-daily]', e.message);
    return new Response(e.message, { status: 500 });
  }
};
