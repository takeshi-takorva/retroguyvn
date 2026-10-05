import { httpError, normalizeChannel, parseVersion, validateFirmwareFile } from './core.js';

const LEGACY_PRODUCT = 'DR_GAME';
const V1_PRODUCT = 'DigitalRealm';
const GAME_SLOT_BYTES = 0x480000;
const EDITABLE = new Set(['draft', 'disabled']);
const RELEASE_ID_RE = /^[A-Za-z0-9._-]{3,96}$/;
const asIso = value => value instanceof Date ? value.toISOString() : new Date(value).toISOString();

function requiredText(value, code, max = 256) {
  const text = String(value ?? '').trim();
  if (!text) throw httpError(400, code);
  if (text.length > max) throw httpError(400, `${code}_too_long`);
  return text;
}

function optionalText(value, code, max = 256) {
  const text = String(value ?? '').trim();
  if (text.length > max) throw httpError(400, `${code}_too_long`);
  return text || null;
}

function integerValue(value, code, minimum = 0) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum) throw httpError(400, code);
  return number;
}

function secureVersion(value) {
  return integerValue(value ?? 0, 'invalid_secure_version', 0);
}

function normalizeVersion(value, product) {
  const text = requiredText(value, 'invalid_version', product === V1_PRODUCT ? 32 : 64);
  if (product === LEGACY_PRODUCT) return parseVersion(text);
  try { return parseVersion(text); }
  catch { return { version: text, sort: 0 }; }
}

function normalizeProduct(value) {
  const product = String(value || LEGACY_PRODUCT).trim();
  if (product !== LEGACY_PRODUCT && product !== V1_PRODUCT) throw httpError(400, 'unsupported_product');
  return product;
}

function canonicalFieldsFromForm(formData) {
  const releaseId = requiredText(formData.get('release_id'), 'release_id_required', 96);
  if (!RELEASE_ID_RE.test(releaseId)) throw httpError(400, 'invalid_release_id');
  const releaseSeq = integerValue(formData.get('release_seq'), 'invalid_release_seq', 1);
  const gameFix = integerValue(formData.get('fix') ?? 0, 'invalid_game_fix', 0);
  const minBoot = requiredText(formData.get('min_boot_version'), 'min_boot_version_required', 32);
  const assetVersion = optionalText(formData.get('asset_version'), 'asset_version', 64);
  const signatureAlg = requiredText(formData.get('signature_alg') || 'RSA-PSS-SHA256', 'signature_alg_required', 32);
  if (signatureAlg !== 'RSA-PSS-SHA256') throw httpError(400, 'unsupported_signature_alg');
  const signature = requiredText(formData.get('signature'), 'signature_required', 4096);
  if (signature.length < 64) throw httpError(400, 'signature_too_short');
  const mandatoryRaw = String(formData.get('mandatory') ?? '0').trim().toLowerCase();
  const mandatory = ['1', 'true', 'yes', 'on'].includes(mandatoryRaw) ? 1 : 0;
  return { releaseId, releaseSeq, gameFix, minBoot, assetVersion, signatureAlg, signature, mandatory };
}

function canonicalFieldsFromInput(input, current) {
  const releaseSeq = integerValue(input.release_seq ?? current.release_seq, 'invalid_release_seq', 1);
  const gameFix = integerValue(input.fix ?? input.game_fix ?? current.game_fix ?? 0, 'invalid_game_fix', 0);
  const minBoot = requiredText(input.min_boot_version ?? current.min_boot_version, 'min_boot_version_required', 32);
  const assetVersion = optionalText(input.asset_version ?? current.asset_version, 'asset_version', 64);
  const signatureAlg = requiredText(input.signature_alg ?? current.signature_alg ?? 'RSA-PSS-SHA256', 'signature_alg_required', 32);
  if (signatureAlg !== 'RSA-PSS-SHA256') throw httpError(400, 'unsupported_signature_alg');
  const signature = requiredText(input.signature ?? current.signature, 'signature_required', 4096);
  if (signature.length < 64) throw httpError(400, 'signature_too_short');
  const mandatory = input.mandatory === undefined ? Number(current.mandatory || 0) : (input.mandatory ? 1 : 0);
  return { releaseSeq, gameFix, minBoot, assetVersion, signatureAlg, signature, mandatory };
}

function fromForm(formData) {
  return [...new Set([...formData.getAll('hardware'), ...formData.getAll('hardware[]')]
    .map(value => String(value).trim()).filter(Boolean))];
}

function fromInput(input) {
  const raw = input.hardware ?? input.targets ?? input.hardwareCodes ?? [];
  return [...new Set((Array.isArray(raw) ? raw : [raw]).map(value => String(value).trim()).filter(Boolean))];
}

async function resolveTargets(repo, codes) {
  if (!codes.length) throw httpError(422, 'hardware_target_required');
  const rows = [];
  for (const code of codes) {
    const row = await repo.findHardwareByCode(code);
    if (!row) throw httpError(422, 'unknown_hardware_target', `Unknown hardware: ${code}`);
    if (!Number(row.enabled)) throw httpError(422, 'hardware_target_disabled', `Hardware disabled: ${code}`);
    rows.push(row);
  }
  return rows;
}

function isReleaseIdentityConflict(error) {
  const text = String(error?.message || error || '');
  return /UNIQUE constraint failed/i.test(text) || /ota_releases.*unique/i.test(text) || /idx_ota_release_seq_v1/i.test(text);
}

export function createReleaseOtaService({ repo, firmwareBucket, now = () => new Date(), uuid = () => crypto.randomUUID() }) {
  const timestamp = () => asIso(now());

  async function createRelease(formData, actor = 'admin') {
    if (!firmwareBucket?.put || !firmwareBucket?.delete) throw httpError(503, 'firmware_storage_unavailable');
    const file = formData.get('file');
    const fileMeta = await validateFirmwareFile(file);
    const product = normalizeProduct(formData.get('product'));
    if (product === V1_PRODUCT && fileMeta.size > GAME_SLOT_BYTES) throw httpError(413, 'firmware_exceeds_game_slot');

    const version = normalizeVersion(formData.get('version'), product);
    const buildId = requiredText(formData.get('build_id'), 'build_id_required', product === V1_PRODUCT ? 128 : 160);
    const channel = normalizeChannel(formData.get('channel'));
    const secure = secureVersion(formData.get('secure_version'));
    const notes = String(formData.get('release_notes') || '').slice(0, product === V1_PRODUCT ? 4096 : 20000);
    const canonical = product === V1_PRODUCT ? canonicalFieldsFromForm(formData) : null;
    const minBootRaw = String(formData.get('min_boot_version') || '').trim();
    const minBoot = canonical ? canonical.minBoot : (minBootRaw ? parseVersion(minBootRaw).version : null);

    if (repo.findReleaseByIdentity && await repo.findReleaseByIdentity(product, version.version, buildId)) {
      throw httpError(409, 'release_already_exists');
    }

    const targets = await resolveTargets(repo, fromForm(formData));
    const suffix = String(uuid()).replaceAll('-', '').slice(0, 12);
    const id = canonical ? canonical.releaseId : `dr-game-${version.version}-${suffix}`;
    if (repo.getRelease && await repo.getRelease(id)) throw httpError(409, 'release_already_exists');
    const r2Key = `ota/dr-game/${id}/${fileMeta.sha256}.bin`;
    const at = timestamp();

    await firmwareBucket.put(r2Key, fileMeta.bytes, {
      httpMetadata: { contentType: 'application/octet-stream' },
      customMetadata: {
        'release-id': id,
        product,
        version: version.version,
        'build-id': buildId,
        sha256: fileMeta.sha256,
        ...(canonical ? { 'release-seq': String(canonical.releaseSeq) } : {})
      }
    });

    try {
      return await repo.createRelease({
        id,
        product,
        version: version.version,
        version_sort: version.sort,
        build_id: buildId,
        channel,
        status: 'draft',
        secure_version: secure,
        min_boot_version: minBoot,
        release_notes: notes,
        r2_key: r2Key,
        file_name: fileMeta.fileName,
        content_type: fileMeta.contentType,
        size_bytes: fileMeta.size,
        sha256: fileMeta.sha256,
        esp_image_valid: 1,
        download_count: 0,
        release_seq: canonical?.releaseSeq ?? null,
        game_fix: canonical?.gameFix ?? 0,
        asset_version: canonical?.assetVersion ?? null,
        signature_alg: canonical?.signatureAlg ?? null,
        signature: canonical?.signature ?? null,
        mandatory: canonical?.mandatory ?? 0,
        created_by: actor,
        created_at: at,
        updated_at: at,
        published_at: null
      }, targets.map(item => item.id));
    } catch (error) {
      try { await firmwareBucket.delete(r2Key); } catch {}
      if (isReleaseIdentityConflict(error)) throw httpError(409, 'release_already_exists');
      throw error;
    }
  }

  async function updateRelease(id, input, actor = 'admin') {
    const current = await repo.getRelease(id);
    if (!current) throw httpError(404, 'release_not_found');
    if (!EDITABLE.has(current.status)) throw httpError(409, 'published_release_is_immutable');
    const product = normalizeProduct(current.product);
    const version = normalizeVersion(input.version ?? current.version, product);
    const buildId = requiredText(input.build_id ?? current.build_id, 'build_id_required', product === V1_PRODUCT ? 128 : 160);
    const channel = normalizeChannel(input.channel ?? current.channel);
    const secure = secureVersion(input.secure_version ?? current.secure_version);
    const canonical = product === V1_PRODUCT ? canonicalFieldsFromInput(input, current) : null;
    const minBootRaw = String(input.min_boot_version ?? current.min_boot_version ?? '').trim();
    const minBoot = canonical ? canonical.minBoot : (minBootRaw ? parseVersion(minBootRaw).version : null);
    const notes = String(input.release_notes ?? current.release_notes ?? '').slice(0, product === V1_PRODUCT ? 4096 : 20000);
    const codes = fromInput(input);
    const targets = codes.length ? await resolveTargets(repo, codes) : null;
    return repo.updateRelease(id, {
      version: version.version,
      version_sort: version.sort,
      build_id: buildId,
      channel,
      secure_version: secure,
      min_boot_version: minBoot,
      release_notes: notes,
      ...(canonical ? {
        release_seq: canonical.releaseSeq,
        game_fix: canonical.gameFix,
        asset_version: canonical.assetVersion,
        signature_alg: canonical.signatureAlg,
        signature: canonical.signature,
        mandatory: canonical.mandatory
      } : {}),
      updated_at: timestamp(),
      updated_by: actor
    }, targets ? targets.map(item => item.id) : undefined);
  }

  async function replaceReleaseFile(id, file, actor = 'admin') {
    if (!firmwareBucket?.put || !firmwareBucket?.delete) throw httpError(503, 'firmware_storage_unavailable');
    const current = await repo.getRelease(id);
    if (!current) throw httpError(404, 'release_not_found');
    if (!EDITABLE.has(current.status)) throw httpError(409, 'published_release_is_immutable');

    const fileMeta = await validateFirmwareFile(file);
    const product = normalizeProduct(current.product);
    if (product === V1_PRODUCT && fileMeta.size > GAME_SLOT_BYTES) throw httpError(413, 'firmware_exceeds_game_slot');

    const r2Key = `ota/dr-game/${id}/${fileMeta.sha256}.bin`;
    const at = timestamp();
    await firmwareBucket.put(r2Key, fileMeta.bytes, {
      httpMetadata: { contentType: 'application/octet-stream' },
      customMetadata: {
        'release-id': id,
        product,
        version: String(current.version || ''),
        'build-id': String(current.build_id || ''),
        sha256: fileMeta.sha256,
        ...(current.release_seq != null ? { 'release-seq': String(current.release_seq) } : {})
      }
    });

    let updated;
    try {
      updated = await repo.updateReleaseFile(id, {
        r2_key: r2Key,
        file_name: fileMeta.fileName,
        content_type: fileMeta.contentType,
        size_bytes: fileMeta.size,
        sha256: fileMeta.sha256,
        esp_image_valid: 1,
        signature: product === V1_PRODUCT ? null : (current.signature ?? null),
        updated_at: at,
        updated_by: actor
      });
    } catch (error) {
      if (r2Key !== current.r2_key) {
        try { await firmwareBucket.delete(r2Key); } catch {}
      }
      throw error;
    }

    if (current.r2_key && current.r2_key !== r2Key) {
      try { await firmwareBucket.delete(current.r2_key); } catch (error) {
        console.warn('[DR OTA] old firmware cleanup failed', { releaseId: id, key: current.r2_key, error: error?.message || String(error) });
      }
    }
    return updated;
  }

  async function publishRelease(id, actor = 'admin') {
    if (!firmwareBucket?.head) throw httpError(503, 'firmware_storage_unavailable');
    const release = await repo.getRelease(id);
    if (!release) throw httpError(404, 'release_not_found');
    if (!release.targets?.length) throw httpError(409, 'hardware_target_required');
    const targetRows = Array.isArray(release.target_hardware) ? release.target_hardware : null;
    if (targetRows && !targetRows.some(item => Number(item.enabled))) throw httpError(409, 'no_enabled_hardware_target');
    if (!Number(release.esp_image_valid)) throw httpError(409, 'firmware_not_validated');
    if (release.product === V1_PRODUCT) {
      if (!Number.isSafeInteger(Number(release.release_seq)) || Number(release.release_seq) < 1 ||
          release.signature_alg !== 'RSA-PSS-SHA256' || String(release.signature || '').length < 64 ||
          !String(release.min_boot_version || '').trim()) {
        throw httpError(409, 'signed_release_metadata_required');
      }
      if (Number(release.size_bytes) > GAME_SLOT_BYTES) throw httpError(409, 'firmware_exceeds_game_slot');
    }
    const object = await firmwareBucket.head(release.r2_key);
    if (!object) throw httpError(409, 'firmware_object_missing');
    if (Number(object.size) !== Number(release.size_bytes)) throw httpError(409, 'firmware_size_mismatch');
    return repo.setReleaseStatus(id, 'published', actor);
  }

  async function disableRelease(id, actor = 'admin') {
    if (!await repo.getRelease(id)) throw httpError(404, 'release_not_found');
    return repo.setReleaseStatus(id, 'disabled', actor);
  }

  async function deleteRelease(id) {
    if (!firmwareBucket?.delete) throw httpError(503, 'firmware_storage_unavailable');
    const release = await repo.getRelease(id);
    if (!release) throw httpError(404, 'release_not_found');
    if (release.status === 'published') throw httpError(409, 'disable_release_before_delete');
    await firmwareBucket.delete(release.r2_key);
    await repo.deleteRelease(id);
    return { ok: true, id };
  }

  async function createHardware(input) {
    const code = requiredText(input.code, 'hardware_code_required', 64);
    const label = requiredText(input.label || code, 'hardware_label_required', 120);
    if (await repo.findHardwareByCode(code)) throw httpError(409, 'hardware_already_exists');
    return repo.createHardware({ code, label });
  }

  return {
    createRelease,
    updateRelease,
    replaceReleaseFile,
    publishRelease,
    disableRelease,
    deleteRelease,
    createHardware,
    updateHardware: (id, patch) => repo.updateHardware(id, patch),
    listHardware: options => repo.listHardware(options),
    listReleases: filters => repo.listReleases(filters),
    getRelease: id => repo.getRelease(id),
    listDevices: filters => repo.listDevices(filters),
    listEvents: filters => repo.listEvents(filters),
    getDevice: id => repo.getDevice(id)
  };
}
