# Colorado Daily Review

Source code and ops for **coloradodailyreview.com** — an AI-native conservative daily news site covering Colorado politics, elections, economy, and national policy with a Colorado angle.

## Architecture
- **Static site**: Astro.js → Cloudflare Pages
- **Content**: Markdown articles in `src/content/articles/`
- **Daily auto-publish**: GitHub Actions cron (5am ET weekdays)
- **Forms/subscriptions**: Cloudflare Worker + D1 database
- **Auth/security**: Cloudflare Turnstile + WAF

## Local development
```bash
npm install
cp .env.example .env   # fill in ANTHROPIC_API_KEY for content generation
npm run dev            # site → http://localhost:4321
npm run generate:dry-run  # content pipeline dry run (no API calls)
```

## Key directories
- `src/` — Astro site source
- `public/` — static assets
- `workers/` — Cloudflare Worker for forms/subscriptions
- `scripts/` — content generation and automation scripts
- `ops/` — operational runbooks and config

## Notes
- Content is AI-generated daily via GitHub Actions; do not manually edit auto-generated article files
- The Cloudflare Worker handles subscriber forms and D1 writes
- `ANTHROPIC_API_KEY` is required in `.env` for content generation
- If you see references to `/Users/ryanlyk/`, replace with `/Users/lyk/`
