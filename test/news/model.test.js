import test from 'node:test';
import assert from 'node:assert/strict';
import { slugifyNewsTitle } from '../../src/news/model.js';
import { normalizeNewsDraft, toPublishedSummary } from '../../src/news/content.js';

test('slugifies Vietnamese news titles',()=>{
  assert.equal(slugifyNewsTitle('Cập nhật Phần cứng Đợt 0.5'),'cap-nhat-phan-cung-dot-0-5');
});

test('normalizes News blocks and removes duplicate tags',()=>{
  const post=normalizeNewsDraft({title:'Hardware Update',tags:['ESP32','esp32','Hardware'],blocks:[{type:'heading',level:9,text:'Milestone'},{type:'gallery',mediaIds:['med_a','med_a','med_b']}]});
  assert.equal(post.slug,'hardware-update');
  assert.deepEqual(post.tags,['ESP32','Hardware']);
  assert.equal(post.blocks[0].level,2);
  assert.deepEqual(post.blocks[1].mediaIds,['med_a','med_b']);
});

test('published summary does not leak article blocks',()=>{
  const item=toPublishedSummary('news_1','2026-09-14T00:00:00Z',{title:'Launch',slug:'launch',excerpt:'Hello',category:'Update',tags:[],coverMediaId:'med_cover',blocks:[{type:'text',text:'Body'}]});
  assert.equal(item.coverUrl,'/media/med_cover');
  assert.equal(item.url,'/news/launch');
  assert.equal(Object.hasOwn(item,'blocks'),false);
});
