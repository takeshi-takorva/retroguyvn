import { ensureProductSchema } from './schema.js';
import { productError } from './model.js';
import { SQL } from './sql.js';
import { getAdminProduct } from './admin-read.js';
import { nowIso, productRevision } from './store.js';

export async function publishProduct(env, id, actor = 'admin') {
  await ensureProductSchema(env);
  const row = await env.DB.prepare(SQL.productById).bind(id).first();
  if (!row) throw productError('Product not found', 404);
  if (!row.draft_revision_id) throw productError('Product has no draft revision', 409);
  const draft = await productRevision(env, row.draft_revision_id);
  if (!draft?.content) throw productError('Draft revision not found', 409);
  const content = draft.content;
  if (!content.slug) throw productError('Published product requires a slug', 422);
  const publishedAt = nowIso();
  const mark = env.DB.prepare(SQL.markRevisionPublished).bind(publishedAt, row.draft_revision_id);
  const publish = env.DB.prepare(SQL.publishProduct).bind(row.draft_revision_id, content.slug, publishedAt, publishedAt, id);
  await env.DB.batch([mark, publish]);
  return getAdminProduct(env, id);
}

export async function unpublishProduct(env, id, actor = 'admin') {
  await ensureProductSchema(env);
  const row = await env.DB.prepare(SQL.productById).bind(id).first();
  if (!row) throw productError('Product not found', 404);
  const updatedAt = nowIso();
  await env.DB.prepare(SQL.unpublishProduct).bind(updatedAt, id).run();
  return getAdminProduct(env, id);
}
