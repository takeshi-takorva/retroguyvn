import test from 'node:test';
import assert from 'node:assert/strict';
import { createOtaService } from '../../src/ota/service.js';
import { parseVersion } from '../../src/ota/core.js';

function checkInput() {
  return {
    deviceId: 'CONTRACT-001',
    hardwareCode: 'HW0.5.1',
    firmwareVersion: '1.0.0',
    firmwareSort: parseVersion('1.0.0').sort,
    bootVersion: '1.0.0',
    bootVersionSort: parseVersion('1.0.0').sort,
    channel: 'stable'
  };
}

function checkRepo() {
  return {
    async upsertDevice() {},
    async appendEvent() {},
    async findHardwareByCode() { return { id: 'hw051', code: 'HW0.5.1', enabled: 1 }; },
    async setDeviceOffer() {},
    async findNewestCompatibleRelease() { return null; },
    async listReleases() { return []; }
  };
}

function uploadForm(target = 'HW0.5.1') {
  const form = new FormData();
  form.set('file', new File([Uint8Array.from([0xE9, 1, 2, 3])], 'game.bin', { type: 'application/octet-stream' }));
  form.set('product', 'DR_GAME');
  form.set('version', '1.2.3');
  form.set('build_id', 'contract-build');
  form.set('channel', 'stable');
  if (target) form.append('hardware', target);
  return form;
}

test('device update check fails closed when FIRMWARE binding is unavailable', async () => {
  const service = createOtaService({ repo: checkRepo(), firmwareBucket: null });
  await assert.rejects(
    () => service.checkForUpdate(checkInput(), {}),
    error => error.status === 503 && error.code === 'firmware_storage_unavailable'
  );
});

test('release upload reports invalid hardware targets as 422', async () => {
  const repo = {
    async findHardwareByCode() { return null; },
    async findReleaseByIdentity() { return null; }
  };
  const bucket = { async put() { throw new Error('must not upload'); }, async delete() {} };
  const service = createOtaService({ repo, firmwareBucket: bucket });

  await assert.rejects(
    () => service.createRelease(uploadForm(null), 'tester'),
    error => error.status === 422 && error.code === 'hardware_target_required'
  );
  await assert.rejects(
    () => service.createRelease(uploadForm('HW9.9'), 'tester'),
    error => error.status === 422 && error.code === 'unknown_hardware_target'
  );
});

test('duplicate release identity returns 409 before uploading another R2 object', async () => {
  let putCalled = false;
  const repo = {
    async findReleaseByIdentity() { return { id: 'existing-release' }; },
    async findHardwareByCode() { return { id: 'hw051', code: 'HW0.5.1', enabled: 1 }; },
    async createRelease() { throw new Error('must not insert'); }
  };
  const bucket = {
    async put() { putCalled = true; },
    async delete() {}
  };
  const service = createOtaService({ repo, firmwareBucket: bucket });

  await assert.rejects(
    () => service.createRelease(uploadForm(), 'tester'),
    error => error.status === 409 && error.code === 'release_already_exists'
  );
  assert.equal(putCalled, false);
});
