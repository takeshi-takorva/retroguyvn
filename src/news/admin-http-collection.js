import { listAdminNews } from './admin-read.js';
import { createNewsPost } from './create.js';

export async function handleNewsCollection(request, env, actor) {
  if (request.method === 'GET') return { status: 200, data: { items: await listAdminNews(env) } };
  if (request.method === 'POST') return { status: 201, data: await createNewsPost(env, await request.json(), actor) };
  return { status: 405, data: { error: 'Method not allowed' } };
}
