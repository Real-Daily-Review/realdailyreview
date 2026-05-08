// Turn a draft + metadata into a Markdown file in src/content/articles/.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import slugify from 'slugify';
import sanitizeHtml from 'sanitize-html';
import matter from 'gray-matter';

const ARTICLES_DIR = path.resolve('src/content/articles');

function dateStamp(d = new Date()) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Allowlist for AI-generated body content. Markdown is rendered server-side,
// but we sanitize raw HTML defensively in case a model emits any.
function safeBody(body) {
  return sanitizeHtml(body, {
    allowedTags: ['p', 'a', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li', 'blockquote', 'h2', 'h3', 'h4', 'br', 'hr'],
    allowedAttributes: { a: ['href', 'rel', 'target', 'title'] },
    allowedSchemes: ['https', 'http', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'nofollow noopener', target: '_blank' }),
    },
  });
}

function slugifyTag(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

export async function writeArticle({ body, meta, pubDate = new Date(), aiGenerated = true }) {
  const stamp = dateStamp(pubDate);
  const slug = `${stamp}-${slugify(meta.title, { lower: true, strict: true }).slice(0, 70)}`;
  const filename = path.join(ARTICLES_DIR, `${slug}.md`);

  // Normalize tags: lowercase, slugified, deduped, max 8.
  const cleanTags = Array.from(
    new Set((meta.tags || []).map(slugifyTag).filter(Boolean))
  ).slice(0, 8);

  const frontmatter = {
    title: meta.title,
    description: meta.description,
    pubDate: pubDate.toISOString(),
    section: meta.section || 'world',
    tags: cleanTags,
    perspectives: meta.perspectives || [],
    sources: (meta.sources || []).slice(0, 8),
    aiGenerated,
    draft: false,
  };

  const file = matter.stringify(safeBody(body), frontmatter);
  await fs.mkdir(ARTICLES_DIR, { recursive: true });
  await fs.writeFile(filename, file, 'utf8');
  return { slug, filename };
}

export async function articleExistsForDate(section, date = new Date()) {
  const stamp = dateStamp(date);
  const files = await fs.readdir(ARTICLES_DIR).catch(() => []);
  return files.some((f) => f.startsWith(stamp) && f.includes(section));
}
