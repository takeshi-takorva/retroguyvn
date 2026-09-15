import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dispatchProductPublic } from '../../src/products/dispatch.js';

const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Product public API rejects unsupported methods without touching storage', async () => {
  const response = await dispatchProductPublic(new Request('https://retroguyvn.com/api/products', { method: 'POST' }), {});
  assert.equal(response.status, 405);
  const body = await response.json();
  assert.match(body.error, /method not allowed/i);
});

test('Product dispatcher exposes public collection/detail and admin CRUD actions', async () => {
  const dispatch = await read('src/products/dispatch.js');
  const publicHttp = await read('src/products/public-http.js');
  const itemHttp = await read('src/products/admin-http-item.js');
  assert.match(publicHttp, /listPublishedProducts/);
  assert.match(publicHttp, /getPublishedProduct/);
  for (const action of ['publish', 'unpublish', 'remove']) assert.match(itemHttp, new RegExp(action));
  assert.match(dispatch, /dispatchProductAdmin/);
});

test('custom Worker routes Product public/admin requests through existing security boundary', async () => {
  const worker = await read('src/news-worker-entry.js');
  assert.match(worker, /\/api\/products/);
  assert.match(worker, /\/api\/admin\/products/);
  assert.match(worker, /dispatchProductPublic/);
  assert.match(worker, /dispatchProductAdmin/);
  assert.match(worker, /mutationOriginAllowed/);
  assert.match(worker, /Unauthorized/);
  assert.match(worker, /\/api\/admin\/session/);
});
