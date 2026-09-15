import { normalizeProductDraft, productRevisionContent } from './content.js';
import { ensureProductSchema } from './schema.js';
import { getAdminProduct } from './admin-read.js';
import { SQL } from './sql.js';
import { assertProductSlugAvailable, nowIso, uid } from './store.js';
import { indexProductMediaUsage, validateProductMedia } from './media.js';

export async function createProduct(env, input, actor = 'admin') {
  await ensureProductSchema(env);
  const content = normalizeProductDraft(input);
  await assertProductSlugAvailable(env, content.slug);
  await validateProductMedia(env, content);
  const id = uid('prod');
  const revisionId = uid('prev');
  const createdAt = nowIso();
  const product = env.DB.prepare(SQL.insertProduct).bind(
    id,
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
    createdAt,
    createdAt,
    actor
  );
  const revisionContent = productRevisionContent(content);
  const revision = env.DB.prepare(SQL.insertRevision).bind(
    revisionId,
    id,
    1,
    JSON.stringify(revisionContent),
    createdAt,
    actor
  );
  await env.DB.batch([product, revision]);
  await indexProductMediaUsage(env, revisionId, revisionContent);
  return getAdminProduct(env, id);
}
