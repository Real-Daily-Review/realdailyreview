// Vercel Cron: X (Twitter) cross-poster / Ravi Sharma (Growth)
// Schedule: every 2h at :45 — see vercel.json
export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyCron, runScript } from '../../../lib/cron-runner';

export const GET: APIRoute = async ({ request }) => {
  if (!verifyCron(request)) return new Response('Unauthorized', { status: 401 });

  try {
    await runScript({
      installCmd: 'npm install gray-matter@^4 --no-save --no-audit --no-fund',
      scriptCmd: 'node scripts/x-poster.mjs',
      gitAddPaths: ['ops/social-posted/'],
      commitMsg: `social: x cross-post ${new Date().toISOString().slice(0, 16)}Z`,
      authorName: 'Ravi Sharma (Growth)',
      authorEmail: 'ravi@realdailyreview.com',
      env: {
        X_API_KEY:            process.env.X_API_KEY,
        X_API_SECRET:         process.env.X_API_SECRET,
        X_ACCESS_TOKEN:       process.env.X_ACCESS_TOKEN,
        X_ACCESS_TOKEN_SECRET: process.env.X_ACCESS_TOKEN_SECRET,
      },
      scriptTimeout: 60_000,
    });
    return new Response('OK', { status: 200 });
  } catch (e: any) {
    console.error('[x-poster]', e.message);
    return new Response(e.message, { status: 500 });
  }
};
