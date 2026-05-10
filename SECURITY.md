# Security Posture — Real Daily Review

## Trust boundaries

```
[ Browser ]
   │ HTTPS (HSTS preloaded, TLS 1.3)
   ▼
[ Cloudflare edge — DDoS, WAF, bot fight, rate limit ]
   │
   ├──► [ Cloudflare Pages ]   ← static HTML/CSS/JS only. No server code path here.
   │
   └──► [ rdr-api Worker ]      ← only place user input is processed.
            │
            ▼
        [ Cloudflare D1 (private) ]   ← subscriber + feedback rows only. IP/UA hashed.
```

## Data minimization

We collect:
- Newsletter subscribers — email only.
- Feedback — message, optional email, optional category. No analytics tied to identity.

We hash before storing:
- Source IP (SHA-256)
- User-Agent (SHA-256)

We do not collect or store: passwords (no accounts yet), payment info (none), location (none), browser fingerprints (none).

## Secrets contract

| Secret | Where it lives | Where it is used | Rotation |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | GitHub Actions secrets | `daily-publish` and `ceo-standup` workflows | 90 days |
| `CLOUDFLARE_API_TOKEN` | GitHub Actions secrets | `deploy` workflow only | 1 year |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions secrets | `deploy` workflow only | n/a |
| `TURNSTILE_SECRET` | `wrangler secret put` (Cloudflare) | rdr-api Worker | when leaked |
| `ADMIN_TOKEN` | `wrangler secret put` (Cloudflare) | rdr-api Worker | 30 days |
| `RESEND_API_KEY` (later) | `wrangler secret put` (Cloudflare) | rdr-api Worker | 90 days |

**No secret is ever committed to git.** `.env` is gitignored. `.env.example` is committed and contains only placeholders.

## Hardening

- **HTTPS-only** with HSTS (`max-age=63072000; includeSubDomains; preload`). Submit to https://hstspreload.org once steady.
- **Strict CSP** in `public/_headers`. Default deny + explicit allowlists for Turnstile, AdSense (when enabled), and our own API origin.
- **CORS** locked to `realdailyreview.com` on the API Worker.
- **Honeypot + Turnstile** on every public form. Honeypot is the cheap tier; Turnstile is the strong tier.
- **Rate limiting** on form POSTs: 5 per minute per IP via D1 sliding window.
- **Input validation:** content-type check, body-size cap (8 KiB), length caps per field, allowlist for HTML tags in any AI-rendered output.
- **Output sanitization:** AI-generated body is run through `sanitize-html` with a strict allowlist before write to disk.
- **No client-side secrets.** Every API key is server-side only.
- **Dependabot** enabled at the repo root.
- **2FA required** for the GitHub org and Cloudflare account (set this manually).

## Incident response

If a key leaks:
1. Rotate it immediately via the appropriate dashboard.
2. Audit recent activity (Cloudflare → API Tokens → audit log; GitHub → Settings → Audit log).
3. Post a one-line note in `ops/INCIDENTS.md` with date/time and what was rotated.

If we get a takedown / DMCA / legal letter:
- Don't silently delete the article. Add an in-line correction or retraction note with date stamp.
- Forward the letter to the shareholder for human review.

## Threat model — what we're protecting against

| Threat | Mitigation |
|---|---|
| Spam form floods | Turnstile + honeypot + per-IP rate limit (5/min) on every POST |
| DDoS | Cloudflare in front; static HTML for read paths is essentially infinite-scale |
| API key exfil via XSS | CSP (default-src 'self', form-action locked); no inline event handlers; AI body sanitized through allowlist |
| Subscriber list theft | D1 access only via Worker bindings; admin endpoints require Bearer ADMIN_TOKEN; **constant-time** comparison to thwart timing attacks |
| Prompt injection in source articles | Generation script only treats source text as data, not instructions; we publish AI output as content, not as instructions to other systems |
| Domain hijack | Cloudflare 2FA + registrar lock at GoDaddy |
| Worker direct access bypass | `workers_dev = false` — Worker only reachable via realdailyreview.com/api/*, no `*.workers.dev` URL |
| CSRF on state-changing API | Origin / Referer check on every state-changing endpoint (subscribe, feedback, auth/request, auth/signout, preferences); SameSite=Lax cookie |
| Magic-link spam (using us to email arbitrary addresses) | Per-email rate limit: 3 magic links per email per hour, regardless of IP. Mandatory Turnstile when configured. Honeypot on auth form. |
| Magic-link token brute force | 256-bit random tokens (crypto.getRandomValues × 32 bytes), 30-min expiry, single-use (used_at flag), rate limit on /api/auth/verify per IP |
| Magic-link enumeration (does email X exist?) | /api/auth/request always returns "Check your email" regardless of whether email is registered or rate-limited |
| Session hijack | httpOnly + Secure + SameSite=Lax cookie; session token = 256-bit random, 30-day expiry, server-stored in user_sessions table; sign-out wipes server row |
| Open redirect via /api/auth/verify | Hardcoded redirect target = `${SITE_ORIGIN}/account`; no user-controlled URL parameters used in Location |
| Account-page SEO leakage | robots.txt disallows /account and /auth/; pages emit `<meta name="robots" content="noindex, nofollow">` |
| Cookie theft via JS | httpOnly flag prevents `document.cookie` access from any script |

## Things deliberately NOT in scope yet

- **User accounts.** Not built. Lower attack surface to keep.
- **Comments.** Not built. Keeps moderation burden zero.
- **Server-side personalization.** Not built. Site is pure static.
