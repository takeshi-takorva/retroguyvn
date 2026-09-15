import { collectProductMediaRefs } from './content.js';
import { productError } from './model.js';
import { nowIso, uid } from './store.js';

export async function validateProductMedia(env, content) {
  const ids = [...new Set(collectProductMediaRefs(content).map(ref => ref.id))];
  for (const id of ids) {
    const row = await env.DB.prepare("SELECT id FROM media_nodes WHERE id = ? AND type = 'file' AND deleted_at IS NULL").bind(id).first();
    if (!row) throw productError(`Media not found: ${id}`);
  }
}

export async function indexProductMediaUsage(env, revisionId, content) {
  await env.DB.prepare('DELETE FROM media_usage WHERE owner_type = ? AND owner_id = ?').bind('product_revision', revisionId).run();
  const refs = collectProductMediaRefs(content);
  if (!refs.length) return;
  const statements = refs.map(ref => env.DB.prepare(
    'INSERT INTO media_usage (id, media_id, owner_type, owner_id, field_path, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(uid('use'), ref.id, 'product_revision', revisionId, ref.path, nowIso()));
  if (typeof env.DB.batch === 'function') await env.DB.batch(statements);
  else for (const statement of statements) await statement.run();
}

export async function assertProductMediaNotInUse(env, mediaId) {
  const sql = "SELECT DISTINCT p.id, p.slug, mu.field_path FROM media_usage mu JOIN products p ON mu.owner_id = p.draft_revision_id OR mu.owner_id = p.published_revision_id WHERE mu.owner_type = 'product_revision' AND mu.media_id = ?";
  const result = await env.DB.prepare(sql).bind(mediaId).all();
  const usage = result.results || [];
  if (usage.length) throw productError('Media is currently used by Product content', 409, { usage });
  return true;
}
