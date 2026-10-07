import test from 'node:test';
import assert from 'node:assert/strict';
import { slugifyPostTitle, normalizePostPagination, normalizePublishTime } from '../../src/content/model.js';
import { normalizePostBlock } from '../../src/content/blocks.js';
import { normalizePostDraft, collectPostMediaRefs, toPublishedPostSummary } from '../../src/content/content.js';

test('shared post model slugifies Vietnamese and clamps pagination to 50', () => {
  assert.equal(slugifyPostTitle('Nhật ký Đường thử nghiệm'), 'nhat-ky-duong-thu-nghiem');
  assert.deepEqual(normalizePostPagination({ page: 3, pageSize: 500 }), { page: 3, pageSize: 50, offset: 100 });
});

test('shared post draft normalizes tags and keeps existing News block vocabulary', () => {
  const draft = normalizePostDraft({
    title: 'Build 05',
    tags: ['ESP32', 'esp32', 'Hardware'],
    blocks: [
      { type: 'text', text: 'Hello world' },
      { type: 'heading', level: 3, text: 'Section' },
      { type: 'image', mediaId: 'm1', alt: 'A', caption: 'Image' },
      { type: 'gallery', mediaIds: ['m2', 'm2', 'm3'] },
      { type: 'video', mediaId: 'm4' },
      { type: 'quote', text: 'Quote', attribution: 'RG' },
      { type: 'link', label: 'Support', url: '/support' }
    ]
  });
  assert.deepEqual(draft.tags, ['ESP32', 'Hardware']);
  assert.deepEqual(draft.blocks.map(block => block.type), ['text','heading','image','gallery','video','quote','link']);
  assert.deepEqual(collectPostMediaRefs(draft).map(ref => ref.id), ['m1','m2','m3','m4']);
});

test('published summary derives canonical URL from explicit channel', () => {
  const content = normalizePostDraft({ title: 'Build 05', slug: 'build-05' });
  assert.equal(toPublishedPostSummary('news', 'p1', '2026-09-15T00:00:00Z', content).url, '/news/build-05');
  assert.equal(toPublishedPostSummary('devlog', 'p2', '2026-09-15T00:00:00Z', content).url, '/devlog/build-05');
});

test('shared blocks enforce safe links and 2000-word text/quote limits', () => {
  assert.throws(() => normalizePostBlock({ type: 'link', url: 'javascript:alert(1)' }), /safe http\(s\)/i);
  const tooLong = Array.from({ length: 2001 }, () => 'word').join(' ');
  assert.throws(() => normalizePostBlock({ type: 'text', text: tooLong }), /2000 words/i);
  assert.throws(() => normalizePostBlock({ type: 'quote', text: tooLong }), /2000 words/i);
});

test('publish time remains ISO-compatible with News backdating', () => {
  assert.equal(normalizePublishTime('2026-09-15T10:00:00+07:00'), '2026-09-15T03:00:00.000Z');
  assert.throws(() => normalizePublishTime('not-a-date'), /Invalid publish date\/time/);
});
