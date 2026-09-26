import test from 'node:test';
import assert from 'node:assert/strict';
import { PAGE_DEFINITIONS, GLOBAL_DEFAULTS } from '../../src/cms/m2-pages.js';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('admin page map matches the five canonical frontend pages', () => {
  assert.deepEqual(Object.keys(PAGE_DEFINITIONS), ['home', 'product', 'news', 'support', 'devlog']);
  assert.deepEqual(Object.values(PAGE_DEFINITIONS).map(page => page.route), ['/', '/product', '/news', '/support', '/devlog']);
  assert.equal(PAGE_DEFINITIONS.home.managerRoute, '/admin');
  assert.equal(PAGE_DEFINITIONS.product.managerRoute, '/admin/products');
  assert.equal(PAGE_DEFINITIONS.devlog.managerRoute, '/admin/devlog');
});

test('legacy public page names are absent from CMS navigation defaults and Pages UI', async () => {
  assert.deepEqual(GLOBAL_DEFAULTS.nav, {
    home: 'HOME',
    product: 'PRODUCT',
    news: 'NEWS',
    support: 'SUPPORT',
    devlog: 'DEV LOG'
  });

  const pageIndex = await read('src/pages/admin/pages/index.astro');
  assert.match(pageIndex, /editorRoute/);
  assert.doesNotMatch(pageIndex, /\/admin\/pages\/\$\{encodeURIComponent\(page\.slug\)\}/);
});
