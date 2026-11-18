import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimpleOtaHttp } from '../../src/ota/simple-http.js';

const ctx = () => ({ waitUntil() {} });

test('public v2 check accepts only current version and returns simplified offer', async () => {
  let current = null;
  const service = {
    async checkForUpdate(version, origin) {
      current = { version, origin };
      return {
        update: true,
        version: 'v1.1.130',
        firmware: { url: origin + '/api/dr/ota/v2/game/v1.1.130', size: 10, sha256: 'a'.repeat(64) },
        assets: null,
        notes: 'fix130'
      };
    }
  };
  const http = createSimpleOtaHttp({ service });
  const response = await http.handlePublic(new Request('https://retroguyvn.com/api/dr/ota/v2/check', {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({ version:'v1.1.129' })
  }), {}, ctx());

  assert.equal(response.status, 200);
  assert.deepEqual(current, { version:'v1.1.129', origin:'https://retroguyvn.com' });
  assert.equal((await response.json()).version, 'v1.1.130');
});

test('admin v2 create/list/publish routes call service with authenticated actor', async () => {
  const calls = [];
  const service = {
    async createRelease(form, actor) { calls.push(['create', form.get('notes'), actor]); return { version:'v1.1.130' }; },
    async listReleases() { return [{ version:'v1.1.130' }]; },
    async publishRelease(version) { calls.push(['publish', version]); return { version, status:'published' }; }
  };
  const http = createSimpleOtaHttp({ service });
  const form = new FormData();
  form.set('file', new File([Uint8Array.from([0xE9])], 'game.bin'));
  form.set('notes','test');

  let response = await http.handleAdmin(new Request('https://retroguyvn.com/api/admin/ota/simple/releases', {
    method:'POST', body:form
  }), {}, ctx(), { email:'admin@example.com' });
  assert.equal(response.status, 200);
  assert.deepEqual(calls[0], ['create','test','admin@example.com']);

  response = await http.handleAdmin(new Request('https://retroguyvn.com/api/admin/ota/simple/releases'), {}, ctx(), { email:'admin@example.com' });
  assert.deepEqual((await response.json()).items, [{ version:'v1.1.130' }]);

  response = await http.handleAdmin(new Request('https://retroguyvn.com/api/admin/ota/simple/releases/v1.1.130/publish', { method:'POST' }), {}, ctx(), {});
  assert.equal(response.status, 200);
  assert.deepEqual(calls[1], ['publish','v1.1.130']);
});

test('admin v2 assets endpoint accepts PUT and DELETE', async () => {
  const calls = [];
  const service = {
    async replaceAssets(version, file, actor) { calls.push(['put',version,file.name,actor]); return { version }; },
    async removeAssets(version, actor) { calls.push(['delete',version,actor]); return { version }; }
  };
  const http = createSimpleOtaHttp({ service });
  const form = new FormData();
  form.set('file', new File([new TextEncoder().encode('DRVGP001')], 'assets.vgi.pack'));

  let response = await http.handleAdmin(new Request('https://retroguyvn.com/api/admin/ota/simple/releases/v1.1.130/assets', { method:'PUT', body:form }), {}, ctx(), { mode:'token' });
  assert.equal(response.status, 200);

  response = await http.handleAdmin(new Request('https://retroguyvn.com/api/admin/ota/simple/releases/v1.1.130/assets', { method:'DELETE' }), {}, ctx(), { mode:'token' });
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [['put','v1.1.130','assets.vgi.pack','token'],['delete','v1.1.130','token']]);
});

test('public game download supports byte range with checksum headers', async () => {
  const bytes = Uint8Array.from([1,2,3,4]);
  const release = { version:'v1.1.130', status:'published', game_size:4, game_sha256:'b'.repeat(64), game_file_name:'game.bin' };
  const service = {
    async getRelease() { return release; },
    async getGameObject(_release, range) {
      assert.deepEqual(range, { start:1, end:2, length:2 });
      return { body:new Blob([bytes.slice(1,3)]).stream() };
    }
  };
  const http = createSimpleOtaHttp({ service });
  const response = await http.handlePublic(new Request('https://retroguyvn.com/api/dr/ota/v2/game/v1.1.130', {
    headers:{ range:'bytes=1-2' }
  }), {}, ctx());

  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 1-2/4');
  assert.equal(response.headers.get('x-dr-sha256'), 'b'.repeat(64));
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [2,3]);
});

test('public assets download 404s when release has no assets', async () => {
  const service = {
    async getRelease() { return { version:'v1.1.130', status:'published', assets_r2_key:null }; }
  };
  const http = createSimpleOtaHttp({ service });
  const response = await http.handlePublic(new Request('https://retroguyvn.com/api/dr/ota/v2/assets/v1.1.130'), {}, ctx());
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, 'assets_not_found');
});
