import { assertPostChannel, contentError } from './model.js';
import { ensureContentSchema } from './schema.js';
import { SQL } from './sql.js';

export async function deletePost(env, channel, id) {
  const normalizedChannel = assertPostChannel(channel);
  await ensureContentSchema(env);
  const post = await env.DB.prepare(SQL.postById).bind(id, normalizedChannel).first();
  if (!post) throw contentError('Post not found', 404);
  const revisions = await env.DB.prepare(SQL.revisionsForPost).bind(id).all();
  for (const revision of revisions.results || []) {
    await env.DB.prepare('DELETE FROM media_usage WHERE owner_type = ? AND owner_id = ?').bind('content_revision', revision.id).run();
  }
  await env.DB.prepare(SQL.deletePost).bind(id, normalizedChannel).run();
  return { ok: true, id };
}
