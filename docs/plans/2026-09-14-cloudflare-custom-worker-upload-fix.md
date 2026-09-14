# Cloudflare custom Worker upload fix

## Problem

Cloudflare Workers Builds succeeds through Astro build and Wrangler dry-run, but `wrangler versions upload` fails with error 10021 because the uploaded source module still imports `@astrojs/cloudflare/handler` as an unresolved bare module.

## Root cause

Astro compiles the source custom Worker selected by root `wrangler.jsonc` into `dist/server/entry.mjs` and generates a deployment config with `no_bundle: true`. The post-build patch incorrectly replaces that compiled `main` with `../../src/news-worker-entry.js`. With `no_bundle: true`, Wrangler then uploads the raw source module graph instead of Astro's compiled Worker, leaving the npm handler import unresolved on Cloudflare.

## Fix

1. Keep root `wrangler.jsonc` pointing to `./src/news-worker-entry.js` so Astro receives the custom Worker as build input.
2. After `astro build`, preserve the generated `config.main` (normally `entry.mjs`) in `dist/server/wrangler.production.json`.
3. Keep D1/R2/vars patching unchanged.
4. Keep CI root config pinned to the source custom Worker for the next clean build.
5. Add regression tests that forbid replacing the generated production `main` with the source path.
6. Verify with `npm test`, `npm run build`, and Wrangler dry-run in GitHub Actions.
