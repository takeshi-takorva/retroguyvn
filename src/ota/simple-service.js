import { parseEspGameImage, parseSimpleVersion, validateAssetsPackHeader } from './simple-core.js';

const GAME_MAX_BYTES = 0x480000;
const ASSETS_MAX_BYTES = 64 * 1024 * 1024;

function httpError(status, code, message = code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function sha256Hex(buffer) {
  return crypto.subtle.digest('SHA-256', buffer).then(digest =>
    [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')
  );
}

function requireBucket(bucket) {
  if (!bucket?.put || !bucket?.delete) throw httpError(503, 'firmware_storage_unavailable');
}

async function readGameFile(file) {
  if (!file?.arrayBuffer) throw httpError(400, 'game_file_required');
  const name = String(file.name || 'game.bin');
  if (!name.toLowerCase().endsWith('.bin')) throw httpError(422, 'game_file_must_be_bin');
  const bytes = await file.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > GAME_MAX_BYTES) throw httpError(413, 'game_file_too_large');
  const image = parseEspGameImage(bytes);
  return {
    bytes,
    fileName: name,
    size: bytes.byteLength,
    sha256: await sha256Hex(bytes),
    image
  };
}

async function readAssetsFile(file) {
  if (!file?.arrayBuffer) throw httpError(400, 'assets_file_required');
  const name = String(file.name || 'assets.vgi.pack');
  if (!name.toLowerCase().endsWith('.vgi.pack')) throw httpError(422, 'assets_file_must_be_vgi_pack');
  const bytes = await file.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > ASSETS_MAX_BYTES) throw httpError(413, 'assets_pack_too_large');
  validateAssetsPackHeader(bytes.slice(0, Math.min(bytes.byteLength, 64)));
  return {
    bytes,
    fileName: name,
    size: bytes.byteLength,
    sha256: await sha256Hex(bytes)
  };
}

function gameKey(version, sha256) {
  return `ota/simple/${version}/game-${sha256}.bin`;
}

function assetsKey(version, sha256) {
  return `ota/simple/${version}/assets-${sha256}.vgi.pack`;
}

function assertDraft(release) {
  if (!release) throw httpError(404, 'simple_release_not_found');
  if (release.status === 'published') throw httpError(409, 'simple_release_published');
}

export function createSimpleOtaService({ repo, firmwareBucket, now = () => new Date() }) {
  if (!repo) throw new TypeError('repo is required');
  const iso = () => now().toISOString();

  async function createRelease(formData, actor = 'admin') {
    requireBucket(firmwareBucket);
    const file = formData?.get?.('file');
    const notes = String(formData?.get?.('notes') || '').slice(0, 4000);
    const game = await readGameFile(file);
    const { version, hwMajor, hwMinor, revision } = game.image;
    if (await repo.getSimpleRelease(version)) throw httpError(409, 'simple_release_exists');

    const key = gameKey(version, game.sha256);
    await firmwareBucket.put(key, game.bytes, {
      httpMetadata: { contentType: 'application/octet-stream' },
      customMetadata: { version, sha256: game.sha256, kind: 'game' }
    });

    const row = {
      version,
      hw_major: hwMajor,
      hw_minor: hwMinor,
      revision,
      game_r2_key: key,
      game_file_name: game.fileName,
      game_size: game.size,
      game_sha256: game.sha256,
      assets_r2_key: null,
      assets_file_name: null,
      assets_size: null,
      assets_sha256: null,
      notes,
      status: 'draft',
      created_by: actor,
      created_at: iso(),
      updated_at: iso(),
      published_at: null
    };
    try {
      return await repo.createSimpleRelease(row);
    } catch (error) {
      try { await firmwareBucket.delete(key); } catch {}
      throw error;
    }
  }

  async function replaceGame(version, file, actor = 'admin') {
    requireBucket(firmwareBucket);
    const current = await repo.getSimpleRelease(version);
    assertDraft(current);
    const game = await readGameFile(file);
    if (game.image.version !== version) throw httpError(409, 'replacement_version_mismatch');
    const key = gameKey(version, game.sha256);
    await firmwareBucket.put(key, game.bytes, {
      httpMetadata: { contentType: 'application/octet-stream' },
      customMetadata: { version, sha256: game.sha256, kind: 'game' }
    });
    let updated;
    try {
      updated = await repo.updateSimpleRelease(version, {
        game_r2_key: key,
        game_file_name: game.fileName,
        game_size: game.size,
        game_sha256: game.sha256,
        updated_by: actor,
        updated_at: iso()
      });
    } catch (error) {
      if (key !== current.game_r2_key) {
        try { await firmwareBucket.delete(key); } catch {}
      }
      throw error;
    }
    if (current.game_r2_key && current.game_r2_key !== key) {
      try { await firmwareBucket.delete(current.game_r2_key); } catch {}
    }
    return updated;
  }

  async function replaceAssets(version, file, actor = 'admin') {
    requireBucket(firmwareBucket);
    const current = await repo.getSimpleRelease(version);
    assertDraft(current);
    const assets = await readAssetsFile(file);
    const key = assetsKey(version, assets.sha256);
    await firmwareBucket.put(key, assets.bytes, {
      httpMetadata: { contentType: 'application/octet-stream' },
      customMetadata: { version, sha256: assets.sha256, kind: 'assets' }
    });
    let updated;
    try {
      updated = await repo.updateSimpleRelease(version, {
        assets_r2_key: key,
        assets_file_name: assets.fileName,
        assets_size: assets.size,
        assets_sha256: assets.sha256,
        updated_by: actor,
        updated_at: iso()
      });
    } catch (error) {
      try { await firmwareBucket.delete(key); } catch {}
      throw error;
    }
    if (current.assets_r2_key && current.assets_r2_key !== key) {
      try { await firmwareBucket.delete(current.assets_r2_key); } catch {}
    }
    return updated;
  }

  async function removeAssets(version, actor = 'admin') {
    requireBucket(firmwareBucket);
    const current = await repo.getSimpleRelease(version);
    assertDraft(current);
    if (current.assets_r2_key) await firmwareBucket.delete(current.assets_r2_key);
    return repo.updateSimpleRelease(version, {
      assets_r2_key: null,
      assets_file_name: null,
      assets_size: null,
      assets_sha256: null,
      updated_by: actor,
      updated_at: iso()
    });
  }

  async function publishRelease(version) {
    if (!firmwareBucket?.head) throw httpError(503, 'firmware_storage_unavailable');
    const release = await repo.getSimpleRelease(version);
    assertDraft(release);
    const gameObject = await firmwareBucket.head(release.game_r2_key);
    if (!gameObject || Number(gameObject.size) !== Number(release.game_size)) {
      throw httpError(409, 'game_object_missing_or_mismatch');
    }
    if (release.assets_r2_key) {
      const assetsObject = await firmwareBucket.head(release.assets_r2_key);
      if (!assetsObject || Number(assetsObject.size) !== Number(release.assets_size)) {
        throw httpError(409, 'assets_object_missing_or_mismatch');
      }
    }
    return repo.updateSimpleRelease(version, {
      status: 'published',
      published_at: iso(),
      updated_at: iso()
    });
  }

  async function deleteRelease(version) {
    requireBucket(firmwareBucket);
    const release = await repo.getSimpleRelease(version);
    if (!release) throw httpError(404, 'simple_release_not_found');
    if (release.status === 'published') throw httpError(409, 'simple_release_published');
    if (release.game_r2_key) await firmwareBucket.delete(release.game_r2_key);
    if (release.assets_r2_key) await firmwareBucket.delete(release.assets_r2_key);
    await repo.deleteSimpleRelease(version);
    return { ok: true, version };
  }

  async function checkForUpdate(currentVersion, origin) {
    const current = parseSimpleVersion(currentVersion);
    const release = await repo.findLatestSimpleRelease(current.hwMajor, current.hwMinor, current.revision);
    if (!release) return { update: false, version: current.version };
    const base = new URL(origin);
    const version = encodeURIComponent(release.version);
    return {
      update: true,
      version: release.version,
      firmware: {
        url: new URL(`/api/dr/ota/v2/game/${version}`, base).toString(),
        size: Number(release.game_size),
        sha256: release.game_sha256
      },
      assets: release.assets_r2_key ? {
        url: new URL(`/api/dr/ota/v2/assets/${version}`, base).toString(),
        size: Number(release.assets_size),
        sha256: release.assets_sha256
      } : null,
      notes: release.notes || ''
    };
  }

  return {
    createRelease,
    replaceGame,
    replaceAssets,
    removeAssets,
    publishRelease,
    deleteRelease,
    checkForUpdate,
    listReleases: () => repo.listSimpleReleases(),
    getRelease: version => repo.getSimpleRelease(version),
    getGameObject: (release, range) => firmwareBucket.get(release.game_r2_key, range ? { range: { offset: range.start, length: range.length } } : undefined),
    getAssetsObject: (release, range) => firmwareBucket.get(release.assets_r2_key, range ? { range: { offset: range.start, length: range.length } } : undefined)
  };
}
