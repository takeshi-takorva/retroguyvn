const nowIso = () => new Date().toISOString();
const uid = prefix => `${prefix}_${crypto.randomUUID()}`;
const clone = value => JSON.parse(JSON.stringify(value));

export const PAGE_DEFINITIONS = {
  home: {
    title: 'Home',
    route: '/',
    managerRoute: '/admin',
    managerLabel: 'Homepage CMS',
    content: {}
  },
  product: {
    title: 'Product',
    route: '/product',
    managerRoute: '/admin/products',
    managerLabel: 'Product CMS',
    content: {}
  },
  news: {
    title: 'News',
    route: '/news',
    managerRoute: null,
    managerLabel: 'News Post Engine (M3)',
    content: {}
  },
  support: {
    title: 'Support',
    route: '/support',
    managerRoute: null,
    managerLabel: 'Support workflow (M4)',
    content: {}
  },
  devlog: {
    title: 'Dev Log',
    route: '/devlog',
    managerRoute: '/admin/devlog',
    managerLabel: 'Dev Log CMS',
    content: {}
  }
};

export const GLOBAL_DEFAULTS = {
  brand: 'RETROGUY VN',
  nav: {
    home: 'HOME',
    product: 'PRODUCT',
    news: 'NEWS',
    support: 'SUPPORT',
    devlog: 'DEV LOG'
  },
  footer: {
    brand: 'RETROGUY VN',
    tagline: 'Retro hardware. Pocket worlds. New adventures.',
    product: 'Product',
    news: 'News',
    support: 'Support',
    devlog: 'Dev Log'
  },
  seo: {
    defaultTitle: 'RetroGuy VN',
    defaultDescription: 'RetroGuy VN — pocket hardware, products, official news, support and development logs.'
  }
};

const PAGE_KEYS = Object.keys(PAGE_DEFINITIONS);

async function audit(env, actor, action, entityType, entityId, details = {}) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    details_json TEXT,
    created_at TEXT NOT NULL
  )`).run();
  await env.DB.prepare('INSERT INTO audit_logs (id, actor, action, entity_type, entity_id, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(uid('audit'), actor || 'admin', action, entityType, entityId, JSON.stringify(details || {}), nowIso()).run();
}

async function ensurePage(env, slug) {
  const def = PAGE_DEFINITIONS[slug];
  if (!def) return null;
  const existing = await env.DB.prepare('SELECT * FROM pages WHERE slug = ?').bind(slug).first();
  if (existing) return existing;

  const pageId = `page_${slug.replaceAll('-', '_')}`;
  const revisionId = uid('rev');
  const createdAt = nowIso();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO pages (id, slug, template, title, draft_revision_id, published_revision_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(pageId, slug, slug, def.title, revisionId, revisionId, createdAt, createdAt),
    env.DB.prepare('INSERT INTO page_revisions (id, page_id, version, content_json, created_at, created_by, published_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(revisionId, pageId, 1, JSON.stringify(def.content), createdAt, 'm2.1-bootstrap', createdAt)
  ]);
  return env.DB.prepare('SELECT * FROM pages WHERE slug = ?').bind(slug).first();
}

async function revision(env, id) {
  if (!id) return null;
  const row = await env.DB.prepare('SELECT id, version, content_json, created_at, created_by, published_at FROM page_revisions WHERE id = ?').bind(id).first();
  if (!row) return null;
  return { ...row, content: JSON.parse(row.content_json) };
}

export async function ensureM21(env) {
  if (!env?.DB?.prepare) return false;
  for (const slug of PAGE_KEYS) await ensurePage(env, slug);
  await ensureGlobals(env);
  return true;
}

export async function listPages(env) {
  await ensureM21(env);
  const result = await env.DB.prepare(`SELECT
      p.slug,
      p.title,
      p.template,
      p.draft_revision_id,
      p.published_revision_id,
      p.updated_at,
      draft.version AS draft_version,
      published.version AS published_version
    FROM pages p
    LEFT JOIN page_revisions draft ON draft.id = p.draft_revision_id
    LEFT JOIN page_revisions published ON published.id = p.published_revision_id
    WHERE p.slug IN (${PAGE_KEYS.map(() => '?').join(',')})`).bind(...PAGE_KEYS).all();
  const rows = new Map((result.results || []).map(row => [row.slug, row]));
  return PAGE_KEYS.map(slug => {
    const def = PAGE_DEFINITIONS[slug];
    const row = rows.get(slug) || {};
    return {
      slug,
      title: def.title,
      route: def.route,
      editorRoute: def.managerRoute,
      managerLabel: def.managerLabel,
      draftVersion: row.draft_version == null ? null : Number(row.draft_version),
      publishedVersion: row.published_version == null ? null : Number(row.published_version),
      updatedAt: row.updated_at || null,
      hasUnpublishedChanges: Boolean(row.draft_revision_id && row.draft_revision_id !== row.published_revision_id)
    };
  });
}

export async function getPageBundle(env, slug) {
  const page = await ensurePage(env, slug);
  if (!page) return null;
  const draft = await revision(env, page.draft_revision_id);
  const published = await revision(env, page.published_revision_id);
  return {
    slug,
    title: page.title,
    route: PAGE_DEFINITIONS[slug].route,
    draft: draft?.content || clone(PAGE_DEFINITIONS[slug].content),
    published: published?.content || clone(PAGE_DEFINITIONS[slug].content),
    revisions: {
      draft: draft ? { id: draft.id, version: draft.version, createdAt: draft.created_at, createdBy: draft.created_by } : null,
      published: published ? { id: published.id, version: published.version, publishedAt: published.published_at } : null
    }
  };
}

export async function getPagePublished(env, slug) {
  const page = await ensurePage(env, slug);
  if (!page) return null;
  const published = await revision(env, page.published_revision_id);
  return published?.content || clone(PAGE_DEFINITIONS[slug].content);
}

export async function savePageDraft(env, slug, content, actor = 'admin') {
  const page = await ensurePage(env, slug);
  if (!page) throw Object.assign(new Error('Unknown page'), { status: 404 });
  const latest = await env.DB.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM page_revisions WHERE page_id = ?').bind(page.id).first();
  const version = Number(latest?.version || 0) + 1;
  const revisionId = uid('rev');
  const createdAt = nowIso();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO page_revisions (id, page_id, version, content_json, created_at, created_by, published_at) VALUES (?, ?, ?, ?, ?, ?, NULL)')
      .bind(revisionId, page.id, version, JSON.stringify(content), createdAt, actor),
    env.DB.prepare('UPDATE pages SET draft_revision_id = ?, updated_at = ? WHERE id = ?').bind(revisionId, createdAt, page.id)
  ]);
  await audit(env, actor, 'save_draft', 'page', slug, { version, revisionId });
  return { ok: true, slug, version, revisionId, savedAt: createdAt };
}

export async function publishPageDraft(env, slug, actor = 'admin') {
  const page = await ensurePage(env, slug);
  if (!page) throw Object.assign(new Error('Unknown page'), { status: 404 });
  const draft = await revision(env, page.draft_revision_id);
  if (!draft) throw new Error('Draft revision not found');
  const publishedAt = nowIso();
  await env.DB.batch([
    env.DB.prepare('UPDATE page_revisions SET published_at = ? WHERE id = ?').bind(publishedAt, draft.id),
    env.DB.prepare('UPDATE pages SET published_revision_id = ?, updated_at = ? WHERE id = ?').bind(draft.id, publishedAt, page.id)
  ]);
  await audit(env, actor, 'publish', 'page', slug, { version: draft.version, revisionId: draft.id });
  return { ok: true, slug, version: draft.version, publishedAt, content: draft.content };
}

async function setting(env, key) {
  return env.DB.prepare('SELECT value_json, updated_at FROM global_settings WHERE key = ?').bind(key).first();
}

export async function ensureGlobals(env) {
  const published = await setting(env, 'site:published');
  if (published) return;
  const createdAt = nowIso();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO global_settings (key, value_json, updated_at) VALUES (?, ?, ?)').bind('site:published', JSON.stringify(GLOBAL_DEFAULTS), createdAt),
    env.DB.prepare('INSERT INTO global_settings (key, value_json, updated_at) VALUES (?, ?, ?)').bind('site:draft', JSON.stringify(GLOBAL_DEFAULTS), createdAt),
    env.DB.prepare('INSERT INTO global_settings (key, value_json, updated_at) VALUES (?, ?, ?)').bind('site:revision', JSON.stringify({ version: 1, publishedVersion: 1 }), createdAt)
  ]);
}

export async function getGlobalsBundle(env) {
  await ensureGlobals(env);
  const [draft, published, revisionRow] = await Promise.all([
    setting(env, 'site:draft'), setting(env, 'site:published'), setting(env, 'site:revision')
  ]);
  const revisions = JSON.parse(revisionRow?.value_json || '{"version":1,"publishedVersion":1}');
  return {
    draft: JSON.parse(draft?.value_json || JSON.stringify(GLOBAL_DEFAULTS)),
    published: JSON.parse(published?.value_json || JSON.stringify(GLOBAL_DEFAULTS)),
    revisions,
    updatedAt: draft?.updated_at || published?.updated_at || null
  };
}

export async function getGlobalsPublished(env) {
  await ensureGlobals(env);
  const row = await setting(env, 'site:published');
  return JSON.parse(row?.value_json || JSON.stringify(GLOBAL_DEFAULTS));
}

export async function saveGlobalsDraft(env, content, actor = 'admin') {
  await ensureGlobals(env);
  const current = await setting(env, 'site:revision');
  const state = JSON.parse(current?.value_json || '{"version":1,"publishedVersion":1}');
  const version = Number(state.version || 1) + 1;
  const savedAt = nowIso();
  await env.DB.batch([
    env.DB.prepare('INSERT OR REPLACE INTO global_settings (key, value_json, updated_at) VALUES (?, ?, ?)').bind('site:draft', JSON.stringify(content), savedAt),
    env.DB.prepare('INSERT OR REPLACE INTO global_settings (key, value_json, updated_at) VALUES (?, ?, ?)').bind('site:revision', JSON.stringify({ ...state, version }), savedAt)
  ]);
  await audit(env, actor, 'save_draft', 'global_settings', 'site', { version });
  return { ok: true, version, savedAt };
}

export async function publishGlobalsDraft(env, actor = 'admin') {
  const bundle = await getGlobalsBundle(env);
  const publishedAt = nowIso();
  const version = Number(bundle.revisions?.version || 1);
  await env.DB.batch([
    env.DB.prepare('INSERT OR REPLACE INTO global_settings (key, value_json, updated_at) VALUES (?, ?, ?)').bind('site:published', JSON.stringify(bundle.draft), publishedAt),
    env.DB.prepare('INSERT OR REPLACE INTO global_settings (key, value_json, updated_at) VALUES (?, ?, ?)').bind('site:revision', JSON.stringify({ version, publishedVersion: version }), publishedAt)
  ]);
  await audit(env, actor, 'publish', 'global_settings', 'site', { version });
  return { ok: true, version, publishedAt, content: bundle.draft };
}
