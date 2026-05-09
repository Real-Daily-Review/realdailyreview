#!/usr/bin/env node
/**
 * Per-article OG card generator.
 *
 * For every article that doesn't have a /public/og/<slug>.png yet, render
 * a 1200x630 SVG with the headline + section + brand mark and rasterize
 * to PNG via ImageMagick. Designed to run AFTER the content pipeline
 * commits articles, BEFORE the build, so each article ships with a
 * custom card.
 *
 * Requires `convert` (ImageMagick) on the runner.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import matter from 'gray-matter';

const ARTICLES_DIR = path.resolve('src/content/articles');
const OG_DIR = path.resolve('public/og');

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function wrapText(text, maxCharsPerLine, maxLines) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > maxCharsPerLine) {
      lines.push(line.trim());
      line = w;
      if (lines.length === maxLines - 1) break;
    } else {
      line = (line ? line + ' ' : '') + w;
    }
  }
  if (line) lines.push(line.trim());
  if (lines.length === maxLines && words.length > lines.join(' ').split(/\s+/).length) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/[.,!?]?\s*$/, '') + '…';
  }
  return lines;
}

function svgFor({ title, section }) {
  const lines = wrapText(title, 36, 4);
  const sectionLabel = (section || 'news').toUpperCase();
  // Layout: brand bar top, section eyebrow, title (large serif), brand mark bottom-left
  const titleSvg = lines.map((l, i) => {
    return `<text x="60" y="${190 + i * 84}" font-family="Iowan Old Style, Charter, Georgia, serif" font-weight="900" font-size="76" fill="#1a1a1a" letter-spacing="-1.5">${escapeXml(l)}</text>`;
  }).join('\n  ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#fbfaf7"/>
  <rect width="1200" height="8" fill="#8a1538"/>
  <text x="60" y="100" font-family="-apple-system, Inter, sans-serif" font-weight="600" font-size="22" fill="#8a1538" letter-spacing="3">${escapeXml(sectionLabel)} · REAL DAILY REVIEW</text>
  ${titleSvg}
  <line x1="60" y1="540" x2="1140" y2="540" stroke="#e7e3da" stroke-width="2"/>
  <rect x="60" y="560" width="56" height="56" fill="#8a1538" rx="8"/>
  <text x="88" y="601" font-family="Iowan Old Style, Charter, Georgia, serif" font-weight="900" font-size="40" text-anchor="middle" fill="#fbfaf7">R</text>
  <text x="135" y="585" font-family="-apple-system, Inter, sans-serif" font-weight="600" font-size="20" fill="#1a1a1a">Real Daily Review</text>
  <text x="135" y="608" font-family="-apple-system, Inter, sans-serif" font-weight="400" font-size="16" fill="#5b5b5b">realdailyreview.com</text>
</svg>`;
}

async function ensureConvert() {
  try {
    execSync('convert -version', { stdio: 'pipe' });
    return true;
  } catch {
    console.warn('[gen-og] ImageMagick `convert` not available — skipping per-article OG generation');
    return false;
  }
}

async function main() {
  if (!await ensureConvert()) return;
  await fs.mkdir(OG_DIR, { recursive: true });
  const files = (await fs.readdir(ARTICLES_DIR).catch(() => [])).filter((f) => f.endsWith('.md'));
  let generated = 0;
  let skipped = 0;
  for (const f of files) {
    const slug = f.replace(/\.md$/, '');
    const outPath = path.join(OG_DIR, `${slug}.png`);
    try { await fs.access(outPath); skipped++; continue; } catch {}
    let data;
    try {
      const raw = await fs.readFile(path.join(ARTICLES_DIR, f), 'utf8');
      data = matter(raw).data;
    } catch { continue; }
    if (!data.title) continue;
    const svg = svgFor({ title: data.title, section: data.section });
    const tmp = path.join('/tmp', `og-${slug}.svg`);
    await fs.writeFile(tmp, svg, 'utf8');
    try {
      execSync(`convert -background none -density 200 -resize 1200x630 "${tmp}" "${outPath}"`, { stdio: 'pipe' });
      generated++;
      console.log(`[gen-og] ${slug}.png`);
    } catch (err) {
      console.warn(`[gen-og] failed for ${slug}: ${err.message}`);
    }
    await fs.unlink(tmp).catch(() => {});
  }
  console.log(`[gen-og] generated=${generated} skipped=${skipped} total_articles=${files.length}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
