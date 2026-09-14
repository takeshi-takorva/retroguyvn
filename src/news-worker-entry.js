import worker, { CMSStore } from './worker-entry.js';
import { dispatchNewsPublic, dispatchNewsAdmin } from './news/dispatch.js';
import { assertNewsMediaNotInUse } from './news/delete.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

function mutationOriginAllowed(request, url) {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return true;
  const origin = request.headers.get('origin');
  return !origin || origin === url.origin;
}

async function newsAdminSession(request, env, ctx) {
  const url = new URL(request.url);
  url.pathname = '/api/admin/session';
  url.search = '';
  const probe = new Request(url.toString(), { method: 'GET', headers: request.headers });
  const response = await worker.fetch(probe, env, ctx);
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

export { CMSStore };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/news' || url.pathname.startsWith('/api/news/')) {
      return dispatchNewsPublic(request, env);
    }

    if (url.pathname === '/api/admin/news' || url.pathname.startsWith('/api/admin/news/')) {
      if (!mutationOriginAllowed(request, url)) return json({ error: 'Cross-origin admin mutation rejected' }, 403);
      const session = await newsAdminSession(request, env, ctx);
      if (!session) return json({ error: 'Unauthorized' }, 401);
      return dispatchNewsAdmin(request, env, session.email || session.mode || 'admin');
    }

    if (request.method === 'DELETE' && url.pathname.startsWith('/api/admin/media/')) {
      if (!mutationOriginAllowed(request, url)) return json({ error: 'Cross-origin admin mutation rejected' }, 403);
      const session = await newsAdminSession(request, env, ctx);
      if (!session) return json({ error: 'Unauthorized' }, 401);
      const mediaId = decodeURIComponent(url.pathname.slice('/api/admin/media/'.length));
      try {
        await assertNewsMediaNotInUse(env, mediaId);
      } catch (error) {
        return json({ error: error.message, usage: error.usage || [] }, Number(error.status || 409));
      }
    }

    return worker.fetch(request, env, ctx);
  }
};
