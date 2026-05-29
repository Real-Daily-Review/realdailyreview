// RSS feed list — Colorado politics coverage with a conservative lens.
// Sources span conservative outlets, Colorado-specific news, and select
// national wires for context. Weight reflects editorial trust + ideological fit.

export const FEEDS = [
  // ── Colorado Conservative / Right-leaning ────────────────────────────────
  {
    name: 'Complete Colorado',
    url: 'https://completecolorado.com/feed/',
    section: 'politics',
    weight: 1.0,
    lean: 'right',
  },
  {
    name: 'Colorado Peak Politics',
    url: 'https://coloradopeakpolitics.com/feed/',
    section: 'politics',
    weight: 1.0,
    lean: 'right',
  },
  {
    name: 'Colorado Springs Gazette — Politics',
    url: 'https://gazette.com/news/politics/rss/',
    section: 'politics',
    weight: 0.95,
    lean: 'right',
  },
  {
    name: 'Denver Gazette',
    url: 'https://denvergazette.com/feed/',
    section: 'politics',
    weight: 0.9,
    lean: 'right',
  },

  // ── Colorado General News (for raw state coverage) ─────────────────────
  {
    name: 'Colorado Politics',
    url: 'https://www.coloradopolitics.com/feed/',
    section: 'politics',
    weight: 0.85,
    lean: 'center',
  },
  {
    name: 'Colorado Sun',
    url: 'https://coloradosun.com/feed/',
    section: 'politics',
    weight: 0.75,
    lean: 'center-left',
  },
  {
    name: 'CPR News',
    url: 'https://www.cpr.org/feed/',
    section: 'politics',
    weight: 0.7,
    lean: 'center-left',
  },
  {
    name: 'Denver Post — Politics',
    url: 'https://www.denverpost.com/politics/feed/',
    section: 'politics',
    weight: 0.75,
    lean: 'center',
  },
  {
    name: '9News Colorado',
    url: 'https://www.9news.com/feeds/syndication/rss/news',
    section: 'politics',
    weight: 0.7,
    lean: 'center',
  },

  // ── Colorado Elections ─────────────────────────────────────────────────
  {
    name: 'Colorado Politics — Elections',
    url: 'https://www.coloradopolitics.com/elections/feed/',
    section: 'elections',
    weight: 0.95,
    lean: 'center',
  },
  {
    name: 'Complete Colorado — Elections',
    url: 'https://completecolorado.com/category/elections/feed/',
    section: 'elections',
    weight: 1.0,
    lean: 'right',
  },
  {
    name: 'Denver Post — Elections',
    url: 'https://www.denverpost.com/tag/election/feed/',
    section: 'elections',
    weight: 0.75,
    lean: 'center',
  },

  // ── Colorado Economy / Energy ──────────────────────────────────────────
  {
    name: 'Denver Business Journal',
    url: 'https://www.bizjournals.com/denver/news/feed/',
    section: 'economy',
    weight: 0.9,
    lean: 'center',
  },
  {
    name: 'Colorado Springs Business Journal',
    url: 'https://www.bizjournals.com/colorado-springs/news/feed/',
    section: 'economy',
    weight: 0.8,
    lean: 'center',
  },
  {
    name: 'Western Wire — Energy',
    url: 'https://westernwire.net/feed/',
    section: 'economy',
    weight: 0.9,
    lean: 'right',
  },

  // ── National Conservative ─────────────────────────────────────────────
  {
    name: 'Washington Examiner',
    url: 'https://www.washingtonexaminer.com/feed',
    section: 'national',
    weight: 0.95,
    lean: 'right',
  },
  {
    name: 'Fox News Politics',
    url: 'https://moxie.foxnews.com/google-publisher/politics.xml',
    section: 'national',
    weight: 0.9,
    lean: 'right',
  },
  {
    name: 'National Review',
    url: 'https://www.nationalreview.com/feed/',
    section: 'national',
    weight: 0.9,
    lean: 'right',
  },
  {
    name: 'The Daily Wire',
    url: 'https://www.dailywire.com/feeds/rss.xml',
    section: 'national',
    weight: 0.85,
    lean: 'right',
  },
  {
    name: 'Daily Caller',
    url: 'https://dailycaller.com/feed/',
    section: 'national',
    weight: 0.8,
    lean: 'right',
  },
  {
    name: 'Wall Street Journal — Politics',
    url: 'https://feeds.a.dj.com/rss/RSSPolitics.xml',
    section: 'national',
    weight: 0.9,
    lean: 'center-right',
  },

  // ── National Wires (for context / opposing view awareness) ────────────
  {
    name: 'Reuters Top News',
    url: 'https://feeds.reuters.com/reuters/topNews',
    section: 'national',
    weight: 0.7,
    lean: 'center',
  },
  {
    name: 'AP Top News',
    url: 'https://rsshub.app/apnews/topics/apf-topnews',
    section: 'national',
    weight: 0.7,
    lean: 'center',
  },

  // ── Opinion / Commentary ──────────────────────────────────────────────
  {
    name: 'National Review — Corner',
    url: 'https://www.nationalreview.com/the-corner/feed/',
    section: 'opinion',
    weight: 0.9,
    lean: 'right',
  },
  {
    name: 'Washington Examiner — Opinion',
    url: 'https://www.washingtonexaminer.com/opinion/feed',
    section: 'opinion',
    weight: 0.85,
    lean: 'right',
  },
  {
    name: 'Colorado Springs Gazette — Opinion',
    url: 'https://gazette.com/opinion/rss/',
    section: 'opinion',
    weight: 0.9,
    lean: 'right',
  },
];

export function feedsForSection(section) {
  return FEEDS.filter((f) => f.section === section);
}
