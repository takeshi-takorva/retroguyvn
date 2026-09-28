import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function rootConfig() {
  return JSON.parse(await readFile(new URL('../../wrangler.jsonc', import.meta.url), 'utf8'));
}

test('MEDIA stays pinned while FIRMWARE is auto-provisioned by Workers Builds', async () => {
  const config = await rootConfig();
  const media = config.r2_buckets?.find(item => item.binding === 'MEDIA');
  const firmware = config.r2_buckets?.find(item => item.binding === 'FIRMWARE');

  assert.equal(media?.bucket_name, 'retroguyvn-media');
  assert.ok(firmware, 'FIRMWARE binding must exist');
  assert.equal(Object.hasOwn(firmware, 'bucket_name'), false, 'FIRMWARE must not hard-code a bucket name');
  assert.equal(Object.hasOwn(firmware, 'preview_bucket_name'), false, 'FIRMWARE preview must use Workers Builds provisioning');
});
