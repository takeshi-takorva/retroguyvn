import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const CONFIG = 'dist/server/wrangler.production.json';
const configPath = resolve(CONFIG);
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
    env: process.env
  });

  if (result.error) {
    console.error(`[cloudflare-preview] Failed to start ${command}:`, result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!existsSync(configPath)) {
  console.log('[cloudflare-preview] Astro output is missing; running npm run build first.');
  run(npmCommand, ['run', 'build']);
}

if (!existsSync(configPath)) {
  console.error(`[cloudflare-preview] Required generated config is still missing: ${CONFIG}`);
  process.exit(1);
}

console.log(`[cloudflare-preview] Uploading Worker preview version with ${CONFIG}.`);
run(npxCommand, ['wrangler', 'versions', 'upload', '--config', CONFIG]);
