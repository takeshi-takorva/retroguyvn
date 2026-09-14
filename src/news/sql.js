export const SQL = {
  postById: 'SELECT * FROM news_posts WHERE id = ?',
  postBySlug: 'SELECT id FROM news_posts WHERE slug = ?',
  postBySlugExceptId: 'SELECT id FROM news_posts WHERE slug = ? AND id <> ?',
  revisionById: 'SELECT * FROM news_revisions WHERE id = ?',
  maxVersion: 'SELECT COALESCE(MAX(version), 0) AS version FROM news_revisions WHERE post_id = ?',
  insertPost: "INSERT INTO news_posts (id, slug, published_slug, title, excerpt, category, tags_json, cover_media_id, status, draft_revision_id, published_revision_id, published_at, created_at, updated_at, created_by) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 'draft', ?, NULL, NULL, ?, ?, ?)",
  insertRevision: 'INSERT INTO news_revisions (id, post_id, version, content_json, created_at, created_by, published_at) VALUES (?, ?, ?, ?, ?, ?, NULL)',
  updateDraft: 'UPDATE news_posts SET slug = ?, title = ?, excerpt = ?, category = ?, tags_json = ?, cover_media_id = ?, draft_revision_id = ?, updated_at = ? WHERE id = ?',
  markRevisionPublished: 'UPDATE news_revisions SET published_at = ? WHERE id = ?',
  publishPost: "UPDATE news_posts SET status = 'published', published_revision_id = ?, published_slug = ?, published_at = ?, updated_at = ? WHERE id = ?",
  unpublishPost: "UPDATE news_posts SET status = 'draft', published_slug = NULL, updated_at = ? WHERE id = ?",
  deletePost: 'DELETE FROM news_posts WHERE id = ?',
  revisionsForPost: 'SELECT id FROM news_revisions WHERE post_id = ?'
};
