import { ensureProductSchema } from './schema.js';
import { productMediaUrl, slugifyProduct } from './model.js';

export function toPublicProduct(row, content) {
  const slug = row?.published_slug || content?.slug || '';
  const galleryMediaIds = Array.isArray(content?.galleryMediaIds) ? content.galleryMediaIds : [];
  return {
    id: row.id,
    slug,
    name: content?.name || '',
    subtitle: content?.subtitle || '',
    excerpt: content?.excerpt || '',
    category: content?.category || 'Handheld',
    availability: content?.availability || 'development',
    featured: Boolean(content?.featured),
    sortOrder: Number(content?.sortOrder || 0),
    coverMediaId: content?.coverMediaId || null,
    coverUrl: productMediaUrl(content?.coverMediaId),
    description: content?.description || '',
    features: Array.isArray(content?.features) ? content.features : [],
    specs: Array.isArray(content?.specs) ? content.specs : [],
    galleryMediaIds,
    gallery: galleryMediaIds.map(id => ({ id, url: productMediaUrl(id) })),
    cta: content?.cta || { label: 'Get support', href: '/support' },
    publishedAt: row.published_at || null,
    url: slug ? `/product/${encodeURIComponent(slug)}` : null
  };
}

export async function getPublishedProduct(env, slug) {
  await ensureProductSchema(env);
  const normalizedSlug = slugifyProduct(slug);
  const row = await env.DB.prepare("SELECT id, published_slug, published_at, published_revision_id FROM products WHERE status = 'published' AND published_slug = ?").bind(normalizedSlug).first();
  if (!row?.published_revision_id) return null;
  const revision = await env.DB.prepare('SELECT content_json FROM product_revisions WHERE id = ?').bind(row.published_revision_id).first();
  if (!revision) return null;
  return toPublicProduct(row, JSON.parse(revision.content_json));
}
