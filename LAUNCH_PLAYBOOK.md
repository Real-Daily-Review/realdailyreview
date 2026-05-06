# Real Daily Review — Launch Playbook

> The list of things only a human can do. Everything else, your CEO (Claude) handles.
> Estimated total time: **30–45 minutes** of clicking. Do these in order.

---

## Phase 0 — Tracking sheet

Open a notes app and keep these slots ready. You'll fill them in as you go and paste them back to me at the end:

```
GITHUB_ORG_NAME       = real-daily-review        (or your choice)
GITHUB_REPO_URL       =
GITHUB_PAT            = (do NOT paste here — store in 1Password/Keychain; only paste into GitHub Secrets)
CLOUDFLARE_ACCOUNT_ID =
CLOUDFLARE_API_TOKEN  = (same — secret, store securely)
CLOUDFLARE_ZONE_ID    =
ANTHROPIC_API_KEY     = (secret)
NEWS_API_KEY          = (secret, optional Phase 4)
RESEND_API_KEY        = (secret, Phase 6 when activated)
```

Anything labeled "secret" never gets pasted into chat or committed to Git. You'll paste them into GitHub Secrets / Cloudflare env vars where I can use them but never read them back.

---

## Phase 1 — GitHub org + repo (10 min)

1. Sign in to GitHub. Click your avatar → **Your organizations** → **New organization** → Free plan.
2. Org name: `real-daily-review` (or pick another — paste it back to me as `GITHUB_ORG_NAME`).
3. Inside the new org: **New repository** → name `realdailyreview` → Private → no README/license (we'll add ours) → Create.
4. Copy the repo URL (e.g. `https://github.com/real-daily-review/realdailyreview.git`) — that's `GITHUB_REPO_URL`.
5. Generate a fine-grained Personal Access Token: GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token.
   - Resource owner: the new org
   - Repository access: only `realdailyreview`
   - Permissions: **Contents: Read & Write**, **Metadata: Read**, **Workflows: Read & Write**, **Pull requests: Read & Write**, **Actions: Read & Write**, **Secrets: Read & Write**
   - Expiration: 90 days (we'll rotate)
   - Generate, copy the `github_pat_…` value, store in your password manager. That's `GITHUB_PAT`.

---

## Phase 2 — Cloudflare account + DNS (10 min)

1. Sign up at https://dash.cloudflare.com (free plan is fine).
2. **Add a Site** → enter `realdailyreview.com` → Free plan → Continue.
3. Cloudflare will scan and show you DNS records currently at GoDaddy. Just click Continue.
4. Cloudflare gives you **two nameservers** like `xena.ns.cloudflare.com` and `kirk.ns.cloudflare.com`. Copy them.
5. In a new tab, log into GoDaddy → My Products → DNS for realdailyreview.com → Nameservers → **Change** → "I'll use my own nameservers" → paste the two Cloudflare ones → Save.
6. Back in Cloudflare, click **Done, check nameservers**. Propagation takes 5 min – 24 hr (usually <1 hr).
7. Once Cloudflare confirms ownership: Dashboard → realdailyreview.com → bottom right shows **Zone ID** and **Account ID**. Copy both → that's `CLOUDFLARE_ZONE_ID` and `CLOUDFLARE_ACCOUNT_ID`.
8. Generate API token: Cloudflare → My Profile → API Tokens → Create Token → **Custom token**:
   - Token name: `realdailyreview-deploy`
   - Permissions:
     - Account → Cloudflare Pages → Edit
     - Account → Workers Scripts → Edit
     - Account → D1 → Edit
     - Zone → DNS → Edit
     - Zone → Cache Purge → Purge
   - Account resources: Include → your account
   - Zone resources: Include → realdailyreview.com
   - TTL: 1 year
   - Continue → Create → copy → that's `CLOUDFLARE_API_TOKEN`.

---

## Phase 3 — Anthropic API key (3 min)

1. Go to https://console.anthropic.com → API Keys → Create Key → name it `realdailyreview-content`.
2. Copy → that's `ANTHROPIC_API_KEY`.
3. **Set a monthly budget cap** in Billing → Usage limits. Recommend $25/mo to start (covers ~150 articles/mo on Haiku + a handful on Sonnet). Hard cap protects against runaway costs.

---

## Phase 4 — Push the code (5 min)

I will have already populated the workspace folder with the full repo. You'll just push it.

```bash
cd "~/Documents/Claude/Projects/Real Daily Review"
git init
git add .
git commit -m "Initial commit: scaffold Real Daily Review"
git branch -M main
git remote add origin <GITHUB_REPO_URL>
git push -u origin main
```

If git isn't installed: `xcode-select --install` (macOS) or grab from git-scm.com.

---

## Phase 5 — Add secrets to GitHub Actions (3 min)

1. Go to your repo on GitHub → Settings → Secrets and variables → Actions → **New repository secret** for each:
   - `ANTHROPIC_API_KEY` = (from Phase 3)
   - `CLOUDFLARE_API_TOKEN` = (from Phase 2)
   - `CLOUDFLARE_ACCOUNT_ID` = (from Phase 2)
2. That's it for now. (Resend/news API keys come later.)

---

## Phase 6 — Connect Cloudflare Pages (5 min)

1. Cloudflare dashboard → Workers & Pages → Create → **Pages** → Connect to Git.
2. Authorize Cloudflare to access the `real-daily-review` org → only the `realdailyreview` repo.
3. Project name: `realdailyreview` → Production branch: `main`.
4. Build settings: framework preset **Astro** → build command `npm run build` → build output `dist`.
5. Environment variables (production):
   - `NODE_VERSION` = `20`
6. Save and Deploy. First build runs ~2 min.
7. Once green: **Custom domains** → Set up → `realdailyreview.com` and `www.realdailyreview.com`. Cloudflare auto-creates the DNS records.

---

## Phase 7 — Things I'll set up while you're doing the above

- I'll have already written the entire site scaffold, content pipeline, GitHub Actions, security headers, feedback form Worker, and sample article content.
- Once Phases 1–6 are done, the next push to `main` will auto-deploy. The `daily-publish.yml` cron will start running every weekday at 5am ET to generate fresh content.

---

## Phase 8 — Apply for ad networks (do this AFTER 2 weeks of content)

These all require a live site with real content + decent traffic before approval. Don't bother on Day 1 — they'll reject us. Calendar reminder for **2026-05-20**:

- **Google AdSense** — apply at adsense.google.com, paste the verification snippet I'll have already added (just enable a flag in `src/config.ts`)
- **Amazon Associates** — apply at affiliate-program.amazon.com (need 3 qualifying sales in first 180 days to keep account)
- **Ezoic** — once you have ~10k monthly visitors, this is usually a 2–3x RPM upgrade over AdSense

I'll remind you in the standup when traffic justifies each application.

---

## What you paste back to me when done

```
GITHUB_REPO_URL = ...
CLOUDFLARE_ZONE_ID = ...
CLOUDFLARE_ACCOUNT_ID = ...
Pages deploy URL = realdailyreview.pages.dev (or similar, you'll see it after Phase 6)
Domain status = "live" / "still propagating"
```

Don't paste secrets into chat — those go in GitHub/Cloudflare directly.

---

## If anything breaks

Tell me which phase, what you see, and a screenshot if helpful. I'll diagnose and tell you the next click.
