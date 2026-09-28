import test from 'node:test';
import assert from 'node:assert/strict';
import { createOtaV1Http } from '../../src/ota/v1-http.js';

const deviceHeaders = {
  'content-type': 'application/json',
  'X-DR-Protocol': '1',
  'X-DR-Device-ID': '0123456789ABCDEF0123456789ABCDEF',
  'X-DR-Serial': 'UNPROVISIONED',
  'X-DR-HW-Version': 'HW0.4',
  'X-DR-Boot-Version': '0.1-fix023',
  'X-DR-FW-Version': '0.4-fix059-save-buffer-linker-hotfix'
};

const checkBody = {
  protocol: 1,
  product: 'DigitalRealm',
  channel: 'stable',
  device_id: '0123456789ABCDEF0123456789ABCDEF',
  serial: 'UNPROVISIONED',
  hardware: 'HW0.4',
  boot_version: '0.1-fix023',
  game_version: '0.4-fix059-save-buffer-linker-hotfix',
  game_fix: 59,
  build_id: 'DR_Game_FW:0.4-fix059-save-buffer-linker-hotfix',
  release_seq: 59,
  service_version: '0.1.0',
  secure_version: 1,
  active_slot: 'A',
  asset_version: null
};

test('v1 check returns canonical up_to_date envelope', async () => {
  const service = {
    async checkForUpdateV1(input) {
      assert.equal(input.deviceId, checkBody.device_id);
      assert.equal(input.releaseSeq, 59);
      return { status: 'up_to_date', currentReleaseSeq: 59 };
    }
  };
  const http = createOtaV1Http({ service, now: () => new Date('2026-09-28T04:00:00Z') });
  const response = await http.handle(new Request('https://retroguyvn.com/api/dr/ota/v1/check', {
    method: 'POST', headers: deviceHeaders, body: JSON.stringify(checkBody)
  }), {}, {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    protocol: 1,
    status: 'up_to_date',
    server_time: '2026-09-28T04:00:00.000Z',
    current_release_seq: 59
  });
});

test('v1 check returns signed release with immutable firmware URL', async () => {
  const release = {
    id: 'dr-game-r60', release_seq: 60, product: 'DigitalRealm', targets: ['HW0.4'],
    channel: 'stable', version: '0.4.0', game_fix: 60, build_id: 'DR_fix060',
    secure_version: 1, min_boot_version: '0.1-fix023', asset_version: null,
    size_bytes: 4096, sha256: 'a'.repeat(64), signature_alg: 'RSA-PSS-SHA256',
    signature: 'A'.repeat(128), mandatory: 0, release_notes: 'OTA v1'
  };
  const service = { async checkForUpdateV1() { return { status: 'update_available', release }; } };
  const http = createOtaV1Http({ service, now: () => new Date('2026-09-28T04:00:00Z') });
  const response = await http.handle(new Request('https://retroguyvn.com/api/dr/ota/v1/check', {
    method: 'POST', headers: deviceHeaders, body: JSON.stringify(checkBody)
  }), {}, {});
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.release.release_seq, 60);
  assert.equal(data.release.product, 'DigitalRealm');
  assert.deepEqual(data.release.hardware, ['HW0.4']);
  assert.equal(data.release.download_url, 'https://retroguyvn.com/api/dr/ota/v1/firmware/dr-game-r60');
  assert.equal(data.release.signature_alg, 'RSA-PSS-SHA256');
});

test('v1 check rejects identity mismatch between headers and JSON', async () => {
  const http = createOtaV1Http({ service: { async checkForUpdateV1() { throw new Error('must not run'); } } });
  const bad = { ...checkBody, hardware: 'HW0.5' };
  const response = await http.handle(new Request('https://retroguyvn.com/api/dr/ota/v1/check', {
    method: 'POST', headers: deviceHeaders, body: JSON.stringify(bad)
  }), {}, {});
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'identity_mismatch');
});

test('v1 firmware streams offered release and exposes release checksum headers', async () => {
  const bytes = Uint8Array.from([0xe9, 1, 2, 3]);
  const release = { id: 'dr-game-r60', size_bytes: 4, sha256: 'b'.repeat(64), file_name: 'game.bin' };
  const service = {
    async authorizeDownloadV1(input) {
      assert.equal(input.deviceId, checkBody.device_id);
      assert.equal(input.releaseId, 'dr-game-r60');
      return release;
    },
    async getFirmwareObject() { return { body: new Blob([bytes]).stream() }; },
    async recordDownloadEvent() {}
  };
  const http = createOtaV1Http({ service });
  const response = await http.handle(new Request('https://retroguyvn.com/api/dr/ota/v1/firmware/dr-game-r60', {
    headers: { 'X-DR-Device-ID': checkBody.device_id }
  }), {}, {});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-dr-release-id'), 'dr-game-r60');
  assert.equal(response.headers.get('x-dr-sha256'), 'b'.repeat(64));
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
});

test('v1 events accepts standard lifecycle event', async () => {
  let captured = null;
  const service = { async recordLifecycleEventV1(value) { captured = value; } };
  const http = createOtaV1Http({ service });
  const event = {
    protocol: 1,
    device_id: checkBody.device_id,
    serial: 'UNPROVISIONED',
    release_id: 'dr-game-r60',
    event: 'BOOT_PENDING_VERIFY',
    progress: 100,
    result: 'INFO',
    error_code: null,
    fw_before: checkBody.game_version,
    fw_after: '0.4.0',
    timestamp: '2026-09-28T04:00:00Z'
  };
  const response = await http.handle(new Request('https://retroguyvn.com/api/dr/ota/v1/events', {
    method: 'POST', headers: deviceHeaders, body: JSON.stringify(event)
  }), {}, {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(captured.event, 'BOOT_PENDING_VERIFY');
});
