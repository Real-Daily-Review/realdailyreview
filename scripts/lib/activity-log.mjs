// Shared helper: every agent's workflow appends a structured entry to its
// activity log so the org-chart artifact can render "currently working on /
// previously did / next up" without each agent reinventing logging.

import { promises as fs } from 'node:fs';
import path from 'node:path';

export async function appendActivity({ agentSlug, action, summary, links = {}, status = 'completed' }) {
  const dir = path.resolve('ops/activity', agentSlug);
  await fs.mkdir(dir, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const file = path.join(dir, `${today}.md`);
  const entry = `\n## ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC — ${action} (${status})

${summary.trim()}

${Object.entries(links).map(([k, v]) => `- ${k}: ${v}`).join('\n')}
`;
  const existing = await fs.readFile(file, 'utf8').catch(() => `# ${agentSlug} — ${today}\n`);
  await fs.writeFile(file, existing + entry, 'utf8');
}

// Read the latest activity for an agent (most recent N entries across last 7 days).
export async function readLatestActivity(agentSlug, n = 5) {
  const dir = path.resolve('ops/activity', agentSlug);
  const files = (await fs.readdir(dir).catch(() => []))
    .filter((f) => f.endsWith('.md'))
    .sort()
    .reverse()
    .slice(0, 7);
  const entries = [];
  for (const f of files) {
    const raw = await fs.readFile(path.join(dir, f), 'utf8').catch(() => '');
    // Each entry begins with `## YYYY-MM-DD HH:MM:SS UTC — Action`
    const parts = raw.split(/\n(?=## \d{4}-\d{2}-\d{2})/);
    for (const p of parts) {
      const m = p.match(/^## (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) UTC — (.+?) \((\w+)\)/);
      if (m) entries.push({ time: m[1], action: m[2], status: m[3], body: p.slice(m[0].length).trim() });
    }
  }
  return entries.slice(0, n);
}
