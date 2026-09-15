import { ensureProductSchema } from './schema.js';
import { productError } from './model.js';
import { SQL } from './sql.js';

export async function deleteProduct(env, id) {
  await ensureProductSchema(env);
  const product = await env.DB.prepare(SQL.productById).bind(id).first();
  if (!product) throw productError('Product not found', 404);
  const revisions = await env.DB.prepare(SQL.revisionsForProduct).bind(id).all();
  for (const revision of revisions.results || []) {
    await env.DB.prepare('DELETE FROM media_usage WHERE owner_type = ? AND owner_id = ?').bind('product_revision', revision.id).run();
  }
  await env.DB.prepare(SQL.deleteProduct).bind(id).run();
  return { ok: true, id };
}
