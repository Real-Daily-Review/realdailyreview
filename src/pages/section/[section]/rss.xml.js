import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { SITE } from '@/config';

const SECTIONS = ['politics', 'elections', 'economy', 'national', 'opinion', 'explainer', 'digest'];

export async function getStaticPaths() {
  return SECTIONS.map((section) => ({ params: { section } }));
}

export async function GET({ params, site }) {
  const { section } = params;
  const items = await getCollection(
    'articles',
    ({ data }) => !data.draft && data.section === section
  );
  const titleCase = section.charAt(0).toUpperCase() + section.slice(1);
  return rss({
    title: `${SITE.name} — ${titleCase}`,
    description: `${titleCase} news from ${SITE.name}. ${SITE.description}`,
    site,
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
