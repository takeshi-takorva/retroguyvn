import { ensureProductSchema } from './schema.js';
import { toPublicProduct } from './public-get.js';

function comparePublishedProducts(a, b) {
  if (Boolean(a.featured) !== Boolean(b.featured)) return a.featured ? -1 : 1;
  const order = Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
  if (order) return order;
  const time = String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''));
  if (time) return time;
  return String(a.id || '').localeCompare(String(b.id || ''));
}

export function sortPublishedProducts(items = []) {
  return [...items].sort(comparePublishedProducts);
}

export function selectFeaturedPublished(items = []) {
  return sortPublishedProducts(items)[0] || null;
}

export async function listPublishedProducts(env) {
  await ensureProductSchema(env);
  const sql = "SELECT p.id, p.published_slug, p.published_at, p.published_revision_id, r.content_json FROM products p JOIN product_revisions r ON r.id = p.published_revision_id WHERE p.status = 'published' AND p.published_revision_id IS NOT NULL";
  const result = await env.DB.prepare(sql).all();
  const items = sortPublishedProducts((result.results || []).map(row => toPublicProduct(row, JSON.parse(row.content_json))));
  const featured = selectFeaturedPublished(items);
  return { items, featuredId: featured?.id || null };
}
