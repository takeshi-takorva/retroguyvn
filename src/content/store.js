import { collectPostMediaRefs } from './content.js';
import { assertPostChannel, contentError, mediaUrl } from './model.js';
import { SQL } from './sql.js';

export const nowIso = () => new Date().toISOString();
export const uid = prefix => `${prefix}_${crypto.randomUUID()}`;

export async function validatePostMedia(env, content) {
  const ids = [...new Set(collectPostMediaRefs(content).map(ref => ref.id))];
  for (const id of ids) {
    const row = await env.DB.prepare("SELECT id FROM media_nodes WHERE id = ? AND type = 'file' AND deleted_at IS NULL").bind(id).first();
    if (!row) throw contentError(`Media not found: ${id}`);
  }
}

export async function indexPostMediaUsage(env, revisionId, content) {
  await env.DB.prepare('DELETE FROM media_usage WHERE owner_type = ? AND owner_id = ?').bind('content_revision', revisionId).run();
  const refs = collectPostMediaRefs(content);
  if (!refs.length) return;
  const statements = refs.map(ref => env.DB.prepare(
    'INSERT INTO media_usage (id, media_id, owner_type, owner_id, field_path, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(uid('use'), ref.id, 'content_revision', revisionId, ref.path, nowIso()));
  if (typeof env.DB.batch === 'function') await env.DB.batch(statements);
  else for (const statement of statements) await statement.run();
}

export async function assertPostSlugAvailable(env, channel, slug, exceptId = null) {
  assertPostChannel(channel);
  const row = exceptId
    ? await env.DB.prepare(SQL.postBySlugExceptId).bind(channel, slug, exceptId).first()
    : await env.DB.prepare(SQL.postBySlug).bind(channel, slug).first();
  if (row) throw contentError('Slug is already in use', 409);
}

export async function postRevision(env, id) {
  if (!id) return null;
  const row = await env.DB.prepare(SQL.revisionById).bind(id).first();
  return row ? { ...row, content: JSON.parse(row.content_json) } : null;
}

export function postRowSummary(row) {
  const channel = assertPostChannel(row.channel);
  const publishedSlug = row.published_slug || null;
  return {
    id: row.id,
    channel,
    slug: row.slug,
    publishedSlug,
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
    createdBy: row.created_by || null,
    url: publishedSlug ? `/${channel}/${encodeURIComponent(publishedSlug)}` : null
  };
}
