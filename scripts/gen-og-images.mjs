#!/usr/bin/env node
/**
 * Per-article hero/OG image generator.
 *
 * Strategy stack (first that succeeds wins):
 *   1. Unsplash photo by topic — if UNSPLASH_ACCESS_KEY set; uses article tags
 *      as search query, picks landscape photo, composites title overlay.
 *   2. Wikimedia Commons photo by topic — keyless, free; same compositing.
 *   3. Brand template card — system fonts (DejaVu Serif), no SVG fallback,
 *      direct ImageMagick caption: rendering so text always lays out correctly.
 *
 * Output: public/og/<slug>.jpg (or .png for templates) at 1200x630.
 * Idempotent: skips slugs that already have a card.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import matter from 'gray-matter';

const ARTICLES_DIR = path.resolve('src/content/articles');
const OG_DIR = path.resolve('public/og');
const TMP_DIR = '/tmp/rdr-og';
const W = 1200, H = 630;

const UNSPLASH = process.env.UNSPLASH_ACCESS_KEY;
const SKIP_PHOTOS = process.env.SKIP_PHOTOS === '1';

function shellEscape(s) { return String(s).replace(/'/g, "'\\''"); }

function which(cmd) {
  try { execSync(`command -v ${cmd}`, { stdio: 'pipe' }); return true; } catch { return false; }
}

// Pick the best font from what's actually installed on the runner.
function pickFont() {
  try {
    const list = execSync('fc-list :family', { encoding: 'utf8' });
    const candidates = ['DejaVu Serif', 'Liberation Serif', 'Noto Serif', 'FreeSerif', 'serif'];
    for (const c of candidates) if (list.split(',').some((f) => f.trim() === c) || list.includes(c)) return c;
  } catch {}
  return 'serif';
}

function pickBoldFontPath() {
  // Try to find a bold serif file path so we can pass it to -font directly
  try {
    const out = execSync('fc-match -f "%{file}" "DejaVu Serif:weight=Bold"', { encoding: 'utf8' }).trim();
    if (out) return out;
  } catch {}
  return null;
}

async function fetchWithTimeout(url, opts = {}, ms = 4000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally { clearTimeout(timer); }
}

async function unsplashSearch(query) {
  if (!UNSPLASH) return null;
  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&orientation=landscape&per_page=10&content_filter=high`;
    const r = await fetchWithTimeout(url, { headers: { Authorization: `Client-ID ${UNSPLASH}` } }, 4000);
    if (!r.ok) return null;
    const j = await r.json();
    const choices = j.results || [];
    if (!choices.length) return null;
    const pick = choices[Math.floor(Math.random() * Math.min(choices.length, 5))];
    return {
      src: pick.urls.regular,
      full: pick.urls.full,
      credit: `${pick.user.name} / Unsplash`,
      creditUrl: pick.user.links.html,
    };
  } catch { return null; }
}

async function wikimediaSearch(query) {
  // Wikimedia's free media search, no API key.
  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent('filetype:bitmap ' + query)}&gsrlimit=8&gsrnamespace=6&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1600&origin=*`;
    const r = await fetchWithTimeout(url, {}, 4000);
    if (!r.ok) return null;
    const j = await r.json();
    const pages = j.query?.pages ? Object.values(j.query.pages) : [];
    const choices = pages.filter((p) => p.imageinfo && p.imageinfo[0] && p.imageinfo[0].thumburl);
    if (!choices.length) return null;
    const pick = choices[Math.floor(Math.random() * Math.min(choices.length, 5))];
    const info = pick.imageinfo[0];
    const credit = (info.extmetadata?.Artist?.value || 'Wikimedia Commons').replace(/<[^>]+>/g, '').slice(0, 80);
    return { src: info.thumburl, full: info.url, credit, creditUrl: pick.title };
  } catch { return null; }
}

async function downloadImage(url, dest) {
  const r = await fetch(url, { headers: { 'User-Agent': 'RealDailyReviewBot/1.0' } });
  if (!r.ok) throw new Error(`download ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  await fs.writeFile(dest, buf);
}

// Build a query string from tags + title to find a relevant photo.
function searchQueryFor(article) {
  const tags = (article.tags || []).filter(Boolean);
  if (tags.length) return tags.slice(0, 2).join(' ');
  const stop = new Set(['the','a','an','of','to','in','on','for','at','with','from','as','and','is','are','this','that','says','said','after','amid','over','by']);
  const words = (article.title || '').replace(/[^\p{L}\s]/gu, '').split(/\s+/).filter((w) => w.length >= 4 && !stop.has(w.toLowerCase()));
  return words.slice(0, 3).join(' ') || article.section || 'news';
}

// Compose: photo (cover) + dark gradient overlay (bottom) + title text + brand strip + section eyebrow.
async function composeWithPhoto(photoPath, outPath, { title, section, font, credit }) {
  const dim = `${W}x${H}`;
  const tEsc = shellEscape(title);
  const sEsc = shellEscape((section || 'news').toUpperCase());
  const cEsc = shellEscape((credit || 'photo').slice(0, 80));
  // 1. resize+crop photo to 1200x630, slight darken
  // 2. add bottom-up dark gradient for legibility
  // 3. caption title (white, large), section eyebrow (small, branded)
  // 4. red top stripe
  const cmd = `set -e
convert "${photoPath}" -resize ${dim}^ -gravity center -extent ${dim} -modulate 90,80,100 /tmp/rdr-og/_photo.png
convert -size ${dim} -define gradient:angle=180 gradient:'rgba(0,0,0,0)-rgba(0,0,0,0.78)' /tmp/rdr-og/_grad.png
convert /tmp/rdr-og/_photo.png /tmp/rdr-og/_grad.png -compose over -composite /tmp/rdr-og/_bg.png
convert -size 1080x80 -background none -fill '#fbfaf7' -font '${font}' -pointsize 22 -gravity NorthWest -interline-spacing 0 caption:'${sEsc} · REAL DAILY REVIEW' /tmp/rdr-og/_eyebrow.png
convert -size 1080x300 -background none -fill '#fbfaf7' -font '${font}' -weight Bold -pointsize 64 -gravity NorthWest -interline-spacing 4 caption:'${tEsc}' /tmp/rdr-og/_title.png
convert /tmp/rdr-og/_bg.png \\
  -fill '#8a1538' -draw 'rectangle 0,0 ${W},8' \\
  /tmp/rdr-og/_title.png -geometry +60+340 -composite \\
  /tmp/rdr-og/_eyebrow.png -geometry +60+540 -composite \\
  -size 1080x40 -background none -fill '#bfbfbf' -font '${font}' -pointsize 14 -gravity NorthWest caption:'Photo: ${cEsc}' -geometry +60+595 -composite \\
  -quality 84 "${outPath}"`;
  spawnSync('bash', ['-lc', cmd], { stdio: 'pipe' });
}

// Brand-card fallback: cream background, burgundy stripe, section eyebrow, title in dark, footer.
// Single convert call so 83 articles render in ~30s, not ~5 min.
async function composeBrandCard(outPath, { title, section, font }) {
  const dim = `${W}x${H}`;
  const tEsc = shellEscape(title);
  const sEsc = shellEscape((section || 'news').toUpperCase());
  const cmd = `convert -size ${dim} xc:'#fbfaf7' \
    -fill '#8a1538' -draw 'rectangle 0,0 ${W},8' \
    \\( -size 1080x60 -background none -fill '#8a1538' -font '${font}' -pointsize 22 -gravity NorthWest caption:'${sEsc} · REAL DAILY REVIEW' \\) -geometry +60+80 -composite \
    \\( -size 1080x340 -background none -fill '#1a1a1a' -font '${font}' -weight Bold -pointsize 60 -gravity NorthWest -interline-spacing 8 caption:'${tEsc}' \\) -geometry +60+170 -composite \
    \\( -size 56x56 xc:'#8a1538' -fill '#fbfaf7' -font '${font}' -weight Bold -pointsize 40 -gravity center label:'R' \\) -geometry +60+550 -composite \
    \\( -size 700x32 -background none -fill '#1a1a1a' -font '${font}' -weight Bold -pointsize 22 -gravity NorthWest caption:'Real Daily Review' \\) -geometry +135+555 -composite \
    \\( -size 700x24 -background none -fill '#5b5b5b' -font '${font}' -pointsize 16 -gravity NorthWest caption:'realdailyreview.com' \\) -geometry +135+584 -composite \
    "${outPath}"`;
  const r = spawnSync('bash', ['-lc', cmd], { stdio: 'pipe' });
  if (r.status !== 0) throw new Error(r.stderr?.toString().slice(0, 200) || 'convert failed');
}

async function main() {
  if (!which('convert')) { console.warn('[gen-og] ImageMagick missing; skipping'); return; }
  await fs.mkdir(OG_DIR, { recursive: true });
  await fs.mkdir(TMP_DIR, { recursive: true });

  const font = pickFont();
  console.log(`[gen-og] using font: ${font}; UNSPLASH=${!!UNSPLASH}`);

  const files = (await fs.readdir(ARTICLES_DIR).catch(() => [])).filter((f) => f.endsWith('.md'));
  let made = 0, skipped = 0, photo = 0, brand = 0;

  for (const f of files) {
    const slug = f.replace(/\.md$/, '');
    const out = path.join(OG_DIR, `${slug}.jpg`);
    const outPng = path.join(OG_DIR, `${slug}.png`);
    try { await fs.access(out); skipped++; continue; } catch {}
    try { await fs.access(outPng); skipped++; continue; } catch {}

    let data;
    try {
      const raw = await fs.readFile(path.join(ARTICLES_DIR, f), 'utf8');
      data = matter(raw).data;
    } catch { continue; }
    if (!data.title) continue;

    const article = { title: data.title, section: data.section, tags: data.tags || [] };
    const query = searchQueryFor(article);

    let photoPath = null;
    let credit = '';
    if (!SKIP_PHOTOS) {
      try {
        const u = await unsplashSearch(query);
        if (u) {
          photoPath = path.join(TMP_DIR, `${slug}.src`);
          await downloadImage(u.src, photoPath);
          credit = u.credit;
        } else {
          const w = await wikimediaSearch(query);
          if (w) {
            photoPath = path.join(TMP_DIR, `${slug}.src`);
            await downloadImage(w.src, photoPath);
            credit = w.credit;
          }
        }
      } catch (err) {
        console.warn(`[gen-og] photo fetch failed for ${slug}: ${err.message}`);
      }
    }

    try {
      if (photoPath) {
        await composeWithPhoto(photoPath, out, { title: article.title, section: article.section, font, credit });
        photo++;
        console.log(`[gen-og] photo ${slug} (q=${query})`);
      } else {
        await composeBrandCard(outPng, { title: article.title, section: article.section, font });
        brand++;
        console.log(`[gen-og] brand ${slug}`);
      }
      made++;
    } catch (err) {
      console.warn(`[gen-og] compose failed for ${slug}: ${err.message}`);
    }
    if (photoPath) await fs.unlink(photoPath).catch(() => {});
  }

  console.log(`[gen-og] made=${made} (photo=${photo}, brand=${brand}) skipped=${skipped} total=${files.length}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
