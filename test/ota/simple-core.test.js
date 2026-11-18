import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareSimpleVersion,
  parseEspGameImage,
  parseSimpleVersion,
  validateAssetsPackHeader
} from '../../src/ota/simple-core.js';

test('parseSimpleVersion parses vHW_MAJOR.HW_MINOR.REVISION', () => {
  assert.deepEqual(parseSimpleVersion('v1.1.129'), {
    version: 'v1.1.129',
    hwMajor: 1,
    hwMinor: 1,
    revision: 129
  });
  assert.deepEqual(parseSimpleVersion('v0.4.7'), {
    version: 'v0.4.7',
    hwMajor: 0,
    hwMinor: 4,
    revision: 7
  });
});

test('parseSimpleVersion rejects legacy and malformed versions', () => {
  for (const value of ['1.1.129', 'v1.1', 'v1.1.129-beta', 'hw1.1-0.4-fix129', 'v01.1.129']) {
    assert.throws(() => parseSimpleVersion(value), /invalid_simple_version/);
  }
});

test('compareSimpleVersion only offers newer revision on exact hardware line', () => {
  assert.equal(compareSimpleVersion('v1.1.129', 'v1.1.130'), 1);
  assert.equal(compareSimpleVersion('v1.1.130', 'v1.1.130'), 0);
  assert.equal(compareSimpleVersion('v1.1.130', 'v1.1.129'), -1);
  assert.equal(compareSimpleVersion('v1.1.129', 'v1.2.130'), null);
});

test('parseEspGameImage extracts DR_Game_FW version from app descriptor', () => {
  const bytes = new Uint8Array(512);
  bytes[0] = 0xE9;
  const offset = 64;
  new DataView(bytes.buffer).setUint32(offset, 0xABCD5432, true);
  const encoder = new TextEncoder();
  bytes.set(encoder.encode('v1.1.129\0'), offset + 16);
  bytes.set(encoder.encode('DR_Game_FW\0'), offset + 48);

  assert.deepEqual(parseEspGameImage(bytes), {
    projectName: 'DR_Game_FW',
    version: 'v1.1.129',
    hwMajor: 1,
    hwMinor: 1,
    revision: 129
  });
});

test('parseEspGameImage rejects non-game firmware', () => {
  const bytes = new Uint8Array(512);
  bytes[0] = 0xE9;
  const offset = 64;
  new DataView(bytes.buffer).setUint32(offset, 0xABCD5432, true);
  const encoder = new TextEncoder();
  bytes.set(encoder.encode('v1.1.129\0'), offset + 16);
  bytes.set(encoder.encode('dr_boot_fw\0'), offset + 48);
  assert.throws(() => parseEspGameImage(bytes), /not_dr_game_fw/);
});

test('validateAssetsPackHeader accepts only DRVGP001 format version 1', () => {
  const good = new Uint8Array(12);
  good.set(new TextEncoder().encode('DRVGP001'), 0);
  new DataView(good.buffer).setUint16(8, 1, true);
  new DataView(good.buffer).setUint16(10, 3, true);
  assert.deepEqual(validateAssetsPackHeader(good), { formatVersion: 1, entryCount: 3 });

  const bad = good.slice();
  bad[0] = 0;
  assert.throws(() => validateAssetsPackHeader(bad), /invalid_vgi_pack/);
});
