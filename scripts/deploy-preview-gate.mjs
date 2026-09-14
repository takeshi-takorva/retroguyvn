const CANARY_BRANCH = 'feature/dr-ota-cloudflare';
const isWorkersBuild = process.env.WORKERS_CI === '1';
const branch = String(process.env.WORKERS_CI_BRANCH || '').trim();

if (isWorkersBuild && branch && branch !== CANARY_BRANCH) {
  console.log(`[cloudflare-preview] Skipping Worker version upload for non-OTA preview branch: ${branch}.`);
  process.exit(0);
}

await import('./deploy-preview.mjs');
