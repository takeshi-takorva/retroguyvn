import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const redirects = [
  ['src/pages/digital-realm.astro', '/'],
  ['src/pages/features.astro', '/'],
  ['src/pages/download.astro', '/support'],
  ['src/pages/gallery.astro', '/product'],
  ['src/pages/Support.astro', '/support'],
];

for (const [path, target] of redirects) {
  test(`${path} permanently redirects to ${target}`, async () => {
    const page = await read(path);
    assert.match(page, /Astro\.redirect/);
    assert.match(page, new RegExp(`['\"]${target.replace('/', '\\/')}['\"]`));
    assert.match(page, /301/);
  });
}
