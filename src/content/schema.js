import { contentError, POST_CHANNELS } from './model.js';

let schemaPromise = null;

const LEGACY_NEWS_MIGRATION_STATEMENTS = [
  `INSERT OR IGNORE INTO content_posts (id, channel, slug, published_slug, title, excerpt, category, tags_json, cover_media_id, status, draft_revision_id, published_revision_id, published_at, created_at, updated_at, created_by)
   SELECT id, 'news', slug, published_slug, title, excerpt, category, tags_json, cover_media_id, status, draft_revision_id, published_revision_id, published_at, created_at, updated_at, created_by FROM news_posts`,
  `INSERT OR IGNORE INTO content_revisions (id, post_id, version, content_json, created_at, created_by, published_at)
   SELECT id, post_id, version, content_json, created_at, created_by, published_at FROM news_revisions`
];

export { POST_CHANNELS };

export const CONTENT_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS content_posts (
    id TEXT PRIMARY KEY,
    channel TEXT NOT NULL CHECK(channel IN ('news','devlog')),
    slug TEXT NOT NULL,
    published_slug TEXT,
    title TEXT NOT NULL,
    excerpt TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'Development',
    tags_json TEXT NOT NULL DEFAULT '[]',
    cover_media_id TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
    draft_revision_id TEXT,
    published_revision_id TEXT,
    published_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    created_by TEXT,
    UNIQUE(channel, slug),
    UNIQUE(channel, published_slug)
  )`,
  `CREATE TABLE IF NOT EXISTS content_revisions (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    content_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    created_by TEXT,
    published_at TEXT,
    FOREIGN KEY (post_id) REFERENCES content_posts(id) ON DELETE CASCADE,
    UNIQUE(post_id, version)
  )`,
  'CREATE INDEX IF NOT EXISTS idx_content_posts_channel_status_published ON content_posts(channel, status, published_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_content_posts_channel_published_slug ON content_posts(channel, published_slug)',
  'CREATE INDEX IF NOT EXISTS idx_content_posts_channel_status_updated ON content_posts(channel, status, updated_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_content_revisions_post_version ON content_revisions(post_id, version DESC)',
  ...LEGACY_NEWS_MIGRATION_STATEMENTS
];

function isMissingLegacyTableError(error) {
  const message = String(error?.message || error || '');
  return /no such table:\s*news_(posts|revisions)/i.test(message);
}

async function applyStatement(env, sql) {
  try {
    await env.DB.prepare(sql).run();
  } catch (error) {
    if (isMissingLegacyTableError(error)) return;
    throw error;
  }
}

async function prepareSchema(env) {
  for (const sql of CONTENT_SCHEMA_STATEMENTS) await applyStatement(env, sql);
  return true;
}

export async function ensureContentSchema(env) {
  if (!env?.DB?.prepare) throw contentError('D1 DB binding is required', 503);
  if (!schemaPromise) {
    schemaPromise = prepareSchema(env).catch(error => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}
