import { listPublishedProducts } from './public-list.js';
import { getPublishedProduct } from './public-get.js';
import { bootstrapProducts } from './bootstrap.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' }
});

export async function handleProductPublic(request, env) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  try {
    await bootstrapProducts(env);
    const parts = new URL(request.url).pathname.split('/').filter(Boolean);
    if (parts.length === 2) return json(await listPublishedProducts(env));
    if (parts.length !== 3) return json({ error: 'Not found' }, 404);
    const item = await getPublishedProduct(env, decodeURIComponent(parts[2]));
    return item ? json(item) : json({ error: 'Not found' }, 404);
  } catch (error) {
    const status = Number(error?.status || 500);
    return json({ error: status >= 500 ? 'Internal server error' : error.message }, status);
  }
}
