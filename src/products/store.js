import { productError, productMediaUrl } from './model.js';

export const nowIso = () => new Date().toISOString();
export const uid = prefix => `${prefix}_${crypto.randomUUID()}`;

export async function assertProductSlugAvailable(env, slug, exceptId = null) {
  const row = exceptId
    ? await env.DB.prepare('SELECT id FROM products WHERE slug = ? AND id <> ?').bind(slug, exceptId).first()
    : await env.DB.prepare('SELECT id FROM products WHERE slug = ?').bind(slug).first();
  if (row) throw productError('Slug is already in use', 409);
}

export async function productRevision(env, id) {
  if (!id) return null;
  const row = await env.DB.prepare('SELECT * FROM product_revisions WHERE id = ?').bind(id).first();
  return row ? { ...row, content: JSON.parse(row.content_json) } : null;
}

export function productRowSummary(row) {
  const publishedSlug = row.published_slug || null;
  return {
    id: row.id,
    slug: row.slug,
    publishedSlug,
    name: row.name,
    subtitle: row.subtitle || '',
    excerpt: row.excerpt || '',
    category: row.category || 'Handheld',
    availability: row.availability || 'development',
    featured: Boolean(Number(row.featured || 0)),
    sortOrder: Number(row.sort_order || 0),
    coverMediaId: row.cover_media_id || null,
    coverUrl: productMediaUrl(row.cover_media_id),
    status: row.status,
    publishedAt: row.published_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by || null,
    url: publishedSlug ? `/product/${encodeURIComponent(publishedSlug)}` : null
  };
}
