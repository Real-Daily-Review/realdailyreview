// Vercel Cron: content generation (replaces daily-publish.yml)
// Schedule: 8x/day — see vercel.json
// maxDuration: 300s (npm ci + RSS fetch + Anthropic + self-redeploy)
export const prerender = false;

import type { APIRoute } from 'astro';
import { execSync } from 'child_process';
import { randomBytes } from 'crypto';
import { verifyCron, runScript } from '../../../lib/cron-runner';

/** After pushing new articles to GitHub, rebuild and redeploy to Vercel autonomously. */
async function vercelRedeploy(repoDir: string): Promise<void> {
  const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
  const TEAM = 'revv-team';
  const PROJECT_ID = 'prj_LKVKVMRMWncXNdfOrAEeep48q2zH';

  if (!VERCEL_TOKEN) {
    console.warn('[generate-daily] VERCEL_TOKEN not set — skipping redeploy');
    return;
  }

  const vDir = `/tmp/vercel-${randomBytes(4).toString('hex')}`;
  const exec = (cmd: string, opts = {}) =>
    execSync(cmd, { stdio: 'pipe', timeout: 60_000, ...opts });

  try {
    // Install Vercel CLI in /tmp
    exec(`npm install vercel --prefix ${vDir}`, { timeout: 30_000 });
    const vcli = `${vDir}/node_modules/.bin/vercel`;

    // Write .vercel/project.json pointing to our project
    exec(`mkdir -p ${repoDir}/.vercel`);
    require('fs').writeFileSync(
      `${repoDir}/.vercel/project.json`,
      JSON.stringify({ orgId: `team_STzeS2bdoSjZAaaRoKtoodMs`, projectId: PROJECT_ID })
    );

    // Build
    exec(`${vcli} build --token ${VERCEL_TOKEN} --yes`, {
      cwd: repoDir, timeout: 90_000,
      env: { ...process.env, HOME: repoDir, ANTHROPIC_API_KEY: 'placeholder' }
    });

    // Patch runtimes to nodejs20.x
    const { readdirSync, writeFileSync } = require('fs');
    const fnDir = `${repoDir}/.vercel/output/functions`;
    (function patchDir(dir: string) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = `${dir}/${entry.name}`;
        if (entry.isDirectory()) patchDir(full);
        if (entry.name === '.vc-config.json') {
          const cfg = JSON.parse(require('fs').readFileSync(full, 'utf8'));
          cfg.runtime = 'nodejs20.x';
          writeFileSync(full, JSON.stringify(cfg, null, '\t'));
        }
      }
    })(fnDir);

    // Deploy
    exec(
      `${vcli} deploy --prebuilt --prod --token ${VERCEL_TOKEN} --scope ${TEAM} --yes`,
      { cwd: repoDir, timeout: 60_000, env: { ...process.env, HOME: repoDir } }
    );

    console.log('[generate-daily] Vercel redeploy complete');
  } finally {
    try { exec(`rm -rf ${vDir}`, { timeout: 10_000 }); } catch {}
  }
}

export const GET: APIRoute = async ({ request }) => {
  if (!verifyCron(request)) return new Response('Unauthorized', { status: 401 });

  try {
    let repoDir: string | undefined;

    await runScript({
      installCmd: 'npm install --no-audit --no-fund',
      scriptCmd: 'npm run generate:daily',
      gitAddPaths: ['src/content/articles/', 'ops/runs/', 'public/og/'],
      commitMsg: `content: auto-publish ${new Date().toISOString().slice(0, 16)}Z [vercel-cron]`,
      authorName: 'Real Daily Review Bot',
      authorEmail: 'bot@realdailyreview.com',
      env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY },
      scriptTimeout: 180_000,
      onAfterPush: async (dir) => { repoDir = dir; },
    });

    // Rebuild + redeploy so new articles appear on the live site
    if (repoDir) await vercelRedeploy(repoDir);

    return new Response('OK', { status: 200 });
  } catch (e: any) {
    console.error('[generate-daily]', e.message);
    return new Response(e.message, { status: 500 });
  }
};
