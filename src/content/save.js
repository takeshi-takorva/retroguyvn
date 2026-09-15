import { normalizePostDraft } from './content.js';
import { assertPostChannel, contentError } from './model.js';
import { ensureContentSchema } from './schema.js';
import { getAdminPost } from './admin-read.js';
import { SQL } from './sql.js';
import { assertPostSlugAvailable, indexPostMediaUsage, nowIso, uid, validatePostMedia } from './store.js';

export async function savePostDraft(env, channel, id, input, actor = 'admin') {
  const normalizedChannel = assertPostChannel(channel);
  await ensureContentSchema(env);
  const post = await env.DB.prepare(SQL.postById).bind(id, normalizedChannel).first();
  if (!post) throw contentError('Post not found', 404);
  const content = normalizePostDraft(input);
  await assertPostSlugAvailable(env, normalizedChannel, content.slug, id);
  await validatePostMedia(env, content);
  const latest = await env.DB.prepare(SQL.maxVersion).bind(id).first();
  const version = Number(latest?.version || 0) + 1;
  const revisionId = uid('crev');
  const updatedAt = nowIso();
  const revision = env.DB.prepare(SQL.insertRevision).bind(revisionId, id, version, JSON.stringify(content), updatedAt, actor);
  const update = env.DB.prepare(SQL.updateDraft).bind(
    content.slug,
    content.title,
    content.excerpt,
    content.category,
    JSON.stringify(content.tags),
    content.coverMediaId,
    revisionId,
    updatedAt,
    id,
    normalizedChannel
  );
  if (typeof env.DB.batch === 'function') await env.DB.batch([revision, update]);
  else { await revision.run(); await update.run(); }
  await indexPostMediaUsage(env, revisionId, content);
  return getAdminPost(env, normalizedChannel, id);
}
