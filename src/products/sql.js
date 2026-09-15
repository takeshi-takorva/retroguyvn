export const SQL = {
  productById: 'SELECT * FROM products WHERE id = ?',
  productBySlug: 'SELECT id FROM products WHERE slug = ?',
  productBySlugExceptId: 'SELECT id FROM products WHERE slug = ? AND id <> ?',
  revisionById: 'SELECT * FROM product_revisions WHERE id = ?',
  maxVersion: 'SELECT COALESCE(MAX(version), 0) AS version FROM product_revisions WHERE product_id = ?',
  insertProduct: "INSERT INTO products (id, slug, published_slug, name, subtitle, excerpt, category, status, availability, featured, sort_order, cover_media_id, draft_revision_id, published_revision_id, published_at, created_at, updated_at, created_by) VALUES (?, ?, NULL, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)",
  insertRevision: 'INSERT INTO product_revisions (id, product_id, version, content_json, created_at, created_by, published_at) VALUES (?, ?, ?, ?, ?, ?, NULL)',
  updateDraft: 'UPDATE products SET slug = ?, name = ?, subtitle = ?, excerpt = ?, category = ?, availability = ?, featured = ?, sort_order = ?, cover_media_id = ?, draft_revision_id = ?, updated_at = ? WHERE id = ?',
  markRevisionPublished: 'UPDATE product_revisions SET published_at = ? WHERE id = ?',
  publishProduct: "UPDATE products SET status = 'published', published_revision_id = ?, published_slug = ?, published_at = ?, updated_at = ? WHERE id = ?",
  unpublishProduct: "UPDATE products SET status = 'draft', published_slug = NULL, updated_at = ? WHERE id = ?",
  deleteProduct: 'DELETE FROM products WHERE id = ?',
  revisionsForProduct: 'SELECT id FROM product_revisions WHERE product_id = ?'
};
