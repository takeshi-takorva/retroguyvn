import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Home SiteHeader owns the styles for its logo and cross-page navigation', async () => {
  const header = await read('src/components/SiteHeader.astro');

  assert.match(header, /<style>/);
  assert.match(header, /\.nav\s*\{/);
  assert.match(header, /\.navin\s*\{/);
  assert.match(header, /\.logo\s*\{/);
  assert.match(header, /\.links\s*\{/);
  assert.match(header, /\.home-nav-toggle\s*\{/);
  assert.match(header, /\.links\.open\s*\{/);
});
