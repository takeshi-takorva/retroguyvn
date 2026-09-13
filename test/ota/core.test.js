import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVersion, normalizeChannel, parseSingleRange, readDeviceCheckHeaders, validateFirmwareFile } from '../../src/ota/core.js';

test('parseVersion sorts 1.10.0 above 1.9.0', () => {
  assert.ok(parseVersion('1.10.0').sort > parseVersion('1.9.0').sort);
});

test('parseVersion rejects invalid values', () => {
  assert.throws(() => parseVersion('v1.2.3'));
  assert.throws(() => parseVersion('1.10000.0'));
});

test('normalizeChannel defaults to stable', () => {
  assert.equal(normalizeChannel(''), 'stable');
});

test('range parser supports bounded and open-ended ranges', () => {
  assert.deepEqual(parseSingleRange('bytes=100-199', 1000), { start: 100, end: 199, length: 100 });
  assert.deepEqual(parseSingleRange('bytes=900-', 1000), { start: 900, end: 999, length: 100 });
});

test('range parser rejects invalid ranges', () => {
  assert.throws(() => parseSingleRange('bytes=0-9,20-29', 1000));
  assert.throws(() => parseSingleRange('bytes=1000-', 1000));
});

test('check headers require device, hardware and current firmware', () => {
  const req = new Request('https://example.test/api/dr/ota', { headers: {
    'X-DR-Device-ID': 'ABC123',
    'X-DR-HW-Version': 'HW0.5.1',
    'X-DR-FW-Version': '1.2.3'
  }});
  const value = readDeviceCheckHeaders(req);
  assert.equal(value.channel, 'stable');
  assert.equal(value.hardwareCode, 'HW0.5.1');
});

test('firmware validation requires .bin and ESP magic', async () => {
  const good = new File([Uint8Array.from([0xE9, 1, 2, 3])], 'game.bin', { type: 'application/octet-stream' });
  const meta = await validateFirmwareFile(good);
  assert.equal(meta.size, 4);
  assert.match(meta.sha256, /^[0-9a-f]{64}$/);

  const badMagic = new File([Uint8Array.from([0x00, 1, 2, 3])], 'bad.bin', { type: 'application/octet-stream' });
  await assert.rejects(
    () => validateFirmwareFile(badMagic),
    error => error.status === 422 && error.code === 'invalid_esp_image_magic'
  );
});

test('firmware validation rejects files above 16 MiB before buffering them', async () => {
  let fullBufferRead = false;
  const oversized = {
    name: 'too-large.bin',
    size: 16 * 1024 * 1024 + 1,
    async arrayBuffer() {
      fullBufferRead = true;
      return new ArrayBuffer(0);
    },
    slice() {
      return { async arrayBuffer() { return Uint8Array.from([0xE9]).buffer; } };
    }
  };

  await assert.rejects(
    () => validateFirmwareFile(oversized),
    error => error.status === 413 && error.code === 'firmware_too_large'
  );
  assert.equal(fullBufferRead, false);
});
