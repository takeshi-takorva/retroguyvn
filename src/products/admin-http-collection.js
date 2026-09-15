import { listAdminProducts } from './admin-read.js';
import { createProduct } from './create.js';
import { bootstrapProducts } from './bootstrap.js';

export async function handleProductCollection(request, env, actor) {
  if (request.method === 'GET') {
    await bootstrapProducts(env, actor);
    return { status: 200, data: { items: await listAdminProducts(env) } };
  }
  if (request.method === 'POST') return { status: 201, data: await createProduct(env, await request.json(), actor) };
  return { status: 405, data: { error: 'Method not allowed' } };
}
