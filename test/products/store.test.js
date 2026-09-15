import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { productRowSummary } from '../../src/products/store.js';
import { SQL } from '../../src/products/sql.js';

const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('product row summary exposes structured catalogue metadata', () => {
  const item = productRowSummary({
    id: 'prod_1', slug: 'dr-portal', published_slug: 'dr-portal', name: 'DR Portal', subtitle: 'Pocket Adventure Device', excerpt: 'Pocket world', category: 'Handheld', availability: 'coming-soon', featured: 1, sort_order: 3, cover_media_id: 'med_1', status: 'published', published_at: '2026-09-15T00:00:00Z', created_at: '2026-09-14T00:00:00Z', updated_at: '2026-09-15T00:00:00Z', created_by: 'admin'
  });
  assert.equal(item.featured, true);
  assert.equal(item.sortOrder, 3);
  assert.equal(item.coverUrl, '/media/med_1');
  assert.equal(item.url, '/product/dr-portal');
});

test('Product SQL keeps immutable revision pointers separate from product metadata', () => {
  assert.match(SQL.insertRevision, /product_revisions/i);
  assert.match(SQL.maxVersion, /MAX\(version\)/i);
  assert.match(SQL.updateDraft, /draft_revision_id/i);
  assert.match(SQL.publishProduct, /published_revision_id/i);
});

test('saving a draft increments revision version instead of replacing a revision', async () => {
  const source = await read('src/products/save.js');
  assert.match(source, /maxVersion/);
  assert.match(source, /Number\(latest\?\.version\s*\|\|\s*0\)\s*\+\s*1/);
  assert.match(source, /insertRevision/);
  assert.doesNotMatch(source, /UPDATE\s+product_revisions/i);
});

test('deleting a product cleans Product media usage rows before deleting the record', async () => {
  const source = await read('src/products/delete.js');
  assert.match(source, /owner_type\s*=\s*\?/);
  assert.match(source, /product_revision/);
  assert.match(source, /deleteProduct/);
});
