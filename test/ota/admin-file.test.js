import test from 'node:test';
import assert from 'node:assert/strict';
import { createOtaHttp } from '../../src/ota/http.js';

const ctx = () => ({ waitUntil() {} });
const bytesBody = bytes => new Blob([bytes]).stream();

test('admin can stream an immutable release file through a protected direct URL', async () => {
  const payload = Uint8Array.from([0xE9, 1, 2, 3]);
  const release = {
    id: 'rel-1',
    file_name: 'dr-game-1.2.0.bin',
    size_bytes: payload.length,
    sha256: 'd'.repeat(64),
    r2_key: 'ota/dr-game/rel-1/file.bin'
  };
  const service = {
    async getRelease(id) { return id === 'rel-1' ? release : null; },
    async getFirmwareObject(value, range) {
      assert.equal(value.id, 'rel-1');
      assert.equal(range, null);
      return { body: bytesBody(payload) };
    }
  };
  const http = createOtaHttp({ service });
  const request = new Request('https://retroguyvn.com/api/admin/ota/releases/rel-1/file');
  const response = await http.handleOtaAdmin(request, {}, ctx(), { email: 'admin@example.com' });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/octet-stream');
  assert.equal(response.headers.get('content-length'), String(payload.length));
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('content-disposition'), 'attachment; filename="dr-game-1.2.0.bin"');
  assert.equal(response.headers.get('etag'), `"${'d'.repeat(64)}"`);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), payload);
});

test('admin direct file URL returns 404 for an unknown release', async () => {
  const http = createOtaHttp({ service: { async getRelease() { return null; } } });
  const request = new Request('https://retroguyvn.com/api/admin/ota/releases/missing/file');
  const response = await http.handleOtaAdmin(request, {}, ctx(), { mode: 'token' });
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, 'release_not_found');
});
