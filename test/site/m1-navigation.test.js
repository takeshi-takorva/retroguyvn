import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PUBLIC_NAV } from '../../src/site/navigation.js';

const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('public navigation contains exactly the five canonical destinations', () => {
  assert.deepEqual(PUBLIC_NAV, [
    { href: '/', label: 'HOME' },
    { href: '/product', label: 'PRODUCT' },
    { href: '/news', label: 'NEWS' },
    { href: '/support', label: 'SUPPORT' },
    { href: '/devlog', label: 'DEV LOG' },
  ]);
});

test('BaseLayout uses shared site shell instead of a local navigation array', async () => {
  const layout = await read('src/layouts/BaseLayout.astro');
  assert.match(layout, /SiteHeader/);
  assert.match(layout, /SiteFooter/);
  assert.doesNotMatch(layout, /const\s+nav\s*=/);
});

test('homepage primary navigation no longer exposes legacy shortcuts', async () => {
  const home = await read('src/pages/index.astro');
  assert.match(home, /SiteHeader/);
  assert.doesNotMatch(home, /<nav[^>]*class="links"[^>]*>.*Experience.*Features.*Hardware.*Digital Realm/s);
  assert.doesNotMatch(home, /href="\/digital-realm"/);
});
