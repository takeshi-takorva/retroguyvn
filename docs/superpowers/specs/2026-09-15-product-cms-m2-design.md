# RetroGuy Web CMS v3 — Product CMS M2 Design

## Goal

Turn the M1 static Product catalogue into a managed Product CMS backed by Cloudflare D1 and the existing shared media/auth infrastructure, while keeping News, Homepage CMS, OTA and Support behaviour unchanged.

## Public routes

- `/product` — product catalogue backed by published Product CMS data.
- `/product/[slug]` — public product detail page backed by the published revision for that product.
- `/api/products` — public JSON list of published products.
- `/api/products/:slug` — public JSON detail for one published product.

Only published products are visible to public endpoints and pages.

## Admin routes

- `/admin/products` — Product Manager UI.
- `GET /api/admin/products` — list all products, including drafts.
- `POST /api/admin/products` — create a draft product.
- `GET /api/admin/products/:id` — load one product with current draft content.
- `PUT /api/admin/products/:id` — save a new immutable draft revision and update structured metadata.
- `POST /api/admin/products/:id/publish` — publish the current draft revision.
- `POST /api/admin/products/:id/unpublish` — remove the product from public endpoints without deleting its revision history.
- `POST /api/admin/products/:id/remove` — delete the product and its revisions after media usage constraints are satisfied.

All admin product routes reuse the existing admin session/auth mechanism and same-origin mutation guard already used by News.

## Data model

### `products`

Fields:

- `id TEXT PRIMARY KEY`
- `slug TEXT NOT NULL UNIQUE`
- `published_slug TEXT UNIQUE`
- `name TEXT NOT NULL`
- `subtitle TEXT NOT NULL DEFAULT ''`
- `excerpt TEXT NOT NULL DEFAULT ''`
- `category TEXT NOT NULL DEFAULT 'Handheld'`
- `status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published'))`
- `availability TEXT NOT NULL DEFAULT 'development' CHECK(availability IN ('development','coming-soon','available','discontinued'))`
- `featured INTEGER NOT NULL DEFAULT 0 CHECK(featured IN (0,1))`
- `sort_order INTEGER NOT NULL DEFAULT 0`
- `cover_media_id TEXT`
- `draft_revision_id TEXT`
- `published_revision_id TEXT`
- `published_at TEXT`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`
- `created_by TEXT`

### `product_revisions`

Fields:

- `id TEXT PRIMARY KEY`
- `product_id TEXT NOT NULL`
- `version INTEGER NOT NULL`
- `content_json TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `created_by TEXT`
- `published_at TEXT`
- foreign key to `products(id)` with cascade delete
- unique `(product_id, version)`

The revision JSON snapshot contains product-detail content rather than duplicating every presentational field into the `products` table.

## Revision content schema

The normalized product revision contains:

```json
{
  "description": "Long-form product description",
  "features": [
    { "title": "Physical Controls", "text": "..." }
  ],
  "specs": [
    { "label": "Display", "value": "..." }
  ],
  "galleryMediaIds": ["media-id-1", "media-id-2"],
  "cta": {
    "label": "Get support",
    "href": "/support"
  }
}
```

Validation rules:

- `name`: 1–120 characters.
- `slug`: normalized URL-safe slug; unique.
- `subtitle`: maximum 180 characters.
- `excerpt`: maximum 500 characters.
- `category`: maximum 80 characters.
- `description`: maximum 4000 words.
- `features`: maximum 20 entries; each title maximum 100 characters and text maximum 500 characters.
- `specs`: maximum 40 entries; label maximum 100 characters and value maximum 300 characters.
- `galleryMediaIds`: maximum 20 unique media IDs.
- `cta.label`: maximum 80 characters.
- `cta.href`: must be a site-relative path beginning with `/`.
- `sort_order`: integer clamped to a safe signed 32-bit range.

## Publish semantics

Draft edits are immutable revisions. Saving a draft creates the next revision version and points `draft_revision_id` at it.

Publishing copies the current draft pointer to `published_revision_id`, sets `status='published'`, records `published_slug=slug`, and records `published_at`. The public detail endpoint resolves by `published_slug` and reads only `published_revision_id`.

Editing a published product creates/updates draft state but does not alter the public revision until Publish is pressed again.

Unpublish changes `status` back to `draft` and removes it from public queries while retaining both revision history and the previous published revision pointer for audit/history purposes.

## Featured product behaviour

Multiple records may technically store `featured=1` while being edited, but the public catalogue selects exactly one featured published product deterministically:

1. lowest `sort_order`;
2. then newest `published_at`;
3. then stable `id` ordering.

Admin UI will present `featured` as a toggle. M2 does not enforce a global uniqueness constraint because doing so complicates draft editing and D1 migrations unnecessarily.

## Public catalogue behaviour

`GET /api/products` returns published product summaries ordered by:

1. `featured DESC`;
2. `sort_order ASC`;
3. `published_at DESC`;
4. `id ASC`.

The response includes `items` and `featuredId`.

The `/product` page renders:

1. existing Product hero;
2. featured product section when one published product exists;
3. catalogue grid for all published products;
4. an honest empty state if D1 has no published products.

No hard-coded fallback product is rendered after the CMS is active.

## Product detail layout

`/product/[slug]` uses the shared `BaseLayout` and includes:

1. category and availability metadata;
2. product name, subtitle and excerpt;
3. cover image;
4. long description;
5. feature highlights;
6. technical specifications;
7. gallery using shared media URLs;
8. CTA, defaulting to `/support` when no custom CTA is set.

Unknown or unpublished slugs return 404.

## Media integration

Product covers and gallery items use the existing `MEDIA` bucket and existing media records/URLs rather than introducing a second media store.

Product CMS adds media-usage discovery so deletion from the shared admin media library is blocked when a media ID is referenced by:

- `products.cover_media_id`;
- a draft product revision gallery;
- a published product revision gallery.

The current News media protection remains active. Media deletion succeeds only when neither News nor Product references the media object.

## Seed/bootstrap behaviour

M2 includes an idempotent Product bootstrap that creates DR Portal only when the `products` table is empty. The bootstrap creates a published initial product using existing DR Portal copy and current product-family asset when that asset can be represented through the existing media system; otherwise the initial product is created without a media ID rather than inventing one.

The bootstrap must never overwrite products after an administrator has created or edited Product CMS data.

## Admin Product Manager

`/admin/products` follows the visual and interaction conventions of `/admin/news` but uses product-specific structured fields.

The screen contains:

- product list/sidebar with status, availability, featured state and ordering;
- New Product button;
- metadata editor: Name, Slug, Subtitle, Excerpt, Category, Availability, Featured, Sort Order;
- Cover selector using shared Media Library;
- Description editor;
- repeatable Features editor;
- repeatable Specifications editor;
- repeatable Gallery media selector;
- CTA label/path;
- Save Draft, Publish, Unpublish and Remove actions;
- public preview/open link when the product has a published slug.

M2 does not implement arbitrary page-builder blocks inside Product details. Structured Product fields are deliberate so the catalogue remains consistent and queryable.

## Worker integration

Create a Product dispatcher parallel to News and extend `src/news-worker-entry.js` rather than replacing the existing Worker stack. Route order must keep current OTA, legacy CMS and News behaviour intact.

Product admin routes use the existing `newsAdminSession`-style session probe; implementation may rename the helper to a neutral `adminSession` if it remains behaviourally identical.

## Error handling

- Validation failures: HTTP 422 with a concise message.
- Duplicate slug: HTTP 409.
- Missing product/admin item: HTTP 404.
- Unauthorized admin access: HTTP 401.
- Cross-origin mutation: HTTP 403.
- Missing D1 binding: HTTP 503.
- Unexpected server failures: HTTP 500 with a generic public/admin response; implementation must not leak stack traces.

## Migrations and runtime schema

Add `migrations/0004_products.sql` with the Product schema and matching runtime `ensureProductSchema(env)` statements. The runtime schema path follows the existing News pattern so fresh/dev databases can self-initialize while production remains migration-compatible.

## Tests

M2 regression coverage must include:

- schema tables/indexes;
- product normalization and validation;
- draft revision immutability/versioning;
- publish/unpublish semantics;
- public list ordering and featured selection;
- public detail isolation from unpublished draft edits;
- admin route auth/origin integration;
- media usage protection;
- bootstrap idempotency;
- `/product` dynamic data client/render contract;
- `/product/[slug]` detail page contract;
- `/admin/products` manager fields/actions;
- all existing News, Homepage CMS and OTA tests remain green;
- Astro build and Wrangler production dry-run succeed with compiled `entry.mjs` preserved.

## Non-goals

M2 does not implement:

- inventory counts;
- shopping cart;
- checkout or payments;
- order management;
- product variants/SKUs as transactional inventory;
- Dev Log publishing backend;
- Support ticket/email backend;
- generic page-builder blocks;
- OTA behaviour changes.

## Acceptance criteria

1. Admin can create, edit, publish, unpublish and remove products from `/admin/products`.
2. Published products appear on `/product`; drafts do not.
3. Each published product has a working `/product/[slug]` detail page.
4. Editing a published product does not change public content until republished.
5. Shared media cannot be deleted while referenced by Product or News.
6. DR Portal is bootstrapped only for a completely empty Product CMS and is never used to overwrite administrator content.
7. Existing News, Homepage CMS and OTA tests remain green.
8. Full Astro/Cloudflare dry-run build passes with production Worker entrypoint preserved.
