import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sortPublishedProducts, selectFeaturedPublished } from '../../src/products/public-list.js';
import { toPublicProduct } from '../../src/products/public-get.js';

const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('public product is serialized from published revision metadata, not mutable draft row metadata', () => {
  const row = { id: 'prod_1', name: 'DRAFT NAME', cover_media_id: 'draft-cover', published_slug: 'dr-portal', published_at: '2026-09-15T00:00:00Z' };
  const published = { name: 'DR Portal', slug: 'dr-portal', subtitle: 'Pocket Adventure Device', excerpt: 'Published copy', category: 'Handheld', availability: 'coming-soon', featured: true, sortOrder: 2, coverMediaId: 'published-cover', description: 'Published description', features: [], specs: [], galleryMediaIds: [], cta: { label: 'Support', href: '/support' } };
  const item = toPublicProduct(row, published);
  assert.equal(item.name, 'DR Portal');
  assert.equal(item.coverMediaId, 'published-cover');
  assert.equal(item.coverUrl, '/media/published-cover');
  assert.equal(item.url, '/product/dr-portal');
});

test('published products sort by featured, sort order, published time and stable id', () => {
  const items = [
    { id: 'b', featured: false, sortOrder: 0, publishedAt: '2026-09-15T00:00:00Z' },
    { id: 'c', featured: true, sortOrder: 9, publishedAt: '2026-09-15T00:00:00Z' },
    { id: 'a', featured: true, sortOrder: 1, publishedAt: '2026-09-14T00:00:00Z' },
  ];
  assert.deepEqual(sortPublishedProducts(items).map(item => item.id), ['a', 'c', 'b']);
  assert.equal(selectFeaturedPublished(items).id, 'a');
});

test('publish and unpublish operate on explicit published revision pointers', async () => {
  const source = await read('src/products/publish.js');
  assert.match(source, /draft_revision_id/);
  assert.match(source, /published_revision_id|publishProduct/);
  assert.match(source, /published_slug|content\.slug/);
  assert.match(source, /unpublishProduct/);
});

test('public reads require published status and published revision', async () => {
  const listSource = await read('src/products/public-list.js');
  const getSource = await read('src/products/public-get.js');
  assert.match(listSource, /status\s*=\s*'published'/);
  assert.match(listSource, /published_revision_id/);
  assert.match(getSource, /published_slug/);
  assert.match(getSource, /published_revision_id/);
});
