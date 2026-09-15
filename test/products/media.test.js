import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { collectProductMediaRefs } from '../../src/products/content.js';
import { assertProductMediaNotInUse } from '../../src/products/media.js';

const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Product cover and gallery references are indexed with stable field paths', () => {
  assert.deepEqual(collectProductMediaRefs({ coverMediaId: 'cover', galleryMediaIds: ['g1', 'g2'] }), [
    { id: 'cover', path: 'coverMediaId' },
    { id: 'g1', path: 'galleryMediaIds.0' },
    { id: 'g2', path: 'galleryMediaIds.1' },
  ]);
});

test('Product media deletion guard blocks referenced media with usage details', async () => {
  const env = { DB: { prepare(sql) { return { bind(mediaId) { return { async all() { assert.match(sql, /product_revision/); assert.equal(mediaId, 'med_1'); return { results: [{ id: 'prod_1', slug: 'dr-portal', field_path: 'coverMediaId' }] }; } }; } }; } } };
  await assert.rejects(() => assertProductMediaNotInUse(env, 'med_1'), error => {
    assert.equal(error.status, 409);
    assert.equal(error.usage[0].id, 'prod_1');
    return true;
  });
});

test('Product create and save validate media and index each immutable revision', async () => {
  const createSource = await read('src/products/create.js');
  const saveSource = await read('src/products/save.js');
  for (const source of [createSource, saveSource]) {
    assert.match(source, /validateProductMedia/);
    assert.match(source, /indexProductMediaUsage/);
  }
});

test('shared media DELETE path checks both News and Product usage before falling through', async () => {
  const worker = await read('src/news-worker-entry.js');
  assert.match(worker, /assertNewsMediaNotInUse/);
  assert.match(worker, /assertProductMediaNotInUse/);
});
