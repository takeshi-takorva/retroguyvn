import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('admin shell loads OTA file actions and client uses protected release file endpoint', async () => {
  const shell = await readFile(new URL('../../src/components/admin/AdminShell.astro', import.meta.url), 'utf8');
  const client = await readFile(new URL('../../public/admin-ota-file-actions.js', import.meta.url), 'utf8');
  assert.match(shell, /admin-ota-file-actions\.js/);
  assert.match(client, /\/api\/admin\/ota\/releases\/.*\/file/);
  assert.match(client, /Download/);
  assert.match(client, /Copy link/);
  assert.match(client, /rg_admin_token/);
});


test('OTA admin login remains visible before client auth and storage access is guarded', async () => {
  const page = await readFile(new URL('../../src/pages/admin/ota.astro', import.meta.url), 'utf8');
  assert.match(page, /class="admin-login" id="loginPanel"/);
  assert.doesNotMatch(page, /class="admin-login admin-hidden" id="loginPanel"/);
  assert.match(page, /safeSessionGet/);
  assert.match(page, /safeSessionSet/);
  assert.match(page, /Admin token is invalid|Admin authentication failed/);
});


test('OTA endpoint placeholder is escaped so Astro can render the page', async () => {
  const page = await readFile(new URL('../../src/pages/admin/ota.astro', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /firmware\/\{release_id\}/);
  assert.match(page, /firmware\/&#123;release_id&#125;/);
});


test('OTA admin upload UI exposes replace-file action with progress and timeout', async () => {
  const page = await readFile(new URL('../../src/pages/admin/ota.astro', import.meta.url), 'utf8');
  const fileActions = await readFile(new URL('../../public/admin-ota-file-actions.js', import.meta.url), 'utf8');

  assert.match(page, /XMLHttpRequest/);
  assert.match(page, /xhr\.upload\.onprogress/);
  assert.match(page, /xhr\.timeout\s*=\s*timeout/);
  assert.match(page, /Uploading firmware/);
  assert.match(fileActions, /Update file/);
  assert.match(fileActions, /uploadFormData\(protectedFilePath\(id\), form, 'PUT'\)/);
  assert.match(fileActions, /xhr\.upload\.onprogress/);
  assert.match(fileActions, /xhr\.timeout\s*=\s*180000/);
  assert.match(fileActions, /old signature was cleared/);
});
