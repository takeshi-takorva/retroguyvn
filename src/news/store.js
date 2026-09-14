import { collectNewsMediaRefs } from './content.js';
import { mediaUrl, newsError } from './model.js';

export const nowIso = () => new Date().toISOString();
export const uid = prefix => `${prefix}_${crypto.randomUUID()}`;

export async function validateNewsMedia(env, content) {
  const ids = [...new Set(collectNewsMediaRefs(content).map(ref => ref.id))];
  for (const id of ids) {
    const row = await env.DB.prepare("SELECT id FROM media_nodes WHERE id = ? AND type = 'file' AND deleted_at IS NULL").bind(id).first();
    if (!row) throw newsError(`Media not found: ${id}`);
  }
}

export async function indexNewsMediaUsage(env, revisionId, content) {
  await env.DB.prepare('DELETE FROM media_usage WHERE owner_type = ? AND owner_id = ?').bind('news_revision', revisionId).run();
  const refs = collectNewsMediaRefs(content);
  if (!refs.length) return;
  const statements = refs.map(ref => env.DB.prepare(
    'INSERT INTO media_usage (id, media_id, owner_type, owner_id, field_path, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(uid('use'), ref.id, 'news_revision', revisionId, ref.path, nowIso()));
  if (typeof env.DB.batch === 'function') await env.DB.batch(statements);
  else for (const statement of statements) await statement.run();
}

export async function assertNewsSlugAvailable(env, slug, exceptId = null) {
  const row = exceptId
    ? await env.DB.prepare('SELECT id FROM news_posts WHERE slug = ? AND id <> ?').bind(slug, exceptId).first()
    : await env.DB.prepare('SELECT id FROM news_posts WHERE slug = ?').bind(slug).first();
  if (row) throw newsError('Slug is already in use', 409);
}

export async function newsRevision(env, id) {
  if (!id) return null;
  const row = await env.DB.prepare('SELECT * FROM news_revisions WHERE id = ?').bind(id).first();
  return row ? { ...row, content: JSON.parse(row.content_json) } : null;
}

export function newsRowSummary(row) {
  return {
    id: row.id,
    slug: row.slug,
    publishedSlug: row.published_slug || null,
    title: row.title,
    excerpt: row.excerpt || '',
    category: row.category || 'Development',
    tags: JSON.parse(row.tags_json || '[]'),
    coverMediaId: row.cover_media_id || null,
    coverUrl: mediaUrl(row.cover_media_id),
    status: row.status,
    publishedAt: row.published_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by || null
  };
}
