import { uploadNewsMedia } from './media.js';

export async function handleNewsMedia(request, env) {
  if (request.method !== 'POST') return { status: 405, data: { error: 'Method not allowed' } };
  const form = await request.formData();
  return { status: 201, data: await uploadNewsMedia(env, form.get('file')) };
}
