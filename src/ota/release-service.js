import { httpError, normalizeChannel, parseVersion, validateFirmwareFile } from './core.js';

const PRODUCT = 'DR_GAME';
const EDITABLE = new Set(['draft', 'disabled']);
const asIso = value => value instanceof Date ? value.toISOString() : new Date(value).toISOString();

function requiredText(value, code, max = 256) {
  const text = String(value ?? '').trim();
  if (!text) throw httpError(400, code);
  if (text.length > max) throw httpError(400, `${code}_too_long`);
  return text;
}

function secureVersion(value) {
  const number = Number(value ?? 0);
  if (!Number.isSafeInteger(number) || number < 0) throw httpError(400, 'invalid_secure_version');
  return number;
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
  return /UNIQUE constraint failed:\s*ota_releases\.product,\s*ota_releases\.version,\s*ota_releases\.build_id/i.test(text)
    || /ota_releases.*product.*version.*build_id.*unique/i.test(text);
}

export function createReleaseOtaService({ repo, firmwareBucket, now = () => new Date(), uuid = () => crypto.randomUUID() }) {
  const timestamp = () => asIso(now());

  async function createRelease(formData, actor = 'admin') {
    if (!firmwareBucket?.put || !firmwareBucket?.delete) throw httpError(503, 'firmware_storage_unavailable');
    const file = formData.get('file');
    const fileMeta = await validateFirmwareFile(file);
    const product = String(formData.get('product') || PRODUCT).trim();
    if (product !== PRODUCT) throw httpError(400, 'unsupported_product');
    const version = parseVersion(formData.get('version'));
    const buildId = requiredText(formData.get('build_id'), 'build_id_required', 160);
    const channel = normalizeChannel(formData.get('channel'));
    const secure = secureVersion(formData.get('secure_version'));
    const minBootRaw = String(formData.get('min_boot_version') || '').trim();
    const minBoot = minBootRaw ? parseVersion(minBootRaw).version : null;
    const notes = String(formData.get('release_notes') || '').slice(0, 20000);

    if (repo.findReleaseByIdentity && await repo.findReleaseByIdentity(product, version.version, buildId)) {
      throw httpError(409, 'release_already_exists');
    }

    const targets = await resolveTargets(repo, fromForm(formData));
    const suffix = String(uuid()).replaceAll('-', '').slice(0, 12);
    const id = `dr-game-${version.version}-${suffix}`;
    const r2Key = `ota/dr-game/${id}/${fileMeta.sha256}.bin`;
    const at = timestamp();

    await firmwareBucket.put(r2Key, file.stream(), {
      httpMetadata: { contentType: 'application/octet-stream' },
      customMetadata: {
        'release-id': id,
        product,
        version: version.version,
        'build-id': buildId,
        sha256: fileMeta.sha256
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
    const version = parseVersion(input.version ?? current.version);
    const buildId = requiredText(input.build_id ?? current.build_id, 'build_id_required', 160);
    const channel = normalizeChannel(input.channel ?? current.channel);
    const secure = secureVersion(input.secure_version ?? current.secure_version);
    const minBootRaw = String(input.min_boot_version ?? current.min_boot_version ?? '').trim();
    const minBoot = minBootRaw ? parseVersion(minBootRaw).version : null;
    const notes = String(input.release_notes ?? current.release_notes ?? '').slice(0, 20000);
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
      updated_at: timestamp(),
      updated_by: actor
    }, targets ? targets.map(item => item.id) : undefined);
  }

  async function publishRelease(id, actor = 'admin') {
    if (!firmwareBucket?.head) throw httpError(503, 'firmware_storage_unavailable');
    const release = await repo.getRelease(id);
    if (!release) throw httpError(404, 'release_not_found');
    if (!release.targets?.length) throw httpError(409, 'hardware_target_required');
    const targetRows = Array.isArray(release.target_hardware) ? release.target_hardware : null;
    if (targetRows && !targetRows.some(item => Number(item.enabled))) throw httpError(409, 'no_enabled_hardware_target');
    if (!Number(release.esp_image_valid)) throw httpError(409, 'firmware_not_validated');
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
