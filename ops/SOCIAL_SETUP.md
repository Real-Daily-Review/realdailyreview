# Social Cross-Poster — Setup Runbook

_Last updated: 2026-05-09_

This document explains how to wire up the social cross-poster so that every new article is automatically shared to Bluesky, Mastodon, and X (Twitter).

The script lives at `scripts/lib/social-post.mjs` and is invoked by `scripts/lib/social-post-runner.mjs`.

---

## Step 1 — Create social accounts (shareholder action)

| Platform | URL | Notes |
|---|---|---|
| **Bluesky** | https://bsky.app | Handle: `realdailyreview.bsky.social` (or custom domain) |
| **Mastodon** | https://mastodon.social (or any instance) | Handle: `@realdailyreview` |
| **X / Twitter** | https://twitter.com | Handle: `@realdailyreview` |
| Threads | https://threads.net | No public API yet — post manually |
| Reddit | https://reddit.com | Requires per-subreddit posting; do manually for now |

---

## Step 2 — Obtain credentials

### Bluesky
1. Log in at https://bsky.app
2. Go to **Settings → App Passwords → Add App Password**
3. Name it `rdr-crossposter`, copy the generated password
4. Your handle is shown on your profile (e.g. `realdailyreview.bsky.social`)

### Mastodon
1. Log in to your instance (e.g. https://mastodon.social)
2. Go to **Preferences → Development → New Application**
3. Name: `RDR Cross-poster`, scopes: `write:statuses`
4. Copy the **Access Token** shown after saving

### X / Twitter
1. Go to https://developer.twitter.com/en/portal/dashboard
2. Create a new project + app (Free tier is sufficient for posting)
3. Under **Keys and Tokens**, generate:
   - **API Key** and **API Key Secret** (consumer keys)
   - **Access Token** and **Access Token Secret** (for your account)
4. Ensure the app has **Read and Write** permissions

---

## Step 3 — Add GitHub Actions Secrets

In the GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**

| Secret name | Value |
|---|---|
| `BLUESKY_HANDLE` | e.g. `realdailyreview.bsky.social` |
| `BLUESKY_APP_PASSWORD` | App password from Step 2 |
| `MASTODON_INSTANCE` | e.g. `https://mastodon.social` |
| `MASTODON_ACCESS_TOKEN` | Access token from Step 2 |
| `TWITTER_API_KEY` | Consumer key |
| `TWITTER_API_SECRET` | Consumer secret |
| `TWITTER_ACCESS_TOKEN` | Access token |
| `TWITTER_ACCESS_SECRET` | Access token secret |

---

## Step 4 — Wire into daily-publish workflow

Add this step to `.github/workflows/daily-publish.yml` **after** the article generation step:

```yaml
- name: Cross-post to social platforms
  env:
    BLUESKY_HANDLE: ${{ secrets.BLUESKY_HANDLE }}
    BLUESKY_APP_PASSWORD: ${{ secrets.BLUESKY_APP_PASSWORD }}
    MASTODON_INSTANCE: ${{ secrets.MASTODON_INSTANCE }}
    MASTODON_ACCESS_TOKEN: ${{ secrets.MASTODON_ACCESS_TOKEN }}
    TWITTER_API_KEY: ${{ secrets.TWITTER_API_KEY }}
    TWITTER_API_SECRET: ${{ secrets.TWITTER_API_SECRET }}
    TWITTER_ACCESS_TOKEN: ${{ secrets.TWITTER_ACCESS_TOKEN }}
    TWITTER_ACCESS_SECRET: ${{ secrets.TWITTER_ACCESS_SECRET }}
  run: node scripts/lib/social-post-runner.mjs
```

The step exits 0 even if no credentials are set (platforms are skipped gracefully), so it won't break the pipeline while accounts are being created.

To post a specific article slug:
```yaml
  run: node scripts/lib/social-post-runner.mjs --slug 2026-05-09-my-article-slug
```

---

## Testing locally

```bash
# Post latest article (dry-run if no env vars set — will log "skipped")
node scripts/lib/social-post-runner.mjs

# Post a specific article
node scripts/lib/social-post-runner.mjs --slug 2026-05-09-some-slug

# With real credentials
BLUESKY_HANDLE=realdailyreview.bsky.social \
BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx \
node scripts/lib/social-post-runner.mjs
```

---

## Platform limits

| Platform | Char limit | Notes |
|---|---|---|
| Bluesky | 300 | URL rendered as rich link via facets |
| Mastodon | 500 | Most instances; some allow more |
| X / Twitter | 280 | URLs count as 23 chars |

The script automatically trims post text to fit each platform's limit.
