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
  let sawDescriptorMagic = false;
  for (let offset = 0; offset <= scanLimit; offset += 4) {
    if (view.getUint32(offset, true) !== APP_DESC_MAGIC) continue;
    sawDescriptorMagic = true;
    const version = readCString(bytes, offset + APP_DESC_VERSION_OFFSET, APP_DESC_TEXT_BYTES);
    const projectName = readCString(bytes, offset + APP_DESC_PROJECT_OFFSET, APP_DESC_TEXT_BYTES);
    if (projectName !== 'DR_Game_FW') continue;
    const parsed = parseSimpleVersion(version);
    return { projectName, ...parsed };
  }
  fail(sawDescriptorMagic ? 'not_dr_game_fw' : 'esp_app_desc_not_found');
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


function safePackSource(path) {
  const text = String(path || '');
  if (!text || text.startsWith('/') || text.includes('\\') || text.includes('//')) fail('invalid_vgi_install_path');
  const parts = text.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) fail('invalid_vgi_install_path');
  return text;
}

function safePackDestination(path) {
  const text = String(path || '');
  if (!text.startsWith('/data/') || text.includes('\\') || text.includes('//')) fail('invalid_vgi_install_path');
  const parts = text.slice(1).split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) fail('invalid_vgi_install_path');
  return text;
}

function parseInstallManifest(text, entryNames) {
  const rawLines = String(text || '').split(/\r?\n/);
  if (!rawLines.length || rawLines[0].trim() !== 'DR_ASSET_PACK_V1') fail('invalid_vgi_install_manifest');
  let version = null;
  for (const raw of rawLines.slice(1)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('VERSION=')) {
      version = parseSimpleVersion(line.slice(8)).version;
      continue;
    }
    if (line.startsWith('COPY ')) {
      const parts = line.split(' ');
      if (parts.length !== 3) fail('invalid_vgi_install_manifest');
      const source = safePackSource(parts[1]);
      safePackDestination(parts[2]);
      if (!entryNames.has(source)) fail('vgi_copy_source_missing');
      continue;
    }
    if (line.startsWith('DELETE ')) {
      safePackDestination(line.slice(7));
      continue;
    }
    fail('invalid_vgi_install_manifest');
  }
  if (!version) fail('invalid_vgi_install_manifest');
  return version;
}

export async function validateAssetsPack(input) {
  const bytes = input instanceof Uint8Array
    ? input
    : input instanceof ArrayBuffer
      ? new Uint8Array(input)
      : new Uint8Array(input?.buffer || []);
  const header = validateAssetsPackHeader(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const entries = new Map();
  let offset = 12;
  for (let index = 0; index < header.entryCount; index += 1) {
    if (offset + 38 > bytes.length) fail('invalid_vgi_pack');
    const pathLength = view.getUint16(offset, true); offset += 2;
    const dataLength = view.getUint32(offset, true); offset += 4;
    const expected = bytes.subarray(offset, offset + 32); offset += 32;
    if (!pathLength || pathLength > 192 || offset + pathLength + dataLength > bytes.length) fail('invalid_vgi_pack');
    const path = safePackSource(decoder.decode(bytes.subarray(offset, offset + pathLength))); offset += pathLength;
    if (entries.has(path)) fail('duplicate_vgi_entry');
    const data = bytes.subarray(offset, offset + dataLength); offset += dataLength;
    const actual = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
    if (actual.length !== expected.length || actual.some((value, i) => value !== expected[i])) fail('vgi_entry_sha_mismatch');
    entries.set(path, data);
  }
  if (offset !== bytes.length) fail('invalid_vgi_pack');
  const first = entries.keys().next().value;
  if (first !== 'install.md') fail('invalid_vgi_install_manifest');
  const manifestBytes = entries.get('install.md');
  if (!manifestBytes || manifestBytes.byteLength > 16 * 1024) fail('invalid_vgi_install_manifest');
  const version = parseInstallManifest(decoder.decode(manifestBytes), new Set(entries.keys()));
  return { version, entryCount: header.entryCount };
}
