// Vercel Cron: Daily exec brief / Alex Reeve CEO (replaces exec-brief.yml)
// Schedule: daily 11:00 UTC — see vercel.json
export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyCron, runScript } from '../../../lib/cron-runner';

export const GET: APIRoute = async ({ request }) => {
  if (!verifyCron(request)) return new Response('Unauthorized', { status: 401 });

  try {
    await runScript({
      installCmd: null,  // deps bundled in Lambda via NODE_PATH
      scriptCmd: 'node scripts/exec-brief.mjs',
      gitAddPaths: ['ops/exec-briefs/'],
      commitMsg: `exec: daily brief ${new Date().toISOString().slice(0, 10)}`,
      authorName: 'Alex Reeve (CEO)',
      authorEmail: 'ceo@realdailyreview.com',
      env: {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        RESEND_API_KEY: process.env.RESEND_API_KEY,
        RESEND_FROM: process.env.RESEND_FROM,
        SHAREHOLDER_EMAIL: process.env.SHAREHOLDER_EMAIL ?? 'ryan@revv.com',
      },
      scriptTimeout: 90_000,
    });
    return new Response('OK', { status: 200 });
  } catch (e: any) {
    console.error('[exec-brief]', e.message);
    return new Response(e.message, { status: 500 });
  }
};
