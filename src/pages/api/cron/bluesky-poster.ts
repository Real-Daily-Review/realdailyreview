// Vercel Cron: Bluesky cross-poster (replaces bluesky-poster.yml)
// Schedule: every 2h at :15 — see vercel.json
export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyCron, runScript } from '../../../lib/cron-runner';

export const GET: APIRoute = async ({ request }) => {
  if (!verifyCron(request)) return new Response('Unauthorized', { status: 401 });

  try {
    await runScript({
      installCmd: 'npm install gray-matter@^4 @anthropic-ai/sdk@^0.30 --no-save --no-audit --no-fund',
      scriptCmd: 'node scripts/bluesky-poster.mjs',
      gitAddPaths: ['ops/social-posted/'],
      commitMsg: `social: bluesky cross-post ${new Date().toISOString().slice(0, 16)}Z`,
      authorName: 'Ravi Sharma (Growth)',
      authorEmail: 'ravi@realdailyreview.com',
      env: {
        BLUESKY_HANDLE: process.env.BLUESKY_HANDLE,
        BLUESKY_APP_PASSWORD: process.env.BLUESKY_APP_PASSWORD,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      },
    });
    return new Response('OK', { status: 200 });
  } catch (e: any) {
    console.error('[bluesky-poster]', e.message);
    return new Response(e.message, { status: 500 });
  }
};
