import { errorResponse, httpError, jsonResponse, parseSingleRange, requestClientMetadata } from './core.js';

const DEVICE_ID_RE = /^[0-9A-F]{32}$/;
const SERIAL_RE = /^(?:UNPROVISIONED|[0-9A-HJKMNP-TV-Z]{10})$/;
const HW_RE = /^HW[0-9]+\.[0-9]+(?:\.[0-9]+)?$/;
const RELEASE_ID_RE = /^[A-Za-z0-9._-]{3,96}$/;
const EVENTS = new Set(['CHECK','UP_TO_DATE','UPDATE_AVAILABLE','UPDATE_REJECTED','DOWNLOAD_START','DOWNLOAD_PROGRESS','DOWNLOAD_COMPLETE','DOWNLOAD_FAILED','VERIFY_PASS','VERIFY_FAIL','INSTALL_START','INSTALL_COMPLETE','INSTALL_FAILED','BOOT_PENDING_VERIFY','BOOT_CONFIRMED','ROLLBACK']);
const RESULTS = new Set(['INFO','PASS','FAIL']);

function requiredHeader(request, name, code) {
  const value = String(request.headers.get(name) || '').trim();
  if (!value) throw httpError(400, code);
  return value;
}

function safeInteger(value, code, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) throw httpError(400, code);
  return value;
}

async function jsonBody(request) {
  try { return await request.json(); }
  catch { throw httpError(400, 'invalid_json'); }
}

function readIdentityHeaders(request, { full = true } = {}) {
  const deviceId = requiredHeader(request, 'X-DR-Device-ID', 'missing_device_id');
  if (!DEVICE_ID_RE.test(deviceId)) throw httpError(400, 'invalid_device_id');
  if (!full) return { deviceId };
  const protocol = requiredHeader(request, 'X-DR-Protocol', 'missing_protocol');
  if (protocol !== '1') throw httpError(426, 'unsupported_protocol');
  const serial = requiredHeader(request, 'X-DR-Serial', 'missing_serial');
  if (!SERIAL_RE.test(serial)) throw httpError(400, 'invalid_serial');
  const hardware = requiredHeader(request, 'X-DR-HW-Version', 'missing_hardware_version');
  if (!HW_RE.test(hardware)) throw httpError(400, 'invalid_hardware');
  return {
    deviceId, serial, hardware,
    bootVersion: requiredHeader(request, 'X-DR-Boot-Version', 'missing_boot_version'),
    gameVersion: requiredHeader(request, 'X-DR-FW-Version', 'missing_firmware_version')
  };
}

function validateCheck(headers, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw httpError(400, 'invalid_check_body');
  if (body.protocol !== 1) throw httpError(426, 'unsupported_protocol');
  if (body.product !== 'DigitalRealm') throw httpError(400, 'unsupported_product');
  if (!['stable','beta','dev'].includes(body.channel)) throw httpError(400, 'invalid_channel');
  if (!DEVICE_ID_RE.test(String(body.device_id || '')) || !SERIAL_RE.test(String(body.serial || '')) ||
      !HW_RE.test(String(body.hardware || ''))) throw httpError(400, 'invalid_identity');
  if (headers.deviceId !== body.device_id || headers.serial !== body.serial ||
      headers.hardware !== body.hardware || headers.bootVersion !== body.boot_version ||
      headers.gameVersion !== body.game_version) throw httpError(400, 'identity_mismatch');
  if (!String(body.build_id || '').trim() || !String(body.service_version || '').trim()) throw httpError(400, 'invalid_device_state');
  safeInteger(body.release_seq, 'invalid_release_seq');
  safeInteger(body.secure_version, 'invalid_secure_version');
  if (body.game_fix !== undefined) safeInteger(body.game_fix, 'invalid_game_fix');
  if (!['A','B','NONE'].includes(body.active_slot)) throw httpError(400, 'invalid_active_slot');
  if (!(body.asset_version == null || typeof body.asset_version === 'string')) throw httpError(400, 'invalid_asset_version');
  return {
    deviceId: body.device_id, serial: body.serial, hardware: body.hardware,
    bootVersion: body.boot_version, gameVersion: body.game_version,
    gameFix: body.game_fix ?? 0, buildId: body.build_id, releaseSeq: body.release_seq,
    serviceVersion: body.service_version, secureVersion: body.secure_version,
    activeSlot: body.active_slot, assetVersion: body.asset_version ?? null, channel: body.channel
  };
}

function validateEvent(headers, body) {
  if (!body || body.protocol !== 1) throw httpError(400, 'invalid_event_body');
  if (!DEVICE_ID_RE.test(String(body.device_id || '')) || !SERIAL_RE.test(String(body.serial || ''))) throw httpError(400, 'invalid_identity');
  if (headers.deviceId !== body.device_id || headers.serial !== body.serial) throw httpError(400, 'identity_mismatch');
  if (!EVENTS.has(body.event)) throw httpError(400, 'invalid_event');
  if (body.release_id != null && !RELEASE_ID_RE.test(String(body.release_id))) throw httpError(400, 'invalid_release_id');
  if (body.progress !== undefined) {
    safeInteger(body.progress, 'invalid_progress');
    if (body.progress > 100) throw httpError(400, 'invalid_progress');
  }
  if (body.result !== undefined && !RESULTS.has(body.result)) throw httpError(400, 'invalid_result');
  if (typeof body.timestamp !== 'string' || !body.timestamp) throw httpError(400, 'invalid_timestamp');
  return {
    deviceId: body.device_id, serial: body.serial, hardwareCode: headers.hardware,
    releaseId: body.release_id ?? null, event: body.event, progress: body.progress,
    result: body.result, errorCode: body.error_code ?? null, fwBefore: body.fw_before ?? null,
    fwAfter: body.fw_after ?? null, timestamp: body.timestamp
  };
}

function releaseManifest(release, origin) {
  return {
    release_id: release.id,
    release_seq: Number(release.release_seq),
    product: 'DigitalRealm',
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

function firmwareHeaders(release, length) {
  const headers = new Headers({
    'content-type': 'application/octet-stream',
    'content-length': String(length),
    'accept-ranges': 'bytes',
    'cache-control': 'private, no-store',
    'X-DR-Release-ID': release.id,
    'X-DR-SHA256': release.sha256,
    etag: `"${release.sha256}"`
  });
  if (release.file_name) headers.set('content-disposition', `attachment; filename="${String(release.file_name).replaceAll('"','')}"`);
  return headers;
}

export function createOtaV1Http({ service, now = () => new Date() }) {
  if (!service) throw new TypeError('service is required');

  async function handle(request, _env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/dr/ota/v1/')) return null;
    try {
      if (url.pathname === '/api/dr/ota/v1/check') {
        if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, { status: 405, headers: { allow: 'POST' } });
        const headers = readIdentityHeaders(request);
        const input = validateCheck(headers, await jsonBody(request));
        const result = await service.checkForUpdateV1(input, requestClientMetadata(request));
        if (result.status === 'update_available') {
          return jsonResponse({ protocol: 1, status: 'update_available', server_time: now().toISOString(),
            release: releaseManifest(result.release, request.url) });
        }
        return jsonResponse({ protocol: 1, status: 'up_to_date', server_time: now().toISOString(),
          current_release_seq: Number(result.currentReleaseSeq || 0) });
      }

      if (url.pathname === '/api/dr/ota/v1/events') {
        if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, { status: 405, headers: { allow: 'POST' } });
        const headers = readIdentityHeaders(request);
        const event = validateEvent(headers, await jsonBody(request));
        await service.recordLifecycleEventV1(event, requestClientMetadata(request));
        return jsonResponse({ ok: true });
      }

      const match = url.pathname.match(/^\/api\/dr\/ota\/v1\/firmware\/([^/]+)$/);
      if (match) {
        if (request.method !== 'GET') return jsonResponse({ error: 'method_not_allowed' }, { status: 405, headers: { allow: 'GET' } });
        const releaseId = decodeURIComponent(match[1]);
        if (!RELEASE_ID_RE.test(releaseId)) throw httpError(400, 'invalid_release_id');
        const { deviceId } = readIdentityHeaders(request, { full: false });
        const release = await service.authorizeDownloadV1({ releaseId, deviceId });
        let range;
        try { range = parseSingleRange(request.headers.get('Range'), Number(release.size_bytes)); }
        catch (error) {
          if (Number(error?.status) === 416) return jsonResponse({ error: error.code || 'range_not_satisfiable' }, {
            status: 416, headers: { 'content-range': `bytes */${release.size_bytes}`, 'accept-ranges': 'bytes' }
          });
          throw error;
        }
        const object = await service.getFirmwareObject(release, range);
        const length = range?.length || Number(release.size_bytes);
        const headers = firmwareHeaders(release, length);
        if (range) headers.set('content-range', `bytes ${range.start}-${range.end}/${release.size_bytes}`);
        return new Response(object.body, { status: range ? 206 : 200, headers });
      }

      return jsonResponse({ error: 'not_found' }, { status: 404 });
    } catch (error) {
      return errorResponse(error);
    }
  }

  return { handle };
}
