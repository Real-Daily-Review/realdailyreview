// Vercel Cron: CEO standup / Ben Foster CoS (replaces ceo-standup.yml)
// Schedule: every 4h — see vercel.json
export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyCron, runScript } from '../../../lib/cron-runner';

export const GET: APIRoute = async ({ request }) => {
  if (!verifyCron(request)) return new Response('Unauthorized', { status: 401 });

  try {
    await runScript({
      installCmd: null,  // deps bundled in Lambda via NODE_PATH
      scriptCmd: 'node scripts/ceo-standup.mjs',
      gitAddPaths: ['ops/'],
      commitMsg: `ops: standup ${new Date().toISOString().slice(0, 16)}Z`,
      authorName: 'Real Daily Review Bot',
      authorEmail: 'bot@realdailyreview.com',
      env: {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      },
      scriptTimeout: 90_000,
    });
    return new Response('OK', { status: 200 });
  } catch (e: any) {
    console.error('[ceo-standup]', e.message);
    return new Response(e.message, { status: 500 });
  }
};
