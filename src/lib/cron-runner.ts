/**
 * Vercel Cron runner — git-free.
 *
 * Uses GitHub REST API instead of git commands (git is not available
 * in Vercel Lambda runtimes). Pattern:
 *   1. Download repo tarball from GitHub API → extract to /tmp
 *   2. npm install (minimal deps)
 *   3. Run agent script
 *   4. Detect changed files, commit via GitHub API
 *
 * Required env vars:
 *   GITHUB_PAT   — token with repo write access
 *   CRON_SECRET  — Vercel sends this as Bearer on every cron invocation
 */

import { execSync } from 'child_process';
import { randomBytes } from 'crypto';
import { promises as fs, createWriteStream } from 'fs';
import https from 'https';
// @ts-ignore — tar has no bundled types but is pure JS, works in Lambda
import tar from 'tar';
import path from 'path';

const REPO = 'Real-Daily-Review/realdailyreview';

// ── Auth ──────────────────────────────────────────────────────────────────

export function verifyCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) { console.warn('[cron] CRON_SECRET not set'); return false; }
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

// ── Types ─────────────────────────────────────────────────────────────────

export interface RunScriptOptions {
  installCmd: string | null;
  scriptCmd: string;
  gitAddPaths: string[];
  commitMsg: string;
  authorName: string;
  authorEmail: string;
  env?: Record<string, string | undefined>;
  scriptTimeout?: number;
  onAfterPush?: (tmpDir: string) => Promise<void>;
}

// ── GitHub API helpers ────────────────────────────────────────────────────

function ghRequest(endpoint: string, method = 'GET', body?: object): Promise<any> {
  const token = process.env.GITHUB_PAT!;
  const data = body ? JSON.stringify(body) : undefined;
  return new Promise((resolve, reject) => {
    const req = https.request(`https://api.github.com${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'rdr-cron/1.0',
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data).toString() } : {}),
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        try { resolve(JSON.parse(text)); } catch { resolve(text); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function downloadUrl(url: string, dest: string, token?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { 'User-Agent': 'rdr-cron/1.0' };
    if (token) headers.Authorization = `Bearer ${token}`;
    function get(u: string) {
      https.get(u, { headers }, (res) => {
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
          get(res.headers.location); return;
        }
        const file = createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', reject);
      }).on('error', reject);
    }
    get(url);
  });
}

// ── Directory walker ──────────────────────────────────────────────────────

async function walkDir(dir: string, fn: (file: string) => Promise<void>): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walkDir(full, fn);
    else await fn(full);
  }
}

// ── Snapshot / diff helpers ───────────────────────────────────────────────

async function snapshot(repoDir: string, addPaths: string[]): Promise<Map<string, string>> {
  const snap = new Map<string, string>();
  for (const p of addPaths) {
    const full = path.join(repoDir, p.replace(/\/$/, ''));
    await walkDir(full, async (file) => {
      const content = await fs.readFile(file, 'utf8').catch(() => null);
      if (content !== null) snap.set(path.relative(repoDir, file), content);
    });
  }
  return snap;
}

async function changedFiles(
  repoDir: string,
  addPaths: string[],
  before: Map<string, string>
): Promise<Map<string, Buffer>> {
  const changed = new Map<string, Buffer>();
  for (const p of addPaths) {
    const full = path.join(repoDir, p.replace(/\/$/, ''));
    await walkDir(full, async (file) => {
      const rel = path.relative(repoDir, file);
      const buf = await fs.readFile(file).catch(() => null);
      if (!buf) return;
      if (!before.has(rel) || before.get(rel) !== buf.toString('utf8')) {
        changed.set(rel, buf);
      }
    });
  }
  return changed;
}

// ── GitHub commit via API ─────────────────────────────────────────────────

async function pushCommit(
  files: Map<string, Buffer>,
  message: string,
  authorName: string,
  authorEmail: string
): Promise<void> {
  // Get HEAD
  const ref = await ghRequest(`/repos/${REPO}/git/ref/heads/main`);
  const baseCommit: string = ref.object.sha;
  const baseTree: string = (await ghRequest(`/repos/${REPO}/git/commits/${baseCommit}`)).tree.sha;

  // Create blobs (in parallel, max 5 at a time to avoid rate limits)
  const entries = Array.from(files.entries());
  const treeItems: object[] = [];
  for (let i = 0; i < entries.length; i += 5) {
    const batch = entries.slice(i, i + 5);
    const blobs = await Promise.all(batch.map(([, buf]) =>
      ghRequest(`/repos/${REPO}/git/blobs`, 'POST', {
        content: buf.toString('base64'), encoding: 'base64',
      })
    ));
    blobs.forEach((blob, j) => {
      treeItems.push({ path: batch[j][0], mode: '100644', type: 'blob', sha: blob.sha });
    });
  }

  const tree = await ghRequest(`/repos/${REPO}/git/trees`, 'POST', {
    base_tree: baseTree, tree: treeItems,
  });

  const commit = await ghRequest(`/repos/${REPO}/git/commits`, 'POST', {
    message,
    tree: tree.sha,
    parents: [baseCommit],
    author: { name: authorName, email: authorEmail, date: new Date().toISOString() },
  });

  // Push with optimistic concurrency retry
  for (let attempt = 1; attempt <= 4; attempt++) {
    const result = await ghRequest(`/repos/${REPO}/git/refs/heads/main`, 'PATCH', {
      sha: commit.sha, force: false,
    });
    if (result.object?.sha === commit.sha) {
      console.log(`[cron-runner] committed ${files.size} files on attempt ${attempt}`);
      return;
    }
    if (attempt < 4) await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  throw new Error('Failed to update ref after 4 attempts');
}

// ── Main runner ───────────────────────────────────────────────────────────

export async function runScript(opts: RunScriptOptions): Promise<void> {
  const ghPat = process.env.GITHUB_PAT;
  if (!ghPat) throw new Error('GITHUB_PAT not set');

  const tmpDir = `/tmp/rdr-${randomBytes(4).toString('hex')}`;
  const tarPath = `${tmpDir}.tar.gz`;
  // Lambda home dir may not exist — point HOME + npm cache to writable /tmp
  const lambdaEnv = {
    ...process.env,
    HOME: tmpDir,
    npm_config_cache: `${tmpDir}/.npm-cache`,
  };
  const exec = (cmd: string, o: Record<string, any> = {}) =>
    execSync(cmd, { stdio: 'pipe', env: lambdaEnv, ...o });

  try {
    // 1. Download + extract repo
    await fs.mkdir(tmpDir, { recursive: true });
    await downloadUrl(
      `https://api.github.com/repos/${REPO}/tarball/main`,
      tarPath, ghPat
    );
    await tar.x({ file: tarPath, cwd: tmpDir, strip: 1 });
    await fs.unlink(tarPath).catch(() => {});
    // Remove lock file — it's out of sync with package.json (added @astrojs/vercel
    // without regenerating the lock). Without this, npm silently skips installs.
    await fs.unlink(`${tmpDir}/package-lock.json`).catch(() => {});

    // 2. Install deps
    if (opts.installCmd) {
      exec(opts.installCmd, { cwd: tmpDir, timeout: 90_000 });
    }

    // 3. Snapshot files before run
    const before = await snapshot(tmpDir, opts.gitAddPaths);

    // 4. Run agent script
    exec(opts.scriptCmd, {
      cwd: tmpDir,
      timeout: opts.scriptTimeout ?? 50_000,
      env: { ...lambdaEnv, REPO, GH_TOKEN: ghPat, ...(opts.env ?? {}) },
    });

    // 5. Detect changes + commit
    const changed = await changedFiles(tmpDir, opts.gitAddPaths, before);
    if (changed.size === 0) {
      console.log('[cron-runner] nothing to commit');
    } else {
      await pushCommit(changed, opts.commitMsg, opts.authorName, opts.authorEmail);
    }

    if (opts.onAfterPush) await opts.onAfterPush(tmpDir);

  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
