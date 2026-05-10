import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { SITE } from '@/config';

export async function GET(context) {
  const articles = await getCollection('articles', ({ data }) => !data.draft);

  const sorted = articles
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf())
    .slice(0, 20);

  return rss({
    // RSS 2.0 required fields
    title: SITE.name,
    description: SITE.description,
    site: context.site ?? SITE.url,
    // Feed-level metadata
    customData: [
      '<language>en-us</language>',
      `<copyright>\u00a9 ${new Date().getFullYear()} ${SITE.name}</copyright>`,
      `<managingEditor>${SITE.contactEmail} (${SITE.name})</managingEditor>`,
      `<webMaster>${SITE.contactEmail} (${SITE.name})</webMaster>`,
      '<ttl>60</ttl>',
      // Google News / PubSubHubbub hub declaration
      '<atom:link href="https://pubsubhubbub.appspot.com" rel="hub" xmlns:atom="http://www.w3.org/2005/Atom"/>',
      `<atom:link href="${SITE.url}/feed.xml" rel="self" type="application/rss+xml" xmlns:atom="http://www.w3.org/2005/Atom"/>`,
    ].join('\n'),
    xmlns: {
      atom: 'http://www.w3.org/2005/Atom',
      dc: 'http://purl.org/dc/elements/1.1/',
    },
    items: sorted.map((article) => ({
      title: article.data.title,
      pubDate: article.data.pubDate,
      description: article.data.description,
      author: article.data.author,
      link: `/articles/${article.slug}`,
      categories: [
        article.data.section,
        ...article.data.tags,
      ],
    })),
  });
}
