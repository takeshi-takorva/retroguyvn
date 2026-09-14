import { ensureNewsSchema } from './schema.js';
import { mediaUrl, newsError } from './model.js';
import { nowIso, uid } from './store.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export async function uploadNewsMedia(env, file) {
  await ensureNewsSchema(env);
  if (!(file instanceof File)) throw newsError('Missing file');
  const isImage = file.type.startsWith('image/');
  const isVideo = ['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type);
  if (!isImage && !isVideo) throw newsError('Only image, MP4, WebM or QuickTime files are allowed', 415);
  const maxBytes = isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (file.size > maxBytes) throw newsError(`${isImage ? 'Image' : 'Video'} is larger than ${Math.round(maxBytes / 1024 / 1024)} MB`, 413);
  if (!env?.MEDIA?.put) throw newsError('R2 MEDIA binding is required', 503);
  const id = uid('med');
  const storageKey = `media/${id}`;
  const createdAt = nowIso();
  await env.MEDIA.put(storageKey, file.stream(), { httpMetadata: { contentType: file.type } });
  try {
    const sql = "INSERT INTO media_nodes (id, parent_id, type, name, mime_type, size, storage_key, source, created_at, updated_at) VALUES (?, NULL, 'file', ?, ?, ?, ?, 'r2', ?, ?)";
    await env.DB.prepare(sql).bind(id, file.name, file.type, file.size, storageKey, createdAt, createdAt).run();
  } catch (error) {
    await env.MEDIA.delete(storageKey);
    throw error;
  }
  return { ok: true, id, url: mediaUrl(id), meta: { id, name: file.name, type: file.type, size: file.size, createdAt }, storage: 'r2' };
}
