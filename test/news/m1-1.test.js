import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeNewsBlock } from '../../src/news/blocks.js';
import { normalizeNewsPagination, normalizePublishTime } from '../../src/news/model.js';

const read=path=>readFile(new URL(`../../${path}`,import.meta.url),'utf8');
const words=count=>Array.from({length:count},(_,index)=>`word${index+1}`).join(' ');

test('text and quote content accept at most 2000 words',()=>{
  assert.equal(normalizeNewsBlock({type:'text',text:words(2000)}).text.split(/\s+/).length,2000);
  assert.equal(normalizeNewsBlock({type:'quote',text:words(2000)}).text.split(/\s+/).length,2000);
  assert.throws(()=>normalizeNewsBlock({type:'text',text:words(2001)}),/2000 words/i);
  assert.throws(()=>normalizeNewsBlock({type:'quote',text:words(2001)}),/2000 words/i);
});

test('publish time accepts an explicit ISO timestamp and falls back when empty',()=>{
  const fallback='2026-09-14T14:00:00.000Z';
  assert.equal(normalizePublishTime('2026-09-01T08:30:00.000Z',fallback),'2026-09-01T08:30:00.000Z');
  assert.equal(normalizePublishTime('',fallback),fallback);
  assert.throws(()=>normalizePublishTime('not-a-date',fallback),/publish date/i);
});

test('public News pagination is fixed to a maximum of 50 posts per page',()=>{
  assert.deepEqual(normalizeNewsPagination({page:3,pageSize:50}),{page:3,pageSize:50,offset:100});
  assert.deepEqual(normalizeNewsPagination({page:-2,pageSize:999}),{page:1,pageSize:50,offset:0});
});

test('public News API returns pagination metadata and uses count plus offset',async()=>{
  const http=await read('src/news/public-http.js');
  const listing=await read('src/news/public-list.js');
  assert.match(http,/pageSize/);
  assert.match(http,/totalPages/);
  assert.match(listing,/COUNT\(\*\)/i);
  assert.match(listing,/LIMIT \? OFFSET \?/i);
});

test('News manager exposes publish date time and 2000 word content guidance',async()=>{
  const admin=await read('src/pages/admin/news.astro');
  const blocks=await read('public/admin/news-blocks.js');
  const app=await read('public/admin/news.js');
  assert.match(admin,/publishAtInput/);
  assert.match(admin,/datetime-local/);
  assert.match(blocks,/2000/);
  assert.match(app,/publishedAt/);
});

test('public News page uses square cover rows and pagination controls',async()=>{
  const page=await read('src/pages/news.astro');
  assert.match(page,/news-list/);
  assert.match(page,/aspect-ratio:\s*1\s*\/\s*1/);
  assert.match(page,/500px/);
  assert.match(page,/pageSize=50/);
  assert.match(page,/Back/);
  assert.match(page,/Next/);
});
