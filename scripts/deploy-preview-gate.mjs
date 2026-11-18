const CANARY_BRANCHES = new Set([
  'feature/dr-ota-cloudflare',
  'feature/dr-ota-v1-contract-sync',
  'feature/ota-simple-v2'
]);
const isWorkersBuild = process.env.WORKERS_CI === '1';
const branch = String(process.env.WORKERS_CI_BRANCH || '').trim();

if (isWorkersBuild && branch && !CANARY_BRANCHES.has(branch)) {
  console.log(`[cloudflare-preview] Skipping Worker version upload for non-OTA preview branch: ${branch}.`);
  process.exit(0);
}

await import('./deploy-preview.mjs');
