export function productError(message, status = 422, extra = {}) {
  return Object.assign(new Error(message), { status, ...extra });
}

export function cleanProductText(value, maxLength, label, { required = false } = {}) {
  const text = String(value ?? '').trim();
  if (required && !text) throw productError(`${label} is required`);
  if (text.length > maxLength) throw productError(`${label} can contain at most ${maxLength} characters`);
  return text;
}

export function countProductWords(value) {
  const text = String(value ?? '').trim();
  return text ? text.split(/\s+/u).length : 0;
}

export function enforceProductWordLimit(value, maxWords, label) {
  const text = String(value ?? '').trim();
  if (countProductWords(text) > maxWords) throw productError(`${label} can contain at most ${maxWords} words`);
  return text;
}

export function slugifyProduct(value) {
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

export function cleanProductMediaId(value) {
  const id = String(value ?? '').trim();
  if (!id) return null;
  if (id.length > 160 || !/^[A-Za-z0-9._:-]+$/.test(id)) throw productError('Invalid media id');
  return id;
}

export function productMediaUrl(id) {
  return id ? `/media/${encodeURIComponent(id)}` : '';
}

export function normalizeSortOrder(value) {
  const number = Math.trunc(Number(value ?? 0));
  if (!Number.isFinite(number)) return 0;
  return Math.max(-2147483648, Math.min(2147483647, number));
}
