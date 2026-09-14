import { ensureNewsSchema } from './schema.js';
import { newsError } from './model.js';
import { newsRevision, newsRowSummary } from './store.js';

export async function listAdminNews(env) {
  await ensureNewsSchema(env);
  const result = await env.DB.prepare('SELECT * FROM news_posts ORDER BY updated_at DESC').all();
  return (result.results || []).map(newsRowSummary);
}

export async function getAdminNews(env, id) {
  await ensureNewsSchema(env);
  const row = await env.DB.prepare('SELECT * FROM news_posts WHERE id = ?').bind(id).first();
  if (!row) throw newsError('News post not found', 404);
  const draft = await newsRevision(env, row.draft_revision_id);
  const published = await newsRevision(env, row.published_revision_id);
  return {
    ...newsRowSummary(row),
    draft: draft?.content || null,
    published: published?.content || null,
    revisions: {
      draft: draft ? { id: draft.id, version: draft.version, createdAt: draft.created_at, createdBy: draft.created_by } : null,
      published: published ? { id: published.id, version: published.version, publishedAt: published.published_at } : null
    }
  };
}
