import { normalizeProductDraft, productRevisionContent } from './content.js';
import { ensureProductSchema } from './schema.js';
import { getAdminProduct } from './admin-read.js';
import { SQL } from './sql.js';
import { assertProductSlugAvailable, nowIso, uid } from './store.js';
import { productError } from './model.js';

export async function saveProductDraft(env, id, input, actor = 'admin') {
  await ensureProductSchema(env);
  const row = await env.DB.prepare(SQL.productById).bind(id).first();
  if (!row) throw productError('Product not found', 404);
  const content = normalizeProductDraft(input);
  await assertProductSlugAvailable(env, content.slug, id);
  const latest = await env.DB.prepare(SQL.maxVersion).bind(id).first();
  const version = Number(latest?.version || 0) + 1;
  const revisionId = uid('prev');
  const updatedAt = nowIso();
  const revision = env.DB.prepare(SQL.insertRevision).bind(
    revisionId,
    id,
    version,
    JSON.stringify(productRevisionContent(content)),
    updatedAt,
    actor
  );
  const update = env.DB.prepare(SQL.updateDraft).bind(
    content.slug,
    content.name,
    content.subtitle,
    content.excerpt,
    content.category,
    content.availability,
    content.featured ? 1 : 0,
    content.sortOrder,
    content.coverMediaId,
    revisionId,
    updatedAt,
    id
  );
  await env.DB.batch([revision, update]);
  return getAdminProduct(env, id);
}
