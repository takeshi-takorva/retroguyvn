import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const GENERATED_CONFIG = resolve('dist/server/wrangler.json');
const DB_BINDING = 'DB';
const DB_NAME = 'retroguyvn-db';
const DB_ID = 'ee89d627-5e03-49d2-b4bc-30a9be91a9a1';
const MEDIA_BINDING = 'MEDIA';
const MEDIA_BUCKET = 'retroguyvn-media';

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
// Remove fields that can make Wrangler treat this as a draft/provisionable binding.
delete db.preview_database_id;

config.r2_buckets ??= [];
let media = config.r2_buckets.find((item) => item?.binding === MEDIA_BINDING);
if (!media) {
  media = { binding: MEDIA_BINDING };
  config.r2_buckets.push(media);
}
media.bucket_name = MEDIA_BUCKET;
delete media.preview_bucket_name;

writeFileSync(GENERATED_CONFIG, `${JSON.stringify(config, null, 2)}\n`);

const verified = JSON.parse(readFileSync(GENERATED_CONFIG, 'utf8'));
const verifiedDb = verified.d1_databases?.find((item) => item?.binding === DB_BINDING);
const verifiedMedia = verified.r2_buckets?.find((item) => item?.binding === MEDIA_BINDING);

if (verifiedDb?.database_id !== DB_ID || verifiedMedia?.bucket_name !== MEDIA_BUCKET) {
  console.error('[wrangler-patch] Verification failed after writing generated config.');
  process.exit(1);
}

console.log(`[wrangler-patch] ${DB_BINDING} pinned to ${DB_NAME} (${DB_ID}).`);
console.log(`[wrangler-patch] ${MEDIA_BINDING} pinned to R2 bucket ${MEDIA_BUCKET}.`);
