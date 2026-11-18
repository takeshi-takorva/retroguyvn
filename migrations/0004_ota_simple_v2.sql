-- Simplified Digital Realm OTA v2 release catalog.
-- Legacy OTA tables remain untouched during migration.

CREATE TABLE IF NOT EXISTS ota_simple_releases (
  version TEXT PRIMARY KEY,
  hw_major INTEGER NOT NULL CHECK(hw_major >= 0),
  hw_minor INTEGER NOT NULL CHECK(hw_minor >= 0),
  revision INTEGER NOT NULL CHECK(revision >= 0),
  game_r2_key TEXT NOT NULL UNIQUE,
  game_file_name TEXT NOT NULL,
  game_size INTEGER NOT NULL CHECK(game_size > 0),
  game_sha256 TEXT NOT NULL CHECK(length(game_sha256)=64),
  assets_r2_key TEXT UNIQUE,
  assets_file_name TEXT,
  assets_size INTEGER,
  assets_sha256 TEXT,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  UNIQUE(hw_major, hw_minor, revision)
);

CREATE INDEX IF NOT EXISTS idx_ota_simple_lookup
ON ota_simple_releases(hw_major, hw_minor, status, revision DESC);
