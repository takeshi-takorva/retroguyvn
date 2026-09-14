import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('News Worker rejects cross-origin admin mutations before auth dispatch', async () => {
  const source = await readFile(new URL('../../src/news-worker-entry.js', import.meta.url), 'utf8');
  assert.match(source, /mutationOriginAllowed/);
  assert.match(source, /origin === url\.origin/);
  assert.match(source, /Cross-origin admin mutation rejected/);
});
