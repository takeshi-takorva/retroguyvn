import { ensureNewsSchema } from './schema.js';
import { newsError } from './model.js';
import { SQL } from './sql.js';

export async function deleteNews(env, id) {
  await ensureNewsSchema(env);
  const post = await env.DB.prepare(SQL.postById).bind(id).first();
  if (!post) throw newsError('News post not found', 404);
  const revisions = await env.DB.prepare(SQL.revisionsForPost).bind(id).all();
  for (const revision of revisions.results || []) {
    await env.DB.prepare('DELETE FROM media_usage WHERE owner_type = ? AND owner_id = ?').bind('news_revision', revision.id).run();
  }
  await env.DB.prepare(SQL.deletePost).bind(id).run();
  return { ok: true, id };
}

export async function assertNewsMediaNotInUse(env, mediaId) {
  await ensureNewsSchema(env);
  const sql = "SELECT DISTINCT p.id, p.slug, mu.field_path FROM media_usage mu JOIN news_posts p ON mu.owner_id = p.draft_revision_id OR mu.owner_id = p.published_revision_id WHERE mu.owner_type = 'news_revision' AND mu.media_id = ?";
  const result = await env.DB.prepare(sql).bind(mediaId).all();
  const usage = result.results || [];
  if (usage.length) throw newsError('Media is currently used by News content', 409, { usage });
  return true;
}
