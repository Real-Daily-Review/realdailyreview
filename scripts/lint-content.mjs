#!/usr/bin/env node
// Quick sanity check on generated content. Runs in CI to fail fast on bad output.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const ARTICLES_DIR = path.resolve('src/content/articles');

const checks = [
  { name: 'has title', test: (m) => typeof m.title === 'string' && m.title.length >= 8 && m.title.length <= 120 },
  { name: 'has description', test: (m) => typeof m.description === 'string' && m.description.length >= 40 && m.description.length <= 280 },
  { name: 'has pubDate', test: (m) => !isNaN(Date.parse(m.pubDate)) },
  { name: 'has valid section', test: (m) => ['digest','politics','business','world','tech','culture','explainer','opinion'].includes(m.section) },
  { name: 'no obvious LLM artifacts', test: (m, body) => !/(as an ai|as a language model|i cannot|i'm sorry, but)/i.test(body) },
  { name: 'no fabricated source markers', test: (m, body) => !/\[citation needed\]|\[link\]/i.test(body) },
  { name: 'word count reasonable', test: (m, body) => {
      // Exempt meta/announcement posts from length rules
      if ((m.tags || []).includes('meta')) return true;
      const words = body.split(/\s+/).filter(Boolean).length;
      if (m.section === 'digest') return words >= 350 && words <= 900;
      return words >= 80 && words <= 600;
    },
  },
];

async function main() {
  const files = (await fs.readdir(ARTICLES_DIR)).filter((f) => f.endsWith('.md'));
  let failed = 0;
  for (const f of files) {
    const raw = await fs.readFile(path.join(ARTICLES_DIR, f), 'utf8');
    const { data, content } = matter(raw);
    for (const c of checks) {
      try {
        if (!c.test(data, content)) {
          console.warn(`✗ ${f}: ${c.name}`);
          failed++;
        }
      } catch (err) {
        console.warn(`✗ ${f}: ${c.name} — ${err.message}`);
        failed++;
      }
    }
  }
  console.log(`Checked ${files.length} articles; ${failed} check failures.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
