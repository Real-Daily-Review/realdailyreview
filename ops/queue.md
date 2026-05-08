# Sprint Queue

_Last updated: 2026-05-08T23:46:08.243Z (evening)_

Active items the CEO operator works through. Auto-managed by ceo-standup.yml.

- [ ] (dev) OG image generator — Cloudflare Worker that renders 1200x630 PNG from article slug, no API cost
- [x] (dev) Deploy API Worker (subscribe + feedback) — DEPLOYED to rdr-api.workers.dev (run #4, 2026-05-07)
- [x] (dev) [NEEDS-SHAREHOLDER] Bind rdr-api Worker to realdailyreview.com/api/* — one-time CF dashboard click OR regen API token with Workers Routes Edit permission
- [x] (dev) [NEEDS-SHAREHOLDER] Create Cloudflare Turnstile widget — drop site key + secret in GH Actions Secrets so forms reject bots
- [x] (growth) Submit sitemap to Google Search Console — DONE 2026-05-07
- [x] (growth) Submit sitemap to Bing Webmaster Tools — DONE 2026-05-07
- [x] (growth) Track GSC indexation — first impressions expected within 3-7 days
- [x] (growth) Ezoic Incubator submitted — under review, up to 2 weeks (decision by ~2026-05-21)
- [x] (ops) Watch for Ezoic Incubator approval/rejection email; update queue when known
- [x] (monetization) ~~Apply to Ezoic~~ — REJECTED 2026-05-07 (250k MAU minimum). Pivot below.
- [x] (monetization) [NEEDS-SHAREHOLDER] Apply to Ezoic Incubator — free, gets us into pipeline pre-traffic
- [x] (monetization) Skimlinks wired — publisher 302708X1790722 active in BaseLayout (2026-05-07)
- [x] (monetization) Buy Me a Coffee handle 'realdailyreview' claimed + brand profile uploaded (2026-05-07)
- [ ] (monetization) [NEEDS-SHAREHOLDER] Apply to Google AdSense (target date: 2026-05-20, after 14 days of content)
- [ ] (content) Backfill 7 days of historical digests for SEO depth — generate dated articles for 2026-04-30 through 2026-05-05
- [ ] (growth) [NEEDS-SHAREHOLDER] Create social accounts: Bluesky, X, Mastodon, Threads, Reddit
- [ ] (dev) Social cross-poster Worker — auto-posts every new article to the platforms above
- [x] (ops) Add overnight publish slot to daily-publish cron (2:30am ET) so we cover Asia/Europe morning hours
- [x] (growth) Auto-generate /feed.xml as a valid RSS 2.0 feed pulling from existing articles (title, URL, pubDate, description). Submit to Feedly + Feedspot indexes on deploy.  _from competitor-watch 2026-05-08_
- [ ] (dev) Add a "Next brief in Xh Xm" live countdown banner in the site header, calculated against the next scheduled cron publish time. Add a "Brief #N of 5 today" label on each article.  _from competitor-watch 2026-05-08_
- [ ] (monetization) Add per-article estimated read time ("~2 min read") rendered statically at build/publish time using word_count / 200, plus a visible article-view counter ("X reads today") for social proof.  _from competitor-watch 2026-05-08_
