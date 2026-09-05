import { handle } from '@astrojs/cloudflare/handler';
import {
  DEFAULT_CONTENT,
  getHomeBundle,
  getHomePublished,
  saveHomeDraft,
  publishHomeDraft,
  listMedia,
  uploadMedia,
  serveMedia,
  deleteMedia,
  migrateLegacyToM2,
  storageStatus
} from './cms/m2-core.js';

const MEDIA_FIELDS = [
  ['hero.image', 'Hero'],
  ['experience.image', 'Experience'],
  ['family.image', 'Product Family'],
  ['hardware.image', 'Hardware']
];

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

const getPath = (obj, path) => path.split('.').reduce((value, key) => value?.[key], obj);

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
}

function decodeBase64Url(value) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const raw = atob(padded);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

function parseJwtPart(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

let jwksCache = { url: '', keys: [], expiresAt: 0 };

function normalizeTeamDomain(value = '') {
  return String(value).trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
}

async function accessIdentity(request, env) {
  const token = request.headers.get('cf-access-jwt-assertion') || '';
  const teamDomain = normalizeTeamDomain(env.ACCESS_TEAM_DOMAIN || '');
  const expectedAud = String(env.ACCESS_AUD || '').trim();
  if (!token || !teamDomain || !expectedAud) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  let header;
  let payload;
  try {
    header = parseJwtPart(parts[0]);
    payload = parseJwtPart(parts[1]);
  } catch {
    return null;
  }

  if (header.alg !== 'RS256' || !header.kid) return null;
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp <= now || (payload.nbf && payload.nbf > now + 30)) return null;

  const issuer = `https://${teamDomain}`;
  if (String(payload.iss || '').replace(/\/$/, '') !== issuer) return null;
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(expectedAud)) return null;

  const certsUrl = `${issuer}/cdn-cgi/access/certs`;
  if (jwksCache.url !== certsUrl || jwksCache.expiresAt < Date.now()) {
    const response = await fetch(certsUrl, { cf: { cacheTtl: 3600, cacheEverything: true } });
    if (!response.ok) return null;
    const certs = await response.json();
    jwksCache = { url: certsUrl, keys: Array.isArray(certs.keys) ? certs.keys : [], expiresAt: Date.now() + 55 * 60 * 1000 };
  }

  const jwk = jwksCache.keys.find(key => key.kid === header.kid);
  if (!jwk) return null;

  try {
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decodeBase64Url(parts[2]), data);
    if (!valid) return null;
  } catch {
    return null;
  }

  const email = String(payload.email || '').trim().toLowerCase();
  const allowed = String(env.ADMIN_EMAILS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
  if (allowed.length && !allowed.includes(email)) return null;
  return { mode: 'access', email: email || null };
}

async function tokenIdentity(request, env) {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  if (!token || !env.ADMIN_TOKEN_SHA256) return null;
  return (await sha256Hex(token)) === env.ADMIN_TOKEN_SHA256 ? { mode: 'token', email: null } : null;
}

async function getIdentity(request, env) {
  return (await accessIdentity(request, env)) || (await tokenIdentity(request, env));
}

function accessConfigured(env) {
  return Boolean(normalizeTeamDomain(env.ACCESS_TEAM_DOMAIN || '') && String(env.ACCESS_AUD || '').trim());
}

function mediaUrl(id) {
  return `/media/${encodeURIComponent(id)}`;
}

function mediaUsage(content, url) {
  return MEDIA_FIELDS.filter(([path]) => getPath(content, path) === url).map(([, label]) => label);
}

class TextHandler {
  constructor(value, html = false) { this.value = value; this.html = html; }
  element(element) { element.setInnerContent(this.value ?? '', { html: this.html }); }
}

class AttrHandler {
  constructor(name, value) { this.name = name; this.value = value; }
  element(element) { if (this.value) element.setAttribute(this.name, this.value); }
}

async function rewriteHome(request, env, ctx) {
  const source = await handle(request, env, ctx);
  if (!source.ok || !source.headers.get('content-type')?.includes('text/html')) return source;
  const c = await getHomePublished(env);
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

// Legacy M1.1 Durable Object is intentionally retained during M2.0.
// It provides zero-downtime fallback and the source for one-time migration into D1/R2.
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

    if (request.method === 'GET' && path === '/media/list') {
      const values = await this.state.storage.list({ prefix: 'media:' });
      const draft = await this.state.storage.get('draft') || DEFAULT_CONTENT;
      const published = await this.state.storage.get('published') || DEFAULT_CONTENT;
      const items = [];
      for (const [key, value] of values) {
        if (!key.endsWith(':meta')) continue;
        const meta = value || {};
        const url = mediaUrl(meta.id);
        items.push({
          ...meta,
          url,
          usage: {
            draft: mediaUsage(draft, url),
            published: mediaUsage(published, url)
          }
        });
      }
      items.sort((a, b) => String(b.createdAt || b.id || '').localeCompare(String(a.createdAt || a.id || '')));
      return json({ items });
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
      const meta = { id, name: file.name, type: file.type || 'application/octet-stream', size: bytes.length, chunkCount, createdAt: new Date().toISOString() };
      await this.state.storage.put(`media:${id}:meta`, meta);
      const pairs = {};
      for (let i = 0; i < chunkCount; i++) {
        pairs[`media:${id}:chunk:${i}`] = bytes.slice(i * chunkSize, Math.min(bytes.length, (i + 1) * chunkSize)).buffer;
      }
      await this.state.storage.put(pairs);
      return json({ ok: true, id, url: mediaUrl(id), meta });
    }

    if (request.method === 'DELETE' && path.startsWith('/media/')) {
      const id = decodeURIComponent(path.slice('/media/'.length));
      const meta = await this.state.storage.get(`media:${id}:meta`);
      if (!meta) return json({ error: 'Media not found' }, { status: 404 });
      const url = mediaUrl(id);
      const draft = await this.state.storage.get('draft') || DEFAULT_CONTENT;
      const published = await this.state.storage.get('published') || DEFAULT_CONTENT;
      const usage = { draft: mediaUsage(draft, url), published: mediaUsage(published, url) };
      if (usage.draft.length || usage.published.length) return json({ error: 'Image is currently used by website content', usage }, { status: 409 });
      const keys = [`media:${id}:meta`];
      for (let i = 0; i < meta.chunkCount; i++) keys.push(`media:${id}:chunk:${i}`);
      await this.state.storage.delete(keys);
      return json({ ok: true, id });
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

function actorFromIdentity(identity) {
  return identity?.email || identity?.mode || 'admin';
}

function apiError(error) {
  return json({ error: error?.message || 'Internal error', usage: error?.usage }, { status: Number(error?.status || 500) });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      if (url.pathname === '/' && request.method === 'GET') {
        return rewriteHome(request, env, ctx);
      }

      if (url.pathname === '/api/content/home' && request.method === 'GET') {
        return json(await getHomePublished(env));
      }

      if (url.pathname.startsWith('/api/admin/')) {
        const identity = await getIdentity(request, env);
        if (!identity) return json({ error: 'Unauthorized', accessConfigured: accessConfigured(env) }, { status: 401 });
        if (url.pathname === '/api/admin/session' && request.method === 'GET') {
          return json({
            authenticated: true,
            mode: identity.mode,
            email: identity.email,
            accessConfigured: accessConfigured(env),
            cms: await storageStatus(env)
          });
        }

        const actor = actorFromIdentity(identity);
        if (url.pathname === '/api/admin/content/home' && request.method === 'GET') return json(await getHomeBundle(env));
        if (url.pathname === '/api/admin/content/home' && request.method === 'PUT') {
          return json(await saveHomeDraft(env, await request.json(), actor));
        }
        if (url.pathname === '/api/admin/publish/home' && request.method === 'POST') {
          return json(await publishHomeDraft(env, actor));
        }
        if (url.pathname === '/api/admin/media' && request.method === 'GET') return json(await listMedia(env));
        if (url.pathname === '/api/admin/media' && request.method === 'POST') {
          const form = await request.formData();
          return json(await uploadMedia(env, form.get('file')));
        }
        if (url.pathname.startsWith('/api/admin/media/') && request.method === 'DELETE') {
          const id = decodeURIComponent(url.pathname.slice('/api/admin/media/'.length));
          return json(await deleteMedia(env, id));
        }
        if (url.pathname === '/api/admin/m2/status' && request.method === 'GET') {
          return json(await storageStatus(env));
        }
        if (url.pathname === '/api/admin/m2/migrate' && request.method === 'POST') {
          return json(await migrateLegacyToM2(env));
        }
        return json({ error: 'Not found' }, { status: 404 });
      }

      if (url.pathname.startsWith('/media/') && request.method === 'GET') {
        const id = decodeURIComponent(url.pathname.slice('/media/'.length));
        return serveMedia(env, id);
      }

      return handle(request, env, ctx);
    } catch (error) {
      if (url.pathname.startsWith('/api/')) return apiError(error);
      console.error('Worker request failed', error);
      return handle(request, env, ctx);
    }
  }
};
