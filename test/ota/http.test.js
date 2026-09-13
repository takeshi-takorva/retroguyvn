import test from 'node:test';
import assert from 'node:assert/strict';
import { createOtaHttp } from '../../src/ota/http.js';

function ctx() { return { waitUntil() {} }; }

function bytesBody(bytes) {
  return new Blob([bytes]).stream();
}

test('public check returns absolute download URL', async () => {
  const service = {
    async checkForUpdate() {
      return { update_available: true, release_id: 'rel-1', version: '1.2.0', download: '/api/dr/ota/download' };
    }
  };
  const http = createOtaHttp({ service });
  const request = new Request('https://retroguyvn.com/api/dr/ota', { headers: {
    'X-DR-Device-ID': 'DEV1', 'X-DR-HW-Version': 'HW0.5.1', 'X-DR-FW-Version': '1.0.0'
  }});
  const response = await http.handleOtaPublic(request, {}, ctx());
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.download, 'https://retroguyvn.com/api/dr/ota/download');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('missing required check header returns 400 JSON', async () => {
  const http = createOtaHttp({ service: { async checkForUpdate() { throw new Error('must not run'); } } });
  const response = await http.handleOtaPublic(new Request('https://retroguyvn.com/api/dr/ota'), {}, ctx());
  const data = await response.json();
  assert.equal(response.status, 400);
  assert.equal(data.error, 'missing_device_id');
});

test('full firmware response exposes length, ranges and strong checksum ETag', async () => {
  const payload = Uint8Array.from({ length: 16 }, (_, i) => i);
  const release = { id: 'rel-1', size_bytes: payload.length, sha256: 'a'.repeat(64), version: '1.2.0' };
  const service = {
    async authorizeDownload() { return release; },
    async getDevice() { return { game_version: '1.0.0', channel: 'stable' }; },
    async getFirmwareObject() { return { body: bytesBody(payload) }; },
    async recordDownloadEvent() {}
  };
  const http = createOtaHttp({ service });
  const request = new Request('https://retroguyvn.com/api/dr/ota/download', { headers: {
    'X-DR-Release-ID': 'rel-1', 'X-DR-Device-ID': 'DEV1', 'X-DR-HW-Version': 'HW0.5.1'
  }});
  const response = await http.handleOtaPublic(request, {}, ctx());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-length'), '16');
  assert.equal(response.headers.get('accept-ranges'), 'bytes');
  assert.equal(response.headers.get('etag'), `"${'a'.repeat(64)}"`);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), payload);
});

test('range firmware response returns 206 and exact content range', async () => {
  const payload = Uint8Array.from({ length: 200 }, (_, i) => i % 256);
  const release = { id: 'rel-1', size_bytes: payload.length, sha256: 'b'.repeat(64), version: '1.2.0' };
  const service = {
    async authorizeDownload() { return release; },
    async getDevice() { return { game_version: '1.0.0', channel: 'stable' }; },
    async getFirmwareObject(_release, range) { return { body: bytesBody(payload.slice(range.start, range.end + 1)) }; },
    async recordDownloadEvent() {}
  };
  const http = createOtaHttp({ service });
  const request = new Request('https://retroguyvn.com/api/dr/ota/download', { headers: {
    'X-DR-Release-ID': 'rel-1', 'X-DR-Device-ID': 'DEV1', 'X-DR-HW-Version': 'HW0.5.1', Range: 'bytes=100-149'
  }});
  const response = await http.handleOtaPublic(request, {}, ctx());
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 100-149/200');
  assert.equal(response.headers.get('content-length'), '50');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), payload.slice(100, 150));
});

test('invalid range returns 416 with unsatisfied content range', async () => {
  const service = {
    async authorizeDownload() { return { id: 'rel-1', size_bytes: 100, sha256: 'c'.repeat(64) }; },
    async getDevice() { return {}; },
    async recordDownloadEvent() {}
  };
  const http = createOtaHttp({ service });
  const request = new Request('https://retroguyvn.com/api/dr/ota/download', { headers: {
    'X-DR-Release-ID': 'rel-1', 'X-DR-Device-ID': 'DEV1', 'X-DR-HW-Version': 'HW0.5.1', Range: 'bytes=100-'
  }});
  const response = await http.handleOtaPublic(request, {}, ctx());
  assert.equal(response.status, 416);
  assert.equal(response.headers.get('content-range'), 'bytes */100');
});
