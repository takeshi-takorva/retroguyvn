import { cleanMediaId, cleanText, newsError } from './model.js';

function safeUrl(value) {
  const url = cleanText(value, 2048);
  if (!url) throw newsError('Link URL is required');
  if (url.startsWith('/')) return url;
  let parsed;
  try { parsed = new URL(url); } catch { throw newsError('Link must use a safe http(s) URL'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw newsError('Link must use a safe http(s) URL');
  return parsed.toString();
}

export function normalizeNewsBlock(block = {}) {
  const type = cleanText(block.type, 20).toLowerCase();
  if (type === 'text') return { type, text: cleanText(block.text, 30000) };
  if (type === 'heading') return { type, level: [2, 3].includes(Number(block.level)) ? Number(block.level) : 2, text: cleanText(block.text, 300) };
  if (type === 'quote') return { type, text: cleanText(block.text, 4000), attribution: cleanText(block.attribution, 160) };
  if (type === 'image') return { type, mediaId: cleanMediaId(block.mediaId), alt: cleanText(block.alt, 240), caption: cleanText(block.caption, 500) };
  if (type === 'video') return { type, mediaId: cleanMediaId(block.mediaId), caption: cleanText(block.caption, 500) };
  if (type === 'gallery') {
    const mediaIds = [];
    const seen = new Set();
    for (const raw of Array.isArray(block.mediaIds) ? block.mediaIds : []) {
      const id = cleanMediaId(raw);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      mediaIds.push(id);
      if (mediaIds.length >= 12) break;
    }
    return { type, mediaIds, caption: cleanText(block.caption, 500) };
  }
  if (type === 'link') return { type, label: cleanText(block.label, 200) || 'Open link', url: safeUrl(block.url) };
  throw newsError(`Unsupported block type: ${type || 'empty'}`);
}
