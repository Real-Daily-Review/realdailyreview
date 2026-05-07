# Real Daily Review — Living Roadmap

The CEO (Claude) maintains this file. Each daily standup pulls from it. Update freely.

## North-star metric
**Daily unique visitors** — must trend up week over week. Everything below ladders to this.

## Now (Sprint 0 — launch) — COMPLETE 2026-05-07
- [x] Scaffold Astro + content pipeline + CI
- [x] LAUNCH_PLAYBOOK for shareholder
- [x] First successful daily-publish run on real news (9 articles published 2026-05-07)
- [x] Cloudflare Pages connected, custom domain live (realdailyreview.com)
- [x] Cloudflare Web Analytics — snippet wired (token pending shareholder)
- [ ] Submit sitemap to Google Search Console + Bing Webmaster Tools (shareholder identity verification)

## Next (Sprint 1 — first traffic)
- [x] Cron: bumped from 1 publish/day to 3 (5:15am / 11:30am / 5:30pm ET) — shipped 2026-05-07
- [x] Newsletter form: phone collection (optional) + worker schema + E.164 normalization — shipped 2026-05-07
- [ ] **OpenGraph image generator** — CF Worker renders SVG→PNG title cards on demand. Free, no API. Shareholder priority #1 on images.
- [ ] **AI hero images on flagship pieces** — Stability AI or OpenAI gpt-image-1 for the daily digest only (~$0.04/image × 22 weekdays = ~$1/mo). Lower priority than OG cards.
- [ ] **Social posting Worker** — fires on every push to articles, posts to Bluesky + X + Mastodon (free APIs). Reddit deferred (manual to start).
  - BLOCKED on shareholder creating accounts: X handle, Bluesky handle, Mastodon instance choice
- [ ] Newsletter wired to Resend (paid switch, ~$20/mo) + double opt-in
- [ ] SMS sender via Twilio for breaking-news alerts to phone subscribers
- [ ] Backfill: have content pipeline write the last 7 days of digests retroactively (for SEO depth on launch)
- [ ] Submit to Google News Publisher Center
- [ ] Submit sitemap to Google Search Console + Bing Webmaster Tools (shareholder identity verification)
- [ ] Cookie consent banner for EU/UK visitors

## Soon (Sprint 2 — monetize)
- [ ] AdSense application after 14 days of content
- [ ] Amazon Associates application
- [ ] Affiliate sandbox: tag-based product mentions in tech briefs
- [ ] Newsletter sponsor slot template + rate card
- [ ] Tip jar live on every article (currently scaffolded, needs real account)

## Later (Sprint 3+ — scale)
- [ ] Topic feeds (per-section RSS)
- [ ] Comment system (or skip — feedback form may suffice)
- [ ] User accounts (Cloudflare Access? Magic link via Resend?) — only if we add bookmarks/saved-for-later
- [ ] Per-story "perspectives" deep dives — flagship long-form
- [ ] Editorial council scoring + flag system for AI drift
- [ ] A/B test headlines via Cloudflare Worker
- [ ] Mobile PWA install prompt

## Operating principles
- Free tier wins until we can justify the spend with ROI math.
- Security first: no private data leaves Cloudflare Workers; no secret in any file under git.
- Every feature ships with measurement. If we can't see whether it moved DAU, don't ship it.
