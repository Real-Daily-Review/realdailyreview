/**
 * Shared Vercel Cron runner.
 *
 * Pattern: shallow-clone repo → install deps → run script → commit + push.
 * Works identically to the previous GitHub Actions workflow pattern,
 * but runs inside a Vercel serverless function.
 *
 * Requirements (Vercel env vars):
 *   GITHUB_PAT   — personal access token with repo write access
 *   CRON_SECRET  — shared secret Vercel sends as Bearer token on every cron call
 */

import { execSync, type ExecSyncOptions } from 'child_process';
import { randomBytes } from 'crypto';

const REPO = 'Real-Daily-Review/realdailyreview';
const BASE_EXEC: ExecSyncOptions = { stdio: 'pipe' };

export function verifyCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn('[cron] CRON_SECRET not set — rejecting request');
    return false;
  }
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export interface RunScriptOptions {
  /** npm install command, or null if no deps needed beyond built-ins */
  installCmd: string | null;
  /** Command to run the agent script, e.g. "node scripts/bluesky-poster.mjs" */
  scriptCmd: string;
  /** git add paths, space-separated glob patterns */
  gitAddPaths: string[];
  /** commit message */
  commitMsg: string;
  /** git author name */
  authorName: string;
  /** git author email */
  authorEmail: string;
  /** additional env vars for the script (merged with process.env) */
  env?: Record<string, string | undefined>;
  /** ms timeout for the script itself (default 50_000) */
  scriptTimeout?: number;
  /** called with the repo tmpDir path after a successful push (before cleanup) */
  onAfterPush?: (tmpDir: string) => Promise<void>;
}

export async function runScript(opts: RunScriptOptions): Promise<void> {
  const ghPat = process.env.GITHUB_PAT;
  if (!ghPat) throw new Error('GITHUB_PAT env var not set');

  const tmpDir = `/tmp/rdr-${randomBytes(4).toString('hex')}`;

  try {
    // ── 1. Shallow clone ────────────────────────────────────────────────
    execSync(
      `git clone --depth=1 "https://${ghPat}@github.com/${REPO}.git" "${tmpDir}"`,
      { ...BASE_EXEC, timeout: 30_000 }
    );

    // ── 2. Install dependencies ─────────────────────────────────────────
    if (opts.installCmd) {
      execSync(opts.installCmd, { ...BASE_EXEC, cwd: tmpDir, timeout: 90_000 });
    }

    // ── 3. Run the agent script ─────────────────────────────────────────
    execSync(opts.scriptCmd, {
      ...BASE_EXEC,
      cwd: tmpDir,
      timeout: opts.scriptTimeout ?? 50_000,
      env: {
        ...process.env,
        HOME: tmpDir,
        REPO,
        GH_TOKEN: ghPat,
        ...(opts.env ?? {}),
      },
    });

    // ── 4. Commit and push (with rebase retry) ───────────────────────────
    execSync(`git config user.name "${opts.authorName.replace(/"/g, "'")}"`, { ...BASE_EXEC, cwd: tmpDir });
    execSync(`git config user.email "${opts.authorEmail}"`, { ...BASE_EXEC, cwd: tmpDir });

    for (const p of opts.gitAddPaths) {
      try { execSync(`git add "${p}"`, { ...BASE_EXEC, cwd: tmpDir }); } catch { /* path may not exist */ }
    }

    // Check if there is anything staged
    try {
      execSync('git diff --cached --quiet', { ...BASE_EXEC, cwd: tmpDir });
      console.log('[cron-runner] nothing to commit');
      return;
    } catch { /* non-zero exit = changes staged → proceed */ }

    execSync(`git commit -m "${opts.commitMsg.replace(/"/g, "'")}"`, { ...BASE_EXEC, cwd: tmpDir });

    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        execSync('git push origin HEAD:main', { ...BASE_EXEC, cwd: tmpDir, timeout: 15_000 });
        console.log(`[cron-runner] pushed on attempt ${attempt}`);
        // Call onAfterPush before cleanup
        if (opts.onAfterPush) {
          try { await opts.onAfterPush(tmpDir); } catch (e: any) {
            console.error('[cron-runner] onAfterPush error:', e.message);
          }
        }
        return;
      } catch {
        if (attempt < 4) {
          try {
            execSync('git fetch origin main && git rebase origin/main || git rebase --abort',
              { ...BASE_EXEC, cwd: tmpDir, shell: '/bin/sh', timeout: 10_000 });
          } catch { /* ignore rebase errors, retry push */ }
        }
      }
    }
    throw new Error('git push failed after 4 attempts');

  } finally {
    try { execSync(`rm -rf "${tmpDir}"`, { timeout: 10_000 }); } catch { /* best-effort cleanup */ }
  }
}
