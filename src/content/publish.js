import { getAdminPost } from './admin-read.js';
import { assertPostChannel, contentError, normalizePublishTime } from './model.js';
import { ensureContentSchema } from './schema.js';
import { SQL } from './sql.js';
import { validatePostMedia } from './media.js';
import { nowIso, postRevision } from './store.js';

export async function publishPost(env, channel, id, actor = 'admin', options = {}) {
  const normalizedChannel = assertPostChannel(channel);
  await ensureContentSchema(env);
  const post = await env.DB.prepare(SQL.postById).bind(id, normalizedChannel).first();
  if (!post) throw contentError('Post not found', 404);
  const draft = await postRevision(env, post.draft_revision_id);
  if (!draft) throw contentError('Draft revision not found', 409);
  if (!Array.isArray(draft.content.blocks) || !draft.content.blocks.length) throw contentError('Add at least one content block before publishing');
  await validatePostMedia(env, draft.content);
  const publishedAt = normalizePublishTime(options?.publishedAt, nowIso());
  const markRevision = env.DB.prepare(SQL.markRevisionPublished).bind(publishedAt, draft.id);
  const updatePost = env.DB.prepare(SQL.publishPost).bind(draft.id, draft.content.slug, publishedAt, publishedAt, id, normalizedChannel);
  if (typeof env.DB.batch === 'function') await env.DB.batch([markRevision, updatePost]);
  else { await markRevision.run(); await updatePost.run(); }
  return { ok: true, actor, publishedAt, post: await getAdminPost(env, normalizedChannel, id) };
}

export async function unpublishPost(env, channel, id, actor = 'admin') {
  const normalizedChannel = assertPostChannel(channel);
  await ensureContentSchema(env);
  const post = await env.DB.prepare(SQL.postById).bind(id, normalizedChannel).first();
  if (!post) throw contentError('Post not found', 404);
  const updatedAt = nowIso();
  await env.DB.prepare(SQL.unpublishPost).bind(updatedAt, id, normalizedChannel).run();
  return { ok: true, actor, unpublishedAt: updatedAt, post: await getAdminPost(env, normalizedChannel, id) };
}
