// Vercel Cron: Metrics fetch / Sam Reyes (replaces metrics-fetch.yml)
// Schedule: every 4h — see vercel.json
export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyCron, runScript } from '../../../lib/cron-runner';

export const GET: APIRoute = async ({ request }) => {
  if (!verifyCron(request)) return new Response('Unauthorized', { status: 401 });

  try {
    await runScript({
      installCmd: null, // uses only built-in fetch()
      scriptCmd: 'node scripts/fetch-traffic-stats.mjs',
      gitAddPaths: ['ops/metrics/'],
      commitMsg: `metrics: ${new Date().toISOString().slice(0, 16)}Z`,
      authorName: 'Sam Reyes (SRE)',
      authorEmail: 'sam@realdailyreview.com',
      env: {
        CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
        CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
        ADMIN_TOKEN: process.env.RDR_ADMIN_TOKEN,
      },
    });
    return new Response('OK', { status: 200 });
  } catch (e: any) {
    console.error('[metrics-fetch]', e.message);
    return new Response(e.message, { status: 500 });
  }
};
