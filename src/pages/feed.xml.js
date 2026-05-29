import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { SITE } from '@/config';

export async function GET(context) {
  const articles = await getCollection('articles', ({ data }) => !data.draft);

  const sorted = articles
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf())
    .slice(0, 20);

  return rss({
    title: SITE.name,
    description: SITE.description,
    site: context.site ?? SITE.url,
    xmlns: {
      atom: 'http://www.w3.org/2005/Atom',
    },
    customData: [
      '<language>en-us</language>',
      `<managingEditor>${SITE.contactEmail} (${SITE.name})</managingEditor>`,
      `<webMaster>${SITE.contactEmail} (${SITE.name})</webMaster>`,
      `<copyright>Copyright ${new Date().getFullYear()} ${SITE.name}</copyright>`,
      '<ttl>60</ttl>',
      `<atom:link href="${SITE.url}/feed.xml" rel="self" type="application/rss+xml" />`,
    ].join('\n'),
    items: sorted.map((article) => ({
      title: article.data.title,
      pubDate: article.data.pubDate,
      description: article.data.description,
      author: article.data.author,
      link: `/articles/${article.slug}`,
      categories: [
        article.data.section,
        ...(article.data.tags ?? []),
      ],
    })),
  });
}
