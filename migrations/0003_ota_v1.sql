-- Digital Realm OTA Protocol v1 companion migration.
-- Column upgrades are intentionally handled idempotently at runtime by src/ota/schema.js
-- (PRAGMA table_info -> ALTER TABLE only when missing). This file therefore contains
-- only CREATE IF NOT EXISTS objects that are safe whether runtime bootstrap ran first or not.

CREATE TABLE IF NOT EXISTS ota_events_v1 (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  serial TEXT,
  hardware_code TEXT,
  event_type TEXT NOT NULL,
  release_id TEXT,
  progress INTEGER,
  result TEXT,
  error_code TEXT,
  fw_before TEXT,
  fw_after TEXT,
  device_timestamp TEXT,
  ip TEXT,
  user_agent TEXT,
  received_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ota_events_v1_device_time
ON ota_events_v1(device_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_ota_events_v1_type_time
ON ota_events_v1(event_type, received_at DESC);

-- release_seq indexes are created by src/ota/schema.js only after it has verified
-- that ota_releases.release_seq exists on the live D1 database.
