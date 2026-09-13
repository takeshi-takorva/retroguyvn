import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));

test('preview deploy uses the repository wrapper', () => {
  assert.equal(packageJson.scripts['deploy:preview'], 'node scripts/deploy-preview.mjs');
});

test('preview wrapper builds missing Astro output before uploading a Worker version', async () => {
  const source = await readFile(new URL('../../scripts/deploy-preview.mjs', import.meta.url), 'utf8');
  assert.match(source, /dist\/server\/wrangler\.production\.json/);
  assert.match(source, /npm[^\n]*run[^\n]*build/);
  assert.match(source, /wrangler[^\n]*versions[^\n]*upload/);
});

test('preview upload is pinned to the generated production Wrangler config', async () => {
  const source = await readFile(new URL('../../scripts/deploy-preview.mjs', import.meta.url), 'utf8');
  assert.match(source, /'versions', 'upload'/);
  assert.match(source, /'--config', CONFIG/);
  assert.match(source, /const CONFIG = 'dist\/server\/wrangler\.production\.json'/);
});

test('OTA feature branch performs a zero-traffic canary only on its exact branch', async () => {
  const source = await readFile(new URL('../../scripts/deploy-preview.mjs', import.meta.url), 'utf8');
  assert.match(source, /WORKERS_CI_BRANCH/);
  assert.match(source, /feature\/dr-ota-cloudflare/);
  assert.match(source, /'deployments', 'status'/);
  assert.match(source, /'--json'/);
  assert.match(source, /'versions', 'deploy'/);
  assert.match(source, /@0%/);
  assert.match(source, /@100%/);
});

test('OTA canary smoke test pins requests to the uploaded version and rolls back on failure', async () => {
  const source = await readFile(new URL('../../scripts/deploy-preview.mjs', import.meta.url), 'utf8');
  assert.match(source, /Cloudflare-Workers-Version-Overrides/);
  assert.match(source, /const BASE_URL = 'https:\/\/retroguyvn\.com'/);
  assert.match(source, /requestCanary\('\/api\/dr\/ota'/);
  assert.match(source, /X-DR-Device-ID/);
  assert.match(source, /X-DR-HW-Version/);
  assert.match(source, /rollback/i);
  assert.match(source, /@100%/);
});
