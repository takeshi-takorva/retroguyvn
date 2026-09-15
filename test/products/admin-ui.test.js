import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Product Manager exposes structured product fields and lifecycle actions', async () => {
  const page = await read('src/pages/admin/products.astro');
  const client = await read('public/admin/products.js');
  const api = await read('public/admin/products-api.js');

  for (const token of [
    'productList','nameInput','slugInput','subtitleInput','excerptInput','categoryInput',
    'availabilityInput','featuredInput','sortOrderInput','coverInput','descriptionInput',
    'featureList','specList','galleryList','ctaLabelInput','ctaHrefInput',
    'saveBtn','publishBtn','unpublishBtn','deleteBtn','openPublicLink'
  ]) assert.match(page, new RegExp(`id=["']${token}["']`));

  assert.match(page, /\/admin\/products\.js/);
  assert.match(client, /addFeature/i);
  assert.match(client, /addSpec/i);
  assert.match(client, /galleryMediaIds/);
  assert.match(api, /\/api\/admin\/products/);
  assert.match(api, /\/api\/admin\/media/);
});

test('Admin home links to Product Manager', async () => {
  const page = await read('src/pages/admin/index.astro');
  assert.match(page, /href=["']\/admin\/products["']/);
  assert.match(page, /Product Manager/i);
});
