import { getAdminProduct } from './admin-read.js';
import { saveProductDraft } from './save.js';
import { publishProduct, unpublishProduct } from './publish.js';
import { deleteProduct } from './delete.js';

export async function handleProductItem(request, env, actor, id, action = '') {
  if (action === 'publish' && request.method === 'POST') return { status: 200, data: await publishProduct(env, id, actor) };
  if (action === 'unpublish' && request.method === 'POST') return { status: 200, data: await unpublishProduct(env, id, actor) };
  if (action === 'remove' && request.method === 'POST') return { status: 200, data: await deleteProduct(env, id) };
  if (action) return { status: 405, data: { error: 'Method not allowed' } };
  if (request.method === 'GET') return { status: 200, data: await getAdminProduct(env, id) };
  if (request.method === 'PUT') return { status: 200, data: await saveProductDraft(env, id, await request.json(), actor) };
  return { status: 405, data: { error: 'Method not allowed' } };
}
