CREATE TABLE IF NOT EXISTS news_posts (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  published_slug TEXT UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Development',
  tags_json TEXT NOT NULL DEFAULT '[]',
  cover_media_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  draft_revision_id TEXT,
  published_revision_id TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS news_revisions (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  content_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT,
  published_at TEXT,
  FOREIGN KEY (post_id) REFERENCES news_posts(id) ON DELETE CASCADE,
  UNIQUE(post_id, version)
);

CREATE INDEX IF NOT EXISTS idx_news_posts_status_published ON news_posts(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_posts_published_slug ON news_posts(published_slug);
CREATE INDEX IF NOT EXISTS idx_news_revisions_post_version ON news_revisions(post_id, version DESC);
