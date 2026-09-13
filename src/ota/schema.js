const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS ota_hardware (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, label TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS ota_releases (id TEXT PRIMARY KEY, product TEXT NOT NULL, version TEXT NOT NULL, version_sort INTEGER NOT NULL, build_id TEXT NOT NULL, channel TEXT NOT NULL CHECK(channel IN ('stable','beta','dev')), status TEXT NOT NULL CHECK(status IN ('draft','published','disabled')), secure_version INTEGER NOT NULL DEFAULT 0, min_boot_version TEXT, release_notes TEXT NOT NULL DEFAULT '', r2_key TEXT NOT NULL UNIQUE, file_name TEXT NOT NULL, content_type TEXT NOT NULL DEFAULT 'application/octet-stream', size_bytes INTEGER NOT NULL, sha256 TEXT NOT NULL, esp_image_valid INTEGER NOT NULL DEFAULT 0, download_count INTEGER NOT NULL DEFAULT 0, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT, UNIQUE(product, version, build_id))`,
  `CREATE TABLE IF NOT EXISTS ota_release_targets (release_id TEXT NOT NULL, hardware_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (release_id, hardware_id), FOREIGN KEY (release_id) REFERENCES ota_releases(id) ON DELETE CASCADE, FOREIGN KEY (hardware_id) REFERENCES ota_hardware(id))`,
  `CREATE TABLE IF NOT EXISTS ota_devices (device_id TEXT PRIMARY KEY, hardware_code TEXT NOT NULL, boot_version TEXT, game_version TEXT, channel TEXT NOT NULL DEFAULT 'stable', first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, last_check_at TEXT, last_download_at TEXT, last_release_id TEXT, last_ip TEXT, last_user_agent TEXT)`,
  `CREATE TABLE IF NOT EXISTS ota_events (id TEXT PRIMARY KEY, device_id TEXT NOT NULL, event_type TEXT NOT NULL, hardware_code TEXT NOT NULL, current_fw TEXT, boot_version TEXT, channel TEXT, release_id TEXT, target_fw TEXT, http_status INTEGER, bytes_served INTEGER NOT NULL DEFAULT 0, range_start INTEGER, range_end INTEGER, ip TEXT, user_agent TEXT, detail_json TEXT, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_ota_release_lookup ON ota_releases(product, channel, status, version_sort DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_ota_target_hardware ON ota_release_targets(hardware_id, release_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ota_events_device_time ON ota_events(device_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_ota_events_type_time ON ota_events(event_type, created_at DESC)`,
  `INSERT OR IGNORE INTO ota_hardware (id, code, label, enabled, created_at, updated_at) VALUES ('hw_04','HW0.4','Hardware 0.4',1,datetime('now'),datetime('now'))`,
  `INSERT OR IGNORE INTO ota_hardware (id, code, label, enabled, created_at, updated_at) VALUES ('hw_05','HW0.5','Hardware 0.5',1,datetime('now'),datetime('now'))`,
  `INSERT OR IGNORE INTO ota_hardware (id, code, label, enabled, created_at, updated_at) VALUES ('hw_051','HW0.5.1','Hardware 0.5.1',1,datetime('now'),datetime('now'))`
];

let ready = false;

export async function ensureOtaSchema(env) {
  if (!env?.DB?.prepare) return false;
  if (ready) return true;
  for (const statement of SCHEMA) await env.DB.prepare(statement).run();
  ready = true;
  return true;
}

export const OTA_SCHEMA_STATEMENTS = SCHEMA;
