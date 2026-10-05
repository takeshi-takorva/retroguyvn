import { ensureOtaSchema } from './schema.js';
import { httpError, parseVersion } from './core.js';

const nowIso = () => new Date().toISOString();
const uid = prefix => `${prefix}_${crypto.randomUUID()}`;

function requireDb(env) {
  if (!env?.DB?.prepare) throw httpError(503, 'ota_database_unavailable');
  return env.DB;
}

async function targetsFor(db, releaseId) {
  const result = await db.prepare(`
    SELECT h.id, h.code, h.label, h.enabled
    FROM ota_release_targets t
    JOIN ota_hardware h ON h.id = t.hardware_id
    WHERE t.release_id = ?
    ORDER BY h.code
  `).bind(releaseId).all();
  return result.results || [];
}

async function withTargets(db, row) {
  if (!row) return null;
  const targetRows = await targetsFor(db, row.id);
  return {
    ...row,
    targets: targetRows.map(item => item.code),
    target_ids: targetRows.map(item => item.id),
    target_hardware: targetRows
  };
}

export function createOtaRepository(env) {
  const db = requireDb(env);

  async function ready() {
    await ensureOtaSchema(env);
  }

  return {
    async listHardware({ includeDisabled = true } = {}) {
      await ready();
      const sql = includeDisabled
        ? 'SELECT * FROM ota_hardware ORDER BY code'
        : 'SELECT * FROM ota_hardware WHERE enabled = 1 ORDER BY code';
      const result = await db.prepare(sql).all();
      return result.results || [];
    },

    async createHardware({ code, label }) {
      await ready();
      const id = uid('hw');
      const at = nowIso();
      await db.prepare('INSERT INTO ota_hardware (id, code, label, enabled, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)')
        .bind(id, code, label, at, at).run();
      return db.prepare('SELECT * FROM ota_hardware WHERE id = ?').bind(id).first();
    },

    async updateHardware(id, patch = {}) {
      await ready();
      const current = await db.prepare('SELECT * FROM ota_hardware WHERE id = ?').bind(id).first();
      if (!current) throw httpError(404, 'hardware_not_found');
      const label = patch.label === undefined ? current.label : String(patch.label).trim();
      const enabled = patch.enabled === undefined ? current.enabled : (patch.enabled ? 1 : 0);
      const at = nowIso();
      await db.prepare('UPDATE ota_hardware SET label = ?, enabled = ?, updated_at = ? WHERE id = ?')
        .bind(label, enabled, at, id).run();
      return db.prepare('SELECT * FROM ota_hardware WHERE id = ?').bind(id).first();
    },

    async findHardwareByCode(code) {
      await ready();
      return db.prepare('SELECT * FROM ota_hardware WHERE code = ?').bind(code).first();
    },

    async findReleaseByIdentity(product, version, buildId) {
      await ready();
      return db.prepare('SELECT * FROM ota_releases WHERE product = ? AND version = ? AND build_id = ?')
        .bind(product, version, buildId).first();
    },

    async createRelease(release, hardwareIds) {
      await ready();
      const statements = [db.prepare(`
        INSERT INTO ota_releases (
          id, product, version, version_sort, build_id, channel, status, secure_version,
          min_boot_version, release_notes, r2_key, file_name, content_type, size_bytes,
          sha256, esp_image_valid, download_count, created_by, created_at, updated_at, published_at,
          release_seq, game_fix, asset_version, signature_alg, signature, mandatory
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        release.id, release.product, release.version, release.version_sort, release.build_id,
        release.channel, release.status, release.secure_version, release.min_boot_version,
        release.release_notes, release.r2_key, release.file_name, release.content_type,
        release.size_bytes, release.sha256, release.esp_image_valid, release.download_count || 0,
        release.created_by || null, release.created_at, release.updated_at, release.published_at || null,
        release.release_seq ?? null, release.game_fix || 0, release.asset_version || null,
        release.signature_alg || null, release.signature || null, release.mandatory ? 1 : 0
      )];
      for (const hardwareId of hardwareIds) {
        statements.push(db.prepare('INSERT INTO ota_release_targets (release_id, hardware_id, created_at) VALUES (?, ?, ?)')
          .bind(release.id, hardwareId, release.created_at));
      }
      await db.batch(statements);
      return withTargets(db, await db.prepare('SELECT * FROM ota_releases WHERE id = ?').bind(release.id).first());
    },

    async getRelease(id) {
      await ready();
      return withTargets(db, await db.prepare('SELECT * FROM ota_releases WHERE id = ?').bind(id).first());
    },

    async listReleases(filters = {}) {
      await ready();
      const where = [];
      const bindings = [];
      let join = '';
      if (filters.hardwareCode) {
        join = ' JOIN ota_release_targets t ON t.release_id = r.id JOIN ota_hardware h ON h.id = t.hardware_id ';
        where.push('h.code = ?');
        bindings.push(filters.hardwareCode);
      }
      for (const [key, column] of [['product', 'r.product'], ['channel', 'r.channel'], ['status', 'r.status']]) {
        if (filters[key]) {
          where.push(`${column} = ?`);
          bindings.push(filters[key]);
        }
      }
      const limit = Math.max(1, Math.min(Number(filters.limit || 100), 500));
      const sql = `SELECT DISTINCT r.* FROM ota_releases r ${join}${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY r.version_sort DESC, r.created_at DESC LIMIT ${limit}`;
      const result = await db.prepare(sql).bind(...bindings).all();
      const items = [];
      for (const row of result.results || []) items.push(await withTargets(db, row));
      return items;
    },

    async updateRelease(id, patch, hardwareIds) {
      await ready();
      const current = await db.prepare('SELECT * FROM ota_releases WHERE id = ?').bind(id).first();
      if (!current) throw httpError(404, 'release_not_found');
      const next = { ...current, ...patch, updated_at: patch.updated_at || nowIso() };
      const statements = [db.prepare(`
        UPDATE ota_releases SET version = ?, version_sort = ?, build_id = ?, channel = ?, secure_version = ?,
          min_boot_version = ?, release_notes = ?, release_seq = ?, game_fix = ?, asset_version = ?,
          signature_alg = ?, signature = ?, mandatory = ?, updated_at = ? WHERE id = ?
      `).bind(next.version, next.version_sort, next.build_id, next.channel, next.secure_version,
        next.min_boot_version || null, next.release_notes || '', next.release_seq ?? null,
        next.game_fix || 0, next.asset_version || null, next.signature_alg || null,
        next.signature || null, next.mandatory ? 1 : 0, next.updated_at, id)];
      if (Array.isArray(hardwareIds)) {
        statements.push(db.prepare('DELETE FROM ota_release_targets WHERE release_id = ?').bind(id));
        for (const hardwareId of hardwareIds) {
          statements.push(db.prepare('INSERT INTO ota_release_targets (release_id, hardware_id, created_at) VALUES (?, ?, ?)')
            .bind(id, hardwareId, next.updated_at));
        }
      }
      await db.batch(statements);
      return withTargets(db, await db.prepare('SELECT * FROM ota_releases WHERE id = ?').bind(id).first());
    },

    async updateReleaseFile(id, patch) {
      await ready();
      const result = await db.prepare(`
        UPDATE ota_releases SET
          r2_key = ?, file_name = ?, content_type = ?, size_bytes = ?, sha256 = ?,
          esp_image_valid = ?, updated_at = ?
        WHERE id = ?
      `).bind(
        patch.r2_key, patch.file_name, patch.content_type || 'application/octet-stream',
        patch.size_bytes, patch.sha256, patch.esp_image_valid ? 1 : 0,
        patch.updated_at || nowIso(), id
      ).run();
      if (!result.meta?.changes) throw httpError(404, 'release_not_found');
      return withTargets(db, await db.prepare('SELECT * FROM ota_releases WHERE id = ?').bind(id).first());
    },

    async setReleaseStatus(id, status, actor) {
      await ready();
      const at = nowIso();
      const publishedAt = status === 'published' ? at : null;
      const result = await db.prepare(`
        UPDATE ota_releases SET status = ?, updated_at = ?, published_at = CASE WHEN ? = 'published' THEN ? ELSE published_at END
        WHERE id = ?
      `).bind(status, at, status, publishedAt, id).run();
      if (!result.meta?.changes) throw httpError(404, 'release_not_found');
      if (actor) {
        await db.prepare('UPDATE ota_releases SET created_by = COALESCE(created_by, ?) WHERE id = ?').bind(actor, id).run();
      }
      return withTargets(db, await db.prepare('SELECT * FROM ota_releases WHERE id = ?').bind(id).first());
    },

    async deleteRelease(id) {
      await ready();
      const result = await db.prepare('DELETE FROM ota_releases WHERE id = ?').bind(id).run();
      return Number(result.meta?.changes || 0) > 0;
    },

    async findNewestCompatibleRelease({ product, channel, hardwareCode, currentVersionSort, bootVersionSort }) {
      await ready();
      const result = await db.prepare(`
        SELECT DISTINCT r.*
        FROM ota_releases r
        JOIN ota_release_targets t ON t.release_id = r.id
        JOIN ota_hardware h ON h.id = t.hardware_id
        WHERE r.product = ? AND r.channel = ? AND r.status = 'published'
          AND h.code = ? AND r.version_sort > ?
        ORDER BY r.version_sort DESC, r.published_at DESC, r.created_at DESC
      `).bind(product, channel, hardwareCode, currentVersionSort).all();
      for (const row of result.results || []) {
        if (row.min_boot_version) {
          if (bootVersionSort == null) continue;
          if (bootVersionSort < parseVersion(row.min_boot_version).sort) continue;
        }
        return withTargets(db, row);
      }
      return null;
    },

    async findNewestCompatibleReleaseV1({ channel, hardwareCode, currentReleaseSeq, currentSecureVersion }) {
      await ready();
      const result = await db.prepare(`
        SELECT DISTINCT r.*
        FROM ota_releases r
        JOIN ota_release_targets t ON t.release_id = r.id
        JOIN ota_hardware h ON h.id = t.hardware_id
        WHERE r.product = 'DigitalRealm' AND r.channel = ? AND r.status = 'published'
          AND h.code = ? AND r.release_seq IS NOT NULL AND r.release_seq > ?
          AND r.secure_version >= ?
          AND r.signature_alg = 'RSA-PSS-SHA256' AND r.signature IS NOT NULL
        ORDER BY r.release_seq DESC, r.published_at DESC, r.created_at DESC
      `).bind(channel, hardwareCode, currentReleaseSeq, currentSecureVersion).all();
      const row = (result.results || [])[0];
      return withTargets(db, row || null);
    },

    async upsertDeviceV1(snapshot) {
      await ready();
      const at = snapshot.lastSeenAt || nowIso();
      await db.prepare(`
        INSERT INTO ota_devices (
          device_id, hardware_code, boot_version, game_version, channel, first_seen_at, last_seen_at,
          last_check_at, last_ip, last_user_agent, serial, game_fix, build_id, release_seq,
          service_version, secure_version, active_slot, asset_version, status, provision_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE',
          CASE WHEN ? = 'UNPROVISIONED' THEN 'UNPROVISIONED' ELSE 'PROVISIONED' END)
        ON CONFLICT(device_id) DO UPDATE SET
          hardware_code = excluded.hardware_code,
          boot_version = excluded.boot_version,
          game_version = excluded.game_version,
          channel = excluded.channel,
          last_seen_at = excluded.last_seen_at,
          last_check_at = excluded.last_check_at,
          last_ip = excluded.last_ip,
          last_user_agent = excluded.last_user_agent,
          serial = excluded.serial,
          game_fix = excluded.game_fix,
          build_id = excluded.build_id,
          release_seq = excluded.release_seq,
          service_version = excluded.service_version,
          secure_version = excluded.secure_version,
          active_slot = excluded.active_slot,
          asset_version = excluded.asset_version,
          provision_state = excluded.provision_state
      `).bind(
        snapshot.deviceId, snapshot.hardwareCode, snapshot.bootVersion || null, snapshot.gameVersion || null,
        snapshot.channel || 'stable', snapshot.firstSeenAt || at, at, snapshot.lastCheckAt || at,
        snapshot.ip || null, snapshot.userAgent || null, snapshot.serial || null,
        snapshot.gameFix || 0, snapshot.buildId || null, snapshot.releaseSeq || 0,
        snapshot.serviceVersion || null, snapshot.secureVersion || 0, snapshot.activeSlot || null,
        snapshot.assetVersion || null, snapshot.serial || 'UNPROVISIONED'
      ).run();
      return db.prepare('SELECT * FROM ota_devices WHERE device_id = ?').bind(snapshot.deviceId).first();
    },

    async appendEventV1(event) {
      await ready();
      const id = event.id || uid('ev1');
      const receivedAt = event.receivedAt || nowIso();
      await db.prepare(`
        INSERT INTO ota_events_v1 (
          id, device_id, serial, hardware_code, event_type, release_id, progress, result,
          error_code, fw_before, fw_after, device_timestamp, ip, user_agent, received_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id, event.deviceId, event.serial || null, event.hardwareCode || null, event.event,
        event.releaseId || null, event.progress ?? null, event.result || null, event.errorCode || null,
        event.fwBefore || null, event.fwAfter || null, event.deviceTimestamp || null,
        event.ip || null, event.userAgent || null, receivedAt
      ).run();
      return id;
    },

    async upsertDevice(snapshot) {
      await ready();
      const at = snapshot.lastSeenAt || nowIso();
      await db.prepare(`
        INSERT INTO ota_devices (
          device_id, hardware_code, boot_version, game_version, channel, first_seen_at, last_seen_at,
          last_check_at, last_ip, last_user_agent
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(device_id) DO UPDATE SET
          hardware_code = excluded.hardware_code,
          boot_version = excluded.boot_version,
          game_version = excluded.game_version,
          channel = excluded.channel,
          last_seen_at = excluded.last_seen_at,
          last_check_at = excluded.last_check_at,
          last_ip = excluded.last_ip,
          last_user_agent = excluded.last_user_agent
      `).bind(
        snapshot.deviceId, snapshot.hardwareCode, snapshot.bootVersion || null, snapshot.gameVersion || null,
        snapshot.channel || 'stable', snapshot.firstSeenAt || at, at, snapshot.lastCheckAt || at,
        snapshot.ip || null, snapshot.userAgent || null
      ).run();
      return db.prepare('SELECT * FROM ota_devices WHERE device_id = ?').bind(snapshot.deviceId).first();
    },

    async setDeviceOffer(deviceId, releaseIdOrNull) {
      await ready();
      const at = nowIso();
      const offeredAt = releaseIdOrNull ? at : null;
      await db.prepare('UPDATE ota_devices SET last_release_id = ?, last_release_offered_at = ?, last_seen_at = ? WHERE device_id = ?')
        .bind(releaseIdOrNull || null, offeredAt, at, deviceId).run();
    },

    async getDevice(deviceId) {
      await ready();
      return db.prepare('SELECT * FROM ota_devices WHERE device_id = ?').bind(deviceId).first();
    },

    async markDeviceDownload(deviceId, releaseId, at = nowIso()) {
      await ready();
      await db.prepare('UPDATE ota_devices SET last_download_at = ?, last_seen_at = ?, last_release_id = ? WHERE device_id = ?')
        .bind(at, at, releaseId, deviceId).run();
    },

    async appendEvent(event) {
      await ready();
      const id = event.id || uid('evt');
      const createdAt = event.createdAt || nowIso();
      await db.prepare(`
        INSERT INTO ota_events (
          id, device_id, event_type, hardware_code, current_fw, boot_version, channel, release_id,
          target_fw, http_status, bytes_served, range_start, range_end, ip, user_agent, detail_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id, event.deviceId, event.eventType, event.hardwareCode, event.currentFw || null,
        event.bootVersion || null, event.channel || null, event.releaseId || null, event.targetFw || null,
        event.httpStatus ?? null, event.bytesServed || 0, event.rangeStart ?? null, event.rangeEnd ?? null,
        event.ip || null, event.userAgent || null,
        event.detailJson == null ? null : (typeof event.detailJson === 'string' ? event.detailJson : JSON.stringify(event.detailJson)),
        createdAt
      ).run();
      return id;
    },

    async incrementDownloadCount(releaseId) {
      await ready();
      await db.prepare('UPDATE ota_releases SET download_count = download_count + 1, updated_at = ? WHERE id = ?')
        .bind(nowIso(), releaseId).run();
    },

    async listDevices(filters = {}) {
      await ready();
      const where = [];
      const bindings = [];
      if (filters.hardwareCode) { where.push('hardware_code = ?'); bindings.push(filters.hardwareCode); }
      if (filters.channel) { where.push('channel = ?'); bindings.push(filters.channel); }
      const limit = Math.max(1, Math.min(Number(filters.limit || 100), 500));
      const sql = `SELECT * FROM ota_devices ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY last_seen_at DESC LIMIT ${limit}`;
      const result = await db.prepare(sql).bind(...bindings).all();
      return result.results || [];
    },

    async listEvents(filters = {}) {
      await ready();
      const where = [];
      const bindings = [];
      if (filters.deviceId) { where.push('device_id = ?'); bindings.push(filters.deviceId); }
      if (filters.eventType) { where.push('event_type = ?'); bindings.push(filters.eventType); }
      if (filters.releaseId) { where.push('release_id = ?'); bindings.push(filters.releaseId); }
      const limit = Math.max(1, Math.min(Number(filters.limit || 200), 1000));
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const legacy = await db.prepare(
        `SELECT id, device_id, event_type, hardware_code, current_fw, target_fw, release_id,
          bytes_served, http_status, detail_json, created_at, 'legacy' AS protocol_source
         FROM ota_events ${clause} ORDER BY created_at DESC LIMIT ${limit}`
      ).bind(...bindings).all();
      const modern = await db.prepare(
        `SELECT id, device_id, event_type, hardware_code, fw_before AS current_fw, fw_after AS target_fw,
          release_id, 0 AS bytes_served, NULL AS http_status, NULL AS detail_json,
          received_at AS created_at, 'v1' AS protocol_source
         FROM ota_events_v1 ${clause} ORDER BY received_at DESC LIMIT ${limit}`
      ).bind(...bindings).all();
      return [...(legacy.results || []), ...(modern.results || [])]
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, limit);
    }
  };
}
