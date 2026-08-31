const DEFAULT_CONTENT = {
  hero: {
    eyebrow: 'Retro Guy · Pocket Adventure Device',
    tagline: 'Open the Portal. Enter the Realm.',
    description: 'Một thiết bị đồng hành nhỏ gọn để nuôi, huấn luyện, khám phá, chiến đấu và phát triển người bạn đồng hành số. Mang Digital Realm theo bạn — trong lòng bàn tay, trong túi quần, ở bất cứ đâu.',
    image: '/images/dr-portal/products/product-family.webp'
  },
  experience: {
    titleMain: 'Designed to go',
    titleAccent: 'with you.',
    description: 'DR Portal được thiết kế như một thiết bị đồng hành thay vì một máy chơi game cồng kềnh: thân máy nhỏ, các phím vật lý dễ thao tác và trải nghiệm có thể tiếp tục trong những khoảng thời gian ngắn xuyên suốt ngày.',
    image: '/images/dr-portal/products/lifestyle-hand.webp'
  },
  family: {
    titleMain: 'Choose your',
    titleAccent: 'portal.',
    description: 'Từ Navy Edition trầm, kỹ thuật tới Orange Edition nổi bật, thiết kế giữ chung một DNA: thân máy bo mềm, mặt điều khiển tập trung và màn hình dọc dành cho thế giới pixel art.',
    image: '/images/dr-portal/products/product-family.webp'
  },
  hardware: {
    titleMain: 'Built for',
    titleAccent: 'pocket play.',
    description: 'Cấu trúc phần cứng tập trung vào độ gọn, kết nối đơn giản và khả năng mở rộng nội dung. Thiết kế mặt lưng, loa và USB-C được tích hợp để giữ tổng thể liền mạch.',
    image: '/images/dr-portal/products/hardware.webp'
  },
  cta: {
    titleMain: 'Your digital world',
    titleAccent: 'is waiting.',
    description: 'Theo dõi Retro Guy để cập nhật quá trình phát triển DR Portal và Digital Realm.'
  }
};

const json = (data, init = {}) => new Response(JSON.stringify(data), {
  ...init,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...(init.headers || {}) }
});

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
}

async function isAuthorized(request, env) {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return false;
  const token = header.slice(7).trim();
  if (!token) return false;
  return (await sha256Hex(token)) === env.ADMIN_TOKEN_SHA256;
}

function cmsStub(env) {
  const id = env.CMS.idFromName('retroguy-home');
  return env.CMS.get(id);
}

function mediaUrl(id) {
  return `/media/${encodeURIComponent(id)}`;
}

async function getPublished(env) {
  const response = await cmsStub(env).fetch('https://cms/content/published');
  if (!response.ok) return DEFAULT_CONTENT;
  return await response.json();
}

class TextHandler {
  constructor(value, html = false) { this.value = value; this.html = html; }
  element(element) { element.setInnerContent(this.value ?? '', { html: this.html }); }
}

class AttrHandler {
  constructor(name, value) { this.name = name; this.value = value; }
  element(element) { if (this.value) element.setAttribute(this.name, this.value); }
}

async function rewriteHome(request, env) {
  const source = await env.ASSETS.fetch(request);
  if (!source.ok || !source.headers.get('content-type')?.includes('text/html')) return source;
  const c = await getPublished(env);
  const expTitle = `${escapeHtml(c.experience?.titleMain)} <em>${escapeHtml(c.experience?.titleAccent)}</em>`;
  const familyTitle = `${escapeHtml(c.family?.titleMain)} <span>${escapeHtml(c.family?.titleAccent)}</span>`;
  const hardwareTitle = `${escapeHtml(c.hardware?.titleMain)} <span>${escapeHtml(c.hardware?.titleAccent)}</span>`;
  const ctaTitle = `${escapeHtml(c.cta?.titleMain)} <span>${escapeHtml(c.cta?.titleAccent)}</span>`;

  return new HTMLRewriter()
    .on('.hero .eyebrow', new TextHandler(c.hero?.eyebrow || DEFAULT_CONTENT.hero.eyebrow))
    .on('.hero .tagline', new TextHandler(c.hero?.tagline || DEFAULT_CONTENT.hero.tagline))
    .on('.hero .lead', new TextHandler(c.hero?.description || DEFAULT_CONTENT.hero.description))
    .on('.hero-media img', new AttrHandler('src', c.hero?.image || DEFAULT_CONTENT.hero.image))
    .on('#experience .head h2', new TextHandler(expTitle, true))
    .on('#experience .head p', new TextHandler(c.experience?.description || DEFAULT_CONTENT.experience.description))
    .on('#experience .photo img', new AttrHandler('src', c.experience?.image || DEFAULT_CONTENT.experience.image))
    .on('.family h3', new TextHandler(familyTitle, true))
    .on('.family p', new TextHandler(c.family?.description || DEFAULT_CONTENT.family.description))
    .on('.family img', new AttrHandler('src', c.family?.image || DEFAULT_CONTENT.family.image))
    .on('#hardware .hardware h3', new TextHandler(hardwareTitle, true))
    .on('#hardware .hardware>div>p', new TextHandler(c.hardware?.description || DEFAULT_CONTENT.hardware.description))
    .on('#hardware .hardware img', new AttrHandler('src', c.hardware?.image || DEFAULT_CONTENT.hardware.image))
    .on('.cta h2', new TextHandler(ctaTitle, true))
    .on('.cta p', new TextHandler(c.cta?.description || DEFAULT_CONTENT.cta.description))
    .transform(source);
}

export class CMSStore {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'GET' && path === '/content/published') {
      const content = await this.state.storage.get('published');
      return json(content || DEFAULT_CONTENT);
    }
    if (request.method === 'GET' && path === '/content/draft') {
      const draft = await this.state.storage.get('draft');
      const published = await this.state.storage.get('published');
      return json({ draft: draft || published || DEFAULT_CONTENT, published: published || DEFAULT_CONTENT });
    }
    if (request.method === 'PUT' && path === '/content/draft') {
      const content = await request.json();
      await this.state.storage.put('draft', content);
      return json({ ok: true, savedAt: new Date().toISOString() });
    }
    if (request.method === 'POST' && path === '/content/publish') {
      const draft = await this.state.storage.get('draft');
      const content = draft || DEFAULT_CONTENT;
      await this.state.storage.put('published', content);
      return json({ ok: true, publishedAt: new Date().toISOString(), content });
    }
    if (request.method === 'POST' && path === '/media/upload') {
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File)) return json({ error: 'Missing file' }, { status: 400 });
      if (!file.type.startsWith('image/')) return json({ error: 'Only image files are allowed' }, { status: 415 });
      if (file.size > 5 * 1024 * 1024) return json({ error: 'Image is larger than 5 MB' }, { status: 413 });

      const id = `${Date.now().toString(36)}-${crypto.randomUUID()}`;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const chunkSize = 90 * 1024;
      const chunkCount = Math.ceil(bytes.length / chunkSize);
      const meta = { id, name: file.name, type: file.type || 'application/octet-stream', size: bytes.length, chunkCount };
      await this.state.storage.put(`media:${id}:meta`, meta);
      const pairs = {};
      for (let i = 0; i < chunkCount; i++) {
        pairs[`media:${id}:chunk:${i}`] = bytes.slice(i * chunkSize, Math.min(bytes.length, (i + 1) * chunkSize)).buffer;
      }
      await this.state.storage.put(pairs);
      return json({ ok: true, id, url: mediaUrl(id), meta });
    }
    if (request.method === 'GET' && path.startsWith('/media/')) {
      const id = decodeURIComponent(path.slice('/media/'.length));
      const meta = await this.state.storage.get(`media:${id}:meta`);
      if (!meta) return new Response('Not found', { status: 404 });
      const parts = [];
      let total = 0;
      for (let i = 0; i < meta.chunkCount; i++) {
        const part = await this.state.storage.get(`media:${id}:chunk:${i}`);
        if (!part) return new Response('Corrupt media', { status: 500 });
        const bytes = new Uint8Array(part);
        parts.push(bytes); total += bytes.length;
      }
      const out = new Uint8Array(total);
      let offset = 0;
      for (const part of parts) { out.set(part, offset); offset += part.length; }
      return new Response(out, { headers: { 'content-type': meta.type, 'cache-control': 'public, max-age=31536000, immutable' } });
    }

    return new Response('Not found', { status: 404 });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/' && request.method === 'GET') {
      return rewriteHome(request, env);
    }

    if (url.pathname === '/api/content/home' && request.method === 'GET') {
      return json(await getPublished(env));
    }

    if (url.pathname.startsWith('/api/admin/')) {
      if (!(await isAuthorized(request, env))) return json({ error: 'Unauthorized' }, { status: 401 });
      const stub = cmsStub(env);
      if (url.pathname === '/api/admin/content/home' && request.method === 'GET') return stub.fetch('https://cms/content/draft');
      if (url.pathname === '/api/admin/content/home' && request.method === 'PUT') {
        return stub.fetch(new Request('https://cms/content/draft', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: request.body }));
      }
      if (url.pathname === '/api/admin/publish/home' && request.method === 'POST') return stub.fetch('https://cms/content/publish', { method: 'POST' });
      if (url.pathname === '/api/admin/media' && request.method === 'POST') {
        return stub.fetch(new Request('https://cms/media/upload', { method: 'POST', headers: request.headers, body: request.body }));
      }
      return json({ error: 'Not found' }, { status: 404 });
    }

    if (url.pathname.startsWith('/media/') && request.method === 'GET') {
      return cmsStub(env).fetch(`https://cms${url.pathname}`);
    }

    return env.ASSETS.fetch(request);
  }
};
