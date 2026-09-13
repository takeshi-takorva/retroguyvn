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
    error => error.status === 403
  );
  repo._devices.set('DEV001', { device_id: 'DEV001', hardware_code: 'HW0.5.1', last_release_id: 'rel-other' });
  await assert.rejects(
    () => service.authorizeDownload({ releaseId: 'rel-1', deviceId: 'DEV001', hardwareCode: 'HW0.5.1' }),
    error => error.status === 409
  );
});
