import { getAdminNews } from './admin-read.js';
import { saveNewsDraft } from './save.js';
import { publishNews, unpublishNews } from './publish.js';
import { deleteNews } from './delete.js';

async function optionalJson(request) {
  if (!String(request.headers.get('content-type') || '').includes('application/json')) return {};
  try { return await request.json(); } catch { return {}; }
}

export async function handleNewsItem(request, env, actor, id, action = '') {
  if (action === 'publish' && request.method === 'POST') return { status: 200, data: await publishNews(env, id, actor, await optionalJson(request)) };
  if (action === 'unpublish' && request.method === 'POST') return { status: 200, data: await unpublishNews(env, id, actor) };
  if (action === 'remove' && request.method === 'POST') return { status: 200, data: await deleteNews(env, id) };
  if (action) return { status: 405, data: { error: 'Method not allowed' } };
  if (request.method === 'GET') return { status: 200, data: await getAdminNews(env, id) };
  if (request.method === 'PUT') return { status: 200, data: await saveNewsDraft(env, id, await request.json(), actor) };
  return { status: 405, data: { error: 'Method not allowed' } };
}
