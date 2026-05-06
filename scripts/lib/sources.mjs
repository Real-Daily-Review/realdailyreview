// RSS feed list — major outlets across the political spectrum.
// Picked for: free public feeds, broad topic coverage, ideological balance,
// reliable update cadence. Tweak `weight` to up-rank trustworthy sources.

export const FEEDS = [
  // Wires (highest trust, lowest spin)
  { name: 'Reuters Top News', url: 'https://feeds.reuters.com/reuters/topNews', section: 'world', weight: 1.0, lean: 'center' },
  { name: 'AP Top News', url: 'https://rsshub.app/apnews/topics/apf-topnews', section: 'world', weight: 1.0, lean: 'center' },
  { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', section: 'world', weight: 0.95, lean: 'center' },

  // U.S. national
  { name: 'NPR National', url: 'https://feeds.npr.org/1003/rss.xml', section: 'politics', weight: 0.9, lean: 'center-left' },
  { name: 'CBS News U.S.', url: 'https://www.cbsnews.com/latest/rss/us', section: 'politics', weight: 0.85, lean: 'center' },
  { name: 'PBS NewsHour', url: 'https://www.pbs.org/newshour/feeds/rss/headlines', section: 'politics', weight: 0.9, lean: 'center' },

  // Politics — different leans, intentional
  { name: 'The Hill', url: 'https://thehill.com/homenews/feed/', section: 'politics', weight: 0.8, lean: 'center' },
  { name: 'Politico', url: 'https://www.politico.com/rss/politicopicks.xml', section: 'politics', weight: 0.85, lean: 'center' },
  { name: 'Wall Street Journal — Politics', url: 'https://feeds.a.dj.com/rss/RSSPolitics.xml', section: 'politics', weight: 0.85, lean: 'center-right' },
  { name: 'Washington Examiner', url: 'https://www.washingtonexaminer.com/feed', section: 'politics', weight: 0.7, lean: 'right' },

  // Business
  { name: 'Reuters Business', url: 'https://feeds.reuters.com/reuters/businessNews', section: 'business', weight: 1.0, lean: 'center' },
  { name: 'WSJ Business', url: 'https://feeds.a.dj.com/rss/WSJcomUSBusiness.xml', section: 'business', weight: 0.9, lean: 'center' },
  { name: 'Financial Times — World', url: 'https://www.ft.com/?format=rss', section: 'business', weight: 0.9, lean: 'center' },
  { name: 'CNBC Top News', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', section: 'business', weight: 0.8, lean: 'center' },

  // World
  { name: 'Al Jazeera English', url: 'https://www.aljazeera.com/xml/rss/all.xml', section: 'world', weight: 0.85, lean: 'center' },
  { name: 'The Guardian — World', url: 'https://www.theguardian.com/world/rss', section: 'world', weight: 0.85, lean: 'center-left' },
  { name: 'Deutsche Welle — Top Stories', url: 'https://rss.dw.com/atom/rss-en-all', section: 'world', weight: 0.85, lean: 'center' },

  // Tech
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', section: 'tech', weight: 0.85, lean: 'center' },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', section: 'tech', weight: 0.85, lean: 'center' },
  { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', section: 'tech', weight: 0.9, lean: 'center' },
  { name: 'Hacker News', url: 'https://hnrss.org/frontpage', section: 'tech', weight: 0.7, lean: 'center' },
];

export function feedsForSection(section) {
  return FEEDS.filter((f) => f.section === section);
}
