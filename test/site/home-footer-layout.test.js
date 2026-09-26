import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Home SiteFooter owns its logo and information layout styles', async () => {
  const footer = await read('src/components/SiteFooter.astro');

  assert.match(footer, /<style>/);
  assert.match(footer, /\.footer\s*\{/);
  assert.match(footer, /\.footerin\s*\{/);
  assert.match(footer, /\.footer\s+img\s*\{/);
  assert.match(footer, /@media\s*\(max-width:\s*560px\)/);
});
