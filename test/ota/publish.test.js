import test from 'node:test';
import assert from 'node:assert/strict';
import { createOtaService } from '../../src/ota/service.js';

const baseRelease = {
  id: 'rel-1',
  status: 'draft',
  targets: ['HW0.5.1'],
  esp_image_valid: 1,
  r2_key: 'ota/dr-game/rel-1/a.bin',
  size_bytes: 4
};

test('publish rejects a release whose target revisions are all disabled', async () => {
  let headCalled = false;
  const repo = {
    async getRelease() { return { ...baseRelease, target_hardware: [{ id: 'hw051', code: 'HW0.5.1', enabled: 0 }] }; },
    async setReleaseStatus() { throw new Error('must not publish'); }
  };
  const bucket = { async head() { headCalled = true; return { size: 4 }; } };
  const service = createOtaService({ repo, firmwareBucket: bucket });
  await assert.rejects(() => service.publishRelease('rel-1'), error => error.code === 'no_enabled_hardware_target');
  assert.equal(headCalled, false);
});

test('publish allows an enabled target after validating the R2 object size', async () => {
  let status = null;
  const repo = {
    async getRelease() { return { ...baseRelease, target_hardware: [{ id: 'hw051', code: 'HW0.5.1', enabled: 1 }] }; },
    async setReleaseStatus(id, value) { status = value; return { id, status: value }; }
  };
  const bucket = { async head() { return { size: 4 }; } };
  const service = createOtaService({ repo, firmwareBucket: bucket });
  const result = await service.publishRelease('rel-1');
  assert.equal(result.status, 'published');
  assert.equal(status, 'published');
});
