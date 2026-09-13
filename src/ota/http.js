import {
  errorResponse,
  httpError,
  jsonResponse,
  parseSingleRange,
  readDeviceCheckHeaders,
  readDownloadHeaders,
  requestClientMetadata
} from './core.js';

function queryFilters(url) {
  return {
    product: url.searchParams.get('product') || undefined,
    channel: url.searchParams.get('channel') || undefined,
    status: url.searchParams.get('status') || undefined,
    hardwareCode: url.searchParams.get('hardware') || undefined,
    deviceId: url.searchParams.get('device_id') || undefined,
    eventType: url.searchParams.get('event_type') || undefined,
    releaseId: url.searchParams.get('release_id') || undefined,
    limit: url.searchParams.get('limit') || undefined
  };
}

function firmwareHeaders(release, length) {
  const headers = new Headers({
    'content-type': 'application/octet-stream',
    'content-length': String(length),
    'accept-ranges': 'bytes',
    'cache-control': 'private, no-store',
    etag: `"${release.sha256}"`
  });
  if (release.file_name) headers.set('content-disposition', `attachment; filename="${String(release.file_name).replaceAll('"', '')}"`);
  return headers;
}

function actorFromSession(session) {
  return session?.email || session?.mode || 'admin';
}

function assertMutationOrigin(request) {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return;
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) throw httpError(403, 'invalid_origin');
}

async function readJson(request) {
  try { return await request.json(); }
  catch { throw httpError(400, 'invalid_json'); }
}

async function readFormData(request) {
  try { return await request.formData(); }
  catch { throw httpError(400, 'invalid_form_data'); }
}

function background(ctx, promise) {
  const safe = Promise.resolve(promise).catch(error => console.error('[DR OTA] background audit failed', error));
  if (ctx?.waitUntil) ctx.waitUntil(safe);
  return safe;
}

export function createOtaHttp({ service }) {
  if (!service) throw new TypeError('service is required');

  async function handleCheck(request) {
    const input = readDeviceCheckHeaders(request);
    const result = await service.checkForUpdate(input, requestClientMetadata(request));
    if (result.update_available && result.download) result.download = new URL(result.download, request.url).toString();
    return jsonResponse(result);
  }

  async function handleDownload(request, ctx) {
    const input = readDownloadHeaders(request);
    const meta = requestClientMetadata(request);
    let release = null;
    let device = null;

    try {
      release = await service.authorizeDownload(input);
      device = await service.getDevice(input.deviceId);
      let range;
      try {
        range = parseSingleRange(request.headers.get('Range'), Number(release.size_bytes));
      } catch (error) {
        if (Number(error?.status) === 416) {
          if (service.recordDownloadEvent) background(ctx, service.recordDownloadEvent('DOWNLOAD_FAIL', {
            release, deviceId: input.deviceId, hardwareCode: input.hardwareCode, device, meta,
            status: 416, detail: { reason: error.code || 'invalid_range', requested_release_id: input.releaseId }
          }));
          return jsonResponse({ error: error.code || 'range_not_satisfiable' }, {
            status: 416,
            headers: { 'content-range': `bytes */${release.size_bytes}`, 'accept-ranges': 'bytes' }
          });
        }
        throw error;
      }

      if (!range && service.recordDownloadEvent) {
        await service.recordDownloadEvent('DOWNLOAD_START', {
          release, deviceId: input.deviceId, hardwareCode: input.hardwareCode, device, meta, status: 200
        });
      }

      const object = await service.getFirmwareObject(release, range);
      const length = range?.length || Number(release.size_bytes);
      const headers = firmwareHeaders(release, length);
      const status = range ? 206 : 200;
      if (range) headers.set('content-range', `bytes ${range.start}-${range.end}/${release.size_bytes}`);

      if (service.recordDownloadEvent) {
        const type = range ? 'DOWNLOAD_RANGE' : 'DOWNLOAD_COMPLETE';
        const job = service.recordDownloadEvent(type, {
          release, deviceId: input.deviceId, hardwareCode: input.hardwareCode, device, meta,
          status, bytes: length, range
        });
        if (range) await job;
        else background(ctx, job);
      }
      return new Response(object.body, { status, headers });
    } catch (error) {
      if (service.recordDownloadEvent) background(ctx, service.recordDownloadEvent('DOWNLOAD_FAIL', {
        release, deviceId: input.deviceId, hardwareCode: input.hardwareCode, device, meta,
        status: Number(error?.status || 500),
        detail: { reason: error?.code || 'download_error', requested_release_id: input.releaseId }
      }));
      throw error;
    }
  }

  async function handleAdminFile(request, releaseId) {
    if (request.method !== 'GET') {
      return jsonResponse({ error: 'method_not_allowed' }, { status: 405, headers: { allow: 'GET' } });
    }
    const release = await service.getRelease(releaseId);
    if (!release) return jsonResponse({ error: 'release_not_found' }, { status: 404 });

    let range;
    try {
      range = parseSingleRange(request.headers.get('Range'), Number(release.size_bytes));
    } catch (error) {
      if (Number(error?.status) === 416) {
        return jsonResponse({ error: error.code || 'range_not_satisfiable' }, {
          status: 416,
          headers: { 'content-range': `bytes */${release.size_bytes}`, 'accept-ranges': 'bytes' }
        });
      }
      throw error;
    }

    const object = await service.getFirmwareObject(release, range);
    const length = range?.length || Number(release.size_bytes);
    const headers = firmwareHeaders(release, length);
    const status = range ? 206 : 200;
    if (range) headers.set('content-range', `bytes ${range.start}-${range.end}/${release.size_bytes}`);
    return new Response(object.body, { status, headers });
  }

  async function handleOtaPublic(request, _env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/dr/ota' && url.pathname !== '/api/dr/ota/download') return null;
    if (request.method !== 'GET') return jsonResponse({ error: 'method_not_allowed' }, { status: 405, headers: { allow: 'GET' } });
    try {
      return url.pathname === '/api/dr/ota' ? await handleCheck(request) : await handleDownload(request, ctx);
    } catch (error) {
      return errorResponse(error);
    }
  }

  async function handleOtaAdmin(request, _env, _ctx, session) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/admin/ota/')) return null;
    if (!session) return jsonResponse({ error: 'Unauthorized' }, { status: 401 });
    const actor = actorFromSession(session);
    try {
      assertMutationOrigin(request);
      if (url.pathname === '/api/admin/ota/hardware') {
        if (request.method === 'GET') return jsonResponse({ items: await service.listHardware({ includeDisabled: true }) });
        if (request.method === 'POST') return jsonResponse(await service.createHardware(await readJson(request)), { status: 201 });
      }
      const hardwareMatch = url.pathname.match(/^\/api\/admin\/ota\/hardware\/([^/]+)$/);
      if (hardwareMatch && request.method === 'PATCH') {
        return jsonResponse(await service.updateHardware(decodeURIComponent(hardwareMatch[1]), await readJson(request)));
      }

      if (url.pathname === '/api/admin/ota/releases') {
        if (request.method === 'GET') return jsonResponse({ items: await service.listReleases(queryFilters(url)) });
        if (request.method === 'POST') return jsonResponse(await service.createRelease(await readFormData(request), actor), { status: 201 });
      }
      const fileMatch = url.pathname.match(/^\/api\/admin\/ota\/releases\/([^/]+)\/file$/);
      if (fileMatch) {
        return handleAdminFile(request, decodeURIComponent(fileMatch[1]));
      }
      const actionMatch = url.pathname.match(/^\/api\/admin\/ota\/releases\/([^/]+)\/(publish|disable)$/);
      if (actionMatch && request.method === 'POST') {
        const id = decodeURIComponent(actionMatch[1]);
        return jsonResponse(actionMatch[2] === 'publish' ? await service.publishRelease(id, actor) : await service.disableRelease(id, actor));
      }
      const releaseMatch = url.pathname.match(/^\/api\/admin\/ota\/releases\/([^/]+)$/);
      if (releaseMatch) {
        const id = decodeURIComponent(releaseMatch[1]);
        if (request.method === 'GET') {
          const release = await service.getRelease(id);
          return release ? jsonResponse(release) : jsonResponse({ error: 'release_not_found' }, { status: 404 });
        }
        if (request.method === 'PUT') return jsonResponse(await service.updateRelease(id, await readJson(request), actor));
        if (request.method === 'DELETE') return jsonResponse(await service.deleteRelease(id, actor));
      }

      if (url.pathname === '/api/admin/ota/devices' && request.method === 'GET') {
        return jsonResponse({ items: await service.listDevices(queryFilters(url)) });
      }
      if (url.pathname === '/api/admin/ota/events' && request.method === 'GET') {
        return jsonResponse({ items: await service.listEvents(queryFilters(url)) });
      }
      return jsonResponse({ error: 'not_found' }, { status: 404 });
    } catch (error) {
      return errorResponse(error);
    }
  }

  return { handleOtaPublic, handleOtaAdmin };
}
