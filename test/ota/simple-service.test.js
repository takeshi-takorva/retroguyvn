import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimpleOtaService } from '../../src/ota/simple-service.js';

function gameBin(version = 'v1.1.130', project = 'DR_Game_FW') {
  const bytes = new Uint8Array(1024);
  bytes[0] = 0xE9;
  const offset = 64;
  new DataView(bytes.buffer).setUint32(offset, 0xABCD5432, true);
  const encoder = new TextEncoder();
  bytes.set(encoder.encode(version + '\0'), offset + 16);
  bytes.set(encoder.encode(project + '\0'), offset + 48);
  return new File([bytes], 'DR_Game_FW.bin', { type: 'application/octet-stream' });
}

async function assetsPack(version = 'v1.1.130') {
  const encoder = new TextEncoder();
  const manifest = encoder.encode(`DR_ASSET_PACK_V1\nVERSION=${version}\n`);
  const sha = new Uint8Array(await crypto.subtle.digest('SHA-256', manifest));
  const path = encoder.encode('install.md');
  const bytes = new Uint8Array(12 + 2 + 4 + 32 + path.length + manifest.length);
  bytes.set(encoder.encode('DRVGP001'), 0);
  const view = new DataView(bytes.buffer);
  view.setUint16(8, 1, true);
  view.setUint16(10, 1, true);
  let offset = 12;
  view.setUint16(offset, path.length, true); offset += 2;
  view.setUint32(offset, manifest.length, true); offset += 4;
  bytes.set(sha, offset); offset += 32;
  bytes.set(path, offset); offset += path.length;
  bytes.set(manifest, offset);
  return new File([bytes], 'assets.vgi.pack', { type: 'application/octet-stream' });
}

function fakeRepo(overrides = {}) {
  const releases = new Map();
  return {
    releases,
    async createSimpleRelease(row) {
      releases.set(row.version, { ...row });
      return { ...row };
    },
    async getSimpleRelease(version) {
      return releases.get(version) || null;
    },
    async updateSimpleRelease(version, patch) {
      const current = releases.get(version);
      const next = { ...current, ...patch };
      releases.set(version, next);
      return next;
    },
    async deleteSimpleRelease(version) {
      releases.delete(version);
    },
    async listSimpleReleases() {
      return [...releases.values()];
    },
    async findLatestSimpleRelease(hwMajor, hwMinor, currentRevision) {
      return [...releases.values()]
        .filter(row => row.status === 'published' && row.hw_major === hwMajor && row.hw_minor === hwMinor && row.revision > currentRevision)
        .sort((a,b) => b.revision - a.revision)[0] || null;
    },
    ...overrides
  };
}

test('createRelease derives v1.1.130 from DR_Game_FW app descriptor and stores draft in R2+D1', async () => {
  const puts = [];
  const repo = fakeRepo();
  const bucket = {
    async put(key, body, options) { puts.push({ key, body, options }); },
    async delete() {}
  };
  const service = createSimpleOtaService({ repo, firmwareBucket: bucket, now: () => new Date('2026-11-18T06:00:00Z') });
  const form = new FormData();
  form.set('file', gameBin('v1.1.130'));
  form.set('notes', 'fix130');

  const release = await service.createRelease(form, 'tester');

  assert.equal(release.version, 'v1.1.130');
  assert.equal(release.hw_major, 1);
  assert.equal(release.hw_minor, 1);
  assert.equal(release.revision, 130);
  assert.equal(release.status, 'draft');
  assert.equal(release.notes, 'fix130');
  assert.match(release.game_sha256, /^[0-9a-f]{64}$/);
  assert.equal(release.game_size, 1024);
  assert.equal(puts.length, 1);
  assert.ok(puts[0].body instanceof ArrayBuffer);
});

test('createRelease rejects non DR_Game_FW and duplicate versions before overwriting release metadata', async () => {
  const repo = fakeRepo();
  const bucket = { async put() {}, async delete() {} };
  const service = createSimpleOtaService({ repo, firmwareBucket: bucket });
  const bad = new FormData();
  bad.set('file', gameBin('v1.1.130', 'dr_boot_fw'));
  await assert.rejects(() => service.createRelease(bad), /not_dr_game_fw/);

  const good = new FormData();
  good.set('file', gameBin('v1.1.130'));
  await service.createRelease(good);
  await assert.rejects(() => service.createRelease(good), error => error.status === 409 && error.code === 'simple_release_exists');
});

test('createRelease compensates new R2 object if D1 insert fails', async () => {
  let key = null;
  const deleted = [];
  const repo = fakeRepo({ async createSimpleRelease() { throw new Error('D1 failed'); } });
  const bucket = {
    async put(value) { key = value; },
    async delete(value) { deleted.push(value); }
  };
  const service = createSimpleOtaService({ repo, firmwareBucket: bucket });
  const form = new FormData();
  form.set('file', gameBin());

  await assert.rejects(() => service.createRelease(form), /D1 failed/);
  assert.ok(key);
  assert.deepEqual(deleted, [key]);
});

test('replaceAssets validates vgi pack and keeps it optional', async () => {
  const repo = fakeRepo();
  repo.releases.set('v1.1.130', {
    version:'v1.1.130', hw_major:1, hw_minor:1, revision:130, status:'draft',
    game_r2_key:'ota/simple/v1.1.130/game.bin', game_size:1024, game_sha256:'a'.repeat(64)
  });
  const bucket = { async put() {}, async delete() {} };
  const service = createSimpleOtaService({ repo, firmwareBucket: bucket });
  const result = await service.replaceAssets('v1.1.130', await assetsPack(), 'tester');

  assert.equal(result.assets_file_name, 'assets.vgi.pack');
  assert.ok(result.assets_size > 32);
  assert.match(result.assets_sha256, /^[0-9a-f]{64}$/);
});

test('published simple release is immutable and publish requires the game object', async () => {
  const repo = fakeRepo();
  repo.releases.set('v1.1.130', {
    version:'v1.1.130', hw_major:1, hw_minor:1, revision:130, status:'draft',
    game_r2_key:'ota/simple/v1.1.130/game.bin', game_size:1024, game_sha256:'a'.repeat(64)
  });
  const bucket = {
    async head(key) { return key.endsWith('game.bin') ? { size:1024 } : null; },
    async put() {}, async delete() {}
  };
  const service = createSimpleOtaService({ repo, firmwareBucket: bucket });
  const published = await service.publishRelease('v1.1.130');
  assert.equal(published.status, 'published');

  await assert.rejects(() => service.replaceGame('v1.1.130', gameBin('v1.1.130')), error => error.status === 409 && error.code === 'simple_release_published');
  await assert.rejects(() => service.replaceAssets('v1.1.130', await assetsPack()), error => error.status === 409 && error.code === 'simple_release_published');
});

test('checkForUpdate offers only a newer revision on the same hardware line', async () => {
  const repo = fakeRepo();
  repo.releases.set('v1.1.130', {
    version:'v1.1.130', hw_major:1, hw_minor:1, revision:130, status:'published',
    game_r2_key:'ota/simple/v1.1.130/game.bin', game_size:1024, game_sha256:'b'.repeat(64),
    assets_r2_key:'ota/simple/v1.1.130/assets.vgi.pack', assets_size:32, assets_sha256:'c'.repeat(64),
    notes:'new build'
  });
  repo.releases.set('v1.2.200', {
    version:'v1.2.200', hw_major:1, hw_minor:2, revision:200, status:'published',
    game_r2_key:'x', game_size:1, game_sha256:'d'.repeat(64)
  });
  const service = createSimpleOtaService({ repo, firmwareBucket: {} });

  const offer = await service.checkForUpdate('v1.1.129', 'https://retroguyvn.com');
  assert.equal(offer.update, true);
  assert.equal(offer.version, 'v1.1.130');
  assert.equal(offer.firmware.url, 'https://retroguyvn.com/api/dr/ota/v2/game/v1.1.130');
  assert.equal(offer.assets.url, 'https://retroguyvn.com/api/dr/ota/v2/assets/v1.1.130');

  assert.deepEqual(await service.checkForUpdate('v1.1.130', 'https://retroguyvn.com'), { update:false, version:'v1.1.130' });
});


test('replaceAssets rejects a pack whose VERSION does not match the release', async () => {
  const repo = fakeRepo();
  repo.releases.set('v1.1.130', {
    version:'v1.1.130', hw_major:1, hw_minor:1, revision:130, status:'draft',
    game_r2_key:'ota/simple/v1.1.130/game.bin', game_size:1024, game_sha256:'a'.repeat(64)
  });
  const bucket = { async put() { throw new Error('must not upload'); }, async delete() {} };
  const service = createSimpleOtaService({ repo, firmwareBucket: bucket });
  await assert.rejects(
    () => service.replaceAssets('v1.1.130', await assetsPack('v1.1.131'), 'tester'),
    error => error.status === 409 && error.code === 'assets_version_mismatch'
  );
});
