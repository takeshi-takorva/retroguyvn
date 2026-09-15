import { normalizePostDraft } from './content.js';
import { assertPostChannel } from './model.js';
import { ensureContentSchema } from './schema.js';
import { getAdminPost } from './admin-read.js';
import { SQL } from './sql.js';
import { indexPostMediaUsage, validatePostMedia } from './media.js';
import { assertPostSlugAvailable, nowIso, uid } from './store.js';

export async function createPost(env, channel, input, actor = 'admin') {
  const normalizedChannel = assertPostChannel(channel);
  await ensureContentSchema(env);
  const content = normalizePostDraft(input);
  await assertPostSlugAvailable(env, normalizedChannel, content.slug);
  await validatePostMedia(env, content);
  const id = uid('post');
  const revisionId = uid('crev');
  const createdAt = nowIso();
  const post = env.DB.prepare(SQL.insertPost).bind(
    id,
    normalizedChannel,
    content.slug,
    content.title,
    content.excerpt,
    content.category,
    JSON.stringify(content.tags),
    content.coverMediaId,
    revisionId,
    createdAt,
    createdAt,
    actor
  );
  const revision = env.DB.prepare(SQL.insertRevision).bind(revisionId, id, 1, JSON.stringify(content), createdAt, actor);
  if (typeof env.DB.batch === 'function') await env.DB.batch([post, revision]);
  else { await post.run(); await revision.run(); }
  await indexPostMediaUsage(env, revisionId, content);
  return getAdminPost(env, normalizedChannel, id);
}
