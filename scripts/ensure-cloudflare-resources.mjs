import { spawnSync } from 'node:child_process';

const BUCKET = 'retroguyvn-media';
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

const whoami = run(['whoami']);
if (whoami.status !== 0) {
  console.log('[cloudflare] No authenticated Wrangler session; skip remote resource ensure step.');
  process.exit(0);
}

const list = run(['r2', 'bucket', 'list']);
if (list.status !== 0) {
  console.error('[cloudflare] Unable to list R2 buckets.');
  console.error(output(list));
  process.exit(1);
}

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
  console.error('[cloudflare] Failed to create R2 bucket.');
  console.error(text);
  process.exit(1);
}

console.log(`[cloudflare] R2 bucket ${BUCKET} is ready.`);
