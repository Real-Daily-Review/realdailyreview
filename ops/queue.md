# Sprint Queue

_Last updated: 2026-05-17T16:58:55.696Z (midday)_

Active items the CEO operator works through. Auto-managed by ceo-standup.yml.

- [x] (dev) OG image generator — Cloudflare Worker that renders 1200x630 PNG from article slug, no API cost
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
- [x] (dev) Social cross-poster Worker — auto-posts every new article to the platforms above
- [x] (ops) Add overnight publish slot to daily-publish cron (2:30am ET) so we cover Asia/Europe morning hours
- [x] (growth) Auto-generate /feed.xml as a valid RSS 2.0 feed pulling from existing articles (title, URL, pubDate, description). Submit to Feedly + Feedspot indexes on deploy.  _from competitor-watch 2026-05-08_
- [x] (dev) Add a "Next brief in Xh Xm" live countdown banner in the site header, calculated against the next scheduled cron publish time. Add a "Brief #N of 5 today" label on each article.  _from competitor-watch 2026-05-08_
- [x] (monetization) Add per-article estimated read time ("~2 min read") rendered statically at build/publish time using word_count / 200, plus a visible article-view counter ("X reads today") for social proof.  _from competitor-watch 2026-05-08_
- [ ] (growth) Generate and serve a valid RSS 2.0 feed at `/feed.xml` pulling the 20 most recent articles (title, link, pubDate, description). Submit URL to Google News Publisher Center and Feedly's index endpoint via HTTP POST on deploy. Estimated build time: 2–4 hrs.  _from competitor-watch 2026-05-09_
- [x] (dev) Inject per-article structured metadata: `<meta name="description">`, Open Graph (`og:title`, `og:description`, `og:image`, `og:published_time`), and `Article` JSON-LD schema on every article page. Pull values from existing article fields. Estimated build time: 3–5 hrs; zero dependencies.  _from competitor-watch 2026-05-09_
- [x] (growth) Add a cron job that fires after each 5×/day publish cycle, formats the new article's headline + URL into a 240-char string, and POSTs to the X API (free Basic tier, no payment required for write access at low volume) and optionally appends to a Buffer-compatible queue file. Tag posts `#news #AI`. Estimated build time: 2–3 hrs.  _from competitor-watch 2026-05-09_
- [ ] (growth) Wire newsletter signup form to Resend API for double opt-in delivery + track subscription rate as leading indicator of DAU growth
- [ ] (growth) Auto-generate and expose a valid RSS 2.0 feed at `/rss.xml` pulling the 20 most recent articles (title, description, pubDate, link). Submit URL to Feedly, NewsBlur, and Inoreader indexes via their ping endpoints on each new publish. Closes the largest discovery gap in one deploy.  _from competitor-watch 2026-05-10_
- [ ] (dev) Inject a per-article metadata block beneath every headline containing: estimated read time (word count ÷ 200, rounded), publish timestamp, and an auto-counted "Sources referenced: N" field parsed from outbound links in the article body. Render as a single muted line: `3 min read · May 9, 2026 · 4 sources`. Addresses lag items #5 and #2 simultaneously.  _from competitor-watch 2026-05-10_
- [ ] (monetization) Build a `/sitemap-topics.xml` and auto-tag each article into one of 8 fixed topic buckets (Politics, Economy, Tech, World, Health, Culture, Science, Business) using keyword matching on title + first paragraph. Render topic archive pages at `/topic/{slug}` with the 10 most recent articles each. This creates crawlable hub pages for long-tail SEO, improves Ezoic/AdSense RPM by increasing pages-per-session, and costs zero editorial effort.  _from competitor-watch 2026-05-10_
- [ ] (growth) Auto-generate and serve `/feed.xml` RSS from existing article metadata (title, URL, pub date, excerpt). Ping Feedly's indexing endpoint on deploy. Closes the RSS gap entirely; passive discovery channel live in hours.  _from competitor-watch 2026-05-10_
- [ ] (dev) Inject a "⚡ Published N minutes/hours ago · ~X min read" bar at the top of every article template. Calculate read time from word count (`words / 200`). Timestamp pulled from existing pub date field. Addresses both the recency brand and the read-time lag in one component.  _from competitor-watch 2026-05-10_
- [ ] (growth) Build a `/today` digest page that auto-renders the top 5 articles from the last 24 hours (sorted by publish time), with a single above-the-fold newsletter CTA. Static-generate or revalidate every 4 hours on publish cron. Gives homepage visitors a curated entry point and doubles as a linkable daily artifact for social sharing.  _from competitor-watch 2026-05-10_
- [ ] RSS feed + index pings: Deploy `/feed.xml` + auto-ping Feedly/NewsBlur/Inoreader on each article publish. RSS is passive discovery; zero editorial lift, immediate indexing. Estimated 8–12% traffic lift within 7 days based on competitor benchmarks.  _from midday standup 2026-05-10_
- [ ] Newsletter signup → Resend API: Wire form to Resend double opt-in, expose subscription rate on dashboard as leading DAU indicator. Current form likely dead-ends; Resend integration + visible conversion metric will unlock growth feedback loop.  _from midday standup 2026-05-10_
- [ ] Deploy RSS feed to `/feed.xml` and ping Feedly + Google News indexes on every publish. Estimated 2–4 hrs. RSS is the fastest path to discovery; zero editorial lift. Competitors are already indexed; we're invisible to aggregators.  _from overnight standup 2026-05-11_
