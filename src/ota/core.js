const VERSION_RE = /^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/;
const CHANNELS = new Set(['stable', 'beta', 'dev']);
export const MAX_FIRMWARE_BYTES = 16 * 1024 * 1024;

export function httpError(status, code, message = code, extra = undefined) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  if (extra !== undefined) error.extra = extra;
  return error;
}

function cleanHeader(request, name, code, maxLength = 160) {
  const value = String(request.headers.get(name) || '').trim();
  if (!value) throw httpError(400, code);
  if (value.length > maxLength) throw httpError(400, `${code}_too_long`);
  return value;
}

export function parseVersion(value) {
  const text = String(value ?? '').trim();
  const match = text.match(VERSION_RE);
  if (!match) throw httpError(400, 'invalid_version');
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  return {
    version: text,
    major,
    minor,
    patch,
    sort: major * 100000000 + minor * 10000 + patch
  };
}

export function compareVersionStrings(a, b) {
  const left = parseVersion(a).sort;
  const right = parseVersion(b).sort;
  return left === right ? 0 : left > right ? 1 : -1;
}

export function normalizeChannel(value) {
  const channel = String(value ?? '').trim().toLowerCase() || 'stable';
  if (!CHANNELS.has(channel)) throw httpError(400, 'invalid_channel');
  return channel;
}

export function readDeviceCheckHeaders(request) {
  const deviceId = cleanHeader(request, 'X-DR-Device-ID', 'missing_device_id');
  const hardwareCode = cleanHeader(request, 'X-DR-HW-Version', 'missing_hardware_version', 64);
  const firmwareVersion = cleanHeader(request, 'X-DR-FW-Version', 'missing_firmware_version', 64);
  const parsedFirmware = parseVersion(firmwareVersion);
  const bootRaw = String(request.headers.get('X-DR-Boot-Version') || '').trim();
  const bootParsed = bootRaw ? parseVersion(bootRaw) : null;
  return {
    deviceId,
    hardwareCode,
    firmwareVersion: parsedFirmware.version,
    firmwareSort: parsedFirmware.sort,
    bootVersion: bootParsed?.version || null,
    bootVersionSort: bootParsed?.sort ?? null,
    channel: normalizeChannel(request.headers.get('X-DR-Channel'))
  };
}

export function readDownloadHeaders(request) {
  return {
    releaseId: cleanHeader(request, 'X-DR-Release-ID', 'missing_release_id'),
    deviceId: cleanHeader(request, 'X-DR-Device-ID', 'missing_device_id'),
    hardwareCode: cleanHeader(request, 'X-DR-HW-Version', 'missing_hardware_version', 64)
  };
}

export function parseSingleRange(header, totalSize) {
  if (!header) return null;
  if (!Number.isSafeInteger(totalSize) || totalSize <= 0) throw httpError(416, 'invalid_range');
  const text = String(header).trim();
  if (text.includes(',')) throw httpError(416, 'multiple_ranges_not_supported');
  const match = text.match(/^bytes=(\d+)-(\d*)$/i);
  if (!match) throw httpError(416, 'invalid_range');
  const start = Number(match[1]);
  const end = match[2] === '' ? totalSize - 1 : Number(match[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= totalSize || end >= totalSize) {
    throw httpError(416, 'range_not_satisfiable');
  }
  return { start, end, length: end - start + 1 };
}

function toHex(bytes) {
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
}

export async function validateFirmwareFile(file) {
  if (!file || typeof file.arrayBuffer !== 'function' || typeof file.name !== 'string') {
    throw httpError(400, 'missing_firmware_file');
  }
  const fileName = file.name.trim();
  if (!fileName.toLowerCase().endsWith('.bin')) throw httpError(415, 'firmware_must_be_bin');
  const size = Number(file.size || 0);
  if (!Number.isSafeInteger(size) || size <= 0) throw httpError(400, 'empty_firmware_file');
  if (size > MAX_FIRMWARE_BYTES) throw httpError(413, 'firmware_too_large');
  const firstByte = new Uint8Array(await file.slice(0, 1).arrayBuffer())[0];
  if (firstByte !== 0xE9) throw httpError(422, 'invalid_esp_image_magic');
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return {
    size,
    sha256: toHex(digest),
    fileName,
    contentType: 'application/octet-stream'
  };
}

export function requestClientMetadata(request) {
  return {
    ip: String(request.headers.get('CF-Connecting-IP') || '').trim() || null,
    userAgent: String(request.headers.get('User-Agent') || '').trim().slice(0, 512) || null
  };
}

export function jsonResponse(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(init.headers || {})
    }
  });
}

export function errorResponse(error) {
  const status = Number(error?.status || 500);
  const code = error?.code || (status >= 500 ? 'internal_error' : 'request_error');
  return jsonResponse({ error: code, message: status >= 500 ? 'Internal server error' : (error?.message || code) }, { status });
}
