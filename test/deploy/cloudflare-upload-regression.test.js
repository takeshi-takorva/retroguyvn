import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const patch = await readFile(new URL('../../scripts/patch-generated-wrangler.mjs', import.meta.url), 'utf8');

test('production deploy config keeps the Astro generated worker main', () => {
  assert.match(patch, /const generatedWorkerMain = config\.main/);
  assert.match(patch, /verified\.main !== generatedWorkerMain/);
  assert.doesNotMatch(patch, /config\.main = ['"]?\.\.\/\.\.\/src\/news-worker-entry\.js/);
});
