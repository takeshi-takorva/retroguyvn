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
