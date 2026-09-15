import { assertPostChannel, contentError } from './model.js';
import { ensureContentSchema } from './schema.js';
import { postRevision, postRowSummary } from './store.js';
import { SQL } from './sql.js';

export async function listAdminPosts(env, channel) {
  const normalizedChannel = assertPostChannel(channel);
  await ensureContentSchema(env);
  const result = await env.DB.prepare(SQL.listAdminPosts).bind(normalizedChannel).all();
  return (result.results || []).map(postRowSummary);
}

export async function getAdminPost(env, channel, id) {
  const normalizedChannel = assertPostChannel(channel);
  await ensureContentSchema(env);
  const row = await env.DB.prepare(SQL.postById).bind(id, normalizedChannel).first();
  if (!row) throw contentError('Post not found', 404);
  const draft = await postRevision(env, row.draft_revision_id);
  const published = await postRevision(env, row.published_revision_id);
  return {
    ...postRowSummary(row),
    draft: draft?.content || null,
    published: published?.content || null,
    revisions: {
      draft: draft ? { id: draft.id, version: draft.version, createdAt: draft.created_at, createdBy: draft.created_by } : null,
      published: published ? { id: published.id, version: published.version, publishedAt: published.published_at } : null
    }
  };
}
