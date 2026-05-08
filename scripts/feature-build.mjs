#!/usr/bin/env node
/**
 * Autonomous feature builder.
 *
 * Runs in GH Actions cron (2x/day). Reads ops/queue.md, picks the first
 * eligible item (not done, not [NEEDS-SHAREHOLDER], not blocked, fits in
 * one PR), gives it to Anthropic with full repo context, gets back a
 * structured plan, writes files, runs the build, opens a PR.
 *
 * Safety guardrails:
 *   - Path allowlist: only writes inside ALLOWED_PATHS. Refuses anything else.
 *   - Forbidden paths (security/CI/secrets) are rejected even if in allowlist.
 *   - Build must pass before commit.
 *   - Diff size cap: AUTO_MERGE_MAX_LINES total added/changed for auto-merge.
 *   - Auto-merge ONLY for paths in AUTO_MERGE_ALLOWLIST and small diffs.
 *   - Everything larger or outside auto-merge → PR for human review.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import Anthropic from '@anthropic-ai/sdk';

const ROOT = path.resolve('.');
const QUEUE_FILE = path.join(ROOT, 'ops/queue.md');
const ROADMAP_FILE = path.join(ROOT, 'ops/ROADMAP.md');
const STANDUPS_DIR = path.join(ROOT, 'ops/standups');

// Paths the bot may write to. Globs (** matches any subpath).
const ALLOWED_PATHS = [
  'src/components/**',
  'src/layouts/**',
  'src/pages/**',
  'src/styles/**',
  'src/config.ts',
  'src/content/config.ts',
  'scripts/lib/**',  // helpers, NOT anthropic.mjs (model selection lives there)
  'ops/**',
  'public/favicon.svg',
  'public/og-default.png',
  'public/robots.txt',
  'README.md',
  'MONETIZATION.md',
];

// Hard-block list — never touched even if path matches an allowed glob.
const FORBIDDEN_PATHS = [
  '.github/**',
  '.local/**',
  '.env',
  '.env.example',
  'public/_headers',
  'public/_redirects',
  'workers/**',
  'scripts/lib/anthropic.mjs',  // model/prompt config
  'scripts/lib/sources.mjs',    // RSS sources — manual curation
  'scripts/feature-build.mjs',  // self
  'scripts/ceo-standup.mjs',    // brain
  'scripts/generate-daily.mjs', // content pipeline
  'package.json',
  'package-lock.json',
  'astro.config.mjs',
  'tsconfig.json',
  '.gitignore',
];

// Within ALLOWED_PATHS, these specific subtrees auto-merge if the diff is small.
const AUTO_MERGE_ALLOWLIST = [
  'src/components/**',
  'src/pages/**',
  'src/styles/**',
  'src/content/config.ts',
  'ops/**',
];
const AUTO_MERGE_MAX_LINES = 250;

const MAX_FILES_PER_PR = 8;
const REPO = process.env.REPO || 'Real-Daily-Review/realdailyreview';
const GH_TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

// ---------- Helpers ----------

function sh(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...opts });
}

function matchGlob(filePath, patterns) {
  return patterns.some((p) => {
    const re = new RegExp(
      '^' + p.replace(/\./g, '\\.').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$'
    );
    return re.test(filePath);
  });
}

async function readIfExists(p, fallback = '') {
  return fs.readFile(p, 'utf8').catch(() => fallback);
}

function parseQueue(md) {
  const items = [];
  for (const line of md.split('\n')) {
    const m = line.match(/^[-*]\s+\[([ xX])\]\s+(.+)$/);
    if (m) items.push({ done: m[1].toLowerCase() === 'x', text: m[2].trim() });
  }
  return items;
}

function isEligible(itemText) {
  if (/\[NEEDS-SHAREHOLDER\]/i.test(itemText)) return false;
  if (/\bBLOCKED\b/i.test(itemText)) return false;
  // Skip items that contain "needs CLOUDFLARE" etc — those are credential-blocked
  if (/needs\s+(CLOUDFLARE|TURNSTILE|RESEND|ADMIN|TWILIO)_/i.test(itemText)) return false;
  return true;
}

async function listRepoFiles() {
  const out = sh(`git ls-files`).trim().split('\n');
  return out.filter(Boolean);
}

async function readRecentStandups(n = 4) {
  const files = (await fs.readdir(STANDUPS_DIR).catch(() => []))
    .filter((f) => f.endsWith('.md'))
    .sort()
    .reverse()
    .slice(0, n);
  const parts = [];
  for (const f of files) {
    parts.push(`### ${f}\n` + await readIfExists(path.join(STANDUPS_DIR, f), ''));
  }
  return parts.join('\n\n---\n\n');
}

async function bundleContextFiles(files, maxBytes = 80_000) {
  // Read each file, accumulate up to maxBytes total. Skip large files.
  let used = 0;
  const out = [];
  for (const f of files) {
    if (used > maxBytes) break;
    try {
      const stat = await fs.stat(path.join(ROOT, f));
      if (stat.size > 20_000) continue;  // skip large files
      const content = await fs.readFile(path.join(ROOT, f), 'utf8');
      if (used + content.length > maxBytes) break;
      out.push({ path: f, content });
      used += content.length + f.length + 20;
    } catch {}
  }
  return out;
}

// ---------- Anthropic call ----------

async function planFeature({ task, queue, roadmap, recentStandups, contextFiles }) {
  const client = new Anthropic({ apiKey: ANTHROPIC_KEY });

  const filesContext = contextFiles
    .map((f) => `<file path="${f.path}">\n${f.content}\n</file>`)
    .join('\n\n');

  const prompt = `You are an autonomous engineer for Real Daily Review (an AI-driven daily news digest, https://realdailyreview.com). Pick up THIS task from the sprint queue and write the code to ship it:

TASK: ${task}

Constraints:
1. **Path allowlist**: only write to paths matching one of: ${ALLOWED_PATHS.join(', ')}
2. **Forbidden paths** (never touch): ${FORBIDDEN_PATHS.join(', ')}
3. **Max ${MAX_FILES_PER_PR} files** in this PR. If the task needs more, deliver the first viable subset.
4. **Build must pass**: \`npm run build\` is run after your writes. If it fails, the PR is rejected.
5. **No deps changes**: package.json/package-lock.json are forbidden. Use only existing deps.
6. **Small atomic change**: aim for <250 lines total. If the task is bigger, scope down to the most valuable slice.

Repo style:
- Astro 4 with TypeScript (strict). Components are .astro files; layouts are in src/layouts.
- Content collection: articles in src/content/articles, schema in src/content/config.ts.
- Site config in src/config.ts.
- Tag URLs are slugified kebab-case.

Output a SINGLE JSON object inside <json>...</json> tags with these fields. NO prose outside the tag.

{
  "summary": "one-line description of what was built",
  "branch_name": "auto-build-YYYYMMDD-HHMM-short-slug",
  "commit_message": "feat: ... (conventional commit format)",
  "pr_title": "...",
  "pr_body": "Markdown body explaining what changed and why. Include 'Closes queue item: \\"...\\"' if applicable.",
  "files": [
    {"path": "src/...", "content": "FULL FILE CONTENTS (not a diff)", "is_new": true/false}
  ],
  "lines_changed_estimate": 123,
  "self_assessment": "what could go wrong with this change; any caveats"
}

CONTEXT:

=== Sprint queue ===
${queue.slice(0, 4000)}

=== Roadmap (snippet) ===
${roadmap.slice(0, 4000)}

=== Recent standups ===
${recentStandups.slice(0, 6000)}

=== Existing files for context ===
${filesContext}`;

  const r = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    temperature: 0.3,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  const m = text.match(/<json>([\s\S]*?)<\/json>/);
  if (!m) throw new Error('Model did not return <json> block. Response head: ' + text.slice(0, 400));
  let parsed;
  try {
    parsed = JSON.parse(m[1]);
  } catch (err) {
    throw new Error('Failed to parse JSON: ' + err.message + '\nRaw: ' + m[1].slice(0, 400));
  }
  return { plan: parsed, usage: r.usage };
}

function validatePlan(plan) {
  if (!plan.files || !Array.isArray(plan.files) || plan.files.length === 0) {
    throw new Error('Plan has no files');
  }
  if (plan.files.length > MAX_FILES_PER_PR) {
    throw new Error(`Plan has ${plan.files.length} files; max is ${MAX_FILES_PER_PR}`);
  }
  for (const f of plan.files) {
    if (typeof f.path !== 'string' || typeof f.content !== 'string') {
      throw new Error(`File entry malformed: ${JSON.stringify(f).slice(0, 200)}`);
    }
    if (matchGlob(f.path, FORBIDDEN_PATHS)) {
      throw new Error(`File '${f.path}' is FORBIDDEN`);
    }
    if (!matchGlob(f.path, ALLOWED_PATHS)) {
      throw new Error(`File '${f.path}' is OUTSIDE allowlist`);
    }
  }
  if (!/^auto-build-/.test(plan.branch_name || '')) {
    throw new Error('branch_name must start with auto-build-');
  }
}

function isAutoMergeable(plan) {
  if (plan.lines_changed_estimate > AUTO_MERGE_MAX_LINES) return false;
  for (const f of plan.files) {
    if (!matchGlob(f.path, AUTO_MERGE_ALLOWLIST)) return false;
  }
  return true;
}

// ---------- GH API ----------

async function ghApi(method, path, body) {
  const r = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    throw new Error(`GH API ${method} ${path} → ${r.status}: ${await r.text()}`);
  }
  return r.json();
}

async function openPullRequest({ branch, title, body }) {
  return ghApi('POST', `/repos/${REPO}/pulls`, {
    head: branch,
    base: 'main',
    title,
    body,
  });
}

async function mergePR(number) {
  return ghApi('PUT', `/repos/${REPO}/pulls/${number}/merge`, {
    merge_method: 'squash',
  });
}

// ---------- Main ----------

async function main() {
  if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY not set');
  if (!GH_TOKEN) throw new Error('GH_TOKEN not set');

  const queueRaw = await readIfExists(QUEUE_FILE);
  const items = parseQueue(queueRaw);
  const eligible = items.filter((i) => !i.done && isEligible(i.text));

  if (eligible.length === 0) {
    console.log('No eligible items in queue. Nothing to do.');
    return;
  }

  const roadmap = await readIfExists(ROADMAP_FILE);
  const recentStandups = await readRecentStandups(4);
  const repoFiles = await listRepoFiles();
  const interesting = repoFiles.filter((f) =>
    /^src\/(layouts|components|config|content\/config|pages\/(about|index|archive|tag|section)|styles\/global)/.test(f) ||
    /^scripts\/lib\/(publish|fetch-headlines|sources)\.mjs$/.test(f) ||
    /^ops\/(ROADMAP|queue)\.md$/.test(f)
  );
  const context = await bundleContextFiles(interesting, 80_000);
  console.log(`[feature-build] context: ${context.length} files, ${repoFiles.length} repo files total`);

  // Try up to 3 eligible items in order. If one fails validation, move on.
  let plan = null, task = null, usage = null, totalUsage = { input_tokens: 0, output_tokens: 0 };
  for (const candidate of eligible.slice(0, 3)) {
    console.log(`[feature-build] trying: ${candidate.text}`);
    try {
      const res = await planFeature({
        task: candidate.text,
        queue: queueRaw,
        roadmap,
        recentStandups,
        contextFiles: context,
      });
      validatePlan(res.plan);
      plan = res.plan;
      task = candidate.text;
      usage = res.usage;
      totalUsage.input_tokens += usage.input_tokens || 0;
      totalUsage.output_tokens += usage.output_tokens || 0;
      console.log(`[feature-build] ✓ plan validated for: ${task}`);
      break;
    } catch (err) {
      console.warn(`[feature-build] candidate failed: ${err.message}`);
      totalUsage.input_tokens += err.usage?.input_tokens || 0;
      totalUsage.output_tokens += err.usage?.output_tokens || 0;
    }
  }
  if (!plan) {
    console.log('[feature-build] no candidate produced a valid plan; exiting');
    return;
  }
  console.log(`[feature-build] plan summary: ${plan.summary}`);
  console.log(`[feature-build] branch=${plan.branch_name} files=${plan.files.length} ~lines=${plan.lines_changed_estimate}`);

  // Create branch from current main
  const headRef = sh('git rev-parse HEAD').trim();
  sh(`git config user.name "Real Daily Review Bot"`);
  sh(`git config user.email "bot@realdailyreview.com"`);
  sh(`git checkout -b ${plan.branch_name}`);

  // Write files
  for (const f of plan.files) {
    const fullPath = path.join(ROOT, f.path);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, f.content, 'utf8');
    console.log(`  wrote ${f.path} (${f.content.length} bytes)`);
  }

  // Build
  console.log('[feature-build] running npm run build…');
  try {
    sh(`npm run build`, { stdio: 'inherit' });
  } catch (err) {
    console.error('[feature-build] BUILD FAILED — aborting branch');
    sh(`git checkout main`);
    sh(`git branch -D ${plan.branch_name}`);
    process.exit(1);
  }

  // Clean up dist (don't commit it)
  sh(`rm -rf dist .astro`);

  // Commit
  sh(`git add -A`);
  const status = sh(`git status --porcelain`).trim();
  if (!status) {
    console.log('[feature-build] no diff; aborting');
    sh(`git checkout main`);
    sh(`git branch -D ${plan.branch_name}`);
    return;
  }
  sh(`git commit -q -m ${JSON.stringify(plan.commit_message)}`);
  sh(`git push -u origin ${plan.branch_name}`);
  console.log(`[feature-build] pushed branch ${plan.branch_name}`);

  // Open PR
  const pr = await openPullRequest({
    branch: plan.branch_name,
    title: plan.pr_title,
    body: `${plan.pr_body}\n\n---\n_Drafted by feature-build.yml. Self-assessment: ${plan.self_assessment || 'n/a'}_\n_Tokens used: ${(usage.input_tokens + usage.output_tokens) || 0}_`,
  });
  console.log(`[feature-build] PR #${pr.number}: ${pr.html_url}`);

  // Auto-merge?
  if (isAutoMergeable(plan)) {
    try {
      await mergePR(pr.number);
      console.log(`[feature-build] auto-merged PR #${pr.number}`);
    } catch (err) {
      console.warn(`[feature-build] auto-merge failed (left for human review): ${err.message}`);
    }
  } else {
    console.log(`[feature-build] PR left for human review (path or size requires it)`);
  }

  console.log(`[feature-build] DONE. cost ~${totalUsage.input_tokens + totalUsage.output_tokens} tokens`);
}

main().catch((err) => { console.error(err); process.exit(1); });
