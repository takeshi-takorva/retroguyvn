export const POST_CHANNELS = Object.freeze(['news', 'devlog']);

export function contentError(message, status = 422, extra = {}) {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, extra);
  return error;
}

export function assertPostChannel(channel) {
  const value = String(channel || '').trim().toLowerCase();
  if (!POST_CHANNELS.includes(value)) throw contentError('Unsupported content channel', 404);
  return value;
}

export const cleanText = (value, max = 10000) => String(value ?? '').trim().slice(0, max);

export function countWords(value) {
  const text = String(value ?? '').trim();
  return text ? text.split(/\s+/u).length : 0;
}

export function enforceWordLimit(value, maxWords = 2000, label = 'Content') {
  const text = String(value ?? '').trim();
  if (countWords(text) > maxWords) throw contentError(`${label} can contain at most ${maxWords} words`);
  return text;
}

export function normalizePublishTime(value, fallback = new Date().toISOString()) {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) throw contentError('Invalid publish date/time');
  return parsed.toISOString();
}

export function normalizePostPagination({ page = 1, pageSize = 50 } = {}) {
  const parsedPage = Math.floor(Number(page));
  const parsedPageSize = Math.floor(Number(pageSize));
  const safePage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const safePageSize = Number.isFinite(parsedPageSize) && parsedPageSize > 0 ? Math.min(parsedPageSize, 50) : 50;
  return { page: safePage, pageSize: safePageSize, offset: (safePage - 1) * safePageSize };
}

export function cleanMediaId(value) {
  const id = cleanText(value, 160);
  if (!id) return null;
  if (!/^[A-Za-z0-9._:-]+$/.test(id)) throw contentError('Invalid media id');
  return id;
}

export function mediaUrl(id) {
  return id ? `/media/${encodeURIComponent(id)}` : '';
}

export function slugifyPostTitle(value) {
  return String(value ?? '')
    .replace(/[Đđ]/g, match => match === 'Đ' ? 'D' : 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    .replace(/-+$/g, '');
}

export function normalizeTags(value) {
  const input = Array.isArray(value) ? value : String(value ?? '').split(',');
  const out = [];
  const seen = new Set();
  for (const raw of input) {
    const tag = cleanText(raw, 30);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= 10) break;
  }
  return out;
}
