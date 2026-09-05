export const DEFAULT_CONTENT = {
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

const HOME_PAGE_ID = 'page_home';
const HOME_SLUG = 'home';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
let schemaReady = false;

const nowIso = () => new Date().toISOString();
const uid = prefix => `${prefix}_${crypto.randomUUID()}`;
const jsonClone = value => JSON.parse(JSON.stringify(value));

export const hasD1 = env => Boolean(env?.DB && typeof env.DB.prepare === 'function');
export const hasR2 = env => Boolean(env?.MEDIA && typeof env.MEDIA.put === 'function');

function legacyStub(env) {
  if (!env?.CMS) return null;
  return env.CMS.get(env.CMS.idFromName('retroguy-home'));
}

async function legacyFetch(env, path, init) {
  const stub = legacyStub(env);
  if (!stub) return null;
  return stub.fetch(`https://cms${path}`, init);
}

async function legacyBundle(env) {
  const response = await legacyFetch(env, '/content/draft');
  if (!response?.ok) return { draft: jsonClone(DEFAULT_CONTENT), published: jsonClone(DEFAULT_CONTENT) };
  return response.json();
}

async function legacyPublished(env) {
  const response = await legacyFetch(env, '/content/published');
  if (!response?.ok) return jsonClone(DEFAULT_CONTENT);
  return response.json();
}

const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  template TEXT NOT NULL,
  title TEXT NOT NULL,
  draft_revision_id TEXT,
  published_revision_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS page_revisions (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  content_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT,
  published_at TEXT,
  FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
  UNIQUE(page_id, version)
);
CREATE INDEX IF NOT EXISTS idx_page_revisions_page_version ON page_revisions(page_id, version DESC);
CREATE TABLE IF NOT EXISTS media_nodes (
  id TEXT PRIMARY KEY,
  parent_id TEXT,
  type TEXT NOT NULL CHECK(type IN ('file','folder')),
  name TEXT NOT NULL,
  mime_type TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  storage_key TEXT,
  width INTEGER,
  height INTEGER,
  checksum TEXT,
  source TEXT NOT NULL DEFAULT 'r2',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (parent_id) REFERENCES media_nodes(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_media_nodes_parent ON media_nodes(parent_id, deleted_at, name);
CREATE INDEX IF NOT EXISTS idx_media_nodes_storage_key ON media_nodes(storage_key);
CREATE TABLE IF NOT EXISTS media_usage (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL,
  owner_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  field_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (media_id) REFERENCES media_nodes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_media_usage_media ON media_usage(media_id);
CREATE INDEX IF NOT EXISTS idx_media_usage_owner ON media_usage(owner_type, owner_id);
CREATE TABLE IF NOT EXISTS global_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cms_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`;

export async function ensureSchema(env) {
  if (!hasD1(env)) return false;
  if (!schemaReady) {
    await env.DB.exec(SCHEMA_SQL);
    schemaReady = true;
  }
  return true;
}

function collectMediaRefs(value, path = '', out = []) {
  if (typeof value === 'string') {
    const match = value.match(/^\/media\/([^/?#]+)/);
    if (match) out.push({ id: decodeURIComponent(match[1]), path });
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectMediaRefs(item, `${path}[${index}]`, out));
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) collectMediaRefs(item, path ? `${path}.${key}` : key, out);
  }
  return out;
}

async function indexRevisionUsage(db, revisionId, content) {
  await db.prepare('DELETE FROM media_usage WHERE owner_type = ? AND owner_id = ?').bind('page_revision', revisionId).run();
  const refs = collectMediaRefs(content);
  if (!refs.length) return;
  const statements = refs.map(ref => db.prepare(
    'INSERT OR IGNORE INTO media_usage (id, media_id, owner_type, owner_id, field_path, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(uid('use'), ref.id, 'page_revision', revisionId, ref.path, nowIso()));
  await db.batch(statements);
}

async function ensureHomePage(env) {
  if (!await ensureSchema(env)) return null;
  const existing = await env.DB.prepare('SELECT * FROM pages WHERE slug = ?').bind(HOME_SLUG).first();
  if (existing) return existing;

  const legacy = await legacyBundle(env);
  const published = legacy.published || DEFAULT_CONTENT;
  const draft = legacy.draft || published;
  const createdAt = nowIso();
  const publishedRevisionId = uid('rev');
  const same = JSON.stringify(draft) === JSON.stringify(published);
  const draftRevisionId = same ? publishedRevisionId : uid('rev');

  const statements = [
    env.DB.prepare('INSERT INTO pages (id, slug, template, title, draft_revision_id, published_revision_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(HOME_PAGE_ID, HOME_SLUG, 'home', 'Home', draftRevisionId, publishedRevisionId, createdAt, createdAt),
    env.DB.prepare('INSERT INTO page_revisions (id, page_id, version, content_json, created_at, created_by, published_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(publishedRevisionId, HOME_PAGE_ID, 1, JSON.stringify(published), createdAt, 'm2-bootstrap', createdAt)
  ];
  if (!same) {
    statements.push(env.DB.prepare('INSERT INTO page_revisions (id, page_id, version, content_json, created_at, created_by, published_at) VALUES (?, ?, ?, ?, ?, ?, NULL)')
      .bind(draftRevisionId, HOME_PAGE_ID, 2, JSON.stringify(draft), createdAt, 'm2-bootstrap'));
  }
  await env.DB.batch(statements);
  await indexRevisionUsage(env.DB, publishedRevisionId, published);
  if (!same) await indexRevisionUsage(env.DB, draftRevisionId, draft);
  return env.DB.prepare('SELECT * FROM pages WHERE slug = ?').bind(HOME_SLUG).first();
}

async function revisionContent(db, id) {
  if (!id) return null;
  const row = await db.prepare('SELECT content_json, version, created_at, created_by, published_at FROM page_revisions WHERE id = ?').bind(id).first();
  if (!row) return null;
  return { ...row, content: JSON.parse(row.content_json) };
}

export async function getHomeBundle(env) {
  if (!hasD1(env)) return legacyBundle(env);
  const page = await ensureHomePage(env);
  const draftRevision = await revisionContent(env.DB, page.draft_revision_id);
  const publishedRevision = await revisionContent(env.DB, page.published_revision_id);
  return {
    draft: draftRevision?.content || jsonClone(DEFAULT_CONTENT),
    published: publishedRevision?.content || jsonClone(DEFAULT_CONTENT),
    revisions: {
      draft: draftRevision ? { version: draftRevision.version, createdAt: draftRevision.created_at, createdBy: draftRevision.created_by } : null,
      published: publishedRevision ? { version: publishedRevision.version, publishedAt: publishedRevision.published_at } : null
    },
    storage: 'd1'
  };
}

export async function getHomePublished(env) {
  if (!hasD1(env)) return legacyPublished(env);
  const page = await ensureHomePage(env);
  const revision = await revisionContent(env.DB, page.published_revision_id);
  return revision?.content || jsonClone(DEFAULT_CONTENT);
}

export async function saveHomeDraft(env, content, actor = 'admin') {
  if (!hasD1(env)) {
    const response = await legacyFetch(env, '/content/draft', {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(content)
    });
    return response?.json() || { ok: false };
  }
  const page = await ensureHomePage(env);
  const latest = await env.DB.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM page_revisions WHERE page_id = ?').bind(page.id).first();
  const version = Number(latest?.version || 0) + 1;
  const revisionId = uid('rev');
  const createdAt = nowIso();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO page_revisions (id, page_id, version, content_json, created_at, created_by, published_at) VALUES (?, ?, ?, ?, ?, ?, NULL)')
      .bind(revisionId, page.id, version, JSON.stringify(content), createdAt, actor),
    env.DB.prepare('UPDATE pages SET draft_revision_id = ?, updated_at = ? WHERE id = ?').bind(revisionId, createdAt, page.id)
  ]);
  await indexRevisionUsage(env.DB, revisionId, content);
  return { ok: true, savedAt: createdAt, version, revisionId, storage: 'd1' };
}

export async function publishHomeDraft(env, actor = 'admin') {
  if (!hasD1(env)) {
    const response = await legacyFetch(env, '/content/publish', { method: 'POST' });
    return response?.json() || { ok: false };
  }
  const page = await ensureHomePage(env);
  const draft = await revisionContent(env.DB, page.draft_revision_id);
  if (!draft) throw new Error('Draft revision not found');
  const publishedAt = nowIso();
  await env.DB.batch([
    env.DB.prepare('UPDATE page_revisions SET published_at = ? WHERE id = ?').bind(publishedAt, page.draft_revision_id),
    env.DB.prepare('UPDATE pages SET published_revision_id = ?, updated_at = ? WHERE id = ?').bind(page.draft_revision_id, publishedAt, page.id),
    env.DB.prepare('INSERT OR REPLACE INTO cms_meta (key, value, updated_at) VALUES (?, ?, ?)').bind('home:last_published_by', actor, publishedAt)
  ]);
  return { ok: true, publishedAt, version: draft.version, content: draft.content, storage: 'd1' };
}

async function legacyMediaList(env) {
  const response = await legacyFetch(env, '/media/list');
  if (!response?.ok) return [];
  const data = await response.json();
  return Array.isArray(data.items) ? data.items : [];
}

async function mediaUsageForCurrentPages(db, mediaId) {
  const result = await db.prepare(`
    SELECT DISTINCT p.slug, mu.field_path
    FROM media_usage mu
    JOIN pages p ON mu.owner_id = p.draft_revision_id OR mu.owner_id = p.published_revision_id
    WHERE mu.media_id = ?
  `).bind(mediaId).all();
  return result.results || [];
}

export async function listMedia(env) {
  const legacy = await legacyMediaList(env);
  if (!hasD1(env) || !hasR2(env)) return { items: legacy.map(item => ({ ...item, source: 'legacy' })), storage: 'legacy' };
  await ensureSchema(env);
  const result = await env.DB.prepare("SELECT * FROM media_nodes WHERE type = 'file' AND deleted_at IS NULL ORDER BY created_at DESC").all();
  const items = [];
  const seen = new Set();
  for (const row of result.results || []) {
    seen.add(row.id);
    items.push({
      id: row.id,
      name: row.name,
      type: row.mime_type,
      size: row.size,
      url: `/media/${encodeURIComponent(row.id)}`,
      createdAt: row.created_at,
      source: row.source,
      usage: await mediaUsageForCurrentPages(env.DB, row.id)
    });
  }
  for (const item of legacy) {
    if (!seen.has(item.id)) items.push({ ...item, source: 'legacy' });
  }
  return { items, storage: 'hybrid' };
}

export async function uploadMedia(env, file) {
  if (!(file instanceof File)) throw Object.assign(new Error('Missing file'), { status: 400 });
  if (!file.type.startsWith('image/')) throw Object.assign(new Error('Only image files are allowed'), { status: 415 });
  if (file.size > MAX_IMAGE_BYTES) throw Object.assign(new Error('Image is larger than 5 MB'), { status: 413 });

  if (!hasD1(env) || !hasR2(env)) {
    const form = new FormData();
    form.append('file', file, file.name);
    const response = await legacyFetch(env, '/media/upload', { method: 'POST', body: form });
    if (!response?.ok) throw Object.assign(new Error('Legacy media upload failed'), { status: response?.status || 500 });
    return response.json();
  }

  await ensureSchema(env);
  const id = uid('med');
  const storageKey = `media/${id}`;
  const createdAt = nowIso();
  await env.MEDIA.put(storageKey, file.stream(), { httpMetadata: { contentType: file.type } });
  try {
    await env.DB.prepare(`
      INSERT INTO media_nodes (id, parent_id, type, name, mime_type, size, storage_key, source, created_at, updated_at)
      VALUES (?, NULL, 'file', ?, ?, ?, ?, 'r2', ?, ?)
    `).bind(id, file.name, file.type, file.size, storageKey, createdAt, createdAt).run();
  } catch (error) {
    await env.MEDIA.delete(storageKey);
    throw error;
  }
  return { ok: true, id, url: `/media/${encodeURIComponent(id)}`, meta: { id, name: file.name, type: file.type, size: file.size, createdAt }, storage: 'r2' };
}

export async function serveMedia(env, id) {
  if (hasD1(env) && hasR2(env)) {
    await ensureSchema(env);
    const row = await env.DB.prepare("SELECT * FROM media_nodes WHERE id = ? AND type = 'file' AND deleted_at IS NULL").bind(id).first();
    if (row?.storage_key) {
      const object = await env.MEDIA.get(row.storage_key);
      if (object) {
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag || object.etag);
        headers.set('cache-control', 'public, max-age=31536000, immutable');
        return new Response(object.body, { headers });
      }
    }
  }
  const legacy = await legacyFetch(env, `/media/${encodeURIComponent(id)}`);
  return legacy || new Response('Not found', { status: 404 });
}

export async function deleteMedia(env, id) {
  if (hasD1(env) && hasR2(env)) {
    await ensureSchema(env);
    const row = await env.DB.prepare('SELECT * FROM media_nodes WHERE id = ? AND deleted_at IS NULL').bind(id).first();
    if (row) {
      const usage = await mediaUsageForCurrentPages(env.DB, id);
      if (usage.length) throw Object.assign(new Error('Image is currently used by website content'), { status: 409, usage });
      if (row.storage_key) await env.MEDIA.delete(row.storage_key);
      await env.DB.prepare('UPDATE media_nodes SET deleted_at = ?, updated_at = ? WHERE id = ?').bind(nowIso(), nowIso(), id).run();
      return { ok: true, id, storage: 'r2' };
    }
  }
  const response = await legacyFetch(env, `/media/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response) throw Object.assign(new Error('Media not found'), { status: 404 });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || 'Delete failed'), { status: response.status, ...data });
  return data;
}

export async function migrateLegacyToM2(env) {
  if (!hasD1(env) || !hasR2(env)) {
    return { ok: false, ready: false, error: 'D1 DB and R2 MEDIA bindings are required' };
  }
  await ensureHomePage(env);
  const legacyItems = await legacyMediaList(env);
  let migrated = 0;
  let skipped = 0;
  const errors = [];
  for (const item of legacyItems) {
    try {
      const exists = await env.DB.prepare('SELECT id FROM media_nodes WHERE id = ?').bind(item.id).first();
      if (exists) { skipped++; continue; }
      const response = await legacyFetch(env, `/media/${encodeURIComponent(item.id)}`);
      if (!response?.ok) throw new Error(`Cannot read legacy media ${item.id}`);
      const bytes = await response.arrayBuffer();
      const storageKey = `media/${item.id}`;
      const type = item.type || response.headers.get('content-type') || 'application/octet-stream';
      await env.MEDIA.put(storageKey, bytes, { httpMetadata: { contentType: type } });
      const createdAt = item.createdAt || nowIso();
      await env.DB.prepare(`
        INSERT INTO media_nodes (id, parent_id, type, name, mime_type, size, storage_key, source, created_at, updated_at)
        VALUES (?, NULL, 'file', ?, ?, ?, ?, 'legacy-migrated', ?, ?)
      `).bind(item.id, item.name || item.id, type, item.size || bytes.byteLength, storageKey, createdAt, nowIso()).run();
      migrated++;
    } catch (error) {
      errors.push({ id: item.id, error: error.message });
    }
  }
  const completedAt = nowIso();
  await env.DB.prepare('INSERT OR REPLACE INTO cms_meta (key, value, updated_at) VALUES (?, ?, ?)')
    .bind('m2:migrated_legacy_at', completedAt, completedAt).run();
  return { ok: errors.length === 0, ready: true, migrated, skipped, errors, completedAt };
}

export async function storageStatus(env) {
  const status = {
    d1: hasD1(env),
    r2: hasR2(env),
    legacyDurableObject: Boolean(env?.CMS),
    mode: hasD1(env) && hasR2(env) ? 'm2-hybrid' : 'm1.1-fallback',
    schemaReady: false,
    migration: null
  };
  if (hasD1(env)) {
    try {
      await ensureSchema(env);
      status.schemaReady = true;
      const row = await env.DB.prepare("SELECT value, updated_at FROM cms_meta WHERE key = 'm2:migrated_legacy_at'").first();
      if (row) status.migration = { completedAt: row.value, updatedAt: row.updated_at };
    } catch (error) {
      status.error = error.message;
    }
  }
  return status;
}
