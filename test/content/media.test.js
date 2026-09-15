import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { collectPostMediaRefs } from '../../src/content/content.js';
import { assertContentMediaNotInUse } from '../../src/content/media.js';

const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('shared post media refs cover cover/image/gallery/video with stable paths', () => {
  const refs = collectPostMediaRefs({
    coverMediaId:'cover',
    blocks:[
      { type:'image', mediaId:'img' },
      { type:'gallery', mediaIds:['g1','g2'] },
      { type:'video', mediaId:'vid' }
    ]
  });
  assert.deepEqual(refs, [
    { id:'cover', path:'coverMediaId' },
    { id:'img', path:'blocks[0].mediaId' },
    { id:'g1', path:'blocks[1].mediaIds[0]' },
    { id:'g2', path:'blocks[1].mediaIds[1]' },
    { id:'vid', path:'blocks[2].mediaId' }
  ]);
});

test('content media deletion guard blocks active shared post references with channel details', async () => {
  const env = { DB: { prepare(sql) {
    if (/INSERT OR IGNORE INTO media_usage/i.test(sql)) return { async run() { return { success:true }; } };
    if (/^CREATE /i.test(sql) || /INSERT OR IGNORE INTO content_/i.test(sql)) return { async run() { return { success:true }; } };
    return { bind(mediaId) { return { async all() {
      assert.match(sql, /content_revision/);
      assert.match(sql, /content_posts/);
      assert.equal(mediaId, 'med_1');
      return { results: [{ id:'post_1', channel:'news', slug:'hello', field_path:'coverMediaId' }] };
    } }; } };
  } } };
  await assert.rejects(() => assertContentMediaNotInUse(env, 'med_1'), error => {
    assert.equal(error.status, 409);
    assert.equal(error.usage[0].channel, 'news');
    return true;
  });
});

test('shared media module retains News upload limits and content_revision indexing', async () => {
  const source = await read('src/content/media.js');
  assert.match(source, /5 \* 1024 \* 1024/);
  assert.match(source, /50 \* 1024 \* 1024/);
  assert.match(source, /content_revision/);
  assert.match(source, /validatePostMedia/);
  assert.match(source, /indexPostMediaUsage/);
});

test('Worker media DELETE guard checks shared Content then Product usage', async () => {
  const worker = await read('src/news-worker-entry.js');
  assert.match(worker, /assertContentMediaNotInUse/);
  assert.match(worker, /assertProductMediaNotInUse/);
  assert.doesNotMatch(worker, /assertNewsMediaNotInUse/);
});
