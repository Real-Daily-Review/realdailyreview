// Vercel Cron: Competitor watch / Ben Foster CoS (replaces competitor-watch.yml)
// Schedule: 2x/day at 02:00 and 14:00 UTC — see vercel.json
export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyCron, runScript } from '../../../lib/cron-runner';

export const GET: APIRoute = async ({ request }) => {
  if (!verifyCron(request)) return new Response('Unauthorized', { status: 401 });

  try {
    await runScript({
      installCmd: null,  // deps bundled in Lambda via NODE_PATH
      scriptCmd: 'node scripts/competitor-watch.mjs',
      gitAddPaths: ['ops/competitive/', 'ops/queue.md'],
      commitMsg: `ops: competitor watch ${new Date().toISOString().slice(0, 10)}`,
      authorName: 'Real Daily Review Bot',
      authorEmail: 'bot@realdailyreview.com',
      env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY },
      scriptTimeout: 150_000,
    });
    return new Response('OK', { status: 200 });
  } catch (e: any) {
    console.error('[competitor-watch]', e.message);
    return new Response(e.message, { status: 500 });
  }
};
