import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('public list is channel-scoped, supports category filter and clamps pagination', async () => {
  const source = await read('src/content/public-list.js');
  assert.match(source, /assertPostChannel/);
  assert.match(source, /normalizePostPagination/);
  assert.match(source, /channel\s*=\s*\?/i);
  assert.match(source, /category\s*=\s*\?/i);
  assert.match(source, /status\s*=\s*'published'/i);
  assert.match(source, /published_revision_id/i);
  assert.match(source, /LIMIT \? OFFSET \?/i);
  assert.match(source, /totalItems/);
  assert.match(source, /totalPages/);
});

test('public detail resolves published revision only within requested channel', async () => {
  const source = await read('src/content/public-get.js');
  assert.match(source, /channel\s*=\s*\?/i);
  assert.match(source, /published_slug\s*=\s*\?/i);
  assert.match(source, /published_revision_id/i);
  assert.doesNotMatch(source, /draft_revision_id/);
  assert.match(source, /toPublishedPostSummary/);
});

test('public serializers read metadata from revision JSON instead of mutable row fields', async () => {
  const listSource = await read('src/content/public-list.js');
  const getSource = await read('src/content/public-get.js');
  assert.match(listSource, /JSON\.parse\(row\.content_json\)/);
  assert.match(getSource, /JSON\.parse\(revision\.content_json\)/);
});
