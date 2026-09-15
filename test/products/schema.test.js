import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PRODUCT_SCHEMA_STATEMENTS } from '../../src/products/schema.js';

const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Product migration defines products and immutable revisions', async () => {
  const sql = await read('migrations/0004_products.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS products/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS product_revisions/i);
  assert.match(sql, /UNIQUE\s*\(product_id,\s*version\)/i);
  assert.match(sql, /published_revision_id/i);
  assert.match(sql, /availability/i);
  assert.match(sql, /featured/i);
});

test('runtime Product schema mirrors migration tables and indexes', () => {
  const sql = PRODUCT_SCHEMA_STATEMENTS.join('\n');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS products/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS product_revisions/i);
  assert.match(sql, /idx_products_status_order/i);
  assert.match(sql, /idx_products_published_slug/i);
  assert.match(sql, /idx_product_revisions_product_version/i);
});
