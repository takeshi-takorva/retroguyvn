import baseWorker, { CMSStore } from './worker.js';
import { migrateLegacyToM2, storageStatus } from './cms/m2-core.js';

let bootstrapPromise = null;

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
    // Automatic provisioning makes DB/MEDIA available on the first production
    // deployment. Migration runs in the background; M1.1 remains the read
    // fallback until D1/R2 objects are ready.
    if (env?.DB && env?.MEDIA) {
      const job = bootstrapM2(env).catch(error => {
        console.error('[CMS M2.0B] automatic migration failed', error);
      });
      if (ctx?.waitUntil) ctx.waitUntil(job);
      else await job;
    }

    return baseWorker.fetch(request, env, ctx);
  }
};
