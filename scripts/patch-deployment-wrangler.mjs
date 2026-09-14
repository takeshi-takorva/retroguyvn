import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

const ROOT_DIR = resolve('.');
const SERVER_DIR = resolve('dist/server');
const GENERATED = resolve(SERVER_DIR, 'wrangler.json');
const PRODUCTION = resolve(SERVER_DIR, 'wrangler.production.json');
const ROOT_CONFIG = resolve('wrangler.jsonc');
const REDIRECT = resolve('.wrangler/deploy/config.json');
const ROOT_MAIN = './src/news-worker-entry.js';
const DB_ID = 'ee89d627-5e03-49d2-b4bc-30a9be91a9a1';
const FINGERPRINT = 'retroguyvn-web-2.2.0-news-m1-uploadfix1';
const R2_DISABLED = existsSync(resolve('.cloudflare-r2-disabled'));
const PIN_ROOT = process.env.CI === 'true' || process.env.WORKERS_CI === '1';

if (!existsSync(GENERATED)) throw new Error(`Generated Wrangler config not found: ${GENERATED}`);
const config = JSON.parse(readFileSync(GENERATED, 'utf8'));
const generatedWorkerMain = config.main;

if (typeof generatedWorkerMain !== 'string' || !generatedWorkerMain.trim()) {
  throw new Error('Astro generated Wrangler config has no server main entrypoint');
}
const normalizedMain = generatedWorkerMain.replaceAll('\\', '/');
if (config.no_bundle === true && /(^|\/)src\/news-worker-entry\.js$/.test(normalizedMain)) {
  throw new Error('Refusing to deploy raw custom Worker with no_bundle=true');
}

config.d1_databases ??= [];
let db = config.d1_databases.find(x => x?.binding === 'DB');
if (!db) config.d1_databases.push(db = { binding: 'DB' });
db.database_name = 'retroguyvn-db';
db.database_id = DB_ID;
delete db.preview_database_id;

config.r2_buckets ??= [];
if (R2_DISABLED) {
  config.r2_buckets = config.r2_buckets.filter(x => !['MEDIA', 'FIRMWARE'].includes(x?.binding));
} else {
  let media = config.r2_buckets.find(x => x?.binding === 'MEDIA');
  if (!media) config.r2_buckets.push(media = { binding: 'MEDIA' });
  media.bucket_name = 'retroguyvn-media';
  delete media.preview_bucket_name;

  let firmware = config.r2_buckets.find(x => x?.binding === 'FIRMWARE');
  if (!firmware) config.r2_buckets.push(firmware = { binding: 'FIRMWARE' });
  delete firmware.bucket_name;
  delete firmware.preview_bucket_name;
}

config.vars ??= {};
config.vars.CMS_ARCHITECTURE = R2_DISABLED ? 'm2-d1-legacy-media' : 'm2-explicit-resources';
config.vars.CMS_R2_STATE = R2_DISABLED ? 'not-entitled' : 'ready';
config.vars.DR_OTA_STORAGE = R2_DISABLED ? 'unavailable' : 'r2-firmware';
config.vars.DEPLOY_FINGERPRINT = FINGERPRINT;

const serialized = `${JSON.stringify(config, null, 2)}\n`;
writeFileSync(GENERATED, serialized);
writeFileSync(PRODUCTION, serialized);
mkdirSync(resolve('.wrangler/deploy'), { recursive: true });
writeFileSync(REDIRECT, `${JSON.stringify({ configPath: '../../dist/server/wrangler.production.json' }, null, 2)}\n`);

function remapFromServer(value) {
  if (typeof value !== 'string' || !value || isAbsolute(value)) return value;
  const absolute = resolve(SERVER_DIR, value);
  let out = relative(ROOT_DIR, absolute).replaceAll('\\', '/');
  if (!out.startsWith('.')) out = `./${out}`;
  return out;
}

if (PIN_ROOT) {
  const root = structuredClone(config);
  root.$schema = './node_modules/wrangler/config-schema.json';
  root.main = ROOT_MAIN;
  delete root.no_bundle;
  if (root.assets?.directory) root.assets.directory = remapFromServer(root.assets.directory);
  writeFileSync(ROOT_CONFIG, `${JSON.stringify(root, null, 2)}\n`);
}

const verified = JSON.parse(readFileSync(PRODUCTION, 'utf8'));
const verifiedDb = verified.d1_databases?.find(x => x?.binding === 'DB');
if (verified.main !== generatedWorkerMain || verifiedDb?.database_id !== DB_ID) {
  throw new Error('Production Wrangler verification failed');
}
if (PIN_ROOT) {
  const root = JSON.parse(readFileSync(ROOT_CONFIG, 'utf8'));
  if (root.main !== ROOT_MAIN || Object.hasOwn(root, 'no_bundle')) {
    throw new Error('Root Wrangler verification failed');
  }
}

console.log(`[wrangler-patch] Production Worker main preserved from Astro build: ${generatedWorkerMain}.`);
console.log(`[wrangler-patch] Fingerprint: ${FINGERPRINT}.`);
