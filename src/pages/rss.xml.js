import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { SITE } from '@/config';

export async function GET(context) {
  const items = await getCollection('articles', ({ data }) => !data.draft);
  return rss({
    title: SITE.name,
    description: SITE.description,
    site: context.site,
    items: items
      .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf())
      .slice(0, 50)
      .map((a) => ({
        title: a.data.title,
        pubDate: a.data.pubDate,
        description: a.data.description,
        author: a.data.author,
        link: `/articles/${a.slug}`,
        categories: [a.data.section, ...a.data.tags],
      })),
    customData: `<language>en-us</language>`,
  });
}
