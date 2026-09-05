# CMS M2.0B — Production Provisioning

M2.0B enables Cloudflare automatic provisioning for the CMS storage bindings:

- `DB` — D1 database
- `MEDIA` — R2 bucket

The bindings are declared without account-specific IDs/names. Wrangler/Cloudflare provisions the missing resources during production deployment and keeps them linked to the Worker.

## Production bootstrap

After both bindings are available, the application automatically:

1. creates/updates the CMS schema in D1;
2. bootstraps the Home page revision history from the M1.1 Durable Object;
3. copies legacy uploaded images to R2 while preserving `/media/<id>` URLs;
4. records `m2:migrated_legacy_at` only after a clean migration;
5. switches storage status to `m2-active`.

The M1.1 Durable Object remains available as read fallback during M2.0B for recovery. Migration is idempotent: existing D1 rows/R2 objects are skipped.

## Verification

Open `/admin/system` and verify:

- D1: READY
- R2: READY
- Schema: READY
- Migration: completed
- Active mode: `m2-active`

No manual D1/R2 IDs are committed to this repository.
