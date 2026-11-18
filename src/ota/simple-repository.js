import { ensureOtaSchema } from './schema.js';

function httpError(status, code) {
  const error = new Error(code);
  error.status = status;
  error.code = code;
  return error;
}

export function createSimpleOtaRepository(env) {
  const db = env?.DB;
  if (!db?.prepare) throw new Error('D1 binding DB is required');
  const ready = () => ensureOtaSchema(env);

  return {
    async createSimpleRelease(row) {
      await ready();
      try {
        await db.prepare(`
          INSERT INTO ota_simple_releases (
            version, hw_major, hw_minor, revision,
            game_r2_key, game_file_name, game_size, game_sha256,
            assets_r2_key, assets_file_name, assets_size, assets_sha256,
            notes, status, created_by, created_at, updated_at, published_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          row.version, row.hw_major, row.hw_minor, row.revision,
          row.game_r2_key, row.game_file_name, row.game_size, row.game_sha256,
          row.assets_r2_key || null, row.assets_file_name || null, row.assets_size ?? null, row.assets_sha256 || null,
          row.notes || '', row.status || 'draft', row.created_by || null, row.created_at, row.updated_at, row.published_at || null
        ).run();
      } catch (error) {
        if (/UNIQUE constraint failed/i.test(String(error?.message || error))) {
          throw httpError(409, 'simple_release_exists');
        }
        throw error;
      }
      return this.getSimpleRelease(row.version);
    },

    async getSimpleRelease(version) {
      await ready();
      return db.prepare('SELECT * FROM ota_simple_releases WHERE version = ?').bind(version).first();
    },

    async updateSimpleRelease(version, patch, {
      expectedStatus = null,
      expectedUpdatedAt = null,
      expectedGameR2Key = undefined,
      expectedAssetsR2Key = undefined
    } = {}) {
      await ready();
      const current = await this.getSimpleRelease(version);
      if (!current) throw httpError(404, 'simple_release_not_found');
      const next = { ...current, ...patch };
      const where = ['version=?'];
      const guards = [version];
      if (expectedStatus != null) {
        where.push('status=?');
        guards.push(expectedStatus);
      }
      if (expectedUpdatedAt != null) {
        where.push('updated_at=?');
        guards.push(expectedUpdatedAt);
      }
      if (expectedGameR2Key !== undefined) {
        where.push('game_r2_key=?');
        guards.push(expectedGameR2Key);
      }
      if (expectedAssetsR2Key !== undefined) {
        if (expectedAssetsR2Key === null) {
          where.push('assets_r2_key IS NULL');
        } else {
          where.push('assets_r2_key=?');
          guards.push(expectedAssetsR2Key);
        }
      }
      const result = await db.prepare(`
        UPDATE ota_simple_releases SET
          game_r2_key=?, game_file_name=?, game_size=?, game_sha256=?,
          assets_r2_key=?, assets_file_name=?, assets_size=?, assets_sha256=?,
          notes=?, status=?, updated_at=?, published_at=?
        WHERE ${where.join(' AND ')}
      `).bind(
        next.game_r2_key, next.game_file_name, next.game_size, next.game_sha256,
        next.assets_r2_key || null, next.assets_file_name || null, next.assets_size ?? null, next.assets_sha256 || null,
        next.notes || '', next.status, next.updated_at, next.published_at || null,
        ...guards
      ).run();
      if (!result.meta?.changes) {
        const latest = await this.getSimpleRelease(version);
        if (!latest) throw httpError(404, 'simple_release_not_found');
        throw httpError(409, 'simple_release_conflict');
      }
      return this.getSimpleRelease(version);
    },

    async deleteSimpleRelease(version, {
      expectedStatus = null,
      expectedUpdatedAt = null,
      expectedGameR2Key = undefined,
      expectedAssetsR2Key = undefined
    } = {}) {
      await ready();
      const where = ['version=?'];
      const guards = [version];
      if (expectedStatus != null) {
        where.push('status=?');
        guards.push(expectedStatus);
      }
      if (expectedUpdatedAt != null) {
        where.push('updated_at=?');
        guards.push(expectedUpdatedAt);
      }
      if (expectedGameR2Key !== undefined) {
        where.push('game_r2_key=?');
        guards.push(expectedGameR2Key);
      }
      if (expectedAssetsR2Key !== undefined) {
        if (expectedAssetsR2Key === null) {
          where.push('assets_r2_key IS NULL');
        } else {
          where.push('assets_r2_key=?');
          guards.push(expectedAssetsR2Key);
        }
      }
      const result = await db.prepare(`DELETE FROM ota_simple_releases WHERE ${where.join(' AND ')}`).bind(...guards).run();
      if (!result.meta?.changes) {
        const latest = await this.getSimpleRelease(version);
        if (!latest) throw httpError(404, 'simple_release_not_found');
        throw httpError(409, 'simple_release_conflict');
      }
      return true;
    },

    async listSimpleReleases() {
      await ready();
      const result = await db.prepare('SELECT * FROM ota_simple_releases ORDER BY hw_major DESC, hw_minor DESC, revision DESC').all();
      return result.results || [];
    },

    async findLatestSimpleRelease(hwMajor, hwMinor, currentRevision) {
      await ready();
      return db.prepare(`
        SELECT * FROM ota_simple_releases
        WHERE hw_major=? AND hw_minor=? AND status='published' AND revision>?
        ORDER BY revision DESC LIMIT 1
      `).bind(hwMajor, hwMinor, currentRevision).first();
    }
  };
}
