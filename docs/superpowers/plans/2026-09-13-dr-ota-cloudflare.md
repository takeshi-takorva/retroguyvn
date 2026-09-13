# DR OTA Cloudflare Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a production Digital Realm Game Firmware OTA subsystem to `retroguyvn.com` using the existing Cloudflare Worker and D1 database plus a dedicated R2 firmware bucket, with strict multi-hardware targeting, protected admin management, stable device APIs, ranged downloads, and auditable device history.

**Architecture:** Keep the current Astro + Cloudflare Workers application and existing admin authentication. Add focused OTA modules under `src/ota/`; store firmware metadata, hardware compatibility, device state and event history in the existing `DB` D1 binding; store `.bin` objects in a new `FIRMWARE` R2 binding targeting `retroguyvn-firmware`; integrate public and admin OTA routes in `src/worker-entry.js`; add `/admin/ota` using the current `AdminShell`.

**Tech Stack:** Astro 7, Cloudflare Workers, Cloudflare D1, Cloudflare R2, JavaScript ES modules, Node.js >=22.12.0 built-in test runner, GitHub Actions, Wrangler 4.

**Spec:** `docs/superpowers/specs/2026-09-13-dr-ota-cloudflare-design.md`

## Global Constraints

- Initial OTA product is exactly `DR_GAME`; schema must remain extensible for future Boot FW or Service OS.
- Hardware compatibility is exact-match only; never infer compatibility between `HW0.4`, `HW0.5`, `HW0.5.1`, or future revisions.
- Initial hardware registry contains `HW0.4`, `HW0.5`, and `HW0.5.1`.
- Device identity is the opaque stable `X-DR-Device-ID`; never identify a device by IP address or COM port.
- Public check endpoint is exactly `GET /api/dr/ota`.
- Public firmware endpoint is exactly `GET /api/dr/ota/download`.
- Required check headers are `X-DR-Device-ID`, `X-DR-HW-Version`, and `X-DR-FW-Version`; `X-DR-Boot-Version` and `X-DR-Channel` are optional, with `stable` as the default channel.
- Required download headers are `X-DR-Release-ID`, `X-DR-Device-ID`, and `X-DR-HW-Version`.
- Download authorization must require that the requested release is still the latest release offered to that device (`ota_devices.last_release_id`), in addition to published status and exact hardware compatibility.
- Firmware upload accepts only non-empty `.bin` files whose first byte is ESP image magic `0xE9`; SHA-256 and size are calculated server-side.
- Release versions use strict `MAJOR.MINOR.PATCH`, each component `0..9999`; `version_sort = MAJOR * 100000000 + MINOR * 10000 + PATCH`.
- Channels are exactly `stable`, `beta`, `dev`; release status values are exactly `draft`, `published`, `disabled`.
- `retroguyvn-media` / `MEDIA` remains unchanged; firmware uses `retroguyvn-firmware` / `FIRMWARE`.
- Raw R2 URLs are never exposed to devices or the public UI.
- Support one HTTP byte range only; valid ranges return `206`, invalid ranges return `416`, and the Worker must read the requested range directly from R2.
- Admin OTA APIs reuse the existing Cloudflare Access / Bearer-token admin authentication; do not introduce a second login system.
- OTA failures must not take down public website rendering or existing CMS/admin functionality.
- `ota_events` is append-only from the application/API perspective; no per-event delete endpoint or UI action.
- Existing GitHub Actions build validation remains and must be extended to run tests before build.

---

## File Structure

### New files

- `migrations/0002_ota.sql` — canonical D1 OTA tables, indexes, constraints, and initial hardware seeds.
- `src/ota/core.js` — pure validation/parsing helpers: semantic versions, channels, device headers, firmware metadata, HTTP ranges, response DTO shaping.
- `src/ota/schema.js` — idempotent runtime schema/bootstrap guard aligned with `0002_ota.sql`, following the existing CMS runtime-bootstrap pattern.
- `src/ota/repository.js` — D1 persistence boundary for hardware, releases, targets, devices, offer pins, events, counts, filters.
- `src/ota/service.js` — OTA business rules and R2 operations: check selection, release CRUD, publish/disable/delete, upload compensation, download authorization.
- `src/ota/http.js` — public/admin request handlers and streaming/range response construction.
- `src/pages/admin/ota.astro` — Firmware Releases, Hardware, Devices and Event History admin workspace.
- `test/ota/core.test.js` — pure OTA validation/version/range tests.
- `test/ota/service.test.js` — business-rule tests with fake repository/R2 adapters.
- `test/ota/http.test.js` — request/response contract tests using fake service functions and streamed byte bodies.
- `docs/DR_OTA_CLOUDFLARE.md` — operator/deployment guide, API contract and smoke-test commands.

### Modified files

- `src/worker-entry.js` — route `/api/dr/ota`, `/api/dr/ota/download`, `/api/admin/ota/*`; reuse `adminSession()` for admin requests; isolate OTA errors.
- `src/components/admin/AdminSidebar.astro` — add active `OTA Firmware` item under Platform.
- `src/styles/admin.css` — reusable OTA table/form/status/progress styles only where existing classes are insufficient.
- `wrangler.jsonc` — add `FIRMWARE` R2 binding for `retroguyvn-firmware`.
- `package.json` — add `test` script using Node built-in test runner.
- `.github/workflows/ci.yml` — run tests before Astro/Worker build.

---

### Task 1: Test Harness, OTA Core Rules, and D1 Schema

**Files:**
- Create: `migrations/0002_ota.sql`
- Create: `src/ota/core.js`
- Create: `src/ota/schema.js`
- Create: `test/ota/core.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces `parseVersion(value) -> { version, major, minor, patch, sort }` or throws status `400`.
- Produces `compareVersionStrings(a, b) -> -1 | 0 | 1`.
- Produces `normalizeChannel(value) -> 'stable' | 'beta' | 'dev'` or throws status `400`.
- Produces `readDeviceCheckHeaders(request) -> { deviceId, hardwareCode, firmwareVersion, firmwareSort, bootVersion, channel }`.
- Produces `readDownloadHeaders(request) -> { releaseId, deviceId, hardwareCode }`.
- Produces `parseSingleRange(header, totalSize) -> null | { start, end, length }` or throws status `416`.
- Produces `validateFirmwareFile(file) -> Promise<{ size, sha256, fileName, contentType }>` or throws `400/415`.
- Produces `ensureOtaSchema(env) -> Promise<boolean>`.

- [ ] **Step 1: Add a Node test script and write failing core tests**

Set `package.json` script:

```json
"test": "node --test"
```

Write `test/ota/core.test.js` with explicit cases:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseVersion,
  normalizeChannel,
  parseSingleRange,
  readDeviceCheckHeaders,
  validateFirmwareFile
} from '../../src/ota/core.js';

test('parseVersion sorts 1.10.0 above 1.9.0', () => {
  assert.ok(parseVersion('1.10.0').sort > parseVersion('1.9.0').sort);
});

test('parseVersion rejects prefixes and component overflow', () => {
  assert.throws(() => parseVersion('v1.2.3'));
  assert.throws(() => parseVersion('1.10000.0'));
});

test('normalizeChannel defaults to stable', () => {
  assert.equal(normalizeChannel(''), 'stable');
  assert.equal(normalizeChannel(null), 'stable');
});

test('range parser supports bounded and open-ended ranges', () => {
  assert.deepEqual(parseSingleRange('bytes=100-199', 1000), { start: 100, end: 199, length: 100 });
  assert.deepEqual(parseSingleRange('bytes=900-', 1000), { start: 900, end: 999, length: 100 });
});

test('range parser rejects multiple and out-of-bounds ranges', () => {
  assert.throws(() => parseSingleRange('bytes=0-9,20-29', 1000));
  assert.throws(() => parseSingleRange('bytes=1000-', 1000));
});

test('check headers require device, hardware and current firmware', () => {
  const req = new Request('https://example.test/api/dr/ota', { headers: {
    'X-DR-Device-ID': 'ABC123',
    'X-DR-HW-Version': 'HW0.5.1',
    'X-DR-FW-Version': '1.2.3'
  }});
  const value = readDeviceCheckHeaders(req);
  assert.equal(value.channel, 'stable');
  assert.equal(value.hardwareCode, 'HW0.5.1');
  assert.equal(value.firmwareSort, parseVersion('1.2.3').sort);
});

test('firmware validation requires .bin and ESP 0xE9 magic', async () => {
  const good = new File([Uint8Array.from([0xE9, 1, 2, 3])], 'game.bin', { type: 'application/octet-stream' });
  const meta = await validateFirmwareFile(good);
  assert.equal(meta.size, 4);
  assert.match(meta.sha256, /^[0-9a-f]{64}$/);

  await assert.rejects(() => validateFirmwareFile(new File([Uint8Array.from([0, 1])], 'game.bin')));
  await assert.rejects(() => validateFirmwareFile(new File([Uint8Array.from([0xE9])], 'game.txt')));
});
```

- [ ] **Step 2: Run tests and verify they fail because `src/ota/core.js` does not exist**

Run:

```bash
npm test
```

Expected: Node test runner fails resolving `../../src/ota/core.js`.

- [ ] **Step 3: Implement the core helpers minimally**

Implement strict semver parsing with:

```js
const VERSION_RE = /^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/;
export function parseVersion(value) {
  const text = String(value ?? '').trim();
  const match = text.match(VERSION_RE);
  if (!match) throw httpError(400, 'invalid_version');
  const major = Number(match[1]), minor = Number(match[2]), patch = Number(match[3]);
  return { version: text, major, minor, patch, sort: major * 100000000 + minor * 10000 + patch };
}
```

Implement `parseSingleRange()` for only `bytes=start-end` and `bytes=start-`, returning an error object with status `416` for malformed/multiple/out-of-bounds requests. Implement SHA-256 with `crypto.subtle.digest` and verify `file.name.toLowerCase().endsWith('.bin')`, `file.size > 0`, and first byte `0xE9`.

- [ ] **Step 4: Add canonical OTA migration**

`migrations/0002_ota.sql` must create:

```sql
CREATE TABLE IF NOT EXISTS ota_hardware (...);
CREATE TABLE IF NOT EXISTS ota_releases (...);
CREATE TABLE IF NOT EXISTS ota_release_targets (...);
CREATE TABLE IF NOT EXISTS ota_devices (...);
CREATE TABLE IF NOT EXISTS ota_events (...);
```

Use the exact columns and status/channel constraints from the approved spec. Add indexes at minimum for:

```sql
CREATE INDEX IF NOT EXISTS idx_ota_release_lookup
ON ota_releases(product, channel, status, version_sort DESC);
CREATE INDEX IF NOT EXISTS idx_ota_target_hardware
ON ota_release_targets(hardware_id, release_id);
CREATE INDEX IF NOT EXISTS idx_ota_events_device_time
ON ota_events(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ota_events_type_time
ON ota_events(event_type, created_at DESC);
```

Seed exact codes with `INSERT OR IGNORE`:

```sql
HW0.4
HW0.5
HW0.5.1
```

- [ ] **Step 5: Add runtime idempotent schema guard**

In `src/ota/schema.js`, export `OTA_SCHEMA_SQL` aligned with the migration and:

```js
let otaSchemaReady = false;
export async function ensureOtaSchema(env) {
  if (!env?.DB?.prepare || !env?.DB?.exec) return false;
  if (!otaSchemaReady) {
    await env.DB.exec(OTA_SCHEMA_SQL);
    otaSchemaReady = true;
  }
  return true;
}
```

The runtime SQL must use only idempotent `CREATE ... IF NOT EXISTS` and `INSERT OR IGNORE`; it must not drop or rewrite existing data.

- [ ] **Step 6: Run unit tests and production dry build**

Run:

```bash
npm test
npm run build
```

Expected: all core tests pass; Astro/Worker dry-run build succeeds.

- [ ] **Step 7: Commit**

```bash
git add package.json migrations/0002_ota.sql src/ota/core.js src/ota/schema.js test/ota/core.test.js
git commit -m "feat: add OTA core rules and schema"
```

---

### Task 2: D1 Repository and Hardware/Release Persistence

**Files:**
- Create: `src/ota/repository.js`
- Create: `test/ota/service.test.js`

**Interfaces:**
- Consumes `ensureOtaSchema(env)` and `parseVersion()`.
- Produces `createOtaRepository(env)` with methods:
  - `listHardware({ includeDisabled = true })`
  - `createHardware({ code, label })`
  - `updateHardware(id, patch)`
  - `findHardwareByCode(code)`
  - `createRelease(release, hardwareIds)`
  - `getRelease(id)`
  - `listReleases(filters)`
  - `updateRelease(id, patch, hardwareIds)`
  - `setReleaseStatus(id, status, actor)`
  - `deleteRelease(id)`
  - `findNewestCompatibleRelease({ product, channel, hardwareCode, currentVersionSort, bootVersionSort })`
  - `upsertDevice(snapshot)`
  - `setDeviceOffer(deviceId, releaseIdOrNull)`
  - `getDevice(deviceId)`
  - `markDeviceDownload(deviceId, releaseId, at)`
  - `appendEvent(event)`
  - `incrementDownloadCount(releaseId)`
  - `listDevices(filters)`
  - `listEvents(filters)`.

- [ ] **Step 1: Extend service tests with a fake repository contract**

Before writing the real repository, define a reusable fake repository inside `test/ota/service.test.js` that stores hardware/releases/devices/events in `Map`/arrays and implements the exact methods above. Add tests that assert the later service can depend only on this interface, not raw SQL.

Example assertion:

```js
test('fake repository offer pin is device-specific', async () => {
  const repo = makeFakeRepo();
  await repo.upsertDevice({ deviceId: 'A', hardwareCode: 'HW0.5', channel: 'stable' });
  await repo.upsertDevice({ deviceId: 'B', hardwareCode: 'HW0.5', channel: 'stable' });
  await repo.setDeviceOffer('A', 'rel_1');
  assert.equal((await repo.getDevice('A')).lastReleaseId, 'rel_1');
  assert.equal((await repo.getDevice('B')).lastReleaseId, null);
});
```

- [ ] **Step 2: Implement `createOtaRepository(env)` using D1 prepared statements**

Keep SQL isolated in `repository.js`; do not place SQL strings in HTTP handlers. Normalize snake_case D1 rows into camelCase returned objects, including `targets: ['HW0.5', ...]` for release reads.

`findNewestCompatibleRelease()` must join `ota_release_targets` + `ota_hardware` and enforce:

```text
product = DR_GAME
status = published
channel exact match
hardware code exact match
version_sort > currentVersionSort
```

For `min_boot_version`, query candidate releases in descending order and reject candidates whose parsed minimum exceeds the device boot version; if boot version is missing and candidate has a minimum, skip it.

- [ ] **Step 3: Ensure offer pin updates are explicit**

`setDeviceOffer(deviceId, releaseIdOrNull)` must update only the targeted device row. Do not infer an offer from `last_download_at` or any event row.

- [ ] **Step 4: Validate repository shape via local D1 smoke commands**

Run the migration locally:

```bash
npx wrangler d1 migrations apply retroguyvn-db --local
```

Then inspect:

```bash
npx wrangler d1 execute retroguyvn-db --local --command "SELECT code, enabled FROM ota_hardware ORDER BY code;"
```

Expected rows include exactly the seeded `HW0.4`, `HW0.5`, `HW0.5.1` with `enabled=1`.

- [ ] **Step 5: Run tests and build**

```bash
npm test
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ota/repository.js test/ota/service.test.js
git commit -m "feat: add OTA D1 repository"
```

---

### Task 3: OTA Service — Release Upload, Lifecycle, and Device Check

**Files:**
- Create: `src/ota/service.js`
- Modify: `test/ota/service.test.js`

**Interfaces:**
- Consumes repository interface from Task 2 and `env.FIRMWARE` R2 binding.
- Produces `createOtaService({ repo, firmwareBucket, now = () => new Date(), uuid = crypto.randomUUID })` with:
  - `checkForUpdate(input, requestMeta)`
  - `createRelease(formData, actor)`
  - `updateRelease(id, input, actor)`
  - `publishRelease(id, actor)`
  - `disableRelease(id, actor)`
  - `deleteRelease(id, actor)`
  - `authorizeDownload(input)`
  - `getFirmwareObject(release, range)`
  - hardware/release/device/event listing wrappers used by admin HTTP handlers.

- [ ] **Step 1: Write failing check-selection tests**

Add tests for:

```text
HW0.5.1 never receives a release targeting only HW0.5
stable never receives beta/dev
current 1.9.0 can receive 1.10.0
missing boot version cannot receive release with min_boot_version
unknown hardware returns update_available=false reason=unknown_hardware
disabled hardware returns reason=hardware_disabled
an offered update writes last_release_id for that device
NO_UPDATE clears stale last_release_id
CHECK + UPDATE_AVAILABLE/NO_UPDATE events are appended
```

- [ ] **Step 2: Implement `checkForUpdate()`**

Sequence must be:

```text
ensure hardware state
upsert device snapshot
append CHECK
select newest compatible release
if none: clear device offer, append NO_UPDATE, return no-update DTO
if found: set device offer to release.id, append UPDATE_AVAILABLE, return update DTO
```

Use constant download URL path `/api/dr/ota/download`; construct absolute URL from the incoming request origin in the HTTP layer, not from R2.

- [ ] **Step 3: Write failing release-upload/lifecycle tests**

Cover:

```text
upload computes hash/size from server bytes
upload writes R2 before D1 and compensates by deleting R2 if D1 create fails
release is created draft, never auto-published
publish fails with zero targets
published release cannot be edited in place
published release cannot be deleted
binary cannot be replaced under same release ID
disable changes published -> disabled
delete removes R2 first, then D1, while events remain untouched
```

Use a fake R2 object with `put/get/delete/head` call recording.

- [ ] **Step 4: Implement release upload and lifecycle**

Release ID format:

```js
const releaseId = `dr-game-${version}-${Date.now().toString(36)}-${uuid().slice(0, 8)}`;
```

R2 key format:

```js
const r2Key = `ota/dr-game/${releaseId}/${sha256}.bin`;
```

R2 put metadata:

```js
await firmwareBucket.put(r2Key, file.stream(), {
  httpMetadata: { contentType: 'application/octet-stream' },
  customMetadata: {
    'release-id': releaseId,
    product: 'DR_GAME',
    version,
    'build-id': buildId,
    sha256
  }
});
```

If D1 persistence throws, call `firmwareBucket.delete(r2Key)` before rethrowing.

- [ ] **Step 5: Write and implement download authorization tests**

`authorizeDownload({ releaseId, deviceId, hardwareCode })` must reject unless all are true:

```text
release exists
release.status === published
release explicitly targets hardwareCode
device exists
device.hardwareCode === hardwareCode
device.lastReleaseId === releaseId
R2 object head/get exists
R2 object size === release.sizeBytes
```

Reject authorization with `403` for offer/hardware mismatch, `404` for nonexistent release/object, `409` for metadata size mismatch.

- [ ] **Step 6: Run tests and build**

```bash
npm test
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ota/service.js test/ota/service.test.js
git commit -m "feat: add OTA release and check service"
```

---

### Task 4: Public Device HTTP API and Ranged Firmware Streaming

**Files:**
- Create: `src/ota/http.js`
- Create: `test/ota/http.test.js`
- Modify: `src/worker-entry.js`

**Interfaces:**
- Consumes core header/range parsers, repository, service.
- Produces `handleOtaPublic(request, env, ctx) -> Promise<Response | null>`.
- Produces `handleOtaAdmin(request, env, ctx, session) -> Promise<Response | null>` for later Task 5.

- [ ] **Step 1: Write failing public check contract tests**

In `test/ota/http.test.js`, use a fake service injected through a small exported handler factory:

```js
const handler = createOtaHttp({ service: fakeService });
```

Cover:

```text
missing required check header -> 400 JSON
invalid channel/version -> 400 JSON
successful no-update response -> 200 JSON no-store
successful update response -> absolute https://host/api/dr/ota/download URL
```

- [ ] **Step 2: Implement check HTTP handler**

For `GET /api/dr/ota`, parse headers via `readDeviceCheckHeaders`, pass `ip` from `CF-Connecting-IP` and `userAgent` from `User-Agent`, call service, and return:

```http
Content-Type: application/json; charset=utf-8
Cache-Control: no-store
```

Non-GET requests to the endpoint return `405` with `Allow: GET`.

- [ ] **Step 3: Write failing range response tests**

Use a fake R2 body containing bytes `0..255` repeated. Assert:

```text
no Range -> 200 + full Content-Length + Accept-Ranges
Range bytes=100-199 -> 206 + exact 100 bytes + Content-Range
Range bytes=900- on 1000 bytes -> 206 bytes 900..999
multi-range -> 416
start >= size -> 416 + Content-Range: bytes */<size>
ETag is strong quoted SHA-256
Cache-Control is private, no-store
```

- [ ] **Step 4: Implement direct R2 range reads**

For a valid range call R2 with a range option equivalent to:

```js
firmwareBucket.get(release.r2Key, {
  range: { offset: range.start, length: range.length }
});
```

Do not call `arrayBuffer()` on the complete firmware object. Return the R2 stream body directly.

- [ ] **Step 5: Implement download logging semantics**

Before returning a full response append `DOWNLOAD_START`. For a range append `DOWNLOAD_RANGE` containing start/end/bytes. For a successful full-body response schedule with `ctx.waitUntil`:

```text
DOWNLOAD_COMPLETE
incrementDownloadCount(release.id)
markDeviceDownload(deviceId, release.id)
```

For request-time failures after identifying a device/release, append `DOWNLOAD_FAIL` with HTTP status and a machine-readable detail.

- [ ] **Step 6: Integrate public routes into `src/worker-entry.js` with isolation**

Before delegating to `baseWorker.fetch`, handle only:

```js
if (url.pathname === '/api/dr/ota' || url.pathname === '/api/dr/ota/download') {
  try { return await handleOtaPublic(request, runtimeEnv, ctx); }
  catch (error) { return otaApiError(error); }
}
```

Do not wrap unrelated website/CMS routes in OTA schema initialization. An OTA failure must return an OTA API error and must not alter public page handling.

- [ ] **Step 7: Run tests and build**

```bash
npm test
npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/ota/http.js test/ota/http.test.js src/worker-entry.js
git commit -m "feat: add DR device OTA API"
```

---

### Task 5: Protected Admin OTA API

**Files:**
- Modify: `src/ota/http.js`
- Modify: `src/worker-entry.js`
- Modify: `test/ota/http.test.js`

**Interfaces:**
- Reuses existing `adminSession(request, env, ctx)` from `src/worker-entry.js`.
- Routes all `/api/admin/ota/*` through `handleOtaAdmin(...)` only after a valid existing admin session.

- [ ] **Step 1: Write failing authorization and admin route tests**

Cover:

```text
worker does not call OTA admin handler when adminSession is null
GET hardware returns registry
POST hardware validates exact code shape but does not hard-code only three revisions
PATCH hardware can disable without deleting history
POST releases requires multipart file + at least one hardware[]
PUT published release is rejected
publish/disable/delete use service lifecycle methods
GET devices and events accept bounded filters/pagination
```

- [ ] **Step 2: Implement admin route dispatch**

Support exact routes:

```text
GET    /api/admin/ota/hardware
POST   /api/admin/ota/hardware
PATCH  /api/admin/ota/hardware/:id
GET    /api/admin/ota/releases
POST   /api/admin/ota/releases
GET    /api/admin/ota/releases/:id
PUT    /api/admin/ota/releases/:id
POST   /api/admin/ota/releases/:id/publish
POST   /api/admin/ota/releases/:id/disable
DELETE /api/admin/ota/releases/:id
GET    /api/admin/ota/devices
GET    /api/admin/ota/events
```

Use JSON for mutations except release creation, which is `multipart/form-data`.

- [ ] **Step 3: Add bounded list filters**

For devices/events accept:

```text
limit: default 50, min 1, max 200
offset: default 0
hardware
channel
device_id
event_type (events only)
release_id (events only)
```

All filters must bind through D1 prepared statements; do not concatenate untrusted values into SQL.

- [ ] **Step 4: Integrate with existing admin auth in `src/worker-entry.js`**

Add `/api/admin/ota` detection before the general base worker delegation:

```js
if (url.pathname === '/api/admin/ota' || url.pathname.startsWith('/api/admin/ota/')) {
  const session = await adminSession(request, runtimeEnv, ctx);
  if (!session) return json({ error: 'Unauthorized' }, { status: 401 });
  return await handleOtaAdmin(request, runtimeEnv, ctx, session);
}
```

Use `actorFromSession(session)` for `created_by` / lifecycle audit fields.

- [ ] **Step 5: Run tests and build**

```bash
npm test
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ota/http.js src/worker-entry.js test/ota/http.test.js
git commit -m "feat: add protected OTA admin API"
```

---

### Task 6: `/admin/ota` Firmware Manager UI

**Files:**
- Create: `src/pages/admin/ota.astro`
- Modify: `src/components/admin/AdminSidebar.astro`
- Modify: `src/styles/admin.css`

**Interfaces:**
- Uses existing `AdminShell.astro`.
- Uses existing session token convention `sessionStorage.getItem('rg_admin_token')` only as fallback when Cloudflare Access is not active.
- Calls `/api/admin/session` and `/api/admin/ota/*`.

- [ ] **Step 1: Add OTA navigation item under Platform**

Update `AdminSidebar.astro` Platform items so the active route contains:

```js
{ href: '/admin/ota', label: 'OTA Firmware', icon: 'OT' }
```

Keep `System` available.

- [ ] **Step 2: Build the admin page shell with four explicit views**

`src/pages/admin/ota.astro` must render inside:

```astro
<AdminShell
  title="OTA Firmware"
  subtitle="Digital Realm firmware releases, hardware targets and device history"
  currentPath="/admin/ota"
>
```

Provide four visible sections/tabs:

```text
Releases
Hardware
Devices
History
```

- [ ] **Step 3: Implement release upload form**

Fields:

```text
Product: DR_GAME (read-only)
Version
Build ID
Channel: stable/beta/dev
Secure Version
Minimum Boot Version (optional)
Release Notes
Hardware target checkboxes loaded from API
Firmware .bin file
```

The UI must not expose editable SHA-256 or size fields; show them after server upload from returned metadata.

Disable submit until at least one enabled hardware target and one `.bin` file are selected.

- [ ] **Step 4: Implement release table actions**

Columns:

```text
Version
Build ID
Channel
Hardware
Status
Size
SHA-256 short prefix
Downloads
Published
Actions
```

Actions obey state:

```text
draft: Edit, Publish, Delete
disabled: Edit, Publish, Delete
published: Disable only
```

Require browser confirmation before Disable/Delete; show API error body in a non-blocking toast/status panel.

- [ ] **Step 5: Implement Hardware view**

Show code, label, enabled state, creation/update timestamp. Support creating a future revision such as `HW0.6` and enabling/disabling existing rows. Never delete hardware rows from UI.

- [ ] **Step 6: Implement Devices and History tables**

Devices columns:

```text
Device ID
Hardware
Game FW
Boot FW
Channel
Last Seen
Last Check
Last Download
Last Offered Release
```

History columns:

```text
Time
Device ID
Event
Hardware
Current FW
Target FW
Release ID
HTTP
Bytes
Range
IP
```

Add filters for hardware/device/event and a Refresh button. No delete action.

- [ ] **Step 7: Add only necessary shared CSS**

Extend `src/styles/admin.css` with reusable classes for compact data tables, responsive overflow, OTA form grid, status chips, hash monospace and empty/error states. Do not copy the legacy M1.1 page's full embedded stylesheet.

- [ ] **Step 8: Run build and manual static checks**

```bash
npm run build
```

Expected: `/admin/ota` builds without Astro errors; sidebar route compiles.

- [ ] **Step 9: Commit**

```bash
git add src/pages/admin/ota.astro src/components/admin/AdminSidebar.astro src/styles/admin.css
git commit -m "feat: add OTA firmware admin workspace"
```

---

### Task 7: Cloudflare R2 Binding, CI, and Deployment Documentation

**Files:**
- Modify: `wrangler.jsonc`
- Modify: `.github/workflows/ci.yml`
- Create: `docs/DR_OTA_CLOUDFLARE.md`

**Interfaces:**
- Adds Worker binding `env.FIRMWARE` -> bucket `retroguyvn-firmware`.
- CI requires tests and build to pass before merge.

- [ ] **Step 1: Add the dedicated R2 binding**

Add alongside existing `MEDIA`:

```json
{
  "binding": "FIRMWARE",
  "bucket_name": "retroguyvn-firmware"
}
```

Do not rename or reuse `MEDIA`.

- [ ] **Step 2: Extend GitHub Actions validation**

Keep Node `22.12.0`, then run:

```yaml
- name: Run tests
  run: npm test
- name: Build Astro site and Worker dry run
  run: npm run build
```

Tests must run before build.

- [ ] **Step 3: Write deployment/operator documentation**

`docs/DR_OTA_CLOUDFLARE.md` must include exact operations:

```bash
npx wrangler r2 bucket create retroguyvn-firmware
npx wrangler d1 migrations apply retroguyvn-db --remote
npm test
npm run build
npm run deploy
```

Also document that if the bucket already exists, the create command is skipped rather than recreating it.

Document public API headers and sample `curl` check:

```bash
curl -i https://retroguyvn.com/api/dr/ota \
  -H 'X-DR-Device-ID: TEST-DEVICE-001' \
  -H 'X-DR-HW-Version: HW0.5.1' \
  -H 'X-DR-FW-Version: 1.0.0' \
  -H 'X-DR-Boot-Version: 1.1.0' \
  -H 'X-DR-Channel: stable'
```

Document range smoke test after a release is offered:

```bash
curl -i https://retroguyvn.com/api/dr/ota/download \
  -H 'X-DR-Release-ID: <release-id-from-check>' \
  -H 'X-DR-Device-ID: TEST-DEVICE-001' \
  -H 'X-DR-HW-Version: HW0.5.1' \
  -H 'Range: bytes=0-1023' \
  -o /tmp/dr-fw-range.bin
```

Explain that `<release-id-from-check>` is copied from the immediately preceding check response for the same device and hardware; it is not a free-form release ID.

- [ ] **Step 4: Run complete pre-PR verification**

```bash
npm install
npm test
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add wrangler.jsonc .github/workflows/ci.yml docs/DR_OTA_CLOUDFLARE.md
git commit -m "chore: configure Cloudflare OTA deployment"
```

---

### Task 8: Remote Cloudflare Provisioning and Production Smoke Test

**Files:**
- No source file required unless a verified deployment issue requires a focused fix.
- Verify current branch source before any remote mutation.

**Interfaces:**
- Cloudflare resources: existing `retroguyvn-db`, existing site Worker, new `retroguyvn-firmware` R2 bucket.
- Production host: `https://retroguyvn.com`.

- [ ] **Step 1: Verify authenticated Cloudflare account and existing resources**

Run:

```bash
npx wrangler whoami
npx wrangler d1 list
npx wrangler r2 bucket list
```

Confirm `retroguyvn-db` exists. Confirm whether `retroguyvn-firmware` already exists before creating it.

- [ ] **Step 2: Create only the missing firmware bucket**

If absent:

```bash
npx wrangler r2 bucket create retroguyvn-firmware
```

If present, make no destructive change.

- [ ] **Step 3: Apply D1 migrations remotely**

```bash
npx wrangler d1 migrations apply retroguyvn-db --remote
```

Inspect seeded hardware:

```bash
npx wrangler d1 execute retroguyvn-db --remote --command "SELECT code, label, enabled FROM ota_hardware ORDER BY code;"
```

Expected: `HW0.4`, `HW0.5`, `HW0.5.1` enabled.

- [ ] **Step 4: Deploy the branch to a non-production preview first if the configured Cloudflare workflow supports previews**

Run the repository's supported preview/deploy flow; do not replace the production route until test/build and preview smoke checks pass. Verify `/admin/ota`, `/api/dr/ota`, and existing public/CMS routes.

- [ ] **Step 5: Production deploy after preview validation**

Use the repository's existing Cloudflare deployment mechanism from the approved branch/merge flow. Do not bypass GitHub CI with an unreviewed local source tree.

- [ ] **Step 6: Execute production no-release checks**

Before uploading a real firmware release, verify:

```text
missing headers -> 400
unknown hardware -> 200 update_available=false reason=unknown_hardware
known hardware with no release -> 200 update_available=false reason=no_published_release or up_to_date according to data
/admin/ota requires existing admin authentication
existing website pages and CMS continue returning successfully
```

- [ ] **Step 7: Create a controlled test release through `/admin/ota`**

Use a known safe ESP32-S3 test `.bin`, target only one test hardware revision/channel, keep it `draft`, verify SHA-256/size/magic metadata, then Publish explicitly.

- [ ] **Step 8: Verify offer pin and range download**

For `TEST-DEVICE-001`:

```text
check -> receives release_id
same device + exact hardware + release_id + Range bytes=0-1023 -> 206
other device using that release_id without its own offer -> 403
different hardware using that release_id -> 403
invalid range -> 416
```

Inspect `/admin/ota` history or D1 to confirm `CHECK`, `UPDATE_AVAILABLE`, and `DOWNLOAD_RANGE` events.

- [ ] **Step 9: Verify disable behavior**

Disable the controlled release. Repeat check: it must no longer be offered. Repeat download with the former release ID: it must be rejected because status is no longer `published`.

- [ ] **Step 10: Final verification before PR/merge completion**

Run:

```bash
npm test
npm run build
```

Then verify GitHub Actions for the branch/PR are green and record the deployed Worker version/commit SHA in the PR description.

---

## Plan Self-Review

- Spec coverage: D1 schema, initial hardware registry, exact-match multi-hardware targeting, version sorting, release lifecycle, R2 isolation, upload validation, check endpoint, offer pin, download authorization, HTTP range, event/device logging, admin authentication/API/UI, CI, deployment and production smoke tests are all mapped to Tasks 1-8.
- Placeholder scan: no implementation step uses `TBD`, `TODO`, "implement later", or an undefined generic instruction; variable sample `<release-id-from-check>` is explicitly defined as a runtime value returned by the preceding check response.
- Type/interface consistency: `createOtaRepository` methods are consumed by `createOtaService`; `createOtaService` is consumed by `createOtaHttp`; `handleOtaPublic`/`handleOtaAdmin` are the only Worker integration surfaces; hardware codes remain strings end-to-end; version comparisons use `version_sort` generated by `parseVersion`.
