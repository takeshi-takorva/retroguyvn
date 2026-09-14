import { ensureNewsSchema } from './schema.js';
import { toPublishedSummary } from './content.js';
import { normalizeNewsPagination } from './model.js';

export async function listPublishedNews(env, options = {}) {
  await ensureNewsSchema(env);
  const normalized = normalizeNewsPagination(options);
  const countRow = await env.DB.prepare("SELECT COUNT(*) AS total FROM news_posts WHERE status = 'published'").first();
  const totalItems = Number(countRow?.total || 0);
  const totalPages = totalItems ? Math.ceil(totalItems / normalized.pageSize) : 0;
  const page = totalPages ? Math.min(normalized.page, totalPages) : 1;
  const offset = (page - 1) * normalized.pageSize;
  const sql = "SELECT p.id, p.published_at, r.content_json FROM news_posts p JOIN news_revisions r ON r.id = p.published_revision_id WHERE p.status = 'published' ORDER BY p.published_at DESC LIMIT ? OFFSET ?";
  const result = await env.DB.prepare(sql).bind(normalized.pageSize, offset).all();
  const items = (result.results || []).map(row => toPublishedSummary(row.id, row.published_at, JSON.parse(row.content_json)));
  return { items, page, pageSize: normalized.pageSize, totalItems, totalPages };
}
