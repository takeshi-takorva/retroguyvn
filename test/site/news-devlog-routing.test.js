import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('legacy development posts render under Dev Log, not News', async () => {
  const news = await read('src/pages/news.astro');
  const devlog = await read('src/pages/devlog.astro');
  const devlogDetail = await read('src/pages/devlog/[slug].astro');
  const newsDetail = await read('src/pages/news/[slug].astro');

  assert.doesNotMatch(news, /\/api\/news/);
  assert.match(devlog, /\/api\/news/);
  assert.match(devlog, /\/devlog\//);
  assert.match(devlogDetail, /\/api\/news\//);
  assert.match(newsDetail, /Astro\.redirect\([^\n]*\/devlog\/[^\n]*,\s*302\)/);
});

test('legacy post admin is exposed as Dev Log Manager', async () => {
  const admin = await read('src/pages/admin/devlog.astro');
  assert.match(admin, /DEV LOG MANAGER/);
  assert.match(admin, /href="\/devlog"/);
});
