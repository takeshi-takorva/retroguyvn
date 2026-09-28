-- Digital Realm OTA Protocol v1 additive migration.
-- Existing legacy OTA tables and endpoints remain valid during M3.1 transition.

ALTER TABLE ota_releases ADD COLUMN release_seq INTEGER;
ALTER TABLE ota_releases ADD COLUMN game_fix INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ota_releases ADD COLUMN asset_version TEXT;
ALTER TABLE ota_releases ADD COLUMN signature_alg TEXT;
ALTER TABLE ota_releases ADD COLUMN signature TEXT;
ALTER TABLE ota_releases ADD COLUMN mandatory INTEGER NOT NULL DEFAULT 0;

ALTER TABLE ota_devices ADD COLUMN serial TEXT;
ALTER TABLE ota_devices ADD COLUMN game_fix INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ota_devices ADD COLUMN build_id TEXT;
ALTER TABLE ota_devices ADD COLUMN release_seq INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ota_devices ADD COLUMN service_version TEXT;
ALTER TABLE ota_devices ADD COLUMN secure_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ota_devices ADD COLUMN active_slot TEXT;
ALTER TABLE ota_devices ADD COLUMN asset_version TEXT;
ALTER TABLE ota_devices ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE ota_devices ADD COLUMN provision_state TEXT NOT NULL DEFAULT 'UNPROVISIONED';

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_ota_release_seq_v1
ON ota_releases(product, release_seq) WHERE release_seq IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ota_release_seq_lookup_v1
ON ota_releases(product, channel, status, release_seq DESC);
CREATE INDEX IF NOT EXISTS idx_ota_events_v1_device_time
ON ota_events_v1(device_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_ota_events_v1_type_time
ON ota_events_v1(event_type, received_at DESC);
