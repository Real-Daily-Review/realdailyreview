// Vercel Cron: Bluesky engagement (replies, likes, follows) — replaces bluesky-engagement.yml
// Schedule: every 6h — see vercel.json
export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyCron, runScript } from '../../../lib/cron-runner';

export const GET: APIRoute = async ({ request }) => {
  if (!verifyCron(request)) return new Response('Unauthorized', { status: 401 });

  try {
    await runScript({
      installCmd: null,  // deps bundled in Lambda via NODE_PATH
      scriptCmd: 'node scripts/bluesky-engagement.mjs',
      gitAddPaths: ['ops/social-posted/', 'ops/activity/'],
      commitMsg: `social: bluesky engagement ${new Date().toISOString().slice(0, 16)}Z`,
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
    console.error('[bluesky-engagement]', e.message);
    return new Response(e.message, { status: 500 });
  }
};
