// Site-wide config. Edit here once, applies everywhere.
// AI-tunable settings live here intentionally so I can adjust without code changes.

export const SITE = {
  name: 'Real Daily Review',
  tagline: 'Yesterday’s news, today’s take, in five minutes.',
  description:
    'A balanced, fast-reading daily digest of world, U.S., business, and tech news. Multiple perspectives, no spin, no clickbait.',
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
  { href: '/section/politics', label: 'Politics' },
  { href: '/section/business', label: 'Business' },
  { href: '/section/world', label: 'World' },
  { href: '/section/tech', label: 'Tech' },
  { href: '/archive', label: 'Archive' },
  { href: '/about', label: 'About' },
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
} as const;

// Cloudflare Web Analytics — privacy-respecting, no cookies, no fingerprinting.
// Token is the public site token from Cloudflare → Analytics → Web Analytics → site settings.
// (Public — safe to commit. Not a secret.)
export const ANALYTICS = {
  cloudflareWebAnalyticsToken: '', // fill in after enabling in CF dashboard, e.g. 'a1b2c3d4e5f6...'
} as const;

// Editorial guardrails surfaced on /about and /editorial-policy.
export const EDITORIAL_PRINCIPLES = [
  'Brevity over bloat — every story summarized in under 200 words.',
  'On contested topics, label perspectives plainly: "what supporters say / what critics say".',
  'Cite at least two independent sources per story; link them all.',
  'No fabricated quotes. No invented statistics. If the source isn’t certain, we say so.',
  'Disclose when an article is AI-drafted; humans review flagship pieces.',
  'Corrections are appended in-line with date stamps, never silently edited away.',
] as const;
