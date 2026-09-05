# RetroGuy CMS M2.0

M2.0 migrates the CMS core from the M1.1 Durable Object prototype toward a Cloudflare-native D1 + R2 architecture while preserving zero-downtime fallback.

## What changes

- Astro now runs with `@astrojs/cloudflare` in server mode.
- The Worker uses Astro's Cloudflare handler as the application runtime.
- Homepage content supports revisioned D1 storage.
- Media supports R2 storage with D1 metadata.
- Existing M1.1 Durable Object storage remains available as a fallback and migration source.
- Existing `/media/<id>` URLs remain valid during and after migration.

## Active modes

### M1.1 fallback

If `DB` and `MEDIA` bindings do not exist, the website continues using the existing Durable Object exactly as before.

### M2 hybrid

When both bindings exist:

- Homepage draft/published content is stored in D1.
- Every save creates a new `page_revisions` version.
- Publish moves the page's `published_revision_id` to the current draft revision.
- New uploaded images are stored in R2 and described by `media_nodes` in D1.
- Old Durable Object images remain readable until migrated.

## Cloudflare resources

Create once in an authenticated Cloudflare environment:

```bash
npx wrangler d1 create retroguy-cms
npx wrangler r2 bucket create retroguy-media
```

Copy the D1 database ID into `wrangler.jsonc`, then add these bindings:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "retroguy-cms",
    "database_id": "<D1_DATABASE_ID>",
    "migrations_dir": "migrations"
  }
],
"r2_buckets": [
  {
    "binding": "MEDIA",
    "bucket_name": "retroguy-media"
  }
]
```

Apply the canonical schema:

```bash
npx wrangler d1 migrations apply retroguy-cms --remote
```

M2 also executes `CREATE TABLE IF NOT EXISTS` at runtime so a missing schema cannot silently destroy content; the SQL file remains the canonical migration history.

## Migration

After bindings are deployed, open:

```text
https://retroguyvn.com/admin/system
```

The console shows D1/R2 readiness. `Run migration` performs the following:

1. Bootstrap the Home page and its current draft/published content into D1.
2. Preserve revision history from the first M2 revision onward.
3. Copy every M1.1 media object into R2.
4. Preserve each legacy media ID, so `/media/<id>` URLs do not change.
5. Record migration completion in `cms_meta`.

The migration is idempotent: already migrated media is skipped.

## D1 tables

- `pages`
- `page_revisions`
- `media_nodes`
- `media_usage`
- `global_settings`
- `cms_meta`

`media_nodes` is deliberately folder-ready for M2.3. R2 object keys are independent from the virtual folder hierarchy so Move/Rename operations will not require copying physical objects.

## M2.0 compatibility rule

Do not remove the `CMS` Durable Object binding or `CMSStore` class yet. It is retained until D1/R2 migration is confirmed on production. Removal belongs to a later cleanup milestone after rollback confidence is established.
