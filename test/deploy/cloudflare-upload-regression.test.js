import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const patch = await readFile(new URL('../../scripts/patch-deployment-wrangler.mjs', import.meta.url), 'utf8');

test('production deploy config keeps the Astro generated worker main', () => {
  assert.match(patch, /const generatedWorkerMain = config\.main/);
  assert.match(patch, /verified\.main !== generatedWorkerMain/);
  assert.doesNotMatch(patch, /config\.main\s*=\s*['"].*src\/news-worker-entry\.js/);
});

test('raw source worker is never paired with Astro no_bundle output config', () => {
  assert.match(patch, /config\.no_bundle === true/);
  assert.match(patch, /Refusing to deploy raw custom Worker with no_bundle=true/);
  assert.match(patch, /delete root\.no_bundle/);
});
