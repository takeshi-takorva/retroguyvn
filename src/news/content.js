import { cleanMediaId, cleanText, mediaUrl, newsError, normalizeTags, slugifyNewsTitle } from './model.js';
import { normalizeNewsBlock } from './blocks.js';

export function normalizeNewsDraft(input = {}) {
  const title = cleanText(input.title, 160);
  if (!title) throw newsError('Title is required');
  const slug = slugifyNewsTitle(cleanText(input.slug, 140) || title);
  if (!slug) throw newsError('Slug is required');
  const rawBlocks = Array.isArray(input.blocks) ? input.blocks : [];
  if (rawBlocks.length > 100) throw newsError('A post can contain at most 100 blocks');
  return {
    title,
    slug,
    excerpt: cleanText(input.excerpt, 320),
    category: cleanText(input.category, 60) || 'Development',
    tags: normalizeTags(input.tags),
    coverMediaId: cleanMediaId(input.coverMediaId),
    blocks: rawBlocks.map(normalizeNewsBlock)
  };
}

export function collectNewsMediaRefs(content) {
  const refs = [];
  if (content.coverMediaId) refs.push({ id: content.coverMediaId, path: 'coverMediaId' });
  content.blocks.forEach((block, index) => {
    if ((block.type === 'image' || block.type === 'video') && block.mediaId) refs.push({ id: block.mediaId, path: `blocks[${index}].mediaId` });
    if (block.type === 'gallery') block.mediaIds.forEach((id, mediaIndex) => refs.push({ id, path: `blocks[${index}].mediaIds[${mediaIndex}]` }));
  });
  return refs;
}

export function toPublishedSummary(id, publishedAt, content) {
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
    url: `/news/${encodeURIComponent(content.slug)}`
  };
}
