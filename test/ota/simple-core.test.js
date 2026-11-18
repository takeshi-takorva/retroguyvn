import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareSimpleVersion,
  parseEspGameImage,
  parseSimpleVersion,
  validateAssetsPackHeader,
  validateAssetsPack
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

test('parseSimpleVersion matches Boot OS uint16/uint32 numeric limits', () => {
  assert.deepEqual(parseSimpleVersion('v65535.65535.4294967295'), {
    version: 'v65535.65535.4294967295',
    hwMajor: 65535,
    hwMinor: 65535,
    revision: 4294967295
  });
  for (const value of ['v65536.1.1', 'v1.65536.1', 'v1.1.4294967296']) {
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


async function makePack(manifest, extraEntries = []) {
  const encoder = new TextEncoder();
  const entries = [['install.md', encoder.encode(manifest)], ...extraEntries.map(([name,data]) => [name, data instanceof Uint8Array ? data : encoder.encode(data)])];
  let total = 12;
  const encoded = [];
  for (const [name,data] of entries) {
    const path = encoder.encode(name);
    const sha = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
    encoded.push({path,data,sha});
    total += 2 + 4 + 32 + path.length + data.length;
  }
  const out = new Uint8Array(total);
  out.set(encoder.encode('DRVGP001'),0);
  const view = new DataView(out.buffer);
  view.setUint16(8,1,true);
  view.setUint16(10,entries.length,true);
  let offset=12;
  for (const e of encoded) {
    view.setUint16(offset,e.path.length,true); offset+=2;
    view.setUint32(offset,e.data.length,true); offset+=4;
    out.set(e.sha,offset); offset+=32;
    out.set(e.path,offset); offset+=e.path.length;
    out.set(e.data,offset); offset+=e.data.length;
  }
  return out;
}

test('validateAssetsPack verifies install.md, entry hashes and version', async () => {
  const pack = await makePack(
    'DR_ASSET_PACK_V1\nVERSION=v1.1.130\nCOPY payload/data/assets/ui/foo.vgi /data/assets/ui/foo.vgi\n',
    [['payload/data/assets/ui/foo.vgi', Uint8Array.from([1,2,3])]]
  );
  assert.deepEqual(await validateAssetsPack(pack), { version:'v1.1.130', entryCount:2 });

  const corrupt = pack.slice();
  corrupt[corrupt.length - 1] ^= 0xff;
  await assert.rejects(() => validateAssetsPack(corrupt), /vgi_entry_sha_mismatch/);
});

test('validateAssetsPack rejects traversal and missing COPY source', async () => {
  const badDest = await makePack('DR_ASSET_PACK_V1\nVERSION=v1.1.130\nCOPY payload/foo.vgi /data/../secret.vgi\n', [['payload/foo.vgi','x']]);
  await assert.rejects(() => validateAssetsPack(badDest), /invalid_vgi_install_path/);

  const missing = await makePack('DR_ASSET_PACK_V1\nVERSION=v1.1.130\nCOPY payload/missing.vgi /data/assets/missing.vgi\n');
  await assert.rejects(() => validateAssetsPack(missing), /vgi_copy_source_missing/);
});

test('validateAssetsPack rejects entries not referenced by install.md', async () => {
  const pack = await makePack(
    'DR_ASSET_PACK_V1\nVERSION=v1.1.130\n',
    [['payload/data/assets/hidden.vgi', Uint8Array.from([9,8,7])]]
  );
  await assert.rejects(() => validateAssetsPack(pack), /vgi_unreferenced_entry/);
});


test('validateAssetsPack requires DR_ASSET_PACK_V1 as the first physical install.md line', async () => {
  const pack = await makePack(
    '# comment before magic is not allowed\nDR_ASSET_PACK_V1\nVERSION=v1.1.130\n'
  );
  await assert.rejects(() => validateAssetsPack(pack), /invalid_vgi_install_manifest/);
});


test('parseEspGameImage skips decoy app-desc magic before the real DR_Game_FW descriptor', () => {
  const bytes = new Uint8Array(1024);
  bytes[0] = 0xE9;
  const view = new DataView(bytes.buffer);
  const encoder = new TextEncoder();

  view.setUint32(32, 0xABCD5432, true);
  bytes.set(encoder.encode('junk-version\0'), 48);
  bytes.set(encoder.encode('junk-project\0'), 80);

  const offset = 128;
  view.setUint32(offset, 0xABCD5432, true);
  bytes.set(encoder.encode('v1.1.129\0'), offset + 16);
  bytes.set(encoder.encode('DR_Game_FW\0'), offset + 48);

  assert.equal(parseEspGameImage(bytes).version, 'v1.1.129');
});
