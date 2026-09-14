import { ensureNewsSchema } from './schema.js';
import { getAdminNews } from './admin-read.js';
import { newsError, normalizePublishTime } from './model.js';
import { SQL } from './sql.js';
import { newsRevision, nowIso, validateNewsMedia } from './store.js';

export async function publishNews(env, id, actor = 'admin', options = {}) {
  await ensureNewsSchema(env);
  const post = await env.DB.prepare(SQL.postById).bind(id).first();
  if (!post) throw newsError('News post not found', 404);
  const draft = await newsRevision(env, post.draft_revision_id);
  if (!draft) throw newsError('Draft revision not found', 409);
  if (!draft.content.blocks.length) throw newsError('Add at least one content block before publishing');
  await validateNewsMedia(env, draft.content);
  const publishedAt = normalizePublishTime(options?.publishedAt, nowIso());
  const markRevision = env.DB.prepare(SQL.markRevisionPublished).bind(publishedAt, draft.id);
  const publishPost = env.DB.prepare(SQL.publishPost).bind(draft.id, draft.content.slug, publishedAt, publishedAt, id);
  await env.DB.batch([markRevision, publishPost]);
  return { ok: true, actor, publishedAt, post: await getAdminNews(env, id) };
}

export async function unpublishNews(env, id, actor = 'admin') {
  await ensureNewsSchema(env);
  const post = await env.DB.prepare(SQL.postById).bind(id).first();
  if (!post) throw newsError('News post not found', 404);
  const updatedAt = nowIso();
  await env.DB.prepare(SQL.unpublishPost).bind(updatedAt, id).run();
  return { ok: true, actor, unpublishedAt: updatedAt, post: await getAdminNews(env, id) };
}
