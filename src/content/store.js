import { assertPostChannel, contentError, mediaUrl } from './model.js';
import { SQL } from './sql.js';

export const nowIso = () => new Date().toISOString();
export const uid = prefix => `${prefix}_${crypto.randomUUID()}`;

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
