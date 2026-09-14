import { handleNewsPublic } from './public-http.js';
import { handleNewsCollection } from './admin-http-collection.js';
import { handleNewsItem } from './admin-http-item.js';
import { handleNewsMedia } from './admin-http-media.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

export async function dispatchNewsPublic(request, env) {
  return handleNewsPublic(request, env);
}

export async function dispatchNewsAdmin(request, env, actor) {
  try {
    const parts = new URL(request.url).pathname.split('/').filter(Boolean);
    let result;
    if (parts.length === 3) result = await handleNewsCollection(request, env, actor);
    else if (parts[3] === 'media') result = await handleNewsMedia(request, env);
    else if (parts[3]) result = await handleNewsItem(request, env, actor, decodeURIComponent(parts[3]), parts[4] || '');
    else return json({ error: 'Not found' }, 404);
    return json(result.data, result.status);
  } catch (error) {
    const status = Number(error?.status || 500);
    return json({ error: status >= 500 ? 'Internal server error' : error.message }, status);
  }
}
