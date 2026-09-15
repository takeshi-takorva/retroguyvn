import {
  cleanProductMediaId,
  cleanProductText,
  enforceProductWordLimit,
  normalizeSortOrder,
  productError,
  slugifyProduct
} from './model.js';

const AVAILABILITY = new Set(['development', 'coming-soon', 'available', 'discontinued']);

function normalizeFeature(item, index) {
  const title = cleanProductText(item?.title, 100, `Feature ${index + 1} title`, { required: true });
  const text = cleanProductText(item?.text, 500, `Feature ${index + 1} text`);
  return { title, text };
}

function normalizeSpec(item, index) {
  const label = cleanProductText(item?.label, 100, `Specification ${index + 1} label`, { required: true });
  const value = cleanProductText(item?.value, 300, `Specification ${index + 1} value`, { required: true });
  return { label, value };
}

export function normalizeProductDraft(input = {}) {
  const name = cleanProductText(input.name, 120, 'Name', { required: true });
  const slug = slugifyProduct(input.slug || name);
  if (!slug) throw productError('Slug is required');

  const availability = String(input.availability || 'development').trim().toLowerCase();
  if (!AVAILABILITY.has(availability)) throw productError('Invalid availability');

  const featureInput = Array.isArray(input.features) ? input.features : [];
  if (featureInput.length > 20) throw productError('Product can contain at most 20 features');
  const specInput = Array.isArray(input.specs) ? input.specs : [];
  if (specInput.length > 40) throw productError('Product can contain at most 40 specifications');

  const galleryInput = Array.isArray(input.galleryMediaIds) ? input.galleryMediaIds : [];
  const galleryMediaIds = [];
  const seen = new Set();
  for (const rawId of galleryInput) {
    const id = cleanProductMediaId(rawId);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    galleryMediaIds.push(id);
  }
  if (galleryMediaIds.length > 20) throw productError('Product can contain at most 20 gallery media items');

  const ctaInput = input.cta && typeof input.cta === 'object' ? input.cta : {};
  const ctaLabel = cleanProductText(ctaInput.label || 'Get support', 80, 'CTA label');
  const ctaHref = cleanProductText(ctaInput.href || '/support', 240, 'CTA path');
  if (!ctaHref.startsWith('/') || ctaHref.startsWith('//')) throw productError('CTA path must be site-relative');

  return {
    name,
    slug,
    subtitle: cleanProductText(input.subtitle, 180, 'Subtitle'),
    excerpt: cleanProductText(input.excerpt, 500, 'Excerpt'),
    category: cleanProductText(input.category || 'Handheld', 80, 'Category', { required: true }),
    availability,
    featured: input.featured === true || input.featured === 1 || input.featured === '1',
    sortOrder: normalizeSortOrder(input.sortOrder),
    coverMediaId: cleanProductMediaId(input.coverMediaId),
    description: enforceProductWordLimit(input.description, 4000, 'Description'),
    features: featureInput.map(normalizeFeature),
    specs: specInput.map(normalizeSpec),
    galleryMediaIds,
    cta: { label: ctaLabel, href: ctaHref }
  };
}

export function productRevisionContent(product) {
  return {
    description: product.description || '',
    features: product.features || [],
    specs: product.specs || [],
    galleryMediaIds: product.galleryMediaIds || [],
    cta: product.cta || { label: 'Get support', href: '/support' }
  };
}

export function collectProductMediaRefs(product) {
  const refs = [];
  if (product?.coverMediaId) refs.push({ id: product.coverMediaId, path: 'coverMediaId' });
  for (const [index, id] of (product?.galleryMediaIds || []).entries()) refs.push({ id, path: `galleryMediaIds.${index}` });
  return refs;
}
