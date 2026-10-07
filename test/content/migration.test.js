import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTENT_SCHEMA_STATEMENTS } from '../../src/content/schema.js';

const migrationSql = () => CONTENT_SCHEMA_STATEMENTS.join('\n');

test('News migration preserves post identity, pointers and timestamps', () => {
  const sql = migrationSql();
  assert.match(sql, /INSERT\s+OR\s+IGNORE\s+INTO\s+content_posts\s*\(id,\s*channel,\s*slug,\s*published_slug,\s*title,\s*excerpt,\s*category,\s*tags_json,\s*cover_media_id,\s*status,\s*draft_revision_id,\s*published_revision_id,\s*published_at,\s*created_at,\s*updated_at,\s*created_by\)/i);
  assert.match(sql, /SELECT\s+id,\s*'news',\s*slug,\s*published_slug,\s*title,\s*excerpt,\s*category,\s*tags_json,\s*cover_media_id,\s*status,\s*draft_revision_id,\s*published_revision_id,\s*published_at,\s*created_at,\s*updated_at,\s*created_by\s+FROM\s+news_posts/i);
});

test('News migration preserves immutable revision IDs, versions and publish timestamps', () => {
  const sql = migrationSql();
  assert.match(sql, /INSERT\s+OR\s+IGNORE\s+INTO\s+content_revisions\s*\(id,\s*post_id,\s*version,\s*content_json,\s*created_at,\s*created_by,\s*published_at\)/i);
  assert.match(sql, /SELECT\s+id,\s*post_id,\s*version,\s*content_json,\s*created_at,\s*created_by,\s*published_at\s+FROM\s+news_revisions/i);
});
