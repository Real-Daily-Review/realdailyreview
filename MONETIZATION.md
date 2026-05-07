# Monetization — 30-Day Plan

> Shareholder directive (2026-05-07): "Operate 24 hours a day to make this profitable within 30 days."
> Target: ≥$1/day net by 2026-06-06, scaling toward break-even on a $50/mo budget.

## What's already wired (code-side, awaiting approvals)
- AdSense slot components — `src/components/AdSlot.astro` renders placeholder until `MONETIZATION.adsenseEnabled = true`
- Amazon Associates link helper — `src/components/AffiliateLink.astro`
- Buy Me a Coffee tip jar — `src/components/TipJar.astro`, live now at https://buymeacoffee.com/realdailyreview *(shareholder must claim handle)*
- Newsletter signup — collecting emails since launch (Worker pending deploy)
- Phone collection in subscribe form — opens SMS sponsorship lane
- ads.txt placeholder at `public/ads.txt` — required by AdSense

## Approval timeline (realistic, REVISED 2026-05-07)

| Channel | Earliest apply | Realistic green-light | First $ |
|---|---|---|---|
| **Ezoic** | ~~Now~~ — REJECTED 2026-05-07, requires 250k MAU. Apply to Incubator (free) for early-stage track. | 90+ days at current trajectory | Day 90+ |
| **Ezoic Incubator** | Today (free) | 5-10 days | When traffic justifies |
| **Buy Me a Coffee** | Now | Same day | Whenever 1st reader tips |
| **Skimlinks** | Now (auto-approve, no min traffic) | Same day | Within hours of first commerce-link click |
| **Monumetric** | At 10k pageviews/mo (~$99 setup fee) | 1-2 weeks | When threshold hit |
| **Google AdSense** | After 14 days of content + privacy/about/contact (already have) | Day 14-21 | Day 21-30 |
| **Amazon Associates** | After 5 articles linked | 1-3 days | After 3 qualifying sales in 180d |
| **Mediavine Journey** | 10k sessions/mo (no setup fee) | When threshold hit | When threshold hit |
| **Newsletter sponsors** | When list ≥ 1k confirmed | Likely 60-90 days | Day 90+ |
| **Direct sponsorships** | When DAU ≥ 5k | Likely 90+ days | Day 90+ |

**Revised path to first $ (no Ezoic):**
1. **Skimlinks today** — auto-approves, 1 line of JS in BaseLayout, every commerce link earns. Can ship in next push.
2. **Apply to Ezoic Incubator** — free, low priority but gets us into their pipeline before traffic.
3. **AdSense Day 14** — primary ad revenue path.
4. **Buy Me a Coffee tips** — already wired. Need shareholder to claim handle.
5. **Mediavine Journey at 10k sessions/mo** — better RPM than AdSense once we hit it.

## Revenue math — what does 30-day profitability look like?

**Cost side** (current)
- Anthropic API: ~$5-15/mo at current cadence (~13 articles/day)
- Cloudflare: $0 (free tier covers everything)
- GitHub Actions: $0 (free for public repos and small private)
- Domain: ~$15/year (~$1/mo prorated)
- **Total monthly cost: ~$10-20/mo** at current scale

**Revenue side — to break even at $20/mo cost:**
- Ezoic at $5 RPM (page revenue per 1k views) needs ~4,000 pageviews/mo = ~135/day = ~50 unique daily visitors
- Or 1 affiliate sale/week at $4 commission
- Or 4 BuyMeACoffee tips/mo at $5 each

**Realistic 30-day target:**
- 30-50 unique visitors/day by social distribution + SEO
- $0.50-2.00/day in display ad revenue (Ezoic)
- 1-2 tip jar conversions
- **First profitable week: Day 21-28**

## Action plan (autonomous + shareholder mix)

### Today (Day 1 of 30) — autonomous
- [x] ads.txt placeholder live
- [x] AdSlot, TipJar, AffiliateLink components in place
- [x] Privacy policy, about, contact pages live (AdSense prerequisites)
- [x] 3-5 publishing cycles/day → fresh content for crawlers

### Days 1-3 — shareholder one-time clicks
- [ ] Apply to Ezoic at https://www.ezoic.com/start (auto-approves at any traffic). They'll provide a small JS snippet I can wire in.
- [ ] Claim Buy Me a Coffee handle: https://buymeacoffee.com → username `realdailyreview`. Needs Stripe Connect for payout.
- [ ] Apply to Skimlinks at https://skimlinks.com — auto-approves smaller publishers. Drop their JS snippet in `BaseLayout` and any commerce link earns commission automatically.
- [ ] Submit sitemap to Google Search Console (gsc.google.com → property → DNS TXT verification → sitemap submit)
- [ ] Submit sitemap to Bing Webmaster (importable from GSC)

### Days 7-14 — content depth
- [ ] Backfill 7 days of historical digests retroactively (autonomous — workflow will write past-dated articles)
- [ ] Get to ≥30 articles before AdSense application (we'll be there by Day 5 at current cadence)

### Day 14 — apply to AdSense
- [ ] (shareholder) AdSense application at adsense.google.com. Approval typically 1-2 weeks. Auto-approve denied if site is too thin → which is why we wait.
- [ ] (shareholder) Once approved: paste publisher ID into `src/config.ts` → I deploy

### Days 14-30 — social distribution accelerator
- [ ] (shareholder, one-time) Create accounts: Bluesky, X, Mastodon, Threads, Reddit
- [ ] (autonomous) Social cross-poster Worker fires on every article publish
- [ ] (autonomous) Reddit posts in /r/news, /r/worldnews, /r/politics — 1-2/day max, follow each sub's rules
- [ ] (autonomous) Newsletter goes weekly, then daily, with sponsorship slot when list ≥1k

### Stretch (Days 21-30)
- [ ] First Buy Me a Coffee membership tier ($3/mo, monthly insider digest)
- [ ] Direct outreach to 10 newsletter sponsors when list ≥500
- [ ] AI-generated hero images on the daily digest (~$1/mo cost)

## Tracking

Every standup commits queue progress to `ops/standups/YYYY-MM-DD-{slot}.md`. Numbers I'm watching:
- Daily uniques (Cloudflare Web Analytics)
- Articles published (filesystem count)
- Newsletter subscribers (D1 count via /api/admin/feedback equivalent endpoint)
- AI spend (manual check on Anthropic console)
- First $ — when, from where

This file is the canonical "what's the path to profit" doc. CEO operator references it on each standup.
