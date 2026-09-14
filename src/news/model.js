export function newsError(message, status = 400, extra = {}) {
  return Object.assign(new Error(message), { status, ...extra });
}

const cleanText = (value, max = 10000) => String(value ?? '').trim().slice(0, max);

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
