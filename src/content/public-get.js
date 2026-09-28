import { toPublishedPostSummary } from './content.js';
import { assertPostChannel, mediaUrl, slugifyPostTitle } from './model.js';
import { ensureContentSchema } from './schema.js';

export async function getPublishedPost(env, channel, slug) {
  const normalizedChannel = assertPostChannel(channel);
  await ensureContentSchema(env);
  const normalizedSlug = slugifyPostTitle(slug);
  const post = await env.DB.prepare(
    "SELECT id, published_at, published_revision_id FROM content_posts WHERE channel = ? AND status = 'published' AND published_slug = ?"
  ).bind(normalizedChannel, normalizedSlug).first();
  if (!post?.published_revision_id) return null;
  const revision = await env.DB.prepare('SELECT content_json FROM content_revisions WHERE id = ?').bind(post.published_revision_id).first();
  if (!revision) return null;
  const content = JSON.parse(revision.content_json);
  return {
    ...toPublishedPostSummary(normalizedChannel, post.id, post.published_at, content),
    ...content,
    coverUrl: mediaUrl(content.coverMediaId)
  };
}
