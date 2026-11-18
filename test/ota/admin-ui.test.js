import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('OTA admin login remains visible before client auth and storage access is guarded', async () => {
  const page = await readFile(new URL('../../src/pages/admin/ota.astro', import.meta.url), 'utf8');
  assert.match(page, /class="admin-login" id="loginPanel"/);
  assert.doesNotMatch(page, /class="admin-login admin-hidden" id="loginPanel"/);
  assert.match(page, /safeSessionGet/);
  assert.match(page, /safeSessionSet/);
  assert.match(page, /Admin token is invalid|Admin authentication failed/);
});

test('OTA admin no longer loads the legacy file-actions client', async () => {
  const shell = await readFile(new URL('../../src/components/admin/AdminShell.astro', import.meta.url), 'utf8');
  assert.doesNotMatch(shell, /admin-ota-file-actions\.js/);
});

test('OTA v2 upload UI has real progress and bounded timeout', async () => {
  const page = await readFile(new URL('../../src/pages/admin/ota.astro', import.meta.url), 'utf8');
  assert.match(page, /XMLHttpRequest/);
  assert.match(page, /xhr\.upload\.onprogress/);
  assert.match(page, /xhr\.timeout\s*=\s*timeout/);
  assert.match(page, /timeout=180000/);
});
