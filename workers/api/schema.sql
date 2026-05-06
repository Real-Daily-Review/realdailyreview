-- D1 schema for the Real Daily Review API worker.
-- Apply with: wrangler d1 execute rdr-prod --file=schema.sql

CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
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

-- Useful views
CREATE VIEW IF NOT EXISTS subscriber_stats AS
SELECT
  status,
  COUNT(*) AS n,
  MIN(created_at) AS first_at,
  MAX(created_at) AS last_at
FROM subscribers
GROUP BY status;
