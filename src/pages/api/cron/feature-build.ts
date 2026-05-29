// Vercel Cron: Autonomous feature builder / Ada Park CTO (replaces feature-build.yml)
// Schedule: 4x/day at 05:00, 11:00, 17:00, 23:00 UTC — see vercel.json
// maxDuration: 300s (full npm ci + code generation + git PR)
export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyCron, runScript } from '../../../lib/cron-runner';

export const GET: APIRoute = async ({ request }) => {
  if (!verifyCron(request)) return new Response('Unauthorized', { status: 401 });

  try {
    await runScript({
      installCmd: 'npm ci --prefer-offline --no-audit --no-fund',
      scriptCmd: 'node scripts/feature-build.mjs',
      // feature-build manages its own commits/PRs via GitHub API; ops/ is a fallback
      gitAddPaths: ['ops/'],
      commitMsg: `ops: feature-build queue update ${new Date().toISOString().slice(0, 16)}Z`,
      authorName: 'Ada Park (CTO)',
      authorEmail: 'ada@realdailyreview.com',
      env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY },
      scriptTimeout: 240_000,
    });
    return new Response('OK', { status: 200 });
  } catch (e: any) {
    console.error('[feature-build]', e.message);
    return new Response(e.message, { status: 500 });
  }
};
