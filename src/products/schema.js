import { productError } from './model.js';

let schemaReady = false;

export const PRODUCT_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    published_slug TEXT UNIQUE,
    name TEXT NOT NULL,
    subtitle TEXT NOT NULL DEFAULT '',
    excerpt TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'Handheld',
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
    availability TEXT NOT NULL DEFAULT 'development' CHECK(availability IN ('development','coming-soon','available','discontinued')),
    featured INTEGER NOT NULL DEFAULT 0 CHECK(featured IN (0,1)),
    sort_order INTEGER NOT NULL DEFAULT 0,
    cover_media_id TEXT,
    draft_revision_id TEXT,
    published_revision_id TEXT,
    published_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    created_by TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS product_revisions (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    content_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    created_by TEXT,
    published_at TEXT,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE(product_id, version)
  )`,
  'CREATE INDEX IF NOT EXISTS idx_products_status_order ON products(status, featured DESC, sort_order ASC, published_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_products_published_slug ON products(published_slug)',
  'CREATE INDEX IF NOT EXISTS idx_product_revisions_product_version ON product_revisions(product_id, version DESC)'
];

export async function ensureProductSchema(env) {
  if (!env?.DB?.prepare) throw productError('D1 DB binding is required', 503);
  if (schemaReady) return true;
  const statements = PRODUCT_SCHEMA_STATEMENTS.map(sql => env.DB.prepare(sql));
  if (typeof env.DB.batch === 'function') await env.DB.batch(statements);
  else for (const statement of statements) await statement.run();
  schemaReady = true;
  return true;
}
