import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Product catalogue is driven by public Product API instead of hard-coded catalogue cards', async () => {
  const page = await read('src/pages/product.astro');
  const client = await read('public/product/catalogue.js');
  assert.match(page, /id="productFeatured"/);
  assert.match(page, /id="productGrid"/);
  assert.match(page, /id="productEmpty"/);
  assert.match(page, /catalogue\.js/);
  assert.match(client, /fetch\(['"]\/api\/products['"]\)/);
  assert.doesNotMatch(page, /<h3>DR Portal<\/h3>/i);
});

test('Product detail page exposes all structured Product regions and slug to safe client renderer', async () => {
  const page = await read('src/pages/product/[slug].astro');
  const client = await read('public/product/detail.js');
  for (const token of ['productDetail', 'productCover', 'productDescription', 'productFeatures', 'productSpecs', 'productGallery', 'productCta', 'productNotFound']) {
    assert.match(page, new RegExp(`id=["']${token}["']`));
  }
  assert.match(page, /data-product-slug/);
  assert.match(page, /detail\.js/);
  assert.match(client, /\/api\/products\//);
  assert.match(client, /textContent/);
  assert.doesNotMatch(client, /innerHTML\s*=/);
});
