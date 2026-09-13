import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));

test('preview deploy uses the repository wrapper', () => {
  assert.equal(packageJson.scripts['deploy:preview'], 'node scripts/deploy-preview.mjs');
});

test('preview wrapper builds missing Astro output before uploading a Worker version', async () => {
  const source = await readFile(new URL('../../scripts/deploy-preview.mjs', import.meta.url), 'utf8');
  assert.match(source, /dist\/server\/wrangler\.production\.json/);
  assert.match(source, /npm[^\n]*run[^\n]*build/);
  assert.match(source, /wrangler[^\n]*versions[^\n]*upload/);
});
