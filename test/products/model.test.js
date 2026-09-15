import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProductDraft } from '../../src/products/content.js';
import { slugifyProduct } from '../../src/products/model.js';

test('slugifies Vietnamese product names', () => {
  assert.equal(slugifyProduct('Thiết bị Cổng Số Đợt 0.5'), 'thiet-bi-cong-so-dot-0-5');
});

test('normalizes product draft and deduplicates gallery media', () => {
  const out = normalizeProductDraft({
    name: 'DR Portal',
    slug: 'DR Portal',
    availability: 'coming-soon',
    featured: true,
    sortOrder: 4,
    galleryMediaIds: ['m1', 'm1', 'm2'],
    features: [{ title: 'Controls', text: 'Physical controls' }],
    specs: [{ label: 'Display', value: 'Portrait display' }],
    cta: { label: 'Support', href: '/support' }
  });
  assert.equal(out.slug, 'dr-portal');
  assert.deepEqual(out.galleryMediaIds, ['m1', 'm2']);
  assert.equal(out.featured, true);
  assert.equal(out.sortOrder, 4);
  assert.equal(out.cta.href, '/support');
});

test('rejects invalid availability and external CTA paths', () => {
  assert.throws(() => normalizeProductDraft({ name: 'A', availability: 'maybe' }), /availability/i);
  assert.throws(() => normalizeProductDraft({ name: 'A', cta: { label: 'Buy', href: 'https://example.com' } }), /site-relative/i);
});

test('enforces product content collection and word limits', () => {
  assert.throws(() => normalizeProductDraft({ name: 'A', description: Array(4001).fill('word').join(' ') }), /4000 words/i);
  assert.throws(() => normalizeProductDraft({ name: 'A', features: Array.from({ length: 21 }, (_, i) => ({ title: `F${i}`, text: 'x' })) }), /20 features/i);
  assert.throws(() => normalizeProductDraft({ name: 'A', specs: Array.from({ length: 41 }, (_, i) => ({ label: `S${i}`, value: 'x' })) }), /40 specifications/i);
  assert.throws(() => normalizeProductDraft({ name: 'A', galleryMediaIds: Array.from({ length: 21 }, (_, i) => `m${i}`) }), /20 gallery/i);
});
