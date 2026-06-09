// Vercel Cron: Revenue agent / Mei Tanaka (replaces revenue-agent.yml)
// Schedule: daily 21:00 UTC — see vercel.json
export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyCron, runScript } from '../../../lib/cron-runner';

export const GET: APIRoute = async ({ request }) => {
  if (!verifyCron(request)) return new Response('Unauthorized', { status: 401 });

  try {
    await runScript({
      installCmd: 'npm install gray-matter@^4 @anthropic-ai/sdk@^0.30 --no-save --no-audit --no-fund',
      scriptCmd: 'node scripts/revenue-agent.mjs',
      gitAddPaths: ['ops/revenue/', 'ops/activity/', 'ops/queue.md'],
      commitMsg: `revenue: ${new Date().toISOString().slice(0, 10)} audit`,
      authorName: 'Mei Tanaka (Revenue)',
      authorEmail: 'mei@realdailyreview.com',
      env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY },
    });
    return new Response('OK', { status: 200 });
  } catch (e: any) {
    console.error('[revenue-agent]', e.message);
    return new Response(e.message, { status: 500 });
  }
};
