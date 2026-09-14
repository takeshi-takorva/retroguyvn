import { normalizeNewsDraft } from './content.js';
import { ensureNewsSchema } from './schema.js';
import { getAdminNews } from './admin-read.js';
import { SQL } from './sql.js';
import { assertNewsSlugAvailable, indexNewsMediaUsage, nowIso, uid, validateNewsMedia } from './store.js';
import { newsError } from './model.js';

export async function saveNewsDraft(env, id, input, actor = 'admin') {
  await ensureNewsSchema(env);
  const post = await env.DB.prepare(SQL.postById).bind(id).first();
  if (!post) throw newsError('News post not found', 404);
  const content = normalizeNewsDraft(input);
  await assertNewsSlugAvailable(env, content.slug, id);
  await validateNewsMedia(env, content);
  const latest = await env.DB.prepare(SQL.maxVersion).bind(id).first();
  const version = Number(latest?.version || 0) + 1;
  const revisionId = uid('nrev');
  const updatedAt = nowIso();
  const revision = env.DB.prepare(SQL.insertRevision).bind(revisionId, id, version, JSON.stringify(content), updatedAt, actor);
  const update = env.DB.prepare(SQL.updateDraft).bind(content.slug, content.title, content.excerpt, content.category, JSON.stringify(content.tags), content.coverMediaId, revisionId, updatedAt, id);
  await env.DB.batch([revision, update]);
  await indexNewsMediaUsage(env, revisionId, content);
  return getAdminNews(env, id);
}
