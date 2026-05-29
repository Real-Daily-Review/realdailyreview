// Site-wide config. Edit here once, applies everywhere.
// AI-tunable settings live here intentionally so I can adjust without code changes.

export const SITE = {
  name: 'Real Daily Review',
  tagline: 'Straight talk on Colorado politics. Conservative. No spin.',
  description:
    'Daily conservative news and analysis on Colorado politics — the state legislature, governor\'s office, elections, and economic policy. Delivered every weekday morning.',
  url: 'https://realdailyreview.com',
  defaultLocale: 'en',
  defaultOgImage: '/og-default.png',
  twitterHandle: '@realdailyreview',
  publishHourET: 5,
  contactEmail: 'hello@realdailyreview.com',
  feedbackEmail: 'feedback@realdailyreview.com',
  copyrightYearStart: 2026,
} as const;

export const NAV = [
  { href: '/', label: 'Today' },
  { href: '/section/politics', label: 'CO Politics' },
  { href: '/section/elections', label: 'Elections' },
  { href: '/section/economy', label: 'Economy' },
  { href: '/section/national', label: 'National' },
  { href: '/section/opinion', label: 'Opinion' },
  { href: '/archive', label: 'Archive' },
  { href: '/account', label: 'Account' },
] as const;

// Monetization toggles. Flip to true once approval lands. The components
// already render the right markup; nothing else needs to change.
export const MONETIZATION = {
  adsenseEnabled: false,
  adsensePublisherId: '', // ca-pub-XXXXXXXXXXXXXXXX
  amazonAssociatesTag: '', // tag-20
  ezoicEnabled: false,
  tipJarEnabled: true,
  tipJarUrl: 'https://buymeacoffee.com/realdailyreview',
  newsletterSponsorEnabled: false,
  // Skimlinks: auto-affiliates every commerce link in articles via JS.
  skimlinksEnabled: true,
  skimlinksPublisherId: '302708X1790722',
  // Ezoic Incubator: JS-driven ad delivery + consent mgmt.
  ezoicIncubatorEnabled: true,
} as const;

// Cloudflare Web Analytics — privacy-respecting, no cookies, no fingerprinting.
export const ANALYTICS = {
  cloudflareWebAnalyticsToken: '', // fill in after enabling in CF dashboard
} as const;

// Cloudflare Turnstile — bot protection for forms.
export const TURNSTILE = {
  siteKey: '0x4AAAAAADK2HDIDOujAYkxI',
} as const;

// Editorial guardrails surfaced on /about and /editorial-policy.
export const EDITORIAL_PRINCIPLES = [
  'Colorado first — every story is filtered through its impact on Coloradans.',
  'Conservative perspective: we cover the news with a free-market, limited-government, individual-liberty lens.',
  'Brevity over bloat — every story in under 200 words.',
  'Attribute clearly: label what is news, what is analysis, and what is opinion.',
  'Cite sources; link the originals. No fabricated quotes or invented statistics.',
  'Disclose when an article is AI-drafted.',
  'Corrections are appended in-line with date stamps, never silently edited away.',
] as const;
