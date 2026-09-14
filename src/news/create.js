import { normalizeNewsDraft } from './content.js';
import { ensureNewsSchema } from './schema.js';
import { getAdminNews } from './admin-read.js';
import { SQL } from './sql.js';
import { assertNewsSlugAvailable, indexNewsMediaUsage, nowIso, uid, validateNewsMedia } from './store.js';

export async function createNewsPost(env, input, actor = 'admin') {
  await ensureNewsSchema(env);
  const content = normalizeNewsDraft(input);
  await assertNewsSlugAvailable(env, content.slug);
  await validateNewsMedia(env, content);
  const id = uid('news');
  const revisionId = uid('nrev');
  const createdAt = nowIso();
  const post = env.DB.prepare(SQL.insertPost).bind(id, content.slug, content.title, content.excerpt, content.category, JSON.stringify(content.tags), content.coverMediaId, revisionId, createdAt, createdAt, actor);
  const revision = env.DB.prepare(SQL.insertRevision).bind(revisionId, id, 1, JSON.stringify(content), createdAt, actor);
  await env.DB.batch([post, revision]);
  await indexNewsMediaUsage(env, revisionId, content);
  return getAdminNews(env, id);
}
