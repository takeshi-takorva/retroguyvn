export function newsError(message, status = 400, extra = {}) {
  return Object.assign(new Error(message), { status, ...extra });
}

const cleanText = (value, max = 10000) => String(value ?? '').trim().slice(0, max);

export function countWords(value) {
  const text = String(value ?? '').trim();
  return text ? text.split(/\s+/u).length : 0;
}

export function enforceWordLimit(value, maxWords = 2000, label = 'Content') {
  const text = String(value ?? '').trim();
  if (countWords(text) > maxWords) throw newsError(`${label} can contain at most ${maxWords} words`);
  return text;
}

export function normalizePublishTime(value, fallback = new Date().toISOString()) {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) throw newsError('Invalid publish date/time');
  return parsed.toISOString();
}

export function normalizeNewsPagination({ page = 1, pageSize = 50 } = {}) {
  const parsedPage = Math.floor(Number(page));
  const parsedPageSize = Math.floor(Number(pageSize));
  const safePage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const safePageSize = Number.isFinite(parsedPageSize) && parsedPageSize > 0 ? Math.min(parsedPageSize, 50) : 50;
  return { page: safePage, pageSize: safePageSize, offset: (safePage - 1) * safePageSize };
}

export function cleanMediaId(value) {
  const id = cleanText(value, 160);
  if (!id) return null;
  if (!/^[A-Za-z0-9._:-]+$/.test(id)) throw newsError('Invalid media id');
  return id;
}

export function mediaUrl(id) {
  return id ? `/media/${encodeURIComponent(id)}` : '';
}

export function slugifyNewsTitle(value) {
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

export { cleanText };
