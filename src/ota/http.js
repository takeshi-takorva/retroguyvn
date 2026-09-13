import {
  errorResponse,
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

export function createOtaHttp({ service }) {
  if (!service) throw new TypeError('service is required');

  async function handleCheck(request) {
    const input = readDeviceCheckHeaders(request);
    const result = await service.checkForUpdate(input, requestClientMetadata(request));
    if (result.update_available && result.download) {
      result.download = new URL(result.download, request.url).toString();
    }
    return jsonResponse(result);
  }

  async function handleDownload(request, ctx) {
    const input = readDownloadHeaders(request);
    const meta = requestClientMetadata(request);
    const release = await service.authorizeDownload(input);
    const device = await service.getDevice(input.deviceId);
    let range;
    try {
      range = parseSingleRange(request.headers.get('Range'), Number(release.size_bytes));
    } catch (error) {
      if (Number(error?.status) === 416) {
        if (service.recordDownloadEvent) {
          const job = service.recordDownloadEvent('DOWNLOAD_FAIL', {
            release, deviceId: input.deviceId, hardwareCode: input.hardwareCode, device, meta,
            status: 416, detail: { reason: error.code || 'invalid_range' }
          });
          if (ctx?.waitUntil) ctx.waitUntil(job); else await job;
        }
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
      else if (ctx?.waitUntil) ctx.waitUntil(job);
      else await job;
    }
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
      if (url.pathname === '/api/admin/ota/hardware') {
        if (request.method === 'GET') return jsonResponse({ items: await service.listHardware({ includeDisabled: true }) });
        if (request.method === 'POST') return jsonResponse(await service.createHardware(await request.json()), { status: 201 });
      }
      const hardwareMatch = url.pathname.match(/^\/api\/admin\/ota\/hardware\/([^/]+)$/);
      if (hardwareMatch && request.method === 'PATCH') {
        return jsonResponse(await service.updateHardware(decodeURIComponent(hardwareMatch[1]), await request.json()));
      }

      if (url.pathname === '/api/admin/ota/releases') {
        if (request.method === 'GET') return jsonResponse({ items: await service.listReleases(queryFilters(url)) });
        if (request.method === 'POST') return jsonResponse(await service.createRelease(await request.formData(), actor), { status: 201 });
      }
      const actionMatch = url.pathname.match(/^\/api\/admin\/ota\/releases\/([^/]+)\/(publish|disable)$/);
      if (actionMatch && request.method === 'POST') {
        const id = decodeURIComponent(actionMatch[1]);
        return jsonResponse(actionMatch[2] === 'publish' ? await service.publishRelease(id, actor) : await service.disableRelease(id, actor));
      }
      const releaseMatch = url.pathname.match(/^\/api\/admin\/ota\/releases\/([^/]+)$/);
      if (releaseMatch) {
        const id = decodeURIComponent(releaseMatch[1]);
        if (request.method === 'GET') return jsonResponse(await service.getRelease(id));
        if (request.method === 'PUT') return jsonResponse(await service.updateRelease(id, await request.json(), actor));
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
