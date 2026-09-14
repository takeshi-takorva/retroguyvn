import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('root Wrangler config uses the News custom Worker wrapper as the build input', async () => {
  const source = await read('wrangler.jsonc');
  assert.match(source, /"main"\s*:\s*"\.\/src\/news-worker-entry\.js"/);
});

test('production patch preserves Astro compiled Worker entrypoint instead of restoring source main', async () => {
  const source = await read('scripts/patch-deployment-wrangler.mjs');
  assert.match(source, /const generatedWorkerMain = config\.main/);
  assert.doesNotMatch(source, /config\.main\s*=\s*['"].*src\/news-worker-entry\.js/);
  assert.match(source, /verified\.main !== generatedWorkerMain/);
});

test('CI root config remains source-based and bundleable for future Astro builds', async () => {
  const source = await read('scripts/patch-deployment-wrangler.mjs');
  assert.match(source, /ROOT_MAIN = '\.\/src\/news-worker-entry\.js'/);
  assert.match(source, /root\.main = ROOT_MAIN/);
  assert.match(source, /delete root\.no_bundle/);
});
