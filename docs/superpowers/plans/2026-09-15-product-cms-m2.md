# Product CMS M2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a structured Product CMS with immutable revisions, admin management, published product APIs, dynamic catalogue/detail pages, shared media protection, and an idempotent DR Portal bootstrap.

**Architecture:** Build `src/products/*` as a Product-specific D1 module parallel to `src/news/*`, then extend the current custom Worker wrapper with Product public/admin dispatch while preserving News/OTA routing. Public Astro pages load Product JSON from same-origin APIs; admin uses the existing session contract and shared media store.

**Tech Stack:** Astro 7, Cloudflare Workers, Cloudflare D1, R2 `MEDIA`, existing admin session/auth, Node `node:test`, Wrangler 4.

**Spec:** `docs/superpowers/specs/2026-09-15-product-cms-m2-design.md`

## Global Constraints

- Do not modify News public/admin semantics, Homepage CMS or OTA behaviour.
- Product data is structured; no arbitrary page-builder blocks in M2.
- Public endpoints expose published revisions only.
- Draft saves are immutable revisions.
- Product media reuses the existing shared Media Library and deletion guard.
- No inventory, cart, checkout, order management, Dev Log backend or Support ticket backend.
- Full `npm test` and `npm run build` must pass; production Worker `main` remains Astro compiled `entry.mjs`.

---

### Task 1: Product schema, normalization and validation

**Files:**
- Create: `migrations/0004_products.sql`
- Create: `src/products/model.js`
- Create: `src/products/content.js`
- Create: `src/products/schema.js`
- Create: `test/products/model.test.js`
- Create: `test/products/schema.test.js`

**Interfaces:**
- Produces `productError(message, status=422)`, `slugifyProduct(value)`, `normalizeProductDraft(input)`, `collectProductMediaRefs(content)`, `ensureProductSchema(env)`.
- Revision content shape: `{ description, features, specs, galleryMediaIds, cta }`.

- [ ] **Step 1: Write failing model tests** for Vietnamese slug normalization, allowed availability values, 4000-word description limit, max 20 features, max 40 specs, gallery dedupe/max 20 and site-relative CTA path.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProductDraft } from '../../src/products/content.js';

test('normalizes product draft and deduplicates gallery media', () => {
  const out = normalizeProductDraft({
    name: 'DR Portal',
    slug: 'DR Portal',
    availability: 'coming-soon',
    featured: true,
    sortOrder: 4,
    galleryMediaIds: ['m1', 'm1', 'm2'],
    cta: { label: 'Support', href: '/support' }
  });
  assert.equal(out.slug, 'dr-portal');
  assert.deepEqual(out.galleryMediaIds, ['m1', 'm2']);
  assert.equal(out.featured, true);
  assert.equal(out.sortOrder, 4);
});
```

- [ ] **Step 2: Run `node --test test/products/model.test.js test/products/schema.test.js`** and verify RED because Product modules do not exist.
- [ ] **Step 3: Implement validation/normalization** with exact limits from the spec and errors carrying HTTP status.
- [ ] **Step 4: Implement D1 schema** matching `migrations/0004_products.sql`, including indexes for status/order, published slug and revision version.
- [ ] **Step 5: Run the focused tests** and verify GREEN.
- [ ] **Step 6: Commit** `feat: add Product CMS schema and validation`.

### Task 2: Product store, revision persistence and admin CRUD

**Files:**
- Create: `src/products/sql.js`
- Create: `src/products/store.js`
- Create: `src/products/create.js`
- Create: `src/products/save.js`
- Create: `src/products/admin-read.js`
- Create: `src/products/delete.js`
- Create: `test/products/admin-store.test.js`

**Interfaces:**
- `createProduct(env, input, actor)` returns admin product detail.
- `saveProductDraft(env, id, input, actor)` creates the next immutable revision and returns detail.
- `listAdminProducts(env)` returns summaries ordered by `sort_order`, creation time.
- `getAdminProduct(env, id)` returns summary plus `draft`, `published`, and revision metadata.
- `deleteProduct(env, id)` removes product/revisions and their product-owned `media_usage` rows.

- [ ] **Step 1: Write failing tests** using the repository's existing fake D1 conventions to assert first revision version `1`, second save version `2`, prior revision unchanged, duplicate slug returns `409`, and delete removes product-owned usage rows.
- [ ] **Step 2: Run focused tests** and verify RED.
- [ ] **Step 3: Implement SQL/store helpers** including `uid('prod')`, `uid('prev')`, slug uniqueness, revision loading and summary conversion.
- [ ] **Step 4: Implement create/save/read/delete** using D1 batch operations where atomic paired writes are required.
- [ ] **Step 5: Run focused tests** and verify GREEN.
- [ ] **Step 6: Commit** `feat: add Product CMS draft persistence`.

### Task 3: Publish, unpublish and public read isolation

**Files:**
- Create: `src/products/publish.js`
- Create: `src/products/public-list.js`
- Create: `src/products/public-get.js`
- Create: `test/products/publish.test.js`
- Create: `test/products/public-read.test.js`

**Interfaces:**
- `publishProduct(env, id, actor)` publishes `draft_revision_id` and `slug`.
- `unpublishProduct(env, id, actor)` sets status back to draft and clears `published_slug`.
- `listPublishedProducts(env)` returns `{ items, featuredId }`.
- `getPublishedProduct(env, slug)` resolves only `published_slug` and `published_revision_id`.

- [ ] **Step 1: Write failing tests** proving draft changes after publishing do not alter `getPublishedProduct`, unpublished products disappear, and featured selection uses `featured DESC, sort_order ASC, published_at DESC, id ASC`.
- [ ] **Step 2: Run focused tests** and verify RED.
- [ ] **Step 3: Implement publish/unpublish SQL operations** preserving immutable revision pointers.
- [ ] **Step 4: Implement public list/detail serialization** including media URLs and normalized detail content.
- [ ] **Step 5: Run focused tests** and verify GREEN.
- [ ] **Step 6: Commit** `feat: publish Product CMS revisions`.

### Task 4: Shared media validation and deletion protection

**Files:**
- Create: `src/products/media.js`
- Modify: `src/news-worker-entry.js`
- Modify: `src/news/delete.js` only if a neutral shared guard cannot be added without changing News semantics.
- Test: `test/products/media.test.js`

**Interfaces:**
- `validateProductMedia(env, productContent)` verifies referenced IDs exist in `media_nodes` as non-deleted files.
- `indexProductMediaUsage(env, revisionId, content)` writes `owner_type='product_revision'` usage rows.
- `assertProductMediaNotInUse(env, mediaId)` throws `409` with usage details when Product references media.

- [ ] **Step 1: Write failing media tests** for cover/gallery validation and delete blocking.
- [ ] **Step 2: Run focused tests** and verify RED.
- [ ] **Step 3: Implement Product media helpers** using existing `media_nodes`/`media_usage` tables.
- [ ] **Step 4: Extend shared media DELETE path** so News guard runs first and Product guard also runs before the existing lower Worker performs the actual deletion.
- [ ] **Step 5: Run News + Product media tests** and verify both remain GREEN.
- [ ] **Step 6: Commit** `feat: protect Product media usage`.

### Task 5: Product API dispatch and Worker integration

**Files:**
- Create: `src/products/admin-http-collection.js`
- Create: `src/products/admin-http-item.js`
- Create: `src/products/public-http.js`
- Create: `src/products/dispatch.js`
- Modify: `src/news-worker-entry.js`
- Create: `test/products/http.test.js`

**Interfaces:**
- Public routes: `GET /api/products`, `GET /api/products/:slug`.
- Admin routes: collection CRUD plus `publish`, `unpublish`, `remove` actions.
- Reuse existing `/api/admin/session` probe and same-origin mutation guard.

- [ ] **Step 1: Write failing route tests** asserting public GET dispatch, admin unauthorized `401`, cross-origin mutation `403`, validation `422`, duplicate slug `409`, unknown item `404`.
- [ ] **Step 2: Run focused tests** and verify RED.
- [ ] **Step 3: Implement HTTP handlers/dispatcher** returning JSON with `cache-control: no-store` for admin and stable JSON for public endpoints.
- [ ] **Step 4: Extend `news-worker-entry.js`** with Product routing before fallback, renaming `newsAdminSession` to neutral `adminSession` only if all call sites remain identical.
- [ ] **Step 5: Run Product HTTP plus News Worker tests** and verify GREEN.
- [ ] **Step 6: Commit** `feat: add Product CMS APIs`.

### Task 6: Idempotent DR Portal bootstrap

**Files:**
- Create: `src/products/bootstrap.js`
- Wire into: Product public/admin initialization path without running on every read after schema is known ready.
- Create: `test/products/bootstrap.test.js`

**Interfaces:**
- `bootstrapProducts(env, actor='system')` creates one published DR Portal only when `SELECT COUNT(*) FROM products` is zero; otherwise returns without writing.

- [ ] **Step 1: Write failing tests** for empty DB creation and no-op when any product exists.
- [ ] **Step 2: Run focused tests** and verify RED.
- [ ] **Step 3: Implement bootstrap** using existing DR Portal marketing copy and no fabricated media ID.
- [ ] **Step 4: Verify calling bootstrap twice still yields one product**.
- [ ] **Step 5: Commit** `feat: bootstrap initial DR Portal product`.

### Task 7: Dynamic public Product catalogue and detail page

**Files:**
- Modify: `src/pages/product.astro`
- Create: `src/pages/product/[slug].astro`
- Create: `public/product/catalogue.js`
- Create: `public/product/detail.js`
- Create: `test/products/pages.test.js`

**Interfaces:**
- Catalogue client requests `/api/products` and renders featured/catalogue data.
- Detail client requests `/api/products/:slug`; Astro page passes route slug to the client through a data attribute or inline serialized string.

- [ ] **Step 1: Write failing source-contract tests** for dynamic API usage, absence of hard-coded DR Portal fallback card, detail feature/spec/gallery containers and 404 state.
- [ ] **Step 2: Run focused tests** and verify RED.
- [ ] **Step 3: Convert `/product`** to loading/empty/error states plus same M1 visual structure driven by API data.
- [ ] **Step 4: Create `/product/[slug]`** with hero, cover, description, features, specs, gallery and CTA regions.
- [ ] **Step 5: Implement public JS renderers** with textContent/DOM APIs rather than injecting untrusted HTML.
- [ ] **Step 6: Run page tests** and verify GREEN.
- [ ] **Step 7: Commit** `feat: render Product CMS publicly`.

### Task 8: Product Manager admin UI

**Files:**
- Create: `src/pages/admin/products.astro`
- Create: `public/admin/products.js`
- Create or reuse: `public/admin/news.css` via the same stylesheet if visually compatible; otherwise create `public/admin/products.css` without duplicating the entire News stylesheet.
- Modify: `src/pages/admin/index.astro` to add Product Manager entry.
- Create: `test/products/admin-ui.test.js`

**Interfaces:**
- Admin UI uses `/api/admin/products` and existing `/api/admin/media` endpoints.
- Required fields/actions match the M2 spec.

- [ ] **Step 1: Write failing UI source tests** for Name, Slug, Subtitle, Excerpt, Category, Availability, Featured, Sort Order, Cover, Description, Features, Specs, Gallery, CTA, Save Draft, Publish, Unpublish, Remove.
- [ ] **Step 2: Run focused tests** and verify RED.
- [ ] **Step 3: Implement admin Astro shell** following News Manager navigation/auth patterns.
- [ ] **Step 4: Implement Product Manager JS** for session probing, list filtering, create/load/save/publish/unpublish/remove, media selectors, repeatable feature/spec rows and gallery selection.
- [ ] **Step 5: Add `/admin` entry** for Products without removing Homepage/News/OTA links.
- [ ] **Step 6: Run UI tests** and verify GREEN.
- [ ] **Step 7: Commit** `feat: add Product Manager admin UI`.

### Task 9: Full verification, PR review and merge readiness

**Files:**
- Modify implementation/tests only for defects found by verification.

**Interfaces:** No new public interfaces.

- [ ] **Step 1: Run `npm test`**; expected 0 failures including all News/OTA regression tests.
- [ ] **Step 2: Run `npm run build`**; expected Astro server build and Wrangler dry-run success with `[wrangler-patch] Production Worker main preserved from Astro build: entry.mjs.`.
- [ ] **Step 3: Review PR diff** against `docs/superpowers/specs/2026-09-15-product-cms-m2-design.md`; confirm no Order/Support/Devlog/OTA scope creep.
- [ ] **Step 4: Open PR `feat/product-cms-m2` → `main`** and wait for GitHub Actions.
- [ ] **Step 5: Inspect CI logs** for exact test count, Astro build and Wrangler dry-run rather than relying only on a green badge.
- [ ] **Step 6: Squash merge only after the latest head SHA is green**.
- [ ] **Step 7: Verify `main` points at the squash commit** and report Cloudflare live deployment separately unless a production Workers Build log is available.
