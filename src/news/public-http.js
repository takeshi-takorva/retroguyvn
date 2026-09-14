import { listPublishedNews } from './public-list.js';
import { getPublishedNewsBySlug } from './public-get.js';

const json = (data, init = {}) => new Response(JSON.stringify(data), {
  ...init,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...(init.headers || {}) }
});

export async function handleNewsPublic(request, env) {
  try {
    const url = new URL(request.url);
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, { status: 405 });
    if (url.pathname === '/api/news') {
      const page = Number(url.searchParams.get('page') || 1);
      const pageSize = Number(url.searchParams.get('pageSize') || url.searchParams.get('limit') || 50);
      const result = await listPublishedNews(env, { page, pageSize });
      const { items, page: currentPage, pageSize: resolvedPageSize, totalItems, totalPages } = result;
      return json({ items, page: currentPage, pageSize: resolvedPageSize, totalItems, totalPages });
    }
    const match = url.pathname.match(/^\/api\/news\/([^/]+)$/);
    if (match) {
      const post = await getPublishedNewsBySlug(env, decodeURIComponent(match[1]));
      return post ? json(post) : json({ error: 'News post not found' }, { status: 404 });
    }
    return json({ error: 'Not found' }, { status: 404 });
  } catch (error) {
    const status = Number(error?.status || 500);
    return json({ error: status >= 500 ? 'Internal server error' : error.message }, { status });
  }
}
