import { errorResponse, httpError, jsonResponse, parseSingleRange } from './core.js';

function actorFromSession(session) {
  return session?.email || session?.mode || 'admin';
}

async function formData(request) {
  try { return await request.formData(); }
  catch { throw httpError(400, 'invalid_multipart_form'); }
}

function fileHeaders(release, kind, length) {
  const isGame = kind === 'game';
  const sha256 = isGame ? release.game_sha256 : release.assets_sha256;
  const name = isGame ? release.game_file_name : release.assets_file_name;
  const headers = new Headers({
    'content-type': 'application/octet-stream',
    'content-length': String(length),
    'accept-ranges': 'bytes',
    'cache-control': 'private, no-store',
    'x-dr-version': release.version,
    'x-dr-sha256': sha256,
    etag: `"${sha256}"`
  });
  if (name) headers.set('content-disposition', `attachment; filename="${String(name).replaceAll('"','')}"`);
  return headers;
}

export function createSimpleOtaHttp({ service }) {
  if (!service) throw new TypeError('service is required');

  async function handleAdmin(request, _env, _ctx, session) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/admin/ota/simple/')) return null;
    try {
      const actor = actorFromSession(session);
      if (url.pathname === '/api/admin/ota/simple/releases') {
        if (request.method === 'GET') return jsonResponse({ items: await service.listReleases() });
        if (request.method === 'POST') return jsonResponse(await service.createRelease(await formData(request), actor));
        return jsonResponse({ error:'method_not_allowed' }, { status:405, headers:{ allow:'GET, POST' } });
      }

      const publishMatch = url.pathname.match(/^\/api\/admin\/ota\/simple\/releases\/([^/]+)\/publish$/);
      if (publishMatch) {
        if (request.method !== 'POST') return jsonResponse({ error:'method_not_allowed' }, { status:405, headers:{ allow:'POST' } });
        return jsonResponse(await service.publishRelease(decodeURIComponent(publishMatch[1])));
      }

      const gameMatch = url.pathname.match(/^\/api\/admin\/ota\/simple\/releases\/([^/]+)\/game$/);
      if (gameMatch) {
        if (request.method !== 'PUT') return jsonResponse({ error:'method_not_allowed' }, { status:405, headers:{ allow:'PUT' } });
        const data = await formData(request);
        return jsonResponse(await service.replaceGame(decodeURIComponent(gameMatch[1]), data.get('file'), actor));
      }

      const assetsMatch = url.pathname.match(/^\/api\/admin\/ota\/simple\/releases\/([^/]+)\/assets$/);
      if (assetsMatch) {
        const version = decodeURIComponent(assetsMatch[1]);
        if (request.method === 'PUT') {
          const data = await formData(request);
          return jsonResponse(await service.replaceAssets(version, data.get('file'), actor));
        }
        if (request.method === 'DELETE') return jsonResponse(await service.removeAssets(version, actor));
        return jsonResponse({ error:'method_not_allowed' }, { status:405, headers:{ allow:'PUT, DELETE' } });
      }

      const releaseMatch = url.pathname.match(/^\/api\/admin\/ota\/simple\/releases\/([^/]+)$/);
      if (releaseMatch) {
        const version = decodeURIComponent(releaseMatch[1]);
        if (request.method === 'GET') {
          const release = await service.getRelease(version);
          return release ? jsonResponse(release) : jsonResponse({ error:'simple_release_not_found' }, { status:404 });
        }
        if (request.method === 'DELETE') return jsonResponse(await service.deleteRelease(version));
        return jsonResponse({ error:'method_not_allowed' }, { status:405, headers:{ allow:'GET, DELETE' } });
      }

      return jsonResponse({ error:'not_found' }, { status:404 });
    } catch (error) {
      return errorResponse(error);
    }
  }

  async function streamRelease(request, version, kind) {
    const release = await service.getRelease(version);
    if (!release || release.status !== 'published') throw httpError(404, 'release_not_found');
    if (kind === 'assets' && !release.assets_r2_key) throw httpError(404, 'assets_not_found');
    const total = Number(kind === 'game' ? release.game_size : release.assets_size);
    let range = null;
    try {
      range = parseSingleRange(request.headers.get('Range'), total);
    } catch (error) {
      if (Number(error?.status) === 416) {
        return jsonResponse({ error:error.code || 'range_not_satisfiable' }, {
          status:416,
          headers:{ 'content-range':`bytes */${total}`, 'accept-ranges':'bytes' }
        });
      }
      throw error;
    }
    const object = kind === 'game'
      ? await service.getGameObject(release, range)
      : await service.getAssetsObject(release, range);
    if (!object?.body) throw httpError(404, kind === 'game' ? 'game_object_missing' : 'assets_object_missing');
    const length = range?.length || total;
    const headers = fileHeaders(release, kind, length);
    if (range) headers.set('content-range', `bytes ${range.start}-${range.end}/${total}`);
    return new Response(object.body, { status:range ? 206 : 200, headers });
  }

  async function handlePublic(request) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/dr/ota/v2/')) return null;
    try {
      if (url.pathname === '/api/dr/ota/v2/check') {
        if (request.method !== 'POST') return jsonResponse({ error:'method_not_allowed' }, { status:405, headers:{ allow:'POST' } });
        let body;
        try { body = await request.json(); } catch { throw httpError(400, 'invalid_json'); }
        if (!body || typeof body.version !== 'string') throw httpError(400, 'version_required');
        return jsonResponse(await service.checkForUpdate(body.version, url.origin));
      }
      const gameMatch = url.pathname.match(/^\/api\/dr\/ota\/v2\/game\/([^/]+)$/);
      if (gameMatch) {
        if (request.method !== 'GET') return jsonResponse({ error:'method_not_allowed' }, { status:405, headers:{ allow:'GET' } });
        return await streamRelease(request, decodeURIComponent(gameMatch[1]), 'game');
      }
      const assetsMatch = url.pathname.match(/^\/api\/dr\/ota\/v2\/assets\/([^/]+)$/);
      if (assetsMatch) {
        if (request.method !== 'GET') return jsonResponse({ error:'method_not_allowed' }, { status:405, headers:{ allow:'GET' } });
        return await streamRelease(request, decodeURIComponent(assetsMatch[1]), 'assets');
      }
      return jsonResponse({ error:'not_found' }, { status:404 });
    } catch (error) {
      return errorResponse(error);
    }
  }

  return { handleAdmin, handlePublic };
}
