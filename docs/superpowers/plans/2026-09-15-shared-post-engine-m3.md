# M3 Shared Post Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the News-specific backend with one channel-aware Post Engine that preserves all News contracts and adds full Dev Log authoring/publication without changing Product CMS, OTA, Support, or deployment semantics.

**Architecture:** Add `src/content/*` as the canonical D1 post engine using `content_posts` and `content_revisions`, with every storage/query operation receiving an explicit `channel` (`news` or `devlog`). Migrate existing News rows/revisions idempotently while preserving IDs, pointers and timestamps; keep legacy `news_*` tables read-only for rollback. Route both public/admin channel families through the shared engine, refactor the browser editor to one channel-configurable implementation, and keep Product CMS/OTA on their current paths.

**Tech Stack:** Astro 7, Cloudflare Workers, Cloudflare D1, R2 `MEDIA`, existing admin session/auth, Node `node:test`, Wrangler 4.

**Spec:** `docs/superpowers/specs/2026-09-15-shared-post-engine-m3-design.md`

## Global Constraints

- Supported channels are exactly `news` and `devlog`.
- A post cannot change channel in M3.
- Slug uniqueness is scoped by channel: `UNIQUE(channel, slug)` and `UNIQUE(channel, published_slug)`.
- Existing News IDs, revision IDs, revision versions, draft/published pointers, publish timestamps and media references must be preserved during migration.
- `news_posts` and `news_revisions` are not dropped in M3 and receive no new writes after shared-engine activation.
- Public rendering reads metadata/content from `published_revision_id`, never mutable draft-row metadata.
- Existing News public/admin routes and pagination remain compatible, including maximum page size 50.
- Dev Log adds category filtering without restricting stored category values to the UI taxonomy.
- Shared content media usage uses `owner_type='content_revision'`; Product media usage remains `owner_type='product_revision'`.
- Admin routes reuse the existing session probe and same-origin mutation guard.
- Do not modify Product CMS lifecycle/schema, OTA architecture, Support backend, order/inventory/checkout, or Page Builder.
- Full `npm test` and `npm run build` must pass; production Worker deployment continues to preserve Astro compiled `entry.mjs`.

---

### Task 1: Shared schema and idempotent News migration

**Files:**
- Create: `migrations/0005_content_posts.sql`
- Create: `src/content/model.js`
- Create: `src/content/schema.js`
- Create: `test/content/schema.test.js`
- Create: `test/content/migration.test.js`

**Interfaces:**
- Produces `POST_CHANNELS`, `assertPostChannel(channel)`, `contentError(message, status=422, extra={})`, `ensureContentSchema(env)`.
- `ensureContentSchema(env)` creates shared tables/indexes and idempotently migrates News rows/revisions without deleting or updating legacy News rows.

- [ ] **Step 1: Write failing schema tests** asserting channel-scoped uniqueness, immutable revision uniqueness, public/admin query indexes and exactly two allowed channels.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTENT_SCHEMA_STATEMENTS, POST_CHANNELS } from '../../src/content/schema.js';

test('shared content schema scopes slugs by channel', () => {
  const sql = CONTENT_SCHEMA_STATEMENTS.join('\n');
  assert.deepEqual(POST_CHANNELS, ['news', 'devlog']);
  assert.match(sql, /UNIQUE\s*\(channel,\s*slug\)/i);
  assert.match(sql, /UNIQUE\s*\(channel,\s*published_slug\)/i);
  assert.match(sql, /UNIQUE\s*\(post_id,\s*version\)/i);
});
```

- [ ] **Step 2: Write failing migration tests** with fake D1 fixtures containing one published News post, two revisions and preserved pointer/timestamp values; assert migration statements copy exact IDs and use conflict-safe insert semantics.

```js
test('News migration preserves identity and revision pointers', async () => {
  const env = fakeMigrationEnv({ post: legacyPost, revisions: legacyRevisions });
  await ensureContentSchema(env);
  assert.equal(env.shared.posts[0].id, legacyPost.id);
  assert.equal(env.shared.posts[0].channel, 'news');
  assert.equal(env.shared.posts[0].published_revision_id, legacyPost.published_revision_id);
  assert.equal(env.shared.revisions[1].id, legacyRevisions[1].id);
});
```

- [ ] **Step 3: Run focused tests and verify RED.**

Run: `node --test test/content/schema.test.js test/content/migration.test.js`
Expected: FAIL because `src/content/schema.js` does not exist.

- [ ] **Step 4: Implement migration SQL** in `0005_content_posts.sql` with `CREATE TABLE IF NOT EXISTS`, channel checks, scoped unique constraints, indexes, `INSERT OR IGNORE ... SELECT 'news', ... FROM news_posts`, and revision copies preserving IDs/content/timestamps.

- [ ] **Step 5: Implement runtime schema/migration** with single-flight readiness per Worker isolate. Runtime migration must execute equivalent conflict-safe copy statements and must not overwrite already-created shared rows.

```js
export const POST_CHANNELS = Object.freeze(['news', 'devlog']);
export function assertPostChannel(channel) {
  if (!POST_CHANNELS.includes(channel)) throw contentError('Unsupported content channel', 404);
  return channel;
}
```

- [ ] **Step 6: Run focused tests and verify GREEN.**

- [ ] **Step 7: Commit** `feat: add shared post schema and News migration`.

---

### Task 2: Shared post normalization and block compatibility

**Files:**
- Create: `src/content/blocks.js`
- Create: `src/content/content.js`
- Extend: `src/content/model.js`
- Test: `test/content/model.test.js`
- Test: `test/news/model.test.js`

**Interfaces:**
- Produces `normalizePostDraft(input)`, `normalizePostBlock(block)`, `collectPostMediaRefs(content)`, `toPublishedPostSummary(channel, id, publishedAt, content)`, `normalizePostPagination(options)`.
- Keeps existing News limits: title 160 chars, excerpt 320 chars, category 60 chars, max 100 blocks, Text/Quote max 2000 words, and existing block-specific constraints.

- [ ] **Step 1: Write failing shared-model tests** for Vietnamese slug normalization, tags dedupe, 100-block cap, Text/Quote limits, safe link normalization, media-ref collection and channel-specific URL generation.

```js
test('published summary derives canonical URL from channel', () => {
  const content = { title:'Build 05', slug:'build-05', excerpt:'', category:'Hardware', tags:[], coverMediaId:null, blocks:[] };
  assert.equal(toPublishedPostSummary('news','p1','2026-09-15T00:00:00Z',content).url, '/news/build-05');
  assert.equal(toPublishedPostSummary('devlog','p2','2026-09-15T00:00:00Z',content).url, '/devlog/build-05');
});
```

- [ ] **Step 2: Run `node --test test/content/model.test.js test/news/model.test.js` and verify RED** because shared content helpers do not exist.

- [ ] **Step 3: Port News block/model behavior into focused shared modules** without changing accepted News content shapes.

- [ ] **Step 4: Keep News compatibility exports thin** only where existing tests/imports still require `src/news/model.js`, `src/news/blocks.js` or `src/news/content.js`; wrappers must delegate to `src/content/*`, not duplicate logic.

- [ ] **Step 5: Run shared + existing News model tests and verify GREEN.**

- [ ] **Step 6: Commit** `refactor: share News and Dev Log content normalization`.

---

### Task 3: Channel-aware draft persistence and immutable revisions

**Files:**
- Create: `src/content/sql.js`
- Create: `src/content/store.js`
- Create: `src/content/create.js`
- Create: `src/content/save.js`
- Create: `src/content/admin-read.js`
- Create: `src/content/delete.js`
- Create: `test/content/admin-store.test.js`

**Interfaces:**
- `createPost(env, channel, input, actor)` -> admin post detail.
- `savePostDraft(env, channel, id, input, actor)` -> next immutable draft revision.
- `listAdminPosts(env, channel)` -> channel-only summaries.
- `getAdminPost(env, channel, id)` -> detail only if post belongs to channel.
- `deletePost(env, channel, id)` -> delete shared post/revisions after cleaning content-owned media usage rows.

- [ ] **Step 1: Write failing persistence tests** proving version 1 then 2 creation, prior revision immutability, same slug allowed across different channels, same-channel duplicate returns 409, cross-channel ID access returns 404, and admin list never leaks another channel.

```js
test('same slug is legal across channels but unique within a channel', async () => {
  await createPost(env, 'news', { title:'Build 05', slug:'build-05' }, 'admin');
  await createPost(env, 'devlog', { title:'Build 05', slug:'build-05' }, 'admin');
  await assert.rejects(
    () => createPost(env, 'news', { title:'Duplicate', slug:'build-05' }, 'admin'),
    error => error.status === 409
  );
});
```

- [ ] **Step 2: Run focused test and verify RED** because persistence modules do not exist.

- [ ] **Step 3: Implement channel-aware SQL/store helpers** so every post lookup/update includes `channel = ?` unless loading a revision by immutable revision ID after ownership was established.

- [ ] **Step 4: Implement create/save/admin-read/delete**, storing full public metadata plus blocks in revision JSON. Save Draft inserts a new revision and updates only mutable draft-row summary/pointer fields.

- [ ] **Step 5: Clean media usage on delete** using `owner_type='content_revision'` for every revision belonging to the deleted post.

- [ ] **Step 6: Run focused persistence tests and verify GREEN.**

- [ ] **Step 7: Commit** `feat: add shared post draft persistence`.

---

### Task 4: Publish/unpublish and public channel isolation

**Files:**
- Create: `src/content/publish.js`
- Create: `src/content/public-list.js`
- Create: `src/content/public-get.js`
- Test: `test/content/publish.test.js`
- Test: `test/content/public-read.test.js`

**Interfaces:**
- `publishPost(env, channel, id, actor, publishedAt?)` publishes current draft revision with explicit published slug/pointer.
- `unpublishPost(env, channel, id, actor)` clears public identity while retaining revision history.
- `listPublishedPosts(env, channel, options)` returns paginated channel-only summaries; optional `category` filter.
- `getPublishedPost(env, channel, slug)` returns full published revision or `null`.

- [ ] **Step 1: Write failing tests** proving draft edits after publish do not affect public reads, unpublished posts disappear, channel filtering is mandatory, Dev Log category filter cannot return News rows, and page size clamps to 50.

```js
test('published post stays isolated from later draft edits', async () => {
  const created = await createPost(env, 'news', baseDraft, 'admin');
  await publishPost(env, 'news', created.id, 'admin');
  await savePostDraft(env, 'news', created.id, { ...baseDraft, title:'Draft changed' }, 'admin');
  const live = await getPublishedPost(env, 'news', baseDraft.slug);
  assert.equal(live.title, baseDraft.title);
});
```

- [ ] **Step 2: Run focused tests and verify RED.**

- [ ] **Step 3: Implement publish/unpublish** using `published_revision_id` and revision snapshots; an explicit publish datetime is validated as ISO and preserved for compatibility with News backdating.

- [ ] **Step 4: Implement public list/detail** with channel-specific URLs and pagination metadata `{ items, page, pageSize, totalItems, totalPages }`.

- [ ] **Step 5: Run focused tests plus `test/news/m1-1.test.js`; verify GREEN.**

- [ ] **Step 6: Commit** `feat: publish shared News and Dev Log revisions`.

---

### Task 5: Shared media upload/indexing/protection and migration compatibility

**Files:**
- Create: `src/content/media.js`
- Modify: `src/news-worker-entry.js`
- Test: `test/content/media.test.js`
- Test: `test/news/integration-files.test.js`
- Test: `test/products/media.test.js`

**Interfaces:**
- `uploadPostMedia(env, file)` retains current image/video size/type limits and shared `MEDIA`/`media_nodes` behavior.
- `validatePostMedia(env, content)` checks all referenced media IDs.
- `indexPostMediaUsage(env, revisionId, content)` writes `owner_type='content_revision'`.
- `assertContentMediaNotInUse(env, mediaId)` blocks delete with channel/post usage details.
- `migrateLegacyNewsMediaUsage(env)` ensures migrated News content remains protected even before old `news_revision` usage rows are cleaned up.

- [ ] **Step 1: Write failing tests** for cover/image/video/gallery validation, content usage indexing, migrated News delete protection, and Product guard regression.

- [ ] **Step 2: Run focused media tests and verify RED.**

- [ ] **Step 3: Implement shared media helpers** by moving behavior from `src/news/media.js` and current News media-indexing code without changing current size/type constraints.

- [ ] **Step 4: Make migration protection idempotent** by rebuilding/adding `content_revision` rows from migrated revision JSON using stable owner ID + field path semantics and conflict-safe insertion/cleanup.

- [ ] **Step 5: Replace Worker media DELETE News guard with shared Content guard followed by existing Product guard.** During compatibility, stale legacy rows may remain but must not be the only protection mechanism.

- [ ] **Step 6: Run Content + News + Product media tests and verify GREEN.**

- [ ] **Step 7: Commit** `feat: protect shared post media usage`.

---

### Task 6: Shared HTTP dispatch and Worker routing

**Files:**
- Create: `src/content/public-http.js`
- Create: `src/content/admin-http-collection.js`
- Create: `src/content/admin-http-item.js`
- Create: `src/content/admin-http-media.js`
- Create: `src/content/dispatch.js`
- Modify: `src/news-worker-entry.js`
- Create: `test/content/http.test.js`
- Modify/Test: `test/news/security.test.js`

**Interfaces:**
- `dispatchPostPublic(request, env, channel)` handles collection/detail GET only.
- `dispatchPostAdmin(request, env, actor, channel)` handles list/create/get/save/publish/unpublish/remove/media.
- Existing `/api/news*` and `/api/admin/news*` map to channel `news`.
- New `/api/devlog*` and `/api/admin/devlog*` map to channel `devlog`.

- [ ] **Step 1: Write failing route tests** for both public channels, unsupported methods, 422 validation, 404 cross-channel access, 409 duplicate same-channel slug, admin unauthorized 401 and cross-origin mutation 403.

```js
test('Worker maps public route families to explicit channels', async () => {
  const source = await readFile(new URL('../../src/news-worker-entry.js', import.meta.url), 'utf8');
  assert.match(source, /dispatchPostPublic\(request, env, 'news'\)/);
  assert.match(source, /dispatchPostPublic\(request, env, 'devlog'\)/);
});
```

- [ ] **Step 2: Run focused HTTP/security tests and verify RED.**

- [ ] **Step 3: Implement shared handlers/dispatcher** with generic 500 responses and `cache-control: no-store` on admin responses.

- [ ] **Step 4: Rewire custom Worker** while preserving Product routing, existing `adminSession()`, same-origin guard and lower-worker fallback exactly.

- [ ] **Step 5: Ensure public/admin News URL shapes remain byte-for-byte compatible at route level.**

- [ ] **Step 6: Run HTTP/security + Product HTTP + OTA tests and verify GREEN.**

- [ ] **Step 7: Commit** `feat: route News and Dev Log through shared engine`.

---

### Task 7: News compatibility wrappers and zero legacy writes

**Files:**
- Modify: `src/news/create.js`
- Modify: `src/news/save.js`
- Modify: `src/news/admin-read.js`
- Modify: `src/news/publish.js`
- Modify: `src/news/delete.js`
- Modify: `src/news/public-list.js`
- Modify: `src/news/public-get.js`
- Modify: `src/news/public-http.js`
- Modify: `src/news/dispatch.js`
- Modify as needed: `src/news/content.js`, `src/news/model.js`, `src/news/blocks.js`, `src/news/media.js`
- Create: `test/content/news-compat.test.js`

**Interfaces:**
- Existing News exports remain callable for regression tests/older internal imports but delegate to shared APIs with channel `news`.
- No compatibility wrapper performs SQL writes to `news_posts` or `news_revisions`.

- [ ] **Step 1: Write failing compatibility/source tests** asserting News wrappers delegate to `src/content/*` and source contains no `INSERT INTO news_posts`, `UPDATE news_posts`, `INSERT INTO news_revisions`, or `DELETE FROM news_posts` write path.

- [ ] **Step 2: Run compatibility + all existing `test/news/*.test.js`; verify RED** against pre-refactor modules.

- [ ] **Step 3: Convert required News modules to thin wrappers** preserving function signatures where possible and hardcoding explicit `news` channel only at this compatibility edge.

- [ ] **Step 4: Keep legacy News schema module only for rollback/tests if still needed, but normal request paths must initialize/migrate through `ensureContentSchema`.**

- [ ] **Step 5: Run all News tests and Content compatibility tests; verify GREEN.**

- [ ] **Step 6: Commit** `refactor: make News a shared-engine compatibility channel`.

---

### Task 8: Shared Post Manager for News and Dev Log

**Files:**
- Create: `public/admin/posts-api.js`
- Create: `public/admin/posts.js`
- Reuse/modify: `public/admin/news-blocks.js`
- Reuse/modify: `public/admin/news-preview.js`
- Reuse/modify: `public/admin/news.css`
- Modify: `src/pages/admin/news.astro`
- Create: `src/pages/admin/devlog.astro`
- Modify: `src/pages/admin/index.astro`
- Create: `test/content/admin-ui.test.js`

**Interfaces:**
- Astro shells expose a channel config through `data-channel`, `data-title`, `data-public-base`, and optional default category.
- Shared browser API builds base path from channel: `/api/admin/${channel}`.
- Media upload posts to `/api/admin/${channel}/media`.

- [ ] **Step 1: Write failing UI source tests** proving both admin shells load `/admin/posts.js`, News has `data-channel="news"`, Dev Log has `data-channel="devlog"`, and both expose the full existing editor action/field set.

- [ ] **Step 2: Write failing API-client tests/source assertions** proving there are no hard-coded `/api/admin/news` CRUD paths in shared `posts-api.js`.

- [ ] **Step 3: Run focused UI tests and verify RED.**

- [ ] **Step 4: Extract channel-configurable client logic** from current `news.js/news-api.js`. Keep token/session behavior, block editor, preview and Media Library behavior compatible.

- [ ] **Step 5: Convert News shell and add Dev Log shell** with Dev Log labels/public link and UI taxonomy convenience default, without restricting backend category text.

- [ ] **Step 6: Add Dev Log Manager entry to `/admin`** while preserving Homepage, Products, News, OTA and System links.

- [ ] **Step 7: Run UI + existing News UI tests and verify GREEN.**

- [ ] **Step 8: Commit** `feat: share Post Manager across News and Dev Log`.

---

### Task 9: Dynamic Dev Log pages and shared safe public renderer

**Files:**
- Create: `public/posts/list.js`
- Create: `public/posts/detail.js`
- Modify: `src/pages/news.astro`
- Modify: `src/pages/news/[slug].astro`
- Modify: `src/pages/devlog.astro`
- Create: `src/pages/devlog/[slug].astro`
- Create: `test/content/pages.test.js`
- Modify: `test/news/m1-1.test.js` only when an old assertion encodes an implementation detail replaced by an equivalent shared renderer.

**Interfaces:**
- Shared list renderer reads route/channel config and calls `/api/${channel}`.
- Dev Log category filter sends a channel-safe `category` query parameter and preserves pagination.
- Shared detail renderer uses DOM/textContent APIs for text and creates only known safe block element types.

- [ ] **Step 1: Write failing page-contract tests** for dynamic `/devlog`, six taxonomy buttons plus ALL, pagination/loading/empty/error states, `/devlog/[slug]`, and shared renderer usage by News/Dev Log.

- [ ] **Step 2: Add safety assertions** that the detail renderer does not insert raw block HTML and that unknown/unpublished detail returns a real 404 while infrastructure exceptions are not caught and rewritten as 404.

- [ ] **Step 3: Run focused page tests and verify RED.**

- [ ] **Step 4: Implement shared list renderer** retaining News square-cover row behavior and allowing Dev Log-specific visual classes/labels/category filters through page configuration.

- [ ] **Step 5: Implement shared detail renderer** for Text/Heading/Image/Gallery/Video/Quote/Link using DOM APIs and `/media/:id` URLs.

- [ ] **Step 6: Convert News pages without changing canonical News routes; replace Dev Log placeholder with dynamic list and add detail route.**

- [ ] **Step 7: Run Content pages + News page regression tests and verify GREEN.**

- [ ] **Step 8: Commit** `feat: publish Dev Log through shared Post Engine`.

---

### Task 10: Full verification, migration review, PR and merge readiness

**Files:**
- Modify implementation/tests only for defects found by verification.
- Optional docs update only if implementation materially differs from the approved spec; do not change scope silently.

**Interfaces:** No new public interfaces.

- [ ] **Step 1: Run `npm test`.**
Expected: zero failures across Content, News, Product, OTA, site/navigation and deployment tests.

- [ ] **Step 2: Run `npm run build`.**
Expected: Astro Cloudflare server build succeeds; patch logs `Production Worker main preserved from Astro build: entry.mjs`; Wrangler dry-run exits successfully.

- [ ] **Step 3: Review migration semantics against the spec.** Confirm IDs/pointers/timestamps are preserved, `INSERT OR IGNORE`/equivalent cannot overwrite shared data, and no normal request writes legacy News tables.

- [ ] **Step 4: Review PR diff for scope.** Reject Support/Order/Inventory/Checkout/OTA redesign/Page Builder/Product redesign changes.

- [ ] **Step 5: Open PR `feat/shared-post-engine-m3` -> `main`** with migration/rollback notes and test evidence.

- [ ] **Step 6: Inspect GitHub Actions logs for the exact latest head SHA.** Record test count, Astro build success and Wrangler dry-run success; a green badge without log inspection is insufficient.

- [ ] **Step 7: Squash merge only if the exact PR HEAD is green and review has no unresolved Important/Critical issue.**

- [ ] **Step 8: Verify `main` points at the squash commit and inspect the post-merge CI run on that exact SHA.**

- [ ] **Step 9: Treat Cloudflare production deployment separately.** If a Workers Build log is supplied/available, verify actual `wrangler deploy`, bindings and Version ID; otherwise report only GitHub merge/CI status and do not claim production deployment.
