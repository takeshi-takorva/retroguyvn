import { ensureNewsSchema } from './schema.js';
import { toPublishedSummary } from './content.js';

export async function listPublishedNews(env, { limit = 50 } = {}) {
  await ensureNewsSchema(env);
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 100));
  const sql = "SELECT p.id, p.published_at, r.content_json FROM news_posts p JOIN news_revisions r ON r.id = p.published_revision_id WHERE p.status = 'published' ORDER BY p.published_at DESC LIMIT ?";
  const result = await env.DB.prepare(sql).bind(safeLimit).all();
  return (result.results || []).map(row => toPublishedSummary(row.id, row.published_at, JSON.parse(row.content_json)));
}
