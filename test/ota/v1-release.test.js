import test from 'node:test';
import assert from 'node:assert/strict';
import { createOtaService } from '../../src/ota/service.js';

function repo(overrides = {}) {
  return {
    async findReleaseByIdentity() { return null; },
    async findHardwareByCode(code) { return { id: 'hw04', code, enabled: 1 }; },
    async createRelease(release, hardwareIds) { return { ...release, targets: ['HW0.4'], target_ids: hardwareIds }; },
    async getRelease() { return null; },
    async listHardware() { return []; },
    async listReleases() { return []; },
    async listDevices() { return []; },
    async listEvents() { return []; },
    ...overrides
  };
}

function signedForm(bytes = Uint8Array.from([0xe9, 1, 2, 3])) {
  const form = new FormData();
  form.set('file', new File([bytes], 'DR_Game_FW.bin', { type: 'application/octet-stream' }));
  form.set('product', 'DigitalRealm');
  form.set('release_id', 'dr-game-r60');
  form.set('release_seq', '60');
  form.set('version', '0.4.0');
  form.set('fix', '60');
  form.set('build_id', '260928_DR_v0.4.0_fix060');
  form.set('channel', 'stable');
  form.set('secure_version', '1');
  form.set('min_boot_version', '0.1-fix023');
  form.set('asset_version', 'DR_ASSET_12');
  form.set('mandatory', '0');
  form.set('signature_alg', 'RSA-PSS-SHA256');
  form.set('signature', 'A'.repeat(128));
  form.set('release_notes', 'Canonical OTA v1 release');
  form.append('hardware', 'HW0.4');
  return form;
}

test('canonical signed release persists OTA v1 metadata without changing server-computed SHA/size', async () => {
  let stored = null;
  const bucket = { async put(key, body, options) { stored = { key, body, options }; }, async delete() {} };
  const service = createOtaService({ repo: repo(), firmwareBucket: bucket, now: () => new Date('2026-09-28T04:00:00Z') });
  const release = await service.createRelease(signedForm(), 'tester');
  assert.equal(release.id, 'dr-game-r60');
  assert.equal(release.release_seq, 60);
  assert.equal(release.product, 'DigitalRealm');
  assert.equal(release.game_fix, 60);
  assert.equal(release.min_boot_version, '0.1-fix023');
  assert.equal(release.signature_alg, 'RSA-PSS-SHA256');
  assert.equal(release.signature.length, 128);
  assert.equal(release.mandatory, 0);
  assert.equal(release.size_bytes, 4);
  assert.match(release.sha256, /^[0-9a-f]{64}$/);
  assert.equal(stored.options.customMetadata['release-seq'], '60');
});

test('canonical Game FW rejects an image larger than the 0x480000 A/B slot', async () => {
  const tooLarge = new Uint8Array(0x480001);
  tooLarge[0] = 0xe9;
  const service = createOtaService({
    repo: repo(),
    firmwareBucket: { async put() { throw new Error('must not upload'); }, async delete() {} }
  });
  await assert.rejects(() => service.createRelease(signedForm(tooLarge), 'tester'),
    error => error.status === 413 && error.code === 'firmware_exceeds_game_slot');
});

test('canonical publish refuses unsigned v1 release metadata', async () => {
  const release = {
    id: 'dr-game-r60', product: 'DigitalRealm', release_seq: 60, status: 'draft',
    targets: ['HW0.4'], target_hardware: [{ code: 'HW0.4', enabled: 1 }],
    esp_image_valid: 1, r2_key: 'ota/dr-game/dr-game-r60/a.bin', size_bytes: 4,
    signature_alg: null, signature: null, min_boot_version: '0.1-fix023'
  };
  const service = createOtaService({
    repo: repo({ async getRelease() { return release; }, async setReleaseStatus() { throw new Error('must not publish'); } }),
    firmwareBucket: { async head() { return { size: 4 }; } }
  });
  await assert.rejects(() => service.publishRelease('dr-game-r60'),
    error => error.status === 409 && error.code === 'signed_release_metadata_required');
});
