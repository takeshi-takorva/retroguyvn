import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SQL } from '../../src/content/sql.js';

const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('publish and unpublish are channel-scoped and use explicit revision pointers', async () => {
  assert.match(SQL.publishPost, /published_revision_id/i);
  assert.match(SQL.publishPost, /published_slug/i);
  assert.match(SQL.publishPost, /WHERE id = \? AND channel = \?/i);
  assert.match(SQL.unpublishPost, /WHERE id = \? AND channel = \?/i);
  const source = await read('src/content/publish.js');
  assert.match(source, /postRevision\(env, post\.draft_revision_id\)/);
  assert.match(source, /SQL\.markRevisionPublished/);
  assert.match(source, /SQL\.publishPost/);
  assert.match(source, /normalizePublishTime/);
});

test('publish validates draft media and requires content blocks', async () => {
  const source = await read('src/content/publish.js');
  assert.match(source, /validatePostMedia/);
  assert.match(source, /blocks\.length/);
  assert.match(source, /Add at least one content block before publishing/);
});
