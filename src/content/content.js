import { assertPostChannel, cleanMediaId, cleanText, mediaUrl, normalizeTags, slugifyPostTitle, contentError } from './model.js';
import { normalizePostBlock } from './blocks.js';

export function normalizePostDraft(input = {}) {
  const title = cleanText(input.title, 160);
  if (!title) throw contentError('Title is required');
  const slug = slugifyPostTitle(cleanText(input.slug, 140) || title);
  if (!slug) throw contentError('Slug is required');
  const rawBlocks = Array.isArray(input.blocks) ? input.blocks : [];
  if (rawBlocks.length > 100) throw contentError('A post can contain at most 100 blocks');
  return {
    title,
    slug,
    excerpt: cleanText(input.excerpt, 320),
    category: cleanText(input.category, 60) || 'Development',
    tags: normalizeTags(input.tags),
    coverMediaId: cleanMediaId(input.coverMediaId),
    blocks: rawBlocks.map(normalizePostBlock)
  };
}

export function collectPostMediaRefs(content = {}) {
  const refs = [];
  if (content.coverMediaId) refs.push({ id: content.coverMediaId, path: 'coverMediaId' });
  for (const [index, block] of (content.blocks || []).entries()) {
    if ((block.type === 'image' || block.type === 'video') && block.mediaId) refs.push({ id: block.mediaId, path: `blocks[${index}].mediaId` });
    if (block.type === 'gallery') {
      (block.mediaIds || []).forEach((id, mediaIndex) => refs.push({ id, path: `blocks[${index}].mediaIds[${mediaIndex}]` }));
    }
  }
  return refs;
}

export function toPublishedPostSummary(channel, id, publishedAt, content) {
  const normalizedChannel = assertPostChannel(channel);
  return {
    id,
    title: content.title,
    slug: content.slug,
    excerpt: content.excerpt,
    category: content.category,
    tags: content.tags || [],
    coverMediaId: content.coverMediaId || null,
    coverUrl: mediaUrl(content.coverMediaId),
    publishedAt,
    url: `/${normalizedChannel}/${encodeURIComponent(content.slug)}`
  };
}
