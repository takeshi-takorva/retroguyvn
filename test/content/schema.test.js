import test from 'node:test';
import assert from 'node:assert/strict';
import { POST_CHANNELS, CONTENT_SCHEMA_STATEMENTS } from '../../src/content/schema.js';

test('shared content schema supports exactly News and Dev Log with channel-scoped slugs', () => {
  assert.deepEqual(POST_CHANNELS, ['news', 'devlog']);
  const sql = CONTENT_SCHEMA_STATEMENTS.join('\n');
  assert.match(sql, /CHECK\s*\(channel\s+IN\s*\('news','devlog'\)\)/i);
  assert.match(sql, /UNIQUE\s*\(channel,\s*slug\)/i);
  assert.match(sql, /UNIQUE\s*\(channel,\s*published_slug\)/i);
  assert.match(sql, /UNIQUE\s*\(post_id,\s*version\)/i);
  assert.match(sql, /idx_content_posts_channel_status_published/i);
  assert.match(sql, /idx_content_posts_channel_published_slug/i);
  assert.match(sql, /idx_content_revisions_post_version/i);
});

test('runtime schema includes idempotent legacy News copy statements', () => {
  const sql = CONTENT_SCHEMA_STATEMENTS.join('\n');
  assert.match(sql, /INSERT\s+OR\s+IGNORE\s+INTO\s+content_posts/i);
  assert.match(sql, /SELECT[\s\S]*'news'[\s\S]*FROM\s+news_posts/i);
  assert.match(sql, /INSERT\s+OR\s+IGNORE\s+INTO\s+content_revisions/i);
  assert.match(sql, /FROM\s+news_revisions/i);
});
