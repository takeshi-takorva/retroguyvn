import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('simplified OTA admin removes legacy release metadata and secondary tabs', async () => {
  const page = await readFile(new URL('../../src/pages/admin/ota.astro', import.meta.url), 'utf8');

  for (const legacy of [
    'Release ID',
    'Release sequence',
    'Build ID',
    'Channel',
    'Secure version',
    'Minimum Boot FW',
    'Asset version',
    'Mandatory',
    'RSA-PSS-SHA256 signature',
    '>Hardware<',
    '>Devices<',
    '>Event History<'
  ]) {
    assert.doesNotMatch(page, new RegExp(legacy));
  }
});

test('simplified OTA admin shows Game BIN, optional VGI pack, notes and auto-detected version', async () => {
  const page = await readFile(new URL('../../src/pages/admin/ota.astro', import.meta.url), 'utf8');

  assert.match(page, /Game FW \.bin/);
  assert.match(page, /Assets \.vgi\.pack/);
  assert.match(page, /Release notes/);
  assert.match(page, /id="detectedVersion"/);
  assert.match(page, /Auto-detected from DR_Game_FW/);
  assert.match(page, /detectGameVersion/);
  assert.match(page, /\/api\/admin\/ota\/simple\/releases/);
  assert.match(page, /\/api\/dr\/ota\/v2\/check/);
});

test('simplified OTA admin upload flow sends game first, optional assets second', async () => {
  const page = await readFile(new URL('../../src/pages/admin/ota.astro', import.meta.url), 'utf8');

  assert.match(page, /form\.set\('file',\s*gameFile\)/);
  assert.match(page, /uploadFormData\('\/api\/admin\/ota\/simple\/releases'/);
  assert.match(page, /assetsFile/);
  assert.match(page, /\/assets/);
  assert.match(page, /Publish/);
});


test('optional assets upload failure keeps the created Game draft recoverable', async () => {
  const page = await readFile(new URL('../../src/pages/admin/ota.astro', import.meta.url), 'utf8');
  assert.match(page, /Game FW was uploaded as Draft/);
  assert.match(page, /Add Assets/);
  assert.match(page, /createdRelease/);
});
