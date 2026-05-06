# Real Daily Review — API Worker

Cloudflare Worker handling forms and admin endpoints.

## First-time setup

```bash
cd workers/api
npm install
npx wrangler login

# Create D1 database
npm run db:create
# Copy the database_id printed by wrangler into wrangler.toml

# Apply schema
npm run db:migrate

# Set secrets
npx wrangler secret put TURNSTILE_SECRET
npx wrangler secret put ADMIN_TOKEN
# Optional, for Phase 6:
npx wrangler secret put RESEND_API_KEY

# Deploy
npm run deploy
```

After deploy, in the Cloudflare dashboard add a route binding `realdailyreview.com/api/*` → `rdr-api`.

## Endpoints

- `POST /api/subscribe`  body `{email, "cf-turnstile-response"}`
- `POST /api/feedback`   body `{message, email?, category?, "cf-turnstile-response"}`
- `GET  /api/admin/feedback` requires `Authorization: Bearer <ADMIN_TOKEN>`
- `GET  /api/health`     liveness probe

## Security notes

- IP and User-Agent stored as SHA-256 hashes only.
- Rate limited (per-IP, sliding 1 min window) via D1 `rate_limit` table.
- Turnstile verification on every form POST.
- All inputs validated, length-capped, content-type-checked.
- CORS locked to `SITE_ORIGIN`.
