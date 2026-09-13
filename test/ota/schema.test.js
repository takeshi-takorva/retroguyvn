import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureOtaSchema, OTA_SCHEMA_STATEMENTS } from '../../src/ota/schema.js';

test('device schema includes offer timestamp for fresh databases', () => {
  const deviceSchema = OTA_SCHEMA_STATEMENTS.find(sql => sql.includes('CREATE TABLE IF NOT EXISTS ota_devices'));
  assert.ok(deviceSchema);
  assert.match(deviceSchema, /last_release_offered_at\s+TEXT/);
});

test('runtime schema upgrades an existing ota_devices table missing offer timestamp', async () => {
  const executed = [];
  const db = {
    prepare(sql) {
      return {
        async run() {
          executed.push(sql);
          return { success: true };
        },
        async all() {
          if (/PRAGMA\s+table_info\(ota_devices\)/i.test(sql)) {
            return { results: [{ name: 'device_id' }, { name: 'last_release_id' }] };
          }
          return { results: [] };
        }
      };
    }
  };

  await ensureOtaSchema({ DB: db });
  assert.ok(executed.some(sql => /ALTER TABLE ota_devices ADD COLUMN last_release_offered_at TEXT/i.test(sql)));
});
