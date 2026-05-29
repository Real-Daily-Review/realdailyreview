// RSS feed list — verified working as of 2026-05-29.
// All feeds tested; 403/blocked sources removed.
// Conservative-weighted for Colorado politics focus.

export const FEEDS = [

  // ── Colorado News (state coverage, all verified 200) ─────────────────
  {
    name: 'Complete Colorado',
    url: 'https://completecolorado.com/feed/',
    section: 'politics',
    weight: 1.0,
    lean: 'right',
  },
  {
    name: 'Colorado Sun',
    url: 'https://coloradosun.com/feed/',
    section: 'politics',
    weight: 0.8,
    lean: 'center-left',
  },
  {
    name: 'CPR News',
    url: 'https://www.cpr.org/feed/',
    section: 'politics',
    weight: 0.75,
    lean: 'center',
  },
  {
    name: '9News Denver',
    url: 'https://www.9news.com/feeds/syndication/rss/news',
    section: 'politics',
    weight: 0.75,
    lean: 'center',
  },
  {
    name: 'KDVR Fox31 Denver',
    url: 'https://kdvr.com/feed/',
    section: 'politics',
    weight: 0.8,
    lean: 'center-right',
  },

  // ── Colorado Elections (verified 200) ─────────────────────────────────
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
    weight: 0.8,
    lean: 'center',
  },

  // ── Colorado Economy / Energy ──────────────────────────────────────────
  {
    name: 'Western Wire',
    url: 'https://westernwire.net/feed/',
    section: 'economy',
    weight: 1.0,
    lean: 'right',
  },

  // ── National Conservative (all verified 200) ─────────────────────────
  {
    name: 'Washington Examiner',
    url: 'https://www.washingtonexaminer.com/feed',
    section: 'national',
    weight: 1.0,
    lean: 'right',
  },
  {
    name: 'Fox News Politics',
    url: 'https://moxie.foxnews.com/google-publisher/politics.xml',
    section: 'national',
    weight: 0.95,
    lean: 'right',
  },
  {
    name: 'National Review',
    url: 'https://www.nationalreview.com/feed/',
    section: 'national',
    weight: 0.95,
    lean: 'right',
  },
  {
    name: 'The Daily Wire',
    url: 'https://www.dailywire.com/feeds/rss.xml',
    section: 'national',
    weight: 0.9,
    lean: 'right',
  },
  {
    name: 'Daily Caller',
    url: 'https://dailycaller.com/feed/',
    section: 'national',
    weight: 0.85,
    lean: 'right',
  },
  {
    name: 'Just The News',
    url: 'https://justthenews.com/feed',
    section: 'national',
    weight: 0.85,
    lean: 'right',
  },
  {
    name: 'New York Post',
    url: 'https://nypost.com/feed/',
    section: 'national',
    weight: 0.85,
    lean: 'right',
  },
  {
    name: 'Breitbart',
    url: 'https://feeds.feedburner.com/breitbart',
    section: 'national',
    weight: 0.75,
    lean: 'right',
  },

  // ── Opinion / Commentary (verified 200) ──────────────────────────────
  {
    name: 'National Review — The Corner',
    url: 'https://www.nationalreview.com/the-corner/feed/',
    section: 'opinion',
    weight: 0.95,
    lean: 'right',
  },
  {
    name: 'Washington Examiner — Opinion',
    url: 'https://www.washingtonexaminer.com/opinion/feed',
    section: 'opinion',
    weight: 0.9,
    lean: 'right',
  },

];

export function feedsForSection(section) {
  return FEEDS.filter((f) => f.section === section);
}
