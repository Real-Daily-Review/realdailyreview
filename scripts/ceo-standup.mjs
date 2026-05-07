#!/usr/bin/env node
/**
 * CEO standup operator — runs in GitHub Actions on a 4x/day cron.
 *
 * Each run:
 *  1) Determines the slot label (morning/midday/evening/overnight) from current UTC hour.
 *  2) Reads ops/queue.md (sprint queue), ops/ROADMAP.md, recent commits, recent runs.
 *  3) Detects work that landed since the last standup → marks it done.
 *  4) If queue has < N active items, asks Anthropic to spawn 1-3 new tasks
 *     from the roadmap with concrete acceptance criteria.
 *  5) Writes a per-slot checkpoint at ops/standups/YYYY-MM-DD-{slot}.md
 *     and an updated ops/queue.md.
 *
 * Designed to run unattended without any human in the loop.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import Anthropic from '@anthropic-ai/sdk';

const ROOT = path.resolve('.');
const OPS_DIR = path.join(ROOT, 'ops');
const STANDUPS_DIR = path.join(OPS_DIR, 'standups');
const QUEUE_FILE = path.join(OPS_DIR, 'queue.md');
const ROADMAP_FILE = path.join(OPS_DIR, 'ROADMAP.md');

const QUEUE_TARGET_SIZE = 6; // refill from roadmap when active count drops below this
const STANDUP_HISTORY_FOR_CONTEXT = 4; // last N standups read into context

function slotForUtcHour(h, override) {
  if (override && override !== 'manual') return override;
  // 04 UTC = 12am ET (overnight); 13 = 9am ET (morning); 18 = 2pm ET (midday); 23 = 7pm ET (evening)
  if (h >= 2 && h < 9) return 'overnight';
  if (h >= 9 && h < 16) return 'morning';
  if (h >= 16 && h < 21) return 'midday';
  return 'evening';
}

function nowUtc() {
  return new Date();
}

function ymd(d = nowUtc()) {
  return d.toISOString().slice(0, 10);
}

function gitJson(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

async function readIfExists(p, fallback = '') {
  return fs.readFile(p, 'utf8').catch(() => fallback);
}

async function listRecentArticleTitles(hours = 48) {
  const dir = path.join(ROOT, 'src/content/articles');
  const cutoff = Date.now() - hours * 3600 * 1000;
  const files = await fs.readdir(dir).catch(() => []);
  const titles = [];
  for (const f of files) {
    if (!f.endsWith('.md')) continue;
    try {
      const raw = await fs.readFile(path.join(dir, f), 'utf8');
      const m = raw.match(/^---\s*\ntitle:\s*['"]?([^'"\n]+)['"]?\s*\n[\s\S]*?pubDate:\s*['"]?([^'"\n]+)/);
      if (!m) continue;
      const pub = Date.parse(m[2]);
      if (pub >= cutoff) titles.push({ title: m[1].trim(), pub });
    } catch {}
  }
  return titles.sort((a, b) => b.pub - a.pub);
}

async function recentCommits(limit = 30) {
  const log = gitJson(`git log --pretty=format:'%h|%cI|%an|%s' -n ${limit}`);
  return log.split('\n').filter(Boolean).map((line) => {
    const [hash, iso, author, ...rest] = line.split('|');
    return { hash, iso, author, subject: rest.join('|') };
  });
}

async function loadActionRunsViaApi() {
  const token = process.env.GH_TOKEN;
  const repo = process.env.REPO;
  if (!token || !repo) return [];
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/actions/runs?per_page=15`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.workflow_runs || []).map((x) => ({
      name: x.name, status: x.status, conclusion: x.conclusion,
      created_at: x.created_at, run_number: x.run_number, html_url: x.html_url,
    }));
  } catch { return []; }
}

function parseQueue(md) {
  // Queue format: lines starting with "- [ ] " (active) or "- [x] " (done)
  // Each item has freeform text after; we treat the line as the canonical item id.
  const items = [];
  for (const line of md.split('\n')) {
    const m = line.match(/^[-*]\s+\[([ xX])\]\s+(.+)$/);
    if (m) items.push({ done: m[1].toLowerCase() === 'x', text: m[2].trim(), raw: line });
  }
  return items;
}

function renderQueue(items, header) {
  return [
    header,
    '',
    ...items.map((i) => `- [${i.done ? 'x' : ' '}] ${i.text}`),
    '',
  ].join('\n');
}

async function aiSpawnTasks({ existingQueue, roadmap, recentStandups, slot, deficit }) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = `You are the CEO of Real Daily Review (an AI-driven daily news digest site, just-launched). You run 4 standups per day. This is the ${slot} standup.

Goal: traffic and revenue grow every day. North-star metric is daily uniques. Path to first revenue: AdSense (after 14 days of content), affiliate links, newsletter sponsorships once we have ≥1k subscribers.

The active sprint queue currently has ${deficit} fewer items than target. Generate ${deficit} new actionable, concrete tasks pulled from the roadmap that an autonomous CEO can execute (or that have a clear shareholder-only blocker labeled).

Constraints on each task:
- Concrete, single-purpose, completable in <1 day of autonomous work
- Tagged with one of: (dev) (content) (growth) (monetization) (ops)
- If the task requires a human (account creation, ID verification, payment auth), prefix with "[NEEDS-SHAREHOLDER]"
- Don't repeat anything already in the existing queue or already shipped per recent standups

Output ONLY the new task lines, one per line, no preamble. Format: "- [ ] (tag) Concrete task description"

EXISTING QUEUE (don't repeat):
${existingQueue || '(empty)'}

ROADMAP (source for new tasks):
${roadmap.slice(0, 6000)}

RECENT STANDUPS (what's been shipped already):
${recentStandups.slice(0, 4000)}`;

  const r = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    temperature: 0.35,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => /^[-*]\s+\[\s*\]/.test(l));
  return lines;
}

async function aiStandupSummary({ slot, queueAfter, doneSinceLast, recentArticles, recentCommits, recentRuns }) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = `Write the ${slot} CEO standup for Real Daily Review. ≤220 words, no fluff.

Format strictly:
## What shipped since last standup
- one bullet per landed item

## Active queue (top 5)
- one bullet per active task

## Risks / blockers
- bullet only if real; "(none)" if not

## North-star
- One line: articles published in last 24h, recent commit count, run pass-rate, anything quantifiable

## Shareholder asks
- bullet only items that need human-in-the-loop; skip if none

DATA:
Done since last standup:
${JSON.stringify(doneSinceLast, null, 2)}

Active queue (top 8):
${JSON.stringify(queueAfter.filter(i => !i.done).slice(0, 8).map(i => i.text), null, 2)}

Recent articles (last 48h):
${JSON.stringify(recentArticles.slice(0, 12), null, 2)}

Recent commits (top 15):
${JSON.stringify(recentCommits.slice(0, 15), null, 2)}

Recent workflow runs (top 8):
${JSON.stringify(recentRuns.slice(0, 8), null, 2)}`;

  const r = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1100,
    temperature: 0.3,
    messages: [{ role: 'user', content: prompt }],
  });
  return r.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}

async function main() {
  await fs.mkdir(STANDUPS_DIR, { recursive: true });
  await fs.mkdir(OPS_DIR, { recursive: true });

  const now = nowUtc();
  const slot = slotForUtcHour(now.getUTCHours(), process.env.SLOT_OVERRIDE);
  const stamp = ymd(now);
  const standupFile = path.join(STANDUPS_DIR, `${stamp}-${slot}.md`);

  // Don't double-write the same slot if cron fires twice within the slot window
  if (await fs.stat(standupFile).catch(() => null)) {
    console.log(`Standup ${stamp}-${slot} already exists — exiting.`);
    return;
  }

  const queueRaw = await readIfExists(QUEUE_FILE, '# Sprint Queue\n\nActive items the CEO operator works through. Newest at top.\n\n');
  const queueItems = parseQueue(queueRaw);
  const activeBeforeCount = queueItems.filter((i) => !i.done).length;

  const roadmap = await readIfExists(ROADMAP_FILE);
  const recentArticles = await listRecentArticleTitles(48);
  const commits = await recentCommits(30);
  const runs = await loadActionRunsViaApi();

  // Detect tasks we can mark done from commit messages
  // Heuristic: if a queue item's text appears (substring) in any recent commit subject, mark done
  const commitText = commits.map((c) => c.subject).join('\n').toLowerCase();
  const newlyDone = [];
  const updatedItems = queueItems.map((i) => {
    if (!i.done) {
      // Match by checking if 3+ significant words from the task overlap with commits
      const words = i.text.toLowerCase().split(/\W+/).filter((w) => w.length >= 5).slice(0, 8);
      const hits = words.filter((w) => commitText.includes(w)).length;
      if (hits >= 3) {
        newlyDone.push(i.text);
        return { ...i, done: true };
      }
    }
    return i;
  });

  // Refill queue if needed
  const activeAfterMarkingCount = updatedItems.filter((i) => !i.done).length;
  let appended = [];
  if (activeAfterMarkingCount < QUEUE_TARGET_SIZE) {
    const deficit = QUEUE_TARGET_SIZE - activeAfterMarkingCount;
    // Pull recent standups for context
    const standupFiles = (await fs.readdir(STANDUPS_DIR).catch(() => []))
      .filter((f) => f.endsWith('.md')).sort().reverse().slice(0, STANDUP_HISTORY_FOR_CONTEXT);
    const recentStandups = (await Promise.all(standupFiles.map((f) => fs.readFile(path.join(STANDUPS_DIR, f), 'utf8').catch(() => '')))).join('\n\n---\n\n');
    try {
      const newLines = await aiSpawnTasks({
        existingQueue: updatedItems.filter((i) => !i.done).map((i) => '- [ ] ' + i.text).join('\n'),
        roadmap, recentStandups, slot, deficit,
      });
      appended = newLines.map((line) => {
        const m = line.match(/^[-*]\s+\[\s*\]\s+(.+)$/);
        return m ? { done: false, text: m[1].trim(), raw: line } : null;
      }).filter(Boolean);
    } catch (err) {
      console.warn('aiSpawnTasks failed:', err.message);
    }
  }

  const finalItems = [...updatedItems, ...appended];

  // Write queue.md
  await fs.writeFile(
    QUEUE_FILE,
    renderQueue(
      finalItems,
      `# Sprint Queue\n\n_Last updated: ${now.toISOString()} (${slot})_\n\nActive items the CEO operator works through. Auto-managed by ceo-standup.yml.`
    ),
    'utf8'
  );

  // Compose standup
  const summaryBody = await aiStandupSummary({
    slot, queueAfter: finalItems, doneSinceLast: newlyDone,
    recentArticles, recentCommits: commits, recentRuns: runs,
  }).catch((err) => `(standup generation failed: ${err.message})\n\nFallback summary — ${appended.length} new tasks queued, ${newlyDone.length} marked done since last run.`);

  const file = `# Standup — ${stamp} ${slot.toUpperCase()}

_Generated ${now.toISOString()} by ceo-standup workflow (cloud, no human in loop)._

${summaryBody}

---
**Queue health:** ${finalItems.filter((i) => !i.done).length} active / ${finalItems.filter((i) => i.done).length} done. Spawned ${appended.length} new tasks this run.
`;

  await fs.writeFile(standupFile, file, 'utf8');
  console.log(`Wrote ${standupFile}`);
  console.log(`Queue size: ${finalItems.length} (${finalItems.filter((i) => !i.done).length} active)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
