# Social Cross-Poster — Setup Guide

The script `scripts/lib/social-post.mjs` auto-posts every new article to
Bluesky, Mastodon, and X (Twitter). It uses **zero new npm dependencies**
(Node 18+ native `fetch` + built-in `crypto`).

Each platform is skipped gracefully when its credentials are absent, so the
script is safe to run in CI before accounts exist.

---

## 1. Create the social accounts (shareholder action)

| Platform | URL | Notes |
|---|---|---|
| Bluesky | https://bsky.app | Create `@realdailyreview.bsky.social` |
| Mastodon | https://mastodon.social | Create `@realdailyreview@mastodon.social` |
| X / Twitter | https://x.com | Create `@realdailyreview` |

---

## 2. Generate credentials

### Bluesky
1. Log in → Settings → Privacy and Security → **App Passwords** → Add.
2. Copy the app password (format: `xxxx-xxxx-xxxx-xxxx`).

### Mastodon
1. Log in → Preferences → Development → **New Application**.
2. Scopes needed: `write:statuses`.
3. Copy the **access token**.

### X / Twitter
1. Go to https://developer.twitter.com → Projects & Apps → your app.
2. Under **Keys and Tokens**, generate:
   - API Key & Secret
   - Access Token & Secret (with **Read and Write** permissions)
3. Ensure the app has **OAuth 1.0a** enabled with Read+Write.

---

## 3. Add GitHub Actions secrets

In the repo → Settings → Secrets and variables → Actions → New repository secret:

| Secret name | Value |
|---|---|
| `BSKY_IDENTIFIER` | `realdailyreview.bsky.social` |
| `BSKY_PASSWORD` | Bluesky app password |
| `MASTODON_BASE_URL` | `https://mastodon.social` |
| `MASTODON_ACCESS_TOKEN` | Mastodon access token |
| `TWITTER_API_KEY` | X API key |
| `TWITTER_API_SECRET` | X API secret |
| `TWITTER_ACCESS_TOKEN` | X access token |
| `TWITTER_ACCESS_SECRET` | X access token secret |

---

## 4. Wire into `daily-publish.yml`

Add this step **after** the `git push` step in `.github/workflows/daily-publish.yml`
(the step that commits and pushes the new article files):

```yaml
- name: Cross-post to social platforms
  if: success()
  env:
    ARTICLE_SLUG: ${{ steps.publish.outputs.latest_slug }}
    ARTICLE_TITLE: ${{ steps.publish.outputs.latest_title }}
    ARTICLE_DESCRIPTION: ${{ steps.publish.outputs.latest_description }}
    ARTICLE_SECTION: ${{ steps.publish.outputs.latest_section }}
    BSKY_IDENTIFIER: ${{ secrets.BSKY_IDENTIFIER }}
    BSKY_PASSWORD: ${{ secrets.BSKY_PASSWORD }}
    MASTODON_BASE_URL: ${{ secrets.MASTODON_BASE_URL }}
    MASTODON_ACCESS_TOKEN: ${{ secrets.MASTODON_ACCESS_TOKEN }}
    TWITTER_API_KEY: ${{ secrets.TWITTER_API_KEY }}
    TWITTER_API_SECRET: ${{ secrets.TWITTER_API_SECRET }}
    TWITTER_ACCESS_TOKEN: ${{ secrets.TWITTER_ACCESS_TOKEN }}
    TWITTER_ACCESS_SECRET: ${{ secrets.TWITTER_ACCESS_SECRET }}
  run: node scripts/lib/social-post.mjs
```

The publish script (`scripts/generate-daily.mjs` or similar) should emit
these outputs. If it doesn't yet, you can also hard-code the slug from the
latest git-committed file:

```yaml
- name: Cross-post to social platforms
  if: success()
  env:
    # Derive slug from the most recently committed article file
    ARTICLE_SLUG: ${{ steps.publish.outputs.latest_slug }}
    # ... rest of secrets
  run: |
    # Fallback: parse slug from last committed .md filename
    SLUG=$(git diff HEAD~1 --name-only | grep 'src/content/articles/' | head -1 | sed 's|src/content/articles/||;s|\.md||')
    ARTICLE_SLUG="$SLUG" node scripts/lib/social-post.mjs
```

---

## 5. Test locally

```bash
ARTICLE_SLUG="2026-05-08-test-article" \
ARTICLE_TITLE="Test Article" \
ARTICLE_DESCRIPTION="This is a test post from Real Daily Review." \
ARTICLE_SECTION="tech" \
BSKY_IDENTIFIER="realdailyreview.bsky.social" \
BSKY_PASSWORD="your-app-password" \
node scripts/lib/social-post.mjs
```

---

## Platform limits

| Platform | Char limit | Free tier |
|---|---|---|
| Bluesky | 300 graphemes | Unlimited posts |
| Mastodon | 500 chars | Unlimited posts |
| X / Twitter | 280 chars | 1,500 tweets/month |

At 3 publishes/day × 30 days = 90 tweets/month — well within the free tier.

---

## Failure behaviour

The script always exits `0`. A failed social post **never blocks a content
deploy**. Errors are logged to the Actions run for manual inspection.
