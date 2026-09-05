PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  template TEXT NOT NULL,
  title TEXT NOT NULL,
  draft_revision_id TEXT,
  published_revision_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS page_revisions (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  content_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT,
  published_at TEXT,
  FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
  UNIQUE(page_id, version)
);

CREATE INDEX IF NOT EXISTS idx_page_revisions_page_version
  ON page_revisions(page_id, version DESC);

CREATE TABLE IF NOT EXISTS media_nodes (
  id TEXT PRIMARY KEY,
  parent_id TEXT,
  type TEXT NOT NULL CHECK(type IN ('file','folder')),
  name TEXT NOT NULL,
  mime_type TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  storage_key TEXT,
  width INTEGER,
  height INTEGER,
  checksum TEXT,
  source TEXT NOT NULL DEFAULT 'r2',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (parent_id) REFERENCES media_nodes(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_media_nodes_parent ON media_nodes(parent_id, deleted_at, name);
CREATE INDEX IF NOT EXISTS idx_media_nodes_storage_key ON media_nodes(storage_key);

CREATE TABLE IF NOT EXISTS media_usage (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL,
  owner_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  field_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (media_id) REFERENCES media_nodes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_media_usage_media ON media_usage(media_id);
CREATE INDEX IF NOT EXISTS idx_media_usage_owner ON media_usage(owner_type, owner_id);

CREATE TABLE IF NOT EXISTS global_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cms_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
