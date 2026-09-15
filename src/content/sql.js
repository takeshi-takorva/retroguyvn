export const SQL = {
  postById: 'SELECT * FROM content_posts WHERE id = ? AND channel = ?',
  postBySlug: 'SELECT id FROM content_posts WHERE channel = ? AND slug = ?',
  postBySlugExceptId: 'SELECT id FROM content_posts WHERE channel = ? AND slug = ? AND id <> ?',
  listAdminPosts: 'SELECT * FROM content_posts WHERE channel = ? ORDER BY updated_at DESC',
  revisionById: 'SELECT * FROM content_revisions WHERE id = ?',
  maxVersion: 'SELECT COALESCE(MAX(version), 0) AS version FROM content_revisions WHERE post_id = ?',
  insertPost: "INSERT INTO content_posts (id, channel, slug, published_slug, title, excerpt, category, tags_json, cover_media_id, status, draft_revision_id, published_revision_id, published_at, created_at, updated_at, created_by) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, 'draft', ?, NULL, NULL, ?, ?, ?)",
  insertRevision: 'INSERT INTO content_revisions (id, post_id, version, content_json, created_at, created_by, published_at) VALUES (?, ?, ?, ?, ?, ?, NULL)',
  updateDraft: 'UPDATE content_posts SET slug = ?, title = ?, excerpt = ?, category = ?, tags_json = ?, cover_media_id = ?, draft_revision_id = ?, updated_at = ? WHERE id = ? AND channel = ?',
  markRevisionPublished: 'UPDATE content_revisions SET published_at = ? WHERE id = ?',
  publishPost: "UPDATE content_posts SET status = 'published', published_revision_id = ?, published_slug = ?, published_at = ?, updated_at = ? WHERE id = ? AND channel = ?",
  unpublishPost: "UPDATE content_posts SET status = 'draft', published_slug = NULL, updated_at = ? WHERE id = ? AND channel = ?",
  deletePost: 'DELETE FROM content_posts WHERE id = ? AND channel = ?',
  revisionsForPost: 'SELECT id FROM content_revisions WHERE post_id = ?'
};
