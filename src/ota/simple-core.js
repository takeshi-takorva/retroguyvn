const SIMPLE_VERSION_RE = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const APP_DESC_MAGIC = 0xABCD5432;
const APP_DESC_VERSION_OFFSET = 16;
const APP_DESC_PROJECT_OFFSET = 48;
const APP_DESC_TEXT_BYTES = 32;
const VGI_PACK_MAGIC = 'DRVGP001';

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function readCString(bytes, offset, length) {
  if (offset < 0 || offset + length > bytes.byteLength) return '';
  let end = offset;
  const limit = offset + length;
  while (end < limit && bytes[end] !== 0) end += 1;
  return new TextDecoder().decode(bytes.subarray(offset, end)).trim();
}

export function parseSimpleVersion(value) {
  const text = String(value ?? '').trim();
  const match = SIMPLE_VERSION_RE.exec(text);
  if (!match) fail('invalid_simple_version');
  const hwMajor = Number(match[1]);
  const hwMinor = Number(match[2]);
  const revision = Number(match[3]);
  if (![hwMajor, hwMinor, revision].every(Number.isSafeInteger)) fail('invalid_simple_version');
  return { version: text, hwMajor, hwMinor, revision };
}

export function compareSimpleVersion(currentValue, candidateValue) {
  const current = parseSimpleVersion(currentValue);
  const candidate = parseSimpleVersion(candidateValue);
  if (current.hwMajor !== candidate.hwMajor || current.hwMinor !== candidate.hwMinor) return null;
  if (candidate.revision > current.revision) return 1;
  if (candidate.revision < current.revision) return -1;
  return 0;
}

export function parseEspGameImage(input) {
  const bytes = input instanceof Uint8Array
    ? input
    : input instanceof ArrayBuffer
      ? new Uint8Array(input)
      : new Uint8Array(input?.buffer || []);
  if (bytes.byteLength < 80 || bytes[0] !== 0xE9) fail('invalid_esp_image');

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const scanLimit = Math.max(0, bytes.byteLength - (APP_DESC_PROJECT_OFFSET + APP_DESC_TEXT_BYTES));
  for (let offset = 0; offset <= scanLimit; offset += 4) {
    if (view.getUint32(offset, true) !== APP_DESC_MAGIC) continue;
    const version = readCString(bytes, offset + APP_DESC_VERSION_OFFSET, APP_DESC_TEXT_BYTES);
    const projectName = readCString(bytes, offset + APP_DESC_PROJECT_OFFSET, APP_DESC_TEXT_BYTES);
    if (projectName !== 'DR_Game_FW') fail('not_dr_game_fw');
    const parsed = parseSimpleVersion(version);
    return { projectName, ...parsed };
  }
  fail('esp_app_desc_not_found');
}

export function validateAssetsPackHeader(input) {
  const bytes = input instanceof Uint8Array
    ? input
    : input instanceof ArrayBuffer
      ? new Uint8Array(input)
      : new Uint8Array(input?.buffer || []);
  if (bytes.byteLength < 12) fail('invalid_vgi_pack');
  const magic = new TextDecoder().decode(bytes.subarray(0, 8));
  if (magic !== VGI_PACK_MAGIC) fail('invalid_vgi_pack');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const formatVersion = view.getUint16(8, true);
  const entryCount = view.getUint16(10, true);
  if (formatVersion !== 1 || entryCount < 1) fail('invalid_vgi_pack');
  return { formatVersion, entryCount };
}
