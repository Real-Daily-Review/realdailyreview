// Vercel Cron: Growth agent / Ravi Sharma (replaces growth-agent.yml)
// Schedule: daily 14:00 UTC — see vercel.json
export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyCron, runScript } from '../../../lib/cron-runner';

export const GET: APIRoute = async ({ request }) => {
  if (!verifyCron(request)) return new Response('Unauthorized', { status: 401 });

  try {
    await runScript({
      installCmd: null,  // deps bundled in Lambda via NODE_PATH
      scriptCmd: 'node scripts/growth-agent.mjs',
      gitAddPaths: ['ops/social-drafts/', 'ops/activity/'],
      commitMsg: `growth: ${new Date().toISOString().slice(0, 10)} social drafts`,
      authorName: 'Ravi Sharma (Growth)',
      authorEmail: 'ravi@realdailyreview.com',
      env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY },
    });
    return new Response('OK', { status: 200 });
  } catch (e: any) {
    console.error('[growth-agent]', e.message);
    return new Response(e.message, { status: 500 });
  }
};
