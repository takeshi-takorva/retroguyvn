import { httpError } from './core.js';

const PRODUCT = 'DigitalRealm';

function versionParts(value) {
  const text = String(value || '').trim();
  let match = text.match(/^(\d+)\.(\d+)-fix(\d+)$/i);
  if (!match) match = text.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return match.slice(1).map(Number);
}

function versionAtLeast(current, required) {
  if (!required) return true;
  const a = versionParts(current);
  const b = versionParts(required);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true;
}

function releaseManifest(release, origin) {
  return {
    release_id: release.id,
    release_seq: Number(release.release_seq),
    product: PRODUCT,
    hardware: release.targets || [],
    channel: release.channel,
    version: release.version,
    ...(Number.isSafeInteger(Number(release.game_fix)) ? { fix: Number(release.game_fix) } : {}),
    build_id: release.build_id,
    secure_version: Number(release.secure_version || 0),
    min_boot_version: release.min_boot_version,
    asset_version: release.asset_version || null,
    size: Number(release.size_bytes),
    sha256: release.sha256,
    signature_alg: release.signature_alg,
    signature: release.signature,
    download_url: new URL('/api/dr/ota/v1/firmware/' + encodeURIComponent(release.id), origin).toString(),
    mandatory: Boolean(Number(release.mandatory || 0)),
    release_notes: String(release.release_notes || '').slice(0, 4096)
  };
}

export function createOtaV1Service({ repo, firmwareBucket, now = () => new Date() }) {
  const iso = () => now().toISOString();

  async function checkForUpdateV1(input, meta = {}) {
    if (!firmwareBucket) throw httpError(503, 'firmware_storage_unavailable');
    const at = iso();
    await repo.upsertDeviceV1({
      deviceId: input.deviceId,
      serial: input.serial,
      hardwareCode: input.hardware,
      bootVersion: input.bootVersion,
      gameVersion: input.gameVersion,
      gameFix: input.gameFix,
      buildId: input.buildId,
      releaseSeq: input.releaseSeq,
      serviceVersion: input.serviceVersion,
      secureVersion: input.secureVersion,
      activeSlot: input.activeSlot,
      assetVersion: input.assetVersion,
      channel: input.channel,
      lastSeenAt: at,
      lastCheckAt: at,
      ip: meta.ip || null,
      userAgent: meta.userAgent || null
    });

    await repo.appendEventV1({
      deviceId: input.deviceId, serial: input.serial, hardwareCode: input.hardware,
      event: 'CHECK', fwBefore: input.gameVersion, result: 'INFO',
      deviceTimestamp: null, ip: meta.ip || null, userAgent: meta.userAgent || null, receivedAt: at
    });

    const hardware = await repo.findHardwareByCode(input.hardware);
    if (!hardware || !Number(hardware.enabled)) {
      await repo.setDeviceOffer(input.deviceId, null);
      return { status: 'up_to_date', currentReleaseSeq: input.releaseSeq };
    }

    const release = await repo.findNewestCompatibleReleaseV1({
      channel: input.channel,
      hardwareCode: input.hardware,
      currentReleaseSeq: input.releaseSeq,
      currentSecureVersion: input.secureVersion
    });

    if (!release || !versionAtLeast(input.bootVersion, release.min_boot_version)) {
      await repo.setDeviceOffer(input.deviceId, null);
      return { status: 'up_to_date', currentReleaseSeq: input.releaseSeq };
    }

    await repo.setDeviceOffer(input.deviceId, release.id);
    await repo.appendEventV1({
      deviceId: input.deviceId, serial: input.serial, hardwareCode: input.hardware,
      releaseId: release.id, event: 'UPDATE_AVAILABLE', fwBefore: input.gameVersion,
      fwAfter: release.version, result: 'INFO', receivedAt: at,
      ip: meta.ip || null, userAgent: meta.userAgent || null
    });
    return { status: 'update_available', release };
  }

  async function authorizeDownloadV1({ releaseId, deviceId }) {
    if (!firmwareBucket?.head) throw httpError(503, 'firmware_storage_unavailable');
    const release = await repo.getRelease(releaseId);
    if (!release || release.status !== 'published' || !Number(release.release_seq)) {
      throw httpError(404, 'release_not_available');
    }
    const device = await repo.getDevice(deviceId);
    if (!device) throw httpError(403, 'device_must_check_first');
    if (!release.targets?.includes(device.hardware_code)) throw httpError(403, 'hardware_not_authorized');
    if (device.last_release_id !== releaseId) throw httpError(403, 'release_not_latest_offer');
    const object = await firmwareBucket.head(release.r2_key);
    if (!object) throw httpError(404, 'firmware_object_missing');
    if (Number(object.size) !== Number(release.size_bytes)) throw httpError(409, 'firmware_size_mismatch');
    return release;
  }

  async function recordLifecycleEventV1(event, meta = {}) {
    await repo.appendEventV1({
      deviceId: event.deviceId,
      serial: event.serial,
      hardwareCode: event.hardwareCode || null,
      releaseId: event.releaseId || null,
      event: event.event,
      progress: event.progress ?? null,
      result: event.result || null,
      errorCode: event.errorCode || null,
      fwBefore: event.fwBefore || null,
      fwAfter: event.fwAfter || null,
      deviceTimestamp: event.timestamp,
      ip: meta.ip || null,
      userAgent: meta.userAgent || null,
      receivedAt: iso()
    });
  }

  return { checkForUpdateV1, authorizeDownloadV1, recordLifecycleEventV1, releaseManifest };
}
