import { httpError } from './core.js';

const PRODUCT = 'DR_GAME';
const asIso = value => value instanceof Date ? value.toISOString() : new Date(value).toISOString();

function releaseDto(release) {
  return {
    release_id: release.id,
    product: release.product,
    version: release.version,
    build_id: release.build_id,
    channel: release.channel,
    hardware: release.targets || [],
    secure_version: Number(release.secure_version || 0),
    min_boot_version: release.min_boot_version || null,
    size: Number(release.size_bytes || 0),
    sha256: release.sha256,
    release_notes: release.release_notes || '',
    download: '/api/dr/ota/download'
  };
}

export function createDeviceOtaService({ repo, firmwareBucket, now = () => new Date() }) {
  const timestamp = () => asIso(now());

  async function appendCheckEvent(type, input, meta, patch = {}) {
    return repo.appendEvent({
      deviceId: input.deviceId,
      eventType: type,
      hardwareCode: input.hardwareCode,
      currentFw: input.firmwareVersion,
      bootVersion: input.bootVersion,
      channel: input.channel,
      ip: meta?.ip || null,
      userAgent: meta?.userAgent || null,
      createdAt: timestamp(),
      ...patch
    });
  }

  async function noUpdate(input, meta, reason) {
    await repo.setDeviceOffer(input.deviceId, null);
    await appendCheckEvent('NO_UPDATE', input, meta, { httpStatus: 200, detailJson: { reason } });
    return {
      update_available: false,
      product: PRODUCT,
      hardware: input.hardwareCode,
      channel: input.channel,
      current_version: input.firmwareVersion,
      reason
    };
  }

  async function checkForUpdate(input, meta = {}) {
    if (!firmwareBucket) throw httpError(503, 'firmware_storage_unavailable');

    const at = timestamp();
    await repo.upsertDevice({
      deviceId: input.deviceId,
      hardwareCode: input.hardwareCode,
      bootVersion: input.bootVersion,
      gameVersion: input.firmwareVersion,
      channel: input.channel,
      lastSeenAt: at,
      lastCheckAt: at,
      ip: meta.ip || null,
      userAgent: meta.userAgent || null
    });
    await appendCheckEvent('CHECK', input, meta, { httpStatus: 200 });

    const hardware = await repo.findHardwareByCode(input.hardwareCode);
    if (!hardware) return noUpdate(input, meta, 'unknown_hardware');
    if (!Number(hardware.enabled)) return noUpdate(input, meta, 'hardware_disabled');

    const release = await repo.findNewestCompatibleRelease({
      product: PRODUCT,
      channel: input.channel,
      hardwareCode: input.hardwareCode,
      currentVersionSort: input.firmwareSort,
      bootVersionSort: input.bootVersionSort
    });
    if (release) {
      await repo.setDeviceOffer(input.deviceId, release.id);
      await appendCheckEvent('UPDATE_AVAILABLE', input, meta, {
        releaseId: release.id,
        targetFw: release.version,
        httpStatus: 200
      });
      return { update_available: true, ...releaseDto(release) };
    }

    const published = await repo.listReleases({
      product: PRODUCT,
      channel: input.channel,
      status: 'published',
      hardwareCode: input.hardwareCode,
      limit: 100
    });
    if (!published.length) return noUpdate(input, meta, 'no_published_release');
    const newer = published.filter(item => Number(item.version_sort) > input.firmwareSort);
    if (!newer.length) return noUpdate(input, meta, 'up_to_date');
    if (newer.some(item => item.min_boot_version)) return noUpdate(input, meta, 'boot_version_required');
    return noUpdate(input, meta, 'up_to_date');
  }

  async function authorizeDownload({ releaseId, deviceId, hardwareCode }) {
    if (!firmwareBucket?.head) throw httpError(503, 'firmware_storage_unavailable');
    const release = await repo.getRelease(releaseId);
    if (!release || release.status !== 'published') throw httpError(404, 'release_not_available');
    if (!release.targets?.includes(hardwareCode)) throw httpError(409, 'hardware_not_authorized');
    const device = await repo.getDevice(deviceId);
    if (!device) throw httpError(409, 'device_must_check_first');
    if (device.hardware_code !== hardwareCode) throw httpError(409, 'device_hardware_changed');
    if (device.last_release_id !== releaseId) throw httpError(409, 'release_not_latest_offer');
    const object = await firmwareBucket.head(release.r2_key);
    if (!object) throw httpError(404, 'firmware_object_missing');
    if (Number(object.size) !== Number(release.size_bytes)) throw httpError(409, 'firmware_size_mismatch');
    return release;
  }

  async function getFirmwareObject(release, range) {
    if (!firmwareBucket?.get) throw httpError(503, 'firmware_storage_unavailable');
    const options = range ? { range: { offset: range.start, length: range.length } } : undefined;
    const object = await firmwareBucket.get(release.r2_key, options);
    if (!object) throw httpError(404, 'firmware_object_missing');
    return object;
  }

  async function recordDownloadEvent(type, context) {
    const { release, deviceId, hardwareCode, device, meta, status, bytes = 0, range = null, detail = null } = context;
    const at = timestamp();
    await repo.appendEvent({
      deviceId,
      eventType: type,
      hardwareCode,
      currentFw: device?.game_version || null,
      bootVersion: device?.boot_version || null,
      channel: device?.channel || release?.channel || null,
      releaseId: release?.id || null,
      targetFw: release?.version || null,
      httpStatus: status,
      bytesServed: bytes,
      rangeStart: range?.start ?? null,
      rangeEnd: range?.end ?? null,
      ip: meta?.ip || null,
      userAgent: meta?.userAgent || null,
      detailJson: detail,
      createdAt: at
    });
    if (release && deviceId && (type === 'DOWNLOAD_RANGE' || type === 'DOWNLOAD_COMPLETE')) {
      await repo.markDeviceDownload(deviceId, release.id, at);
    }
    if (release && type === 'DOWNLOAD_COMPLETE') await repo.incrementDownloadCount(release.id);
  }

  return { checkForUpdate, authorizeDownload, getFirmwareObject, recordDownloadEvent };
}
