import baseWorker, { CMSStore } from './worker.js';
import { migrateLegacyToM2, storageStatus } from './cms/m2-core.js';
import {
  PAGE_DEFINITIONS,
  ensureM21,
  listPages,
  getPageBundle,
  getPagePublished,
  savePageDraft,
  publishPageDraft,
  getGlobalsBundle,
  getGlobalsPublished,
  saveGlobalsDraft,
  publishGlobalsDraft
} from './cms/m2-pages.js';

let bootstrapPromise = null;

const json = (data, init = {}) => new Response(JSON.stringify(data), {
  ...init,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...(init.headers || {}) }
});

function wrapD1ExecForSchema(db) {
  if (!db?.prepare || !db?.exec) return db;

  return new Proxy(db, {
    get(target, prop) {
      if (prop === 'exec') {
        return async (sql) => {
          if (typeof sql !== 'string' || !sql.includes('CREATE TABLE IF NOT EXISTS pages')) {
            return target.exec(sql);
          }

          const statements = sql
            .split(';')
            .map(statement => statement.trim())
            .filter(Boolean)
            .filter(statement => !/^PRAGMA\s+foreign_keys\s*=\s*ON$/i.test(statement));

          const startedAt = Date.now();
          for (const statement of statements) {
            await target.prepare(statement).run();
          }

          return { count: statements.length, duration: Date.now() - startedAt };
        };
      }

      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}

function withD1SchemaCompat(env) {
  if (!env?.DB) return env;
  const compatDb = wrapD1ExecForSchema(env.DB);
  return new Proxy(env, {
    get(target, prop, receiver) {
      if (prop === 'DB') return compatDb;
      return Reflect.get(target, prop, receiver);
    }
  });
}

async function bootstrapM2(env) {
  const status = await storageStatus(env);
  if (!status.d1 || !status.r2) return status;

  if (status.migration) {
    await ensureM21(env);
    return status;
  }

  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const result = await migrateLegacyToM2(env);
      if (!result.ok) {
        if (env?.DB?.prepare) {
          await env.DB.prepare("DELETE FROM cms_meta WHERE key = 'm2:migrated_legacy_at'").run();
          await env.DB.prepare(
            'INSERT OR REPLACE INTO cms_meta (key, value, updated_at) VALUES (?, ?, ?)'
          ).bind('m2:last_migration_error', JSON.stringify(result.errors || []), new Date().toISOString()).run();
        }
        throw new Error(`M2 legacy migration incomplete: ${(result.errors || []).length} error(s)`);
      }

      if (env?.DB?.prepare) {
        await env.DB.prepare(
          'INSERT OR REPLACE INTO cms_meta (key, value, updated_at) VALUES (?, ?, ?)'
        ).bind('m2:active', 'true', new Date().toISOString()).run();
      }
      await ensureM21(env);
      return result;
    })().finally(() => {
      bootstrapPromise = null;
    });
  }

  return bootstrapPromise;
}

class TextHandler {
  constructor(value) { this.value = value; }
  element(element) { element.setInnerContent(this.value ?? ''); }
}

class AttributeHandler {
  constructor(name, value) { this.name = name; this.value = value; }
  element(element) { if (this.value != null) element.setAttribute(this.name, String(this.value)); }
}

function flattenStrings(value, prefix = '', out = []) {
  if (typeof value === 'string' || typeof value === 'number') {
    out.push([prefix, String(value)]);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenStrings(item, prefix ? `${prefix}.${index}` : String(index), out));
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      flattenStrings(item, prefix ? `${prefix}.${key}` : key, out);
    }
  }
  return out;
}

async function rewriteM21(response, env, pathname) {
  if (!response?.ok || !response.headers.get('content-type')?.includes('text/html')) return response;
  if (pathname.startsWith('/admin')) return response;

  const globals = await getGlobalsPublished(env);
  const entry = Object.entries(PAGE_DEFINITIONS).find(([, def]) => def.route === pathname);
  const page = entry ? await getPagePublished(env, entry[0]) : null;
  const rewriter = new HTMLRewriter();

  for (const [key, value] of flattenStrings(globals)) {
    if (key.startsWith('seo.')) continue;
    rewriter.on(`[data-cms-global="${key}"]`, new TextHandler(value));
  }

  if (page) {
    for (const [key, value] of flattenStrings(page)) {
      if (key === 'seoTitle' || key === 'seoDescription') continue;
      rewriter.on(`[data-cms="${key}"]`, new TextHandler(value));
    }
    rewriter.on('[data-cms-global="seo.title"]', new TextHandler(page.seoTitle || globals.seo?.defaultTitle || 'RetroGuy VN'));
    rewriter.on('[data-cms-global="seo.description"]', new AttributeHandler('content', page.seoDescription || globals.seo?.defaultDescription || ''));
  }

  return rewriter.transform(response);
}

async function adminSession(request, env, ctx) {
  const url = new URL(request.url);
  url.pathname = '/api/admin/session';
  url.search = '';
  const probe = new Request(url.toString(), { method: 'GET', headers: request.headers });
  const response = await baseWorker.fetch(probe, env, ctx);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return null;
  return data;
}

function actorFromSession(session) {
  return session?.email || session?.mode || 'admin';
}

async function handleM21Admin(request, env, ctx, pathname) {
  const session = await adminSession(request, env, ctx);
  if (!session) return json({ error: 'Unauthorized' }, { status: 401 });
  const actor = actorFromSession(session);

  if (pathname === '/api/admin/pages' && request.method === 'GET') {
    return json({ pages: await listPages(env) });
  }
  if (pathname === '/api/admin/globals' && request.method === 'GET') {
    return json(await getGlobalsBundle(env));
  }
  if (pathname === '/api/admin/globals' && request.method === 'PUT') {
    return json(await saveGlobalsDraft(env, await request.json(), actor));
  }
  if (pathname === '/api/admin/globals/publish' && request.method === 'POST') {
    return json(await publishGlobalsDraft(env, actor));
  }

  const publishMatch = pathname.match(/^\/api\/admin\/pages\/([^/]+)\/publish$/);
  if (publishMatch && request.method === 'POST') {
    return json(await publishPageDraft(env, decodeURIComponent(publishMatch[1]), actor));
  }

  const pageMatch = pathname.match(/^\/api\/admin\/pages\/([^/]+)$/);
  if (pageMatch) {
    const slug = decodeURIComponent(pageMatch[1]);
    if (request.method === 'GET') {
      const bundle = await getPageBundle(env, slug);
      return bundle ? json(bundle) : json({ error: 'Unknown page' }, { status: 404 });
    }
    if (request.method === 'PUT') {
      return json(await savePageDraft(env, slug, await request.json(), actor));
    }
  }

  return json({ error: 'Not found' }, { status: 404 });
}

export { CMSStore };

export default {
  async fetch(request, env, ctx) {
    const runtimeEnv = withD1SchemaCompat(env);
    const url = new URL(request.url);

    try {
      if (runtimeEnv?.DB && runtimeEnv?.MEDIA) {
        const job = bootstrapM2(runtimeEnv).catch(error => {
          console.error('[CMS M2] automatic bootstrap failed', error);
        });
        if (ctx?.waitUntil) ctx.waitUntil(job);
        else await job;
      }

      if (
        url.pathname === '/api/admin/pages' ||
        url.pathname.startsWith('/api/admin/pages/') ||
        url.pathname === '/api/admin/globals' ||
        url.pathname === '/api/admin/globals/publish'
      ) {
        return await handleM21Admin(request, runtimeEnv, ctx, url.pathname);
      }

      const response = await baseWorker.fetch(request, runtimeEnv, ctx);
      if (request.method === 'GET' && !url.pathname.startsWith('/api/') && !url.pathname.startsWith('/media/')) {
        return await rewriteM21(response, runtimeEnv, url.pathname);
      }
      return response;
    } catch (error) {
      console.error('[CMS M2.1] request failed', error);
      if (url.pathname.startsWith('/api/admin/pages') || url.pathname.startsWith('/api/admin/globals')) {
        return json({ error: error?.message || 'Internal error' }, { status: Number(error?.status || 500) });
      }
      return baseWorker.fetch(request, runtimeEnv, ctx);
    }
  }
};
