-- D1 schema for the Real Daily Review API worker.
-- Apply with: wrangler d1 execute rdr-prod --file=schema.sql

CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,                        -- E.164 format, optional, for SMS breaking news
  phone_verified INTEGER NOT NULL DEFAULT 0,  -- 1 once user confirms via SMS opt-in
  phone_unsubscribed_at INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','unsubscribed')),
  source TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  confirmed_at INTEGER,
  unsubscribed_at INTEGER,
  ip_hash TEXT,
  ua_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status);
CREATE INDEX IF NOT EXISTS idx_subscribers_created ON subscribers(created_at);

CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message TEXT NOT NULL,
  email TEXT,
  category TEXT,
  page_url TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  ip_hash TEXT,
  ua_hash TEXT,
  reviewed INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_reviewed ON feedback(reviewed);

CREATE TABLE IF NOT EXISTS rate_limit (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL
);

-- Magic-link auth tokens. One row per email-link request; consumed on verify.
CREATE TABLE IF NOT EXISTS auth_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  ip_hash TEXT
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_email ON auth_tokens(email);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires ON auth_tokens(expires_at);

-- Long-lived session cookies stored server-side; cookie value = session_token.
CREATE TABLE IF NOT EXISTS user_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  session_token TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  last_seen_at INTEGER,
  ip_hash TEXT
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_email ON user_sessions(email);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);

-- User preferences keyed by email. JSON for flexibility.
CREATE TABLE IF NOT EXISTS user_preferences (
  email TEXT PRIMARY KEY,
  preferences TEXT NOT NULL DEFAULT '{}',  -- JSON: {sections:[...], frequency:'daily'|'weekly', timezone:'America/New_York'}
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

-- Useful views
CREATE VIEW IF NOT EXISTS subscriber_stats AS
SELECT
  status,
  COUNT(*) AS n,
  MIN(created_at) AS first_at,
  MAX(created_at) AS last_at
FROM subscribers
GROUP BY status;
