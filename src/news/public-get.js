import { ensureNewsSchema } from './schema.js';
import { mediaUrl, slugifyNewsTitle } from './model.js';
import { toPublishedSummary } from './content.js';

export async function getPublishedNewsBySlug(env, slug) {
  await ensureNewsSchema(env);
  const post = await env.DB.prepare('SELECT id, published_at, published_revision_id FROM news_posts WHERE status = ? AND published_slug = ?').bind('published', slugifyNewsTitle(slug)).first();
  if (!post?.published_revision_id) return null;
  const revision = await env.DB.prepare('SELECT content_json FROM news_revisions WHERE id = ?').bind(post.published_revision_id).first();
  if (!revision) return null;
  const content = JSON.parse(revision.content_json);
  return { ...toPublishedSummary(post.id, post.published_at, content), ...content, coverUrl: mediaUrl(content.coverMediaId) };
}
