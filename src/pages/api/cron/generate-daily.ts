// Vercel Cron: content generation scheduler
// Schedule: 8x/day — see vercel.json
//
// This cron triggers the GitHub Actions daily-publish.yml workflow via workflow_dispatch.
// GitHub Actions handles the actual generation (no timeout constraints, git available).
// Vercel is the scheduler; GitHub Actions is the executor.
export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyCron } from '../../../lib/cron-runner';

const REPO = 'Real-Daily-Review/realdailyreview';

export const GET: APIRoute = async ({ request }) => {
  if (!verifyCron(request)) return new Response('Unauthorized', { status: 401 });

  const ghPat = process.env.GITHUB_PAT;
  if (!ghPat) return new Response('GITHUB_PAT not set', { status: 500 });

  const resp = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/daily-publish.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ghPat}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    }
  );

  if (resp.ok || resp.status === 204) {
    console.log('[generate-daily] triggered GitHub Actions daily-publish.yml');
    return new Response('OK', { status: 200 });
  }

  const err = await resp.text();
  console.error('[generate-daily] failed to trigger workflow:', resp.status, err);
  return new Response(err, { status: resp.status });
};
