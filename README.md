# Real Daily Review

> Yesterday's news, today's take, in five minutes.

An AI-native daily news digest. Static site (Astro) + Cloudflare Pages + GitHub Actions cron for content generation + Cloudflare Worker for forms.

## Architecture

```
realdailyreview.com
├── Static site            → Cloudflare Pages (Astro)
├── Content                → Markdown in src/content/articles/
├── Daily auto-publish     → GitHub Actions cron (5am ET weekdays)
├── Forms (subscribe etc.) → Cloudflare Worker + D1
└── Auth/security          → Cloudflare Turnstile + WAF
```

## Local development

```bash
npm install
cp .env.example .env  # fill in ANTHROPIC_API_KEY for content generation
npm run dev           # site → http://localhost:4321

# Content pipeline (no API calls)
npm run generate:dry-run

# Worker (requires wrangler login)
cd workers/api
npm install
npm run dev
```

## Repository layout

| Path | Purpose |
|---|---|
| `src/` | Astro site source (layouts, components, pages, styles) |
| `src/content/articles/` | Markdown articles (committed by CI) |
| `src/config.ts` | Site-wide config, monetization toggles |
| `scripts/` | Content generation pipeline (Node, runs in GH Actions) |
| `workers/api/` | Cloudflare Worker for /api/* (forms, admin) |
| `.github/workflows/` | CI: daily-publish, deploy, ceo-standup |
| `ops/` | Roadmap, standups, incident notes — operational docs |
| `public/` | Static assets (favicon, robots.txt, security headers) |

## Operating cadence

- **Every weekday at 5am ET:** `daily-publish` workflow generates fresh articles, commits, deploy fires.
- **Every weekday at 9am ET:** `ceo-standup` workflow drops a Markdown standup into `ops/standups/`.
- **On every push to main:** `deploy` builds and ships to Cloudflare Pages.

## Documentation

- [`LAUNCH_PLAYBOOK.md`](./LAUNCH_PLAYBOOK.md) — what the human (shareholder) clicks to take us live.
- [`SECURITY.md`](./SECURITY.md) — trust model, secrets contract, hardening posture.
- [`ops/ROADMAP.md`](./ops/ROADMAP.md) — current sprint, next sprint, backlog.

## License

© 2026 Real Daily Review. All rights reserved.
