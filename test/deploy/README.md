# Deploy regression tests

These tests protect the Cloudflare Workers deployment contract. The root Wrangler config selects the source custom Worker for Astro to build, while the generated production Wrangler config must continue to deploy Astro's compiled server entrypoint rather than the raw source graph.
