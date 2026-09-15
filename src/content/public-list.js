import { assertPostChannel, cleanText, normalizePostPagination } from './model.js';
import { ensureContentSchema } from './schema.js';
import { toPublishedPostSummary } from './content.js';

const publishedRowsSql = `SELECT p.id, p.published_at, r.content_json,
  json_extract(r.content_json, '$.category') AS category
  FROM content_posts p
  JOIN content_revisions r ON r.id = p.published_revision_id
  WHERE p.channel = ? AND p.status = 'published' AND p.published_revision_id IS NOT NULL`;

export async function listPublishedPosts(env, channel, options = {}) {
  const normalizedChannel = assertPostChannel(channel);
  await ensureContentSchema(env);
  const normalized = normalizePostPagination(options);
  const category = cleanText(options.category, 60);
  const categoryClause = category ? ' AND category = ?' : '';

  const countSql = `SELECT COUNT(*) AS total FROM (${publishedRowsSql}) published WHERE 1 = 1${categoryClause}`;
  const countStatement = env.DB.prepare(countSql);
  const countRow = category
    ? await countStatement.bind(normalizedChannel, category).first()
    : await countStatement.bind(normalizedChannel).first();
  const totalItems = Number(countRow?.total || 0);
  const totalPages = totalItems ? Math.ceil(totalItems / normalized.pageSize) : 0;
  const page = totalPages ? Math.min(normalized.page, totalPages) : 1;
  const offset = (page - 1) * normalized.pageSize;

  const listSql = `SELECT * FROM (${publishedRowsSql}) published WHERE 1 = 1${categoryClause} ORDER BY published_at DESC, id ASC LIMIT ? OFFSET ?`;
  const statement = env.DB.prepare(listSql);
  const result = category
    ? await statement.bind(normalizedChannel, category, normalized.pageSize, offset).all()
    : await statement.bind(normalizedChannel, normalized.pageSize, offset).all();
  const items = (result.results || []).map(row => toPublishedPostSummary(normalizedChannel, row.id, row.published_at, JSON.parse(row.content_json)));
  return { items, page, pageSize: normalized.pageSize, totalItems, totalPages };
}
