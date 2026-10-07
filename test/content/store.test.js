import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { postRowSummary } from '../../src/content/store.js';
import { SQL } from '../../src/content/sql.js';

const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('shared post SQL scopes mutable post access and slug uniqueness by channel', () => {
  assert.match(SQL.postById, /WHERE id = \? AND channel = \?/i);
  assert.match(SQL.postBySlug, /WHERE channel = \? AND slug = \?/i);
  assert.match(SQL.postBySlugExceptId, /WHERE channel = \? AND slug = \? AND id <> \?/i);
  assert.match(SQL.listAdminPosts, /WHERE channel = \?/i);
  assert.match(SQL.updateDraft, /WHERE id = \? AND channel = \?/i);
  assert.match(SQL.deletePost, /WHERE id = \? AND channel = \?/i);
});

test('shared post SQL creates immutable revisions and increments versions', async () => {
  assert.match(SQL.insertRevision, /content_revisions/i);
  assert.match(SQL.maxVersion, /MAX\(version\)/i);
  const source = await read('src/content/save.js');
  assert.match(source, /Number\(latest\?\.version\s*\|\|\s*0\)\s*\+\s*1/);
  assert.match(source, /insertRevision/);
  assert.doesNotMatch(source, /UPDATE\s+content_revisions\s+SET\s+content_json/i);
});

test('same slug may exist across channels because slug checks bind channel first', async () => {
  const source = await read('src/content/store.js');
  assert.match(source, /assertPostSlugAvailable\(env, channel, slug/);
  assert.match(source, /SQL\.postBySlug/);
  assert.match(source, /bind\(channel, slug\)/);
});

test('post row summary exposes channel and canonical channel URL', () => {
  const item = postRowSummary({
    id:'post_1', channel:'devlog', slug:'build-05', published_slug:'build-05', title:'Build 05', excerpt:'Update', category:'HARDWARE', tags_json:'["ESP32"]', cover_media_id:'med_1', status:'published', published_at:'2026-09-15T00:00:00Z', created_at:'2026-09-14T00:00:00Z', updated_at:'2026-09-15T00:00:00Z', created_by:'admin'
  });
  assert.equal(item.channel, 'devlog');
  assert.equal(item.url, '/devlog/build-05');
  assert.equal(item.coverUrl, '/media/med_1');
});

test('delete cleans content revision usage before deleting channel-scoped post', async () => {
  const source = await read('src/content/delete.js');
  assert.match(source, /content_revision/);
  assert.match(source, /revisionsForPost/);
  assert.match(source, /deletePost/);
});
