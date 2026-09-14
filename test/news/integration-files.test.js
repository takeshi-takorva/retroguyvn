import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../../${path}`,import.meta.url),'utf8');

test('wrangler uses News wrapper without replacing existing worker',async()=>{
  const wrangler=await read('wrangler.jsonc');
  const wrapper=await read('src/news-worker-entry.js');
  assert.match(wrangler,/news-worker-entry\.js/);
  assert.match(wrapper,/worker-entry\.js/);
  assert.match(wrapper,/dispatchNewsPublic/);
  assert.match(wrapper,/dispatchNewsAdmin/);
});

test('News migration defines posts and immutable revisions',async()=>{
  const sql=await read('migrations/0003_news.sql');
  assert.match(sql,/CREATE TABLE IF NOT EXISTS news_posts/);
  assert.match(sql,/published_slug/);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS news_revisions/);
  assert.match(sql,/UNIQUE\(post_id, version\)/);
});

test('admin and public News pages are present',async()=>{
  const admin=await read('src/pages/admin/news.astro');
  const listing=await read('src/pages/news.astro');
  const detail=await read('src/pages/news/[slug].astro');
  assert.match(admin,/NEWS MANAGER/);
  assert.match(admin,/Content blocks/);
  assert.match(listing,/\/api\/news/);
  assert.match(detail,/\/api\/news\//);
});
