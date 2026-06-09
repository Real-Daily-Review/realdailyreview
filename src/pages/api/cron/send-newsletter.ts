// Vercel Cron: Newsletter sender (replaces send-newsletter.yml)
// Schedule: daily 10:00 UTC — see vercel.json
export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyCron, runScript } from '../../../lib/cron-runner';

export const GET: APIRoute = async ({ request }) => {
  if (!verifyCron(request)) return new Response('Unauthorized', { status: 401 });

  try {
    await runScript({
      installCmd: 'npm install gray-matter@^4 --no-save --no-audit --no-fund',
      scriptCmd: 'node scripts/send-newsletter.mjs',
      gitAddPaths: ['ops/newsletter/'],
      commitMsg: `newsletter: ${new Date().toISOString().slice(0, 10)}`,
      authorName: 'Real Daily Review Bot',
      authorEmail: 'bot@realdailyreview.com',
      env: {
        RESEND_API_KEY: process.env.RESEND_API_KEY,
        RESEND_FROM: process.env.RESEND_FROM,
        ADMIN_TOKEN: process.env.RDR_ADMIN_TOKEN,
      },
    });
    return new Response('OK', { status: 200 });
  } catch (e: any) {
    console.error('[send-newsletter]', e.message);
    return new Response(e.message, { status: 500 });
  }
};
