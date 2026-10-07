import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('shared dispatcher exposes explicit public and admin channel entrypoints', async () => {
  const source = await read('src/content/dispatch.js');
  assert.match(source, /dispatchPostPublic\(request, env, channel\)/);
  assert.match(source, /dispatchPostAdmin\(request, env, actor, channel\)/);
  assert.match(source, /handlePostPublic/);
  assert.match(source, /handlePostCollection/);
  assert.match(source, /handlePostItem/);
  assert.match(source, /handlePostMedia/);
});

test('public HTTP handler accepts collection/detail GET and category pagination inputs', async () => {
  const source = await read('src/content/public-http.js');
  assert.match(source, /request\.method !== 'GET'/);
  assert.match(source, /listPublishedPosts\(env, channel/);
  assert.match(source, /getPublishedPost\(env, channel/);
  assert.match(source, /searchParams\.get\('category'\)/);
  assert.match(source, /pageSize/);
});

test('Worker routes News and Dev Log through shared dispatcher while preserving Product routes', async () => {
  const source = await read('src/news-worker-entry.js');
  assert.match(source, /dispatchPostPublic\(request, env, 'news'\)/);
  assert.match(source, /dispatchPostPublic\(request, env, 'devlog'\)/);
  assert.match(source, /dispatchPostAdmin\(request, env, [^,]+, 'news'\)/);
  assert.match(source, /dispatchPostAdmin\(request, env, [^,]+, 'devlog'\)/);
  assert.match(source, /dispatchProductPublic/);
  assert.match(source, /dispatchProductAdmin/);
  assert.match(source, /Cross-origin admin mutation rejected/);
  assert.match(source, /Unauthorized/);
});

test('shared admin handlers wire channel into CRUD lifecycle and media upload', async () => {
  const collection = await read('src/content/admin-http-collection.js');
  const item = await read('src/content/admin-http-item.js');
  const media = await read('src/content/admin-http-media.js');
  assert.match(collection, /listAdminPosts\(env, channel\)/);
  assert.match(collection, /createPost\(env, channel/);
  assert.match(item, /getAdminPost\(env, channel/);
  assert.match(item, /savePostDraft\(env, channel/);
  assert.match(item, /publishPost\(env, channel/);
  assert.match(item, /unpublishPost\(env, channel/);
  assert.match(item, /deletePost\(env, channel/);
  assert.match(media, /uploadPostMedia/);
});
