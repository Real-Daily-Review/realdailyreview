// Vercel Cron: Mastodon cross-poster (replaces mastodon-poster.yml)
// Schedule: every 2h at :45 — see vercel.json
export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyCron, runScript } from '../../../lib/cron-runner';

export const GET: APIRoute = async ({ request }) => {
  if (!verifyCron(request)) return new Response('Unauthorized', { status: 401 });

  try {
    await runScript({
      installCmd: 'npm install gray-matter@^4 --no-save --no-audit --no-fund',
      scriptCmd: 'node scripts/mastodon-poster.mjs',
      gitAddPaths: ['ops/social-posted/'],
      commitMsg: `social: mastodon cross-post ${new Date().toISOString().slice(0, 16)}Z`,
      authorName: 'Ravi Sharma (Growth)',
      authorEmail: 'ravi@realdailyreview.com',
      env: {
        MASTODON_INSTANCE: process.env.MASTODON_INSTANCE,
        MASTODON_ACCESS_TOKEN: process.env.MASTODON_ACCESS_TOKEN,
      },
    });
    return new Response('OK', { status: 200 });
  } catch (e: any) {
    console.error('[mastodon-poster]', e.message);
    return new Response(e.message, { status: 500 });
  }
};
