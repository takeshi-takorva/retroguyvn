import test from 'node:test';
import assert from 'node:assert/strict';
import { createOtaService } from '../../src/ota/service.js';
import { parseVersion } from '../../src/ota/core.js';

function fakeRepo(overrides = {}) {
  const devices = new Map();
  const events = [];
  const hardware = new Map([
    ['HW0.5', { id: 'hw05', code: 'HW0.5', enabled: 1 }],
    ['HW0.5.1', { id: 'hw051', code: 'HW0.5.1', enabled: 1 }]
  ]);
  const api = {
    async findHardwareByCode(code) { return hardware.get(code) || null; },
    async upsertDevice(value) { devices.set(value.deviceId, { ...(devices.get(value.deviceId) || {}), ...value }); },
    async setDeviceOffer(id, releaseId) { devices.set(id, { ...(devices.get(id) || {}), last_release_id: releaseId }); },
    async getDevice(id) { return devices.get(id) || null; },
    async appendEvent(value) { events.push(value); },
    async findNewestCompatibleRelease() { return null; },
    async listReleases() { return []; },
    async getRelease() { return null; },
    async createRelease(release, hardwareIds) { return { ...release, target_ids: hardwareIds }; },
    async updateRelease(id, patch, hardwareIds) { return { id, ...patch, target_ids: hardwareIds || [] }; },
    async updateReleaseFile(id, patch) { return { id, ...patch }; },
    async setReleaseStatus(id, status) { return { id, status }; },
    async deleteRelease() { return true; },
    async createHardware(value) { return { id: 'hw-new', enabled: 1, ...value }; },
    async updateHardware(id, patch) { return { id, ...patch }; },
    async markDeviceDownload() {},
    async incrementDownloadCount() {},
    async listHardware() { return [...hardware.values()]; },
    async listDevices() { return [...devices.values()]; },
    async listEvents() { return events; },
    ...overrides
  };
  api._devices = devices;
  api._events = events;
  return api;
}

function input(patch = {}) {
  return {
    deviceId: 'DEV001',
    hardwareCode: 'HW0.5.1',
    firmwareVersion: '1.9.0',
    firmwareSort: parseVersion('1.9.0').sort,
    bootVersion: '1.1.0',
    bootVersionSort: parseVersion('1.1.0').sort,
    channel: 'stable',
    ...patch
  };
}

function releaseForm() {
  const form = new FormData();
  form.set('file', new File([Uint8Array.from([0xE9, 1, 2, 3])], 'game.bin', { type: 'application/octet-stream' }));
  form.set('product', 'DR_GAME');
  form.set('version', '1.10.0');
  form.set('build_id', 'build-110');
  form.set('channel', 'stable');
  form.set('secure_version', '2');
  form.set('min_boot_version', '1.1.0');
  form.set('release_notes', 'release test');
  form.append('hardware', 'HW0.5.1');
  return form;
}

const meta = { ip: '127.0.0.1', userAgent: 'DR-Test' };

test('unknown hardware returns no update and clears offer pin', async () => {
  const repo = fakeRepo();
  const service = createOtaService({ repo, firmwareBucket: {} });
  const result = await service.checkForUpdate(input({ hardwareCode: 'HW9.9' }), meta);
  assert.equal(result.update_available, false);
  assert.equal(result.reason, 'unknown_hardware');
  assert.equal(repo._devices.get('DEV001').last_release_id, null);
});

test('offered update pins release to device and records event', async () => {
  const release = {
    id: 'rel-new', product: 'DR_GAME', version: '1.10.0', version_sort: parseVersion('1.10.0').sort,
    build_id: 'build-110', channel: 'stable', status: 'published', secure_version: 1,
    min_boot_version: '1.0.0', size_bytes: 4096, sha256: 'a'.repeat(64), release_notes: 'test',
    targets: ['HW0.5.1']
  };
  const repo = fakeRepo({ async findNewestCompatibleRelease() { return release; } });
  const service = createOtaService({ repo, firmwareBucket: {} });
  const result = await service.checkForUpdate(input(), meta);
  assert.equal(result.update_available, true);
  assert.equal(result.release_id, 'rel-new');
  assert.equal(repo._devices.get('DEV001').last_release_id, 'rel-new');
  assert.ok(repo._events.some(event => event.eventType === 'UPDATE_AVAILABLE'));
});

test('missing boot version cannot receive release that requires boot minimum', async () => {
  const release = {
    id: 'rel-new', version: '1.10.0', version_sort: parseVersion('1.10.0').sort,
    channel: 'stable', status: 'published', min_boot_version: '1.1.0', targets: ['HW0.5.1']
  };
  const repo = fakeRepo({
    async findNewestCompatibleRelease() { return null; },
    async listReleases() { return [release]; }
  });
  const service = createOtaService({ repo, firmwareBucket: {} });
  const result = await service.checkForUpdate(input({ bootVersion: null, bootVersionSort: null }), meta);
  assert.equal(result.update_available, false);
  assert.equal(result.reason, 'boot_version_required');
});

test('download authorization requires exact target and latest device offer', async () => {
  const release = { id: 'rel-1', status: 'published', r2_key: 'ota/a.bin', size_bytes: 4, targets: ['HW0.5.1'] };
  const repo = fakeRepo({ async getRelease() { return release; } });
  repo._devices.set('DEV001', { device_id: 'DEV001', hardware_code: 'HW0.5.1', last_release_id: 'rel-1' });
  const bucket = { async head() { return { size: 4 }; } };
  const service = createOtaService({ repo, firmwareBucket: bucket });
  const authorized = await service.authorizeDownload({ releaseId: 'rel-1', deviceId: 'DEV001', hardwareCode: 'HW0.5.1' });
  assert.equal(authorized.id, 'rel-1');

  await assert.rejects(
    () => service.authorizeDownload({ releaseId: 'rel-1', deviceId: 'DEV001', hardwareCode: 'HW0.5' }),
    error => error.status === 409 && error.code === 'hardware_not_authorized'
  );
  repo._devices.set('DEV001', { device_id: 'DEV001', hardware_code: 'HW0.5.1', last_release_id: 'rel-other' });
  await assert.rejects(
    () => service.authorizeDownload({ releaseId: 'rel-1', deviceId: 'DEV001', hardwareCode: 'HW0.5.1' }),
    error => error.status === 409
  );
});

test('new firmware is stored in R2 and persisted as draft with explicit target', async () => {
  let stored = null;
  const bucket = {
    async put(key, body, options) { stored = { key, body, options }; },
    async delete() {}
  };
  const repo = fakeRepo();
  const service = createOtaService({ repo, firmwareBucket: bucket, uuid: () => '12345678-1234-1234-1234-123456789abc', now: () => new Date('2026-09-13T10:00:00Z') });
  const release = await service.createRelease(releaseForm(), 'tester@example.com');
  assert.equal(release.status, 'draft');
  assert.deepEqual(release.target_ids, ['hw051']);
  assert.match(stored.key, /^ota\/dr-game\/dr-game-1\.10\.0-/);
  assert.equal(stored.options.customMetadata.product, 'DR_GAME');
  assert.ok(stored.body instanceof ArrayBuffer);
  assert.deepEqual([...new Uint8Array(stored.body)], [0xE9, 1, 2, 3]);
});

test('failed D1 release insert compensates by deleting the uploaded R2 object', async () => {
  let uploadedKey = null;
  let deletedKey = null;
  const bucket = {
    async put(key) { uploadedKey = key; },
    async delete(key) { deletedKey = key; }
  };
  const repo = fakeRepo({ async createRelease() { throw new Error('D1 insert failed'); } });
  const service = createOtaService({ repo, firmwareBucket: bucket, uuid: () => 'abc12345-0000-0000-0000-000000000000' });
  await assert.rejects(() => service.createRelease(releaseForm(), 'tester'));
  assert.ok(uploadedKey);
  assert.equal(deletedKey, uploadedKey);
});

test('publish refuses a missing or size-mismatched R2 object', async () => {
  const release = { id: 'rel-1', status: 'draft', targets: ['HW0.5.1'], esp_image_valid: 1, r2_key: 'ota/a.bin', size_bytes: 4 };
  const repo = fakeRepo({ async getRelease() { return release; } });
  let bucket = { async head() { return null; } };
  let service = createOtaService({ repo, firmwareBucket: bucket });
  await assert.rejects(() => service.publishRelease('rel-1'), error => error.code === 'firmware_object_missing');

  bucket = { async head() { return { size: 5 }; } };
  service = createOtaService({ repo, firmwareBucket: bucket });
  await assert.rejects(() => service.publishRelease('rel-1'), error => error.code === 'firmware_size_mismatch');
});

test('published release metadata is immutable until disabled', async () => {
  const release = { id: 'rel-1', status: 'published', version: '1.2.0', build_id: 'b', channel: 'stable', secure_version: 0, release_notes: '' };
  const repo = fakeRepo({ async getRelease() { return release; } });
  const service = createOtaService({ repo, firmwareBucket: {} });
  await assert.rejects(() => service.updateRelease('rel-1', { version: '1.2.1' }), error => error.code === 'published_release_is_immutable');
});


test('draft firmware file replacement updates D1 then removes the old R2 object', async () => {
  const oldKey = 'ota/dr-game/rel-1/old.bin';
  const release = {
    id: 'rel-1', product: 'DigitalRealm', status: 'draft', version: '0.4.0',
    build_id: 'build-60', release_seq: 60, r2_key: oldKey
  };
  let uploaded = null;
  const deleted = [];
  const repo = fakeRepo({
    async getRelease() { return release; },
    async updateReleaseFile(id, patch) { return { ...release, id, ...patch }; }
  });
  const bucket = {
    async put(key, body, options) { uploaded = { key, body, options }; },
    async delete(key) { deleted.push(key); }
  };
  const service = createOtaService({ repo, firmwareBucket: bucket, now: () => new Date('2026-10-05T02:00:00Z') });
  const file = new File([Uint8Array.from([0xE9, 9, 8, 7, 6])], 'replacement.bin', { type: 'application/octet-stream' });
  const result = await service.replaceReleaseFile('rel-1', file, 'tester');

  assert.equal(result.file_name, 'replacement.bin');
  assert.equal(result.size_bytes, 5);
  assert.match(result.sha256, /^[0-9a-f]{64}$/);
  assert.equal(uploaded.key, result.r2_key);
  assert.ok(uploaded.body instanceof ArrayBuffer);
  assert.equal(uploaded.options.customMetadata['release-id'], 'rel-1');
  assert.deepEqual(deleted, [oldKey]);
});

test('firmware replacement compensates new R2 object when D1 update fails and preserves old object', async () => {
  const oldKey = 'ota/dr-game/rel-1/old.bin';
  const release = {
    id: 'rel-1', product: 'DigitalRealm', status: 'draft', version: '0.4.0',
    build_id: 'build-60', release_seq: 60, r2_key: oldKey
  };
  let newKey = null;
  const deleted = [];
  const repo = fakeRepo({
    async getRelease() { return release; },
    async updateReleaseFile() { throw new Error('D1 update failed'); }
  });
  const bucket = {
    async put(key) { newKey = key; },
    async delete(key) { deleted.push(key); }
  };
  const service = createOtaService({ repo, firmwareBucket: bucket });
  const file = new File([Uint8Array.from([0xE9, 4, 5, 6])], 'replacement.bin', { type: 'application/octet-stream' });

  await assert.rejects(() => service.replaceReleaseFile('rel-1', file, 'tester'), /D1 update failed/);
  assert.ok(newKey);
  assert.deepEqual(deleted, [newKey]);
  assert.notEqual(newKey, oldKey);
});

test('published firmware file cannot be replaced until the release is disabled', async () => {
  const release = { id: 'rel-1', product: 'DigitalRealm', status: 'published', r2_key: 'ota/old.bin' };
  let putCalled = false;
  const repo = fakeRepo({ async getRelease() { return release; } });
  const bucket = { async put() { putCalled = true; }, async delete() {} };
  const service = createOtaService({ repo, firmwareBucket: bucket });
  const file = new File([Uint8Array.from([0xE9, 1])], 'replacement.bin', { type: 'application/octet-stream' });

  await assert.rejects(
    () => service.replaceReleaseFile('rel-1', file, 'tester'),
    error => error.status === 409 && error.code === 'published_release_is_immutable'
  );
  assert.equal(putCalled, false);
});
