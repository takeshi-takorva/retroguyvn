const nowIso = () => new Date().toISOString();
const uid = prefix => `${prefix}_${crypto.randomUUID()}`;
const clone = value => JSON.parse(JSON.stringify(value));

export const PAGE_DEFINITIONS = {
  'digital-realm': {
    title: 'Digital Realm',
    route: '/digital-realm',
    content: {
      seoTitle: 'Digital Realm — RetroGuy VN',
      seoDescription: "Discover Digital Realm, RetroGuy VN's connected pocket-world project.",
      eyebrow: 'Flagship project',
      heading: 'DIGITAL REALM',
      lede: 'A connected virtual-pet adventure built around exploration, care, collection and team combat — designed for a dedicated handheld instead of a phone screen.',
      showcaseLabel: 'Product artwork / video placeholder',
      tag: 'Portable world',
      showcaseHeading: 'Carry the realm with you.',
      showcaseText: 'The device is the portal. Your companion lives, grows and travels with you while the world expands through maps, events, quests and future network services.',
      primaryAction: 'Explore features',
      secondaryAction: 'View media',
      cards: [
        { badge: 'WORLD', title: 'Explore', text: 'Connected regions with distinct climates, cities, NPC roles, resources, quests and activities.' },
        { badge: 'COMPANION', title: 'Raise', text: 'Care routines, training, evolution and long-term progression give your character a persistent life.' },
        { badge: 'COMBAT', title: 'Team battle', text: 'A 3v3 combat foundation supports solo, team and future online competitive modes.' }
      ]
    }
  },
  features: {
    title: 'Features',
    route: '/features',
    content: {
      seoTitle: 'Features — RetroGuy VN',
      seoDescription: 'Explore the Digital Realm feature set and product experience.',
      eyebrow: 'Digital Realm',
      heading: 'FEATURES',
      lede: 'The V1 feature map focuses on the experience players touch every day while keeping the architecture ready for network services later.',
      items: [
        { badge: '01', title: 'Pocket-first design', text: 'Compact dedicated hardware focused on comfortable one-handed play and quick daily interactions.' },
        { badge: '02', title: 'Virtual companion', text: 'Care, clean, train, evolve and build persistent progress over time.' },
        { badge: '03', title: 'Realm exploration', text: 'Travel through multiple regions with NPCs, shops, quests, weather and local activities.' },
        { badge: '04', title: '3v3 combat', text: 'A team-based combat architecture designed to support PvE, local PvP and future online play.' },
        { badge: '05', title: 'Mini-games', text: 'Fishing, training and other location-based activities expand progression beyond combat.' },
        { badge: '06', title: 'Connected future', text: 'Device accounts, OTA updates, cloud save, events, ranking and online matchmaking are planned as web services.' }
      ],
      roadmapLabel: 'Roadmap note:',
      roadmapText: 'Account, OTA, cloud save and online PvP are backend phases. This public website V1 does not expose unfinished services as available features.'
    }
  },
  gallery: {
    title: 'Media',
    route: '/gallery',
    content: {
      seoTitle: 'Media — RetroGuy VN',
      seoDescription: 'Product photography, gameplay captures, concept art and development media from RetroGuy VN.',
      eyebrow: 'Screenshots & media',
      heading: 'MEDIA',
      lede: 'A dedicated space for product photography, game captures, concept art and development videos.',
      items: ['Product photography', 'Gameplay capture', 'World / map art', 'Development video']
    }
  },
  download: {
    title: 'Download',
    route: '/download',
    content: {
      seoTitle: 'Downloads — RetroGuy VN',
      seoDescription: 'Verified RetroGuy VN firmware, manuals and future device content packages.',
      eyebrow: 'Firmware & resources',
      heading: 'DOWNLOAD',
      lede: 'This area is reserved for verified firmware, manuals and future device content packages.',
      statusLabel: 'V1 status:',
      statusText: 'Public firmware downloads are not enabled yet. OTA and signed release delivery will be added in a later backend phase.',
      items: [
        { title: 'Firmware releases', text: 'Future stable firmware packages grouped by hardware revision with release notes and checksums.' },
        { title: 'Manuals & guides', text: 'Quick-start instructions, controls, troubleshooting and product documentation.' },
        { title: 'Content packages', text: 'Future verified assets and game content updates distributed separately from firmware where possible.' }
      ]
    }
  },
  support: {
    title: 'Support',
    route: '/support',
    content: {
      seoTitle: 'Support — RetroGuy VN',
      seoDescription: 'Setup, troubleshooting, warranty and contact information for RetroGuy VN products.',
      eyebrow: 'Help & contact',
      heading: 'SUPPORT',
      lede: 'Support V1 provides a clear home for setup guidance, troubleshooting, warranty information and contact channels as they become available.',
      cards: [
        { badge: 'START', title: 'Quick start', text: 'Device setup, controls, charging, storage and first-run instructions will be published here.' },
        { badge: 'FIX', title: 'Troubleshooting', text: 'Known issues, recovery steps and firmware-specific notes will be maintained alongside releases.' },
        { badge: 'CONTACT', title: 'Get in touch', text: 'Official community and support contact details will be added before public launch.' }
      ]
    }
  }
};

export const GLOBAL_DEFAULTS = {
  brand: 'RETROGUY VN',
  nav: {
    home: 'HOME',
    digitalRealm: 'DIGITAL REALM',
    features: 'FEATURES',
    media: 'MEDIA',
    news: 'NEWS',
    download: 'DOWNLOAD',
    support: 'SUPPORT'
  },
  footer: {
    brand: 'RETROGUY VN',
    tagline: 'Retro hardware. Pocket worlds. New adventures.',
    digitalRealm: 'Digital Realm',
    devlog: 'Devlog',
    support: 'Support'
  },
  seo: {
    defaultTitle: 'RetroGuy VN',
    defaultDescription: 'RetroGuy VN — retro-inspired hardware, Digital Realm, development updates and downloads.'
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
  const result = await env.DB.prepare(`SELECT slug, title, template, draft_revision_id, published_revision_id, updated_at
    FROM pages WHERE slug IN (${PAGE_KEYS.map(() => '?').join(',')}) ORDER BY title`).bind(...PAGE_KEYS).all();
  return (result.results || []).map(row => ({
    slug: row.slug,
    title: row.title,
    route: PAGE_DEFINITIONS[row.slug]?.route || `/${row.slug}`,
    updatedAt: row.updated_at,
    hasUnpublishedChanges: row.draft_revision_id !== row.published_revision_id
  }));
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
