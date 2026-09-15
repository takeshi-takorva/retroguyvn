import { ensureProductSchema } from './schema.js';
import { productError } from './model.js';
import { productRevision, productRowSummary } from './store.js';

export async function listAdminProducts(env) {
  await ensureProductSchema(env);
  const result = await env.DB.prepare('SELECT * FROM products ORDER BY sort_order ASC, updated_at DESC').all();
  return (result.results || []).map(productRowSummary);
}

export async function getAdminProduct(env, id) {
  await ensureProductSchema(env);
  const row = await env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(id).first();
  if (!row) throw productError('Product not found', 404);
  const draft = await productRevision(env, row.draft_revision_id);
  const published = await productRevision(env, row.published_revision_id);
  return {
    ...productRowSummary(row),
    draft: draft?.content || null,
    published: published?.content || null,
    revisions: {
      draft: draft ? { id: draft.id, version: draft.version, createdAt: draft.created_at, createdBy: draft.created_by } : null,
      published: published ? { id: published.id, version: published.version, publishedAt: published.published_at } : null
    }
  };
}
