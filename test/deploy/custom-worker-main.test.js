import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('root Wrangler config uses the News custom Worker wrapper', async () => {
  const source = await read('wrangler.jsonc');
  assert.match(source, /"main"\s*:\s*"\.\/src\/news-worker-entry\.js"/);
});

test('generated production Wrangler patch preserves the custom Worker entrypoint', async () => {
  const source = await read('scripts/patch-generated-wrangler.mjs');
  assert.match(source, /CUSTOM_WORKER_MAIN = '\.\.\/\.\.\/src\/news-worker-entry\.js'/);
  assert.match(source, /ROOT_CUSTOM_WORKER_MAIN = '\.\/src\/news-worker-entry\.js'/);
  assert.match(source, /config\.main = CUSTOM_WORKER_MAIN/);
  assert.match(source, /verified\.main !== CUSTOM_WORKER_MAIN/);
  assert.match(source, /rootVerified\.main !== ROOT_CUSTOM_WORKER_MAIN/);
});
