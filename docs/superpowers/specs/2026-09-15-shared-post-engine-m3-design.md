# RetroGuy Web CMS v3 — M3 Shared Post Engine Design

## Goal

Replace the News-specific post backend with a shared post engine that serves two independent public channels — News and Dev Log — while preserving the existing News URLs, publish state, revision history, media protection, admin security boundary, Product CMS behavior, OTA behavior, and Cloudflare deployment contract.

M3 is a backend/content-engine consolidation milestone. It does not add Support tickets, outbound email, order management, inventory, checkout, or generic page-builder capabilities.

## Scope

M3 delivers:

- shared `content_posts` and `content_revisions` tables;
- `channel` discrimination with supported values `news` and `devlog`;
- safe migration of existing News rows/revisions into the shared engine;
- public News compatibility through `/api/news`, `/api/news/:slug`, `/news`, and `/news/[slug]`;
- new Dev Log APIs and public pages through `/api/devlog`, `/api/devlog/:slug`, `/devlog`, and `/devlog/[slug]`;
- shared post CRUD, immutable revisions, publish/unpublish/delete, block normalization, media indexing, public list/detail serialization, and HTTP dispatch;
- `/admin/news` and `/admin/devlog` using the same Post Manager implementation with a channel-specific configuration;
- shared media deletion protection for all content revisions plus Product revisions;
- full News/Product/OTA regression coverage.

M3 does not drop the legacy `news_posts` or `news_revisions` tables. They remain available as legacy/read-only data for rollback safety after migration.

## Architectural choice

Use a new shared Post Engine in `src/content/*` rather than adding a Dev Log type to `src/news/*` or copying the News implementation.

Recommended structure:

```text
src/content/
├── schema.js
├── model.js
├── blocks.js
├── content.js
├── sql.js
├── store.js
├── create.js
├── save.js
├── admin-read.js
├── publish.js
├── delete.js
├── public-list.js
├── public-get.js
├── media.js
├── public-http.js
├── admin-http-collection.js
├── admin-http-item.js
└── dispatch.js
```

The unit boundary is channel-aware but content-generic. News and Dev Log are two consumers of the same post engine, not two duplicated CMS implementations.

## Supported channels

The shared engine supports exactly:

- `news`
- `devlog`

A channel value is required at the storage/query boundary and is never inferred from a title, category, tag, or route slug.

A post remains in one channel for its entire lifecycle in M3. Moving a post from News to Dev Log is out of scope because changing channel would also change its canonical URL and public identity.

## Data model

### `content_posts`

Fields:

- `id TEXT PRIMARY KEY`
- `channel TEXT NOT NULL CHECK(channel IN ('news','devlog'))`
- `slug TEXT NOT NULL`
- `published_slug TEXT`
- `title TEXT NOT NULL`
- `excerpt TEXT NOT NULL DEFAULT ''`
- `category TEXT NOT NULL DEFAULT 'Development'`
- `tags_json TEXT NOT NULL DEFAULT '[]'`
- `cover_media_id TEXT`
- `status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published'))`
- `draft_revision_id TEXT`
- `published_revision_id TEXT`
- `published_at TEXT`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`
- `created_by TEXT`

Uniqueness is scoped by channel:

```sql
UNIQUE(channel, slug)
UNIQUE(channel, published_slug)
```

This intentionally permits both `/news/build-05` and `/devlog/build-05` to exist at the same time.

Indexes must support public channel/status/date queries, published slug resolution, admin channel/status ordering, and revision loading.

### `content_revisions`

Fields:

- `id TEXT PRIMARY KEY`
- `post_id TEXT NOT NULL`
- `version INTEGER NOT NULL`
- `content_json TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `created_by TEXT`
- `published_at TEXT`
- foreign key `post_id -> content_posts(id) ON DELETE CASCADE`
- `UNIQUE(post_id, version)`

A revision is immutable. Every Save Draft creates a new revision. Publishing updates the published pointer to the current draft revision instead of mutating revision content.

## Revision snapshot

The revision JSON must contain all metadata required to render a public post independently from mutable draft-row metadata:

```json
{
  "title": "...",
  "slug": "...",
  "excerpt": "...",
  "category": "...",
  "tags": [],
  "coverMediaId": null,
  "blocks": []
}
```

Public serialization must read title/slug/excerpt/category/tags/cover/blocks from `published_revision_id`. This preserves the current draft-vs-published isolation contract already used by Product CMS.

## Content blocks

M3 preserves the current News block vocabulary and limits:

- Text
- Heading
- Image
- Gallery
- Video
- Quote
- Link

Existing block normalization behavior and per-block limits remain unchanged unless a defect is discovered during migration tests.

No arbitrary HTML/CSS block is introduced in M3.

## Migration strategy

Create `migrations/0005_content_posts.sql`.

The migration creates the shared tables and copies existing News data using the same IDs and timestamps.

### Post migration

For every row in `news_posts`, insert one row in `content_posts` with:

```text
channel = 'news'
```

Preserve exactly:

- post `id`;
- `slug`;
- `published_slug`;
- `title`;
- `excerpt`;
- `category`;
- `tags_json`;
- `cover_media_id`;
- `status`;
- `draft_revision_id`;
- `published_revision_id`;
- `published_at`;
- `created_at`;
- `updated_at`;
- `created_by`.

### Revision migration

For every `news_revisions` row, insert one `content_revisions` row while preserving:

- revision `id`;
- `post_id`;
- `version`;
- `content_json`;
- `created_at`;
- `created_by`;
- `published_at`.

### Idempotency

Migration/runtime schema preparation must be safe when called multiple times. Existing migrated rows must not be duplicated or rewritten.

Use insert semantics that preserve previously migrated shared rows and do not overwrite content created after M3 becomes active.

### Legacy tables

`news_posts` and `news_revisions` are not dropped in M3. After the shared engine is active they become legacy/read-only. All new News writes go only to `content_posts` / `content_revisions`.

This gives a production rollback window without forcing an irreversible destructive schema change in the same milestone.

## Media usage migration

Existing News media usage currently uses:

```text
owner_type = 'news_revision'
```

The shared engine uses:

```text
owner_type = 'content_revision'
```

For migrated News revisions, corresponding media usage must be rebuilt or migrated using the same revision IDs and field paths.

Shared content media usage covers:

- cover media;
- image blocks;
- video blocks;
- gallery items.

The media delete guard must block deletion if a media object is referenced by either:

- any active/shared content revision through `owner_type='content_revision'`;
- any Product revision through `owner_type='product_revision'`.

During the migration compatibility window, stale legacy `news_revision` usage rows may remain, but the effective delete guard must never allow deletion of media still used by migrated News content.

## Public APIs

### News compatibility

Keep unchanged:

```text
GET /api/news
GET /api/news/:slug
```

These routes dispatch the shared engine with `channel='news'`.

The list preserves the existing pagination contract:

- default/max page size behavior remains compatible;
- maximum 50 posts per page;
- response includes `items`, `page`, `pageSize`, `totalItems`, and `totalPages`.

Existing News item URLs remain:

```text
/news/:slug
```

### Dev Log

Add:

```text
GET /api/devlog
GET /api/devlog/:slug
```

These dispatch the same shared engine with `channel='devlog'`.

Dev Log list uses the same pagination shape as News and accepts an optional category filter.

Public reads return only posts where:

- channel matches the requested channel;
- status is published;
- a published revision pointer exists.

Unknown or unpublished slugs return 404.

## Public page routes

### `/news`

Preserve the existing News visual/list contract. The implementation may move inline rendering logic into a shared client renderer, but the public route, pagination, square-cover row layout, and News-specific wording remain compatible.

### `/news/[slug]`

Preserve the existing News article rendering and URL behavior, but source data from the shared engine.

### `/devlog`

Replace the M1 placeholder with the real Dev Log journal.

Primary taxonomy shown by the frontend:

- HARDWARE
- SOFTWARE
- GAME
- DESIGN
- PROTOTYPE
- MANUFACTURING

The backend category remains free text to avoid hard-coding taxonomy into storage.

The page supports:

- ALL plus category filtering;
- pagination;
- honest loading/empty/error states;
- links to `/devlog/:slug`.

### `/devlog/[slug]`

Render the same safe block vocabulary as News with Dev Log visual identity and metadata.

The article renderer may be shared as long as channel-specific labels, canonical URL, and surrounding page styling remain distinct.

## Admin APIs

Keep News compatibility:

```text
GET    /api/admin/news
POST   /api/admin/news
GET    /api/admin/news/:id
PUT    /api/admin/news/:id
POST   /api/admin/news/:id/publish
POST   /api/admin/news/:id/unpublish
POST   /api/admin/news/:id/remove
```

Add equivalent Dev Log routes:

```text
GET    /api/admin/devlog
POST   /api/admin/devlog
GET    /api/admin/devlog/:id
PUT    /api/admin/devlog/:id
POST   /api/admin/devlog/:id/publish
POST   /api/admin/devlog/:id/unpublish
POST   /api/admin/devlog/:id/remove
```

Both route families dispatch the same implementation with an explicit channel argument.

All admin mutations reuse the existing shared `adminSession()` probe and same-origin mutation guard in the custom Worker wrapper.

No new authentication mechanism is introduced.

## Admin UI

### Shared Post Manager

Refactor the News Manager client/editor into a channel-configurable implementation rather than maintaining two copies.

Target structure:

```text
src/pages/admin/news.astro
src/pages/admin/devlog.astro
public/admin/posts.js
public/admin/posts-api.js
public/admin/news.css   (or renamed shared stylesheet if that can be done without compatibility risk)
```

The two Astro shells provide channel-specific configuration, labels, and public links while loading the same client behavior.

Required editor capabilities stay compatible with current News Manager:

- title;
- slug;
- category;
- publish date/time;
- excerpt;
- tags;
- cover image;
- Text/Heading/Image/Gallery/Video/Quote/Link blocks;
- Media upload/selection;
- Preview;
- Save Draft;
- Publish;
- Unpublish;
- Delete.

Dev Log defaults category to `HARDWARE` or a neutral development category only at UI convenience level; storage does not restrict categories to the six displayed taxonomy values.

Admin Home must expose both News Manager and Dev Log Manager without removing Product Manager, Homepage CMS, OTA, or other existing admin entries.

## Worker routing

The current custom Worker wrapper remains the top-level integration point.

Desired routing shape:

```text
/api/news*           -> Shared Post Engine(channel='news')
/api/devlog*         -> Shared Post Engine(channel='devlog')
/api/admin/news*     -> Shared Post Engine(channel='news') + existing admin security
/api/admin/devlog*   -> Shared Post Engine(channel='devlog') + existing admin security
/api/products*       -> existing Product CMS unchanged
/api/admin/products* -> existing Product CMS unchanged
/media DELETE guard  -> shared content guard + Product guard
fallback             -> existing lower worker
```

The production deployment contract remains unchanged: Astro builds the server output and the deployment patch must preserve compiled `entry.mjs` for Wrangler production deploys.

## Compatibility wrappers

To reduce migration risk, existing `src/news/*` public imports may temporarily become thin wrappers around `src/content/*` during M3.

The target end-state is that News route/API behavior is powered by the shared engine. It is not required to delete every legacy News helper file in the same milestone if keeping a thin compatibility wrapper materially reduces production risk.

No new write path may continue writing `news_posts` or `news_revisions` after M3 activation.

## Error handling

- validation errors: 422;
- duplicate channel+slug: 409;
- unknown post: 404;
- unauthorized admin: 401;
- cross-origin admin mutation: 403;
- missing D1/MEDIA binding: 503;
- unexpected server errors: 500 with generic public/admin JSON error text rather than leaking internals.

Public Astro detail pages return 404 only when the shared engine explicitly reports no published post. Infrastructure errors must remain server errors and must not be converted into false 404 responses.

## Testing strategy

M3 is implemented test-first.

Required focused coverage:

1. schema defines channel-scoped uniqueness and immutable revisions;
2. migration copies News posts/revisions with exact IDs/pointers/timestamps;
3. migration is idempotent;
4. old News API contracts still use `channel='news'`;
5. Dev Log APIs use `channel='devlog'`;
6. identical slugs can exist across News and Dev Log but not twice within one channel;
7. Save Draft increments immutable revision version;
8. publish/unpublish uses explicit revision pointers;
9. draft edits do not alter public published content;
10. public list/detail only return the requested channel;
11. News pagination remains compatible at max 50/page;
12. Dev Log category filter is channel-safe;
13. migrated media remains deletion-protected;
14. Product media protection still passes;
15. shared admin dispatcher preserves auth/origin boundary;
16. `/admin/news` and `/admin/devlog` load the shared editor contract;
17. News pages remain compatible;
18. Dev Log list/detail render dynamic content and safe block output;
19. Product CMS regression tests pass;
20. OTA regression tests pass.

Final verification requires:

```text
npm test
npm run build
```

The build must complete Astro server output and Wrangler production dry-run with the compiled Astro `entry.mjs` preserved.

## Rollout and deployment

M3 is developed on `feat/shared-post-engine-m3` and merged through a pull request only after the latest branch HEAD is green.

After merge:

- verify CI again on the exact squash commit on `main`;
- distinguish GitHub CI success from Cloudflare production deploy success;
- when Cloudflare build logs are available, verify actual `wrangler deploy` success, bindings, and deployed Worker version;
- smoke-test `/news`, an existing News article, `/devlog`, `/api/news`, `/api/devlog`, `/admin/news`, and `/admin/devlog` on the live domain/Worker as access permits.

## Out of scope

Explicitly excluded from M3:

- Support FAQ/ticket database;
- support inbox/reply/email;
- order management;
- inventory/stock;
- checkout/payment;
- Product CMS redesign;
- OTA architecture changes;
- generic Page Builder;
- arbitrary HTML/CSS content blocks;
- dropping legacy News tables immediately;
- moving posts between channels.

## Acceptance criteria

M3 is complete only when all of the following are true:

- existing News data migrates without losing IDs, revision history, draft/published pointers, publish timestamps, or media protection;
- all existing News public URLs and API shapes remain compatible;
- all new News writes use the shared tables;
- Dev Log CRUD/draft/publish/unpublish/delete works through the shared engine;
- `/devlog` and `/devlog/[slug]` render published Dev Log content;
- News and Dev Log can reuse the same slug independently;
- public draft isolation is preserved;
- News/Dev Log share one admin editor implementation;
- shared media deletion protection covers Content + Product;
- Product CMS tests remain green;
- OTA tests remain green;
- full test suite passes with zero failures;
- Astro Cloudflare server build passes;
- Wrangler production dry-run passes;
- PR review finds no Support/Order/OTA/Page-Builder scope creep.
