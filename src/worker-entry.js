import baseWorker, { CMSStore } from './worker.js';
import { migrateLegacyToM2, storageStatus } from './cms/m2-core.js';

let bootstrapPromise = null;

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

          return {
            count: statements.length,
            duration: Date.now() - startedAt
          };
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
  if (!status.d1 || !status.r2 || status.migration) return status;

  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const result = await migrateLegacyToM2(env);
      if (!result.ok) {
        // M2.0 migrateLegacyToM2 writes its completion marker after an attempt.
        // Remove it on partial failure so the next request can safely retry.
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
      return result;
    })().finally(() => {
      bootstrapPromise = null;
    });
  }

  return bootstrapPromise;
}

export { CMSStore };

export default {
  async fetch(request, env, ctx) {
    // D1 currently rejects the multi-statement schema bootstrap emitted by
    // M2 core. Route all runtime D1 access through a compatibility wrapper
    // that executes the schema DDL one statement at a time.
    const runtimeEnv = withD1SchemaCompat(env);

    if (runtimeEnv?.DB && runtimeEnv?.MEDIA) {
      const job = bootstrapM2(runtimeEnv).catch(error => {
        console.error('[CMS M2.0B] automatic migration failed', error);
      });
      if (ctx?.waitUntil) ctx.waitUntil(job);
      else await job;
    }

    return baseWorker.fetch(request, runtimeEnv, ctx);
  }
};
