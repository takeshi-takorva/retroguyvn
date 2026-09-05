import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';

const ROOT_DIR = resolve('.');
const GENERATED_DIR = resolve('dist/server');
const GENERATED_CONFIG = resolve(GENERATED_DIR, 'wrangler.json');
const PRODUCTION_CONFIG = resolve(GENERATED_DIR, 'wrangler.production.json');
const ROOT_CONFIG = resolve('wrangler.jsonc');
const REDIRECT_DIR = resolve('.wrangler/deploy');
const REDIRECT_CONFIG = resolve('.wrangler/deploy/config.json');
const R2_DISABLED_MARKER = resolve('.cloudflare-r2-disabled');
const DB_BINDING = 'DB';
const DB_NAME = 'retroguyvn-db';
const DB_ID = 'ee89d627-5e03-49d2-b4bc-30a9be91a9a1';
const MEDIA_BINDING = 'MEDIA';
const MEDIA_BUCKET = 'retroguyvn-media';
const DEPLOY_FINGERPRINT = 'retroguyvn-web-2.0.7';
const PIN_ROOT_CONFIG = process.env.CI === 'true' || process.env.WORKERS_CI === '1';
const R2_DISABLED = existsSync(R2_DISABLED_MARKER);

if (!existsSync(GENERATED_CONFIG)) {
  console.error(`[wrangler-patch] Generated config not found: ${GENERATED_CONFIG}`);
  process.exit(1);
}

let config;
try {
  config = JSON.parse(readFileSync(GENERATED_CONFIG, 'utf8'));
} catch (error) {
  console.error('[wrangler-patch] Unable to parse generated Astro Wrangler config.');
  console.error(error);
  process.exit(1);
}

config.d1_databases ??= [];
let db = config.d1_databases.find((item) => item?.binding === DB_BINDING);
if (!db) {
  db = { binding: DB_BINDING };
  config.d1_databases.push(db);
}
db.database_name = DB_NAME;
db.database_id = DB_ID;
delete db.preview_database_id;

config.r2_buckets ??= [];
if (R2_DISABLED) {
  config.r2_buckets = config.r2_buckets.filter((item) => item?.binding !== MEDIA_BINDING);
} else {
  let media = config.r2_buckets.find((item) => item?.binding === MEDIA_BINDING);
  if (!media) {
    media = { binding: MEDIA_BINDING };
    config.r2_buckets.push(media);
  }
  media.bucket_name = MEDIA_BUCKET;
  delete media.preview_bucket_name;
}

config.vars ??= {};
config.vars.CMS_ARCHITECTURE = R2_DISABLED ? 'm2-d1-legacy-media' : 'm2-explicit-resources';
config.vars.CMS_R2_STATE = R2_DISABLED ? 'not-entitled' : 'ready';
config.vars.DEPLOY_FINGERPRINT = DEPLOY_FINGERPRINT;

const serialized = `${JSON.stringify(config, null, 2)}\n`;
writeFileSync(GENERATED_CONFIG, serialized);
writeFileSync(PRODUCTION_CONFIG, serialized);

mkdirSync(REDIRECT_DIR, { recursive: true });
writeFileSync(REDIRECT_CONFIG, `${JSON.stringify({ configPath: '../../dist/server/wrangler.production.json' }, null, 2)}\n`);

function remapGeneratedPath(value) {
  if (typeof value !== 'string' || !value || isAbsolute(value)) return value;
  const absolute = resolve(GENERATED_DIR, value);
  let out = relative(ROOT_DIR, absolute).replaceAll('\\', '/');
  if (!out.startsWith('.')) out = `./${out}`;
  return out;
}

if (PIN_ROOT_CONFIG) {
  const rootConfig = structuredClone(config);
  rootConfig.$schema = './node_modules/wrangler/config-schema.json';
  if (rootConfig.main) rootConfig.main = remapGeneratedPath(rootConfig.main);
  if (rootConfig.assets?.directory) rootConfig.assets.directory = remapGeneratedPath(rootConfig.assets.directory);
  writeFileSync(ROOT_CONFIG, `${JSON.stringify(rootConfig, null, 2)}\n`);
  console.log(`[wrangler-patch] CI root config pinned for deploy: ${rootConfig.main}.`);
}

const verified = JSON.parse(readFileSync(PRODUCTION_CONFIG, 'utf8'));
const verifiedDb = verified.d1_databases?.find((item) => item?.binding === DB_BINDING);
const verifiedMedia = verified.r2_buckets?.find((item) => item?.binding === MEDIA_BINDING);
const redirect = JSON.parse(readFileSync(REDIRECT_CONFIG, 'utf8'));

if (
  verifiedDb?.database_id !== DB_ID ||
  (!R2_DISABLED && verifiedMedia?.bucket_name !== MEDIA_BUCKET) ||
  (R2_DISABLED && verifiedMedia) ||
  verified.vars?.DEPLOY_FINGERPRINT !== DEPLOY_FINGERPRINT ||
  redirect?.configPath !== '../../dist/server/wrangler.production.json'
) {
  console.error('[wrangler-patch] Verification failed after writing production deployment config.');
  process.exit(1);
}

if (PIN_ROOT_CONFIG) {
  const rootVerified = JSON.parse(readFileSync(ROOT_CONFIG, 'utf8'));
  const rootDb = rootVerified.d1_databases?.find((item) => item?.binding === DB_BINDING);
  const rootMedia = rootVerified.r2_buckets?.find((item) => item?.binding === MEDIA_BINDING);
  if (
    rootDb?.database_id !== DB_ID ||
    (!R2_DISABLED && rootMedia?.bucket_name !== MEDIA_BUCKET) ||
    (R2_DISABLED && rootMedia) ||
    rootVerified.vars?.DEPLOY_FINGERPRINT !== DEPLOY_FINGERPRINT
  ) {
    console.error('[wrangler-patch] CI root deployment config verification failed.');
    process.exit(1);
  }
}

console.log(`[wrangler-patch] ${DB_BINDING} pinned to ${DB_NAME} (${DB_ID}).`);
if (R2_DISABLED) {
  console.log('[wrangler-patch] MEDIA binding omitted because Cloudflare account R2 is not enabled.');
  console.log('[wrangler-patch] CMS mode: D1 content + legacy Durable Object media fallback.');
} else {
  console.log(`[wrangler-patch] ${MEDIA_BINDING} pinned to R2 bucket ${MEDIA_BUCKET}.`);
}
console.log('[wrangler-patch] Deploy redirect forced to dist/server/wrangler.production.json.');
console.log(`[wrangler-patch] Fingerprint: ${DEPLOY_FINGERPRINT}.`);
