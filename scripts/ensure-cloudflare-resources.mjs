import { spawnSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const BUCKET = 'retroguyvn-media';
const R2_DISABLED_MARKER = resolve('.cloudflare-r2-disabled');
const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function run(args) {
  return spawnSync(NPX, ['wrangler', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function output(result) {
  return `${result.stdout || ''}\n${result.stderr || ''}`.trim();
}

function markR2Disabled(reason) {
  writeFileSync(R2_DISABLED_MARKER, `${reason}\n`);
  console.warn('[cloudflare] R2 is not enabled for this account; continuing in D1 + legacy-media mode.');
  console.warn('[cloudflare] Enable R2 in Cloudflare Dashboard → Storage & databases → R2, then redeploy to activate R2 migration.');
}

function clearR2Disabled() {
  rmSync(R2_DISABLED_MARKER, { force: true });
}

function isR2NotEntitled(text) {
  return /code:\s*10042/i.test(text) || /please enable r2/i.test(text) || /not entitled/i.test(text);
}

// GitHub Actions validates the project only. It has no Cloudflare API token,
// so remote resource provisioning must be skipped there.
if (process.env.GITHUB_ACTIONS === 'true') {
  clearR2Disabled();
  console.log('[cloudflare] GitHub Actions detected; skip remote R2 provisioning.');
  process.exit(0);
}

const whoami = run(['whoami']);
if (whoami.status !== 0) {
  clearR2Disabled();
  console.log('[cloudflare] No authenticated Wrangler session; skip remote resource ensure step.');
  process.exit(0);
}

const list = run(['r2', 'bucket', 'list']);
if (list.status !== 0) {
  const text = output(list);
  if (isR2NotEntitled(text)) {
    markR2Disabled('Cloudflare R2 unavailable: account is not entitled (10042).');
    process.exit(0);
  }
  console.error('[cloudflare] Unable to list R2 buckets in authenticated deployment environment.');
  console.error(text);
  process.exit(1);
}

clearR2Disabled();

if (output(list).includes(BUCKET)) {
  console.log(`[cloudflare] R2 bucket ${BUCKET} already exists.`);
  process.exit(0);
}

console.log(`[cloudflare] Creating R2 bucket ${BUCKET}...`);
const create = run(['r2', 'bucket', 'create', BUCKET]);
if (create.status !== 0) {
  const text = output(create);
  if (/already exists/i.test(text)) {
    console.log(`[cloudflare] R2 bucket ${BUCKET} already exists.`);
    process.exit(0);
  }
  if (isR2NotEntitled(text)) {
    markR2Disabled('Cloudflare R2 unavailable while creating bucket: account is not entitled (10042).');
    process.exit(0);
  }
  console.error('[cloudflare] Failed to create R2 bucket.');
  console.error(text);
  process.exit(1);
}

clearR2Disabled();
console.log(`[cloudflare] R2 bucket ${BUCKET} is ready.`);
