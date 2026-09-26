import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../../${path}`,import.meta.url),'utf8');

test('wrangler keeps the legacy post engine wrapper active during Dev Log routing hotfix',async()=>{
  const wrangler=await read('wrangler.jsonc');
  const wrapper=await read('src/news-worker-entry.js');
  assert.match(wrangler,/news-worker-entry\.js/);
  assert.match(wrapper,/worker-entry\.js/);
  assert.match(wrapper,/dispatchNewsPublic/);
  assert.match(wrapper,/dispatchNewsAdmin/);
});

test('legacy post migration keeps immutable news_* storage until M3 migrates it',async()=>{
  const sql=await read('migrations/0003_news.sql');
  assert.match(sql,/CREATE TABLE IF NOT EXISTS news_posts/);
  assert.match(sql,/published_slug/);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS news_revisions/);
  assert.match(sql,/UNIQUE\(post_id, version\)/);
});

test('legacy post engine is surfaced as Dev Log while News is isolated',async()=>{
  const admin=await read('src/pages/admin/devlog.astro');
  const listing=await read('src/pages/devlog.astro');
  const detail=await read('src/pages/devlog/[slug].astro');
  const news=await read('src/pages/news.astro');
  assert.match(admin,/DEV LOG MANAGER/);
  assert.match(admin,/Content blocks/);
  assert.match(listing,/\/api\/news/);
  assert.match(detail,/\/api\/news\//);
  assert.doesNotMatch(news,/\/api\/news/);
});
