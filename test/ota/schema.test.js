import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureOtaSchema, OTA_SCHEMA_STATEMENTS } from '../../src/ota/schema.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test('device schema includes offer timestamp for fresh databases', () => {
  const deviceSchema = OTA_SCHEMA_STATEMENTS.find(sql => sql.includes('CREATE TABLE IF NOT EXISTS ota_devices'));
  assert.ok(deviceSchema);
  assert.match(deviceSchema, /last_release_offered_at\s+TEXT/);
});

test('runtime schema upgrade is single-flight for concurrent cold-start requests', async () => {
  const executed = [];
  const db = {
    prepare(sql) {
      return {
        async run() {
          await delay(1);
          executed.push(sql);
          return { success: true };
        },
        async all() {
          if (/PRAGMA\s+table_info\(ota_devices\)/i.test(sql)) {
            await delay(2);
            return { results: [{ name: 'device_id' }, { name: 'last_release_id' }] };
          }
          return { results: [] };
        }
      };
    }
  };

  await Promise.all([
    ensureOtaSchema({ DB: db }),
    ensureOtaSchema({ DB: db })
  ]);

  const alters = executed.filter(sql => /ALTER TABLE ota_devices ADD COLUMN last_release_offered_at TEXT/i.test(sql));
  assert.equal(alters.length, 1);
});
