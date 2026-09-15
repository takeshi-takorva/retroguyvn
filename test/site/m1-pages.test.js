import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Product page preserves featured and catalogue-ready layout for the CMS-driven catalogue', async () => {
  const page = await read('src/pages/product.astro');
  assert.match(page, /PRODUCTS?/i);
  assert.match(page, /product-featured/);
  assert.match(page, /product-grid/);
  assert.match(page, /productFeatured/);
  assert.match(page, /productGrid/);
  assert.doesNotMatch(page, /<h3>DR Portal<\/h3>/i);
});

test('Dev Log page defines development journal taxonomy without reusing the News API in M1', async () => {
  const page = await read('src/pages/devlog.astro');
  assert.match(page, /DEV LOG/);
  for (const category of ['HARDWARE', 'SOFTWARE', 'GAME', 'DESIGN', 'PROTOTYPE', 'MANUFACTURING']) {
    assert.match(page, new RegExp(category));
  }
  assert.doesNotMatch(page, /\/api\/news/);
});

test('Support page exposes FAQ and complete contact form shell', async () => {
  const page = await read('src/pages/support.astro');
  assert.match(page, /FAQ/i);
  assert.match(page, /name="name"/);
  assert.match(page, /name="email"/);
  assert.match(page, /name="topic"/);
  assert.match(page, /name="message"/);
  assert.match(page, /SEND QUESTION/i);
  assert.match(page, /preventDefault\(\)/);
  assert.doesNotMatch(page, /fetch\([^)]*support/i);
});
