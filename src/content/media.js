import { collectPostMediaRefs } from './content.js';
import { contentError, mediaUrl } from './model.js';
import { ensureContentSchema } from './schema.js';
import { nowIso, uid } from './store.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
let legacyUsagePromise = null;

export async function validatePostMedia(env, content) {
  const ids = [...new Set(collectPostMediaRefs(content).map(ref => ref.id))];
  for (const id of ids) {
    const row = await env.DB.prepare("SELECT id FROM media_nodes WHERE id = ? AND type = 'file' AND deleted_at IS NULL").bind(id).first();
    if (!row) throw contentError(`Media not found: ${id}`);
  }
}

export async function indexPostMediaUsage(env, revisionId, content) {
  await env.DB.prepare('DELETE FROM media_usage WHERE owner_type = ? AND owner_id = ?').bind('content_revision', revisionId).run();
  const refs = collectPostMediaRefs(content);
  if (!refs.length) return;
  const statements = refs.map(ref => env.DB.prepare('INSERT INTO media_usage (id, media_id, owner_type, owner_id, field_path, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(uid('use'), ref.id, 'content_revision', revisionId, ref.path, nowIso()));
  if (typeof env.DB.batch === 'function') await env.DB.batch(statements);
  else for (const statement of statements) await statement.run();
}

export async function migrateLegacyNewsMediaUsage(env) {
  await ensureContentSchema(env);
  if (!legacyUsagePromise) legacyUsagePromise = env.DB.prepare("INSERT OR IGNORE INTO media_usage (id, media_id, owner_type, owner_id, field_path, created_at) SELECT 'm3_' || id, media_id, 'content_revision', owner_id, field_path, created_at FROM media_usage WHERE owner_type = 'news_revision'").run().catch(error => { legacyUsagePromise = null; throw error; });
  return legacyUsagePromise;
}

export async function assertContentMediaNotInUse(env, mediaId) {
  await migrateLegacyNewsMediaUsage(env);
  const sql = "SELECT DISTINCT p.id, p.channel, p.slug, mu.field_path FROM media_usage mu JOIN content_posts p ON mu.owner_id = p.draft_revision_id OR mu.owner_id = p.published_revision_id WHERE mu.owner_type = 'content_revision' AND mu.media_id = ?";
  const result = await env.DB.prepare(sql).bind(mediaId).all();
  const usage = result.results || [];
  if (usage.length) throw contentError('Media is currently used by Content', 409, { usage });
  return true;
}

export async function uploadPostMedia(env, file) {
  await ensureContentSchema(env);
  if (!(file instanceof File)) throw contentError('Missing file');
  const isImage = file.type.startsWith('image/');
  const isVideo = ['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type);
  if (!isImage && !isVideo) throw contentError('Only image, MP4, WebM or QuickTime files are allowed', 415);
  const maxBytes = isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (file.size > maxBytes) throw contentError(`${isImage ? 'Image' : 'Video'} is larger than ${Math.round(maxBytes / 1024 / 1024)} MB`, 413);
  if (!env?.MEDIA?.put) throw contentError('R2 MEDIA binding is required', 503);
  const id = uid('med');
  const storageKey = `media/${id}`;
  const createdAt = nowIso();
  await env.MEDIA.put(storageKey, file.stream(), { httpMetadata: { contentType: file.type } });
  try {
    await env.DB.prepare("INSERT INTO media_nodes (id, parent_id, type, name, mime_type, size, storage_key, source, created_at, updated_at) VALUES (?, NULL, 'file', ?, ?, ?, ?, 'r2', ?, ?)").bind(id, file.name, file.type, file.size, storageKey, createdAt, createdAt).run();
  } catch (error) {
    await env.MEDIA.delete(storageKey);
    throw error;
  }
  return { ok: true, id, url: mediaUrl(id), meta: { id, name: file.name, type: file.type, size: file.size, createdAt }, storage: 'r2' };
}
