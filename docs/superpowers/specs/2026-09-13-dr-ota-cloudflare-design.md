# DR OTA Cloudflare Design

Date: 2026-09-13
Status: Proposed for implementation
Branch: `feature/dr-ota-cloudflare`

## 1. Goal

Add a production OTA management subsystem to `retroguyvn.com` for Digital Realm devices while preserving the current Astro + Cloudflare Workers architecture.

The subsystem must:

- expose a protected admin page at `/admin/ota`;
- let an authorized admin upload, edit, publish, disable and delete Game Firmware `.bin` releases;
- support multiple hardware revisions without ambiguous fallback;
- expose stable device-facing endpoints for OTA check and firmware download;
- store firmware binaries in a dedicated Cloudflare R2 bucket;
- store release metadata, hardware compatibility, device registry and immutable OTA event history in the existing Cloudflare D1 database;
- keep the existing CMS/media stack isolated and unchanged except for shared authentication and admin navigation;
- preserve support for streamed/ranged downloads so an ESP32-S3 can resume or fetch firmware incrementally.

## 2. Existing architecture to preserve

The current site uses:

- Astro;
- Cloudflare Workers;
- the existing D1 binding `DB` targeting `retroguyvn-db`;
- the existing R2 binding `MEDIA` targeting `retroguyvn-media`;
- the current Worker entrypoint and CMS code;
- existing admin authentication through Cloudflare Access when configured, with the current Bearer-token fallback;
- GitHub Actions for build validation;
- the existing `main` branch as production source.

The OTA subsystem must be additive. It must not repurpose `MEDIA` for firmware and must not create a second authentication system.

## 3. Selected architecture

Use one additional R2 bucket dedicated to firmware and continue using the existing D1 database.

```text
GitHub: takeshi-takorva/retroguyvn
        |
        v
Cloudflare Worker: retroguyvn
        |
        +-- Astro website / CMS
        |
        +-- /admin
        |     +-- existing CMS
        |     +-- /admin/ota
        |
        +-- Device OTA API
              +-- GET /api/dr/ota
              +-- GET /api/dr/ota/download

Cloudflare D1: retroguyvn-db
        +-- CMS tables
        +-- OTA metadata tables

Cloudflare R2
        +-- retroguyvn-media      (existing CMS media)
        +-- retroguyvn-firmware   (new OTA binaries)
```

New Wrangler binding:

```json
{
  "binding": "FIRMWARE",
  "bucket_name": "retroguyvn-firmware"
}
```

The R2 object must never be exposed through a raw public R2 URL. Devices download through the Worker so authorization, hardware compatibility, range handling and logging remain centralized.

## 4. Product and release model

Initial product identifier:

```text
DR_GAME
```

The design must permit future products such as Boot FW or Service OS without redesigning the schema, but only `DR_GAME` is in scope for the first implementation.

Each release has one version/build identity and one binary object. Compatibility is expressed separately through target rows.

Example:

```text
Release: DR_GAME 1.3.0
Targets:
  HW0.5
  HW0.5.1
```

A release may target one or multiple explicit hardware revisions.

### 4.1 No implicit hardware fallback

Hardware compatibility is exact-match only.

If a device sends:

```text
X-DR-HW-Version: HW0.5.1
```

then a release targeting only `HW0.5` is not compatible unless `HW0.5.1` is explicitly included in that release's target rows.

The server must never infer compatibility from numbering or prefix similarity.

This rule is intentionally strict to prevent flashing a binary built for a different PCB revision.

## 5. Hardware revision registry

Create an explicit hardware registry so the admin UI can select known revisions and future revisions can be added without code changes.

Initial rows:

```text
HW0.4
HW0.5
HW0.5.1
```

Each hardware revision has:

- `id` internal text key;
- `code` external stable code such as `HW0.5.1`;
- `label` admin-facing display name;
- `enabled` boolean;
- timestamps.

A disabled hardware revision remains valid for historical logs/releases but is hidden from new-release selection by default.

## 6. D1 schema

Add a new migration after the existing CMS migration.

### 6.1 `ota_hardware`

Columns:

```text
id TEXT PRIMARY KEY
code TEXT NOT NULL UNIQUE
label TEXT NOT NULL
enabled INTEGER NOT NULL DEFAULT 1
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
```

### 6.2 `ota_releases`

Columns:

```text
id TEXT PRIMARY KEY
product TEXT NOT NULL
version TEXT NOT NULL
version_sort INTEGER NOT NULL
build_id TEXT NOT NULL
channel TEXT NOT NULL
status TEXT NOT NULL
secure_version INTEGER NOT NULL DEFAULT 0
min_boot_version TEXT
release_notes TEXT NOT NULL DEFAULT ''
r2_key TEXT NOT NULL UNIQUE
file_name TEXT NOT NULL
content_type TEXT NOT NULL DEFAULT 'application/octet-stream'
size_bytes INTEGER NOT NULL
sha256 TEXT NOT NULL
esp_image_valid INTEGER NOT NULL DEFAULT 0
download_count INTEGER NOT NULL DEFAULT 0
created_by TEXT
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
published_at TEXT
```

Constraints/business rules:

- `product` initial allowed value: `DR_GAME`;
- `channel` allowed values: `stable`, `beta`, `dev`;
- `status` allowed values: `draft`, `published`, `disabled`;
- `sha256` is lower-case 64-character hex;
- uploaded firmware must have `.bin` extension;
- uploaded firmware must start with ESP image magic byte `0xE9` before a release can be created;
- a release cannot become `published` without at least one enabled/known hardware target;
- `(product, version, build_id)` must be unique;
- deleting a release is allowed only after it is not `published`.

`version_sort` is a server-generated sortable numeric representation used to avoid lexical comparison errors such as `1.10.0` being treated as less than `1.9.0`. The first implementation supports semantic versions in `MAJOR.MINOR.PATCH` form, each component `0..9999`, encoded as:

```text
MAJOR * 100000000 + MINOR * 10000 + PATCH
```

The external `version` remains the human-readable string.

### 6.3 `ota_release_targets`

Columns:

```text
release_id TEXT NOT NULL
hardware_id TEXT NOT NULL
created_at TEXT NOT NULL
PRIMARY KEY (release_id, hardware_id)
FOREIGN KEY (release_id) REFERENCES ota_releases(id) ON DELETE CASCADE
FOREIGN KEY (hardware_id) REFERENCES ota_hardware(id)
```

### 6.4 `ota_devices`

Stores the latest known state for each device.

Columns:

```text
device_id TEXT PRIMARY KEY
hardware_code TEXT NOT NULL
boot_version TEXT
game_version TEXT
channel TEXT NOT NULL DEFAULT 'stable'
first_seen_at TEXT NOT NULL
last_seen_at TEXT NOT NULL
last_check_at TEXT
last_download_at TEXT
last_release_id TEXT
last_ip TEXT
last_user_agent TEXT
```

`device_id` is treated as an opaque stable identifier supplied by the device. The backend must not derive identity from IP address or COM port.

### 6.5 `ota_events`

Append-only history table.

Columns:

```text
id TEXT PRIMARY KEY
device_id TEXT NOT NULL
event_type TEXT NOT NULL
hardware_code TEXT NOT NULL
current_fw TEXT
boot_version TEXT
channel TEXT
release_id TEXT
target_fw TEXT
http_status INTEGER
bytes_served INTEGER NOT NULL DEFAULT 0
range_start INTEGER
range_end INTEGER
ip TEXT
user_agent TEXT
detail_json TEXT
created_at TEXT NOT NULL
```

Supported initial `event_type` values:

```text
CHECK
UPDATE_AVAILABLE
NO_UPDATE
DOWNLOAD_START
DOWNLOAD_RANGE
DOWNLOAD_COMPLETE
DOWNLOAD_FAIL
```

The event table is immutable through the public API and admin UI. Admin may filter/export, but the first implementation provides no delete action for individual history rows.

## 7. R2 object layout

Use deterministic but non-public keys:

```text
ota/dr-game/<release-id>/<sha256>.bin
```

Example:

```text
ota/dr-game/dr-game-1.3.0-26091301/7e1f...a4.bin
```

R2 object metadata should include at least:

```text
release-id
product
version
build-id
sha256
```

The D1 release row is authoritative for publication status and compatibility. R2 metadata is diagnostic only.

When an admin deletes an eligible release, deletion order is:

1. verify release is not `published`;
2. delete R2 object;
3. delete D1 release row and target rows in a transaction/ordered operation;
4. retain historical `ota_events` rows; they keep the historical `release_id` text even if the release row no longer exists.

The schema therefore must not enforce a cascading foreign key from `ota_events.release_id` to `ota_releases.id`.

## 8. Device request contract

### 8.1 Check endpoint

Stable URL:

```text
GET https://retroguyvn.com/api/dr/ota
```

Required headers:

```text
X-DR-Device-ID
X-DR-HW-Version
X-DR-FW-Version
```

Optional headers:

```text
X-DR-Boot-Version
X-DR-Channel
```

Default channel when omitted:

```text
stable
```

Validation:

- missing required header -> `400` JSON;
- unknown/disabled hardware -> `200` with `update_available: false` plus a machine-readable reason; do not offer a different hardware binary;
- unsupported channel -> `400`;
- malformed firmware version -> `400`;
- check requests do not require admin authentication.

The endpoint upserts `ota_devices`, writes a `CHECK` event, selects the newest compatible published release and then writes either `UPDATE_AVAILABLE` or `NO_UPDATE`.

### 8.2 Release selection

Candidate release must satisfy all of:

```text
product = DR_GAME
status = published
channel = device channel
release target contains exact hardware code
version_sort > current device version_sort
min_boot_version is null OR device boot version >= min_boot_version
```

If multiple releases match, order by:

```text
version_sort DESC,
published_at DESC,
created_at DESC
```

Return the first match.

If the device omits `X-DR-Boot-Version` and the selected release declares `min_boot_version`, that release is not eligible. This fails safe rather than assuming compatibility.

### 8.3 Check response when no update exists

```json
{
  "update_available": false,
  "product": "DR_GAME",
  "hardware": "HW0.5.1",
  "channel": "stable",
  "current_version": "1.2.1",
  "reason": "up_to_date"
}
```

Allowed initial reasons:

```text
up_to_date
unknown_hardware
hardware_disabled
boot_version_required
no_published_release
```

### 8.4 Check response when an update exists

```json
{
  "update_available": true,
  "release_id": "dr-game-1.3.0-26091301",
  "product": "DR_GAME",
  "version": "1.3.0",
  "build_id": "260913_DR_v1.3.0",
  "channel": "stable",
  "hardware": ["HW0.5", "HW0.5.1"],
  "secure_version": 3,
  "min_boot_version": "1.1.0",
  "size": 3610363,
  "sha256": "<64-char-lowercase-hex>",
  "release_notes": "...",
  "download": "https://retroguyvn.com/api/dr/ota/download"
}
```

The download URL is constant. `release_id` pins the release selected during the check so a newly published release cannot silently replace it between check and download.

## 9. Download endpoint

Stable URL:

```text
GET https://retroguyvn.com/api/dr/ota/download
```

Required headers:

```text
X-DR-Release-ID
X-DR-Device-ID
X-DR-HW-Version
```

The Worker must verify:

1. release exists;
2. release status is `published`;
3. exact supplied hardware code is a target of that release;
4. supplied hardware code matches the latest known hardware code for the device when a device record already exists;
5. R2 object exists;
6. R2 object size agrees with D1 metadata.

A device cannot download an arbitrary unpublished or incompatible firmware object by guessing an R2 key or release ID.

### 9.1 Range support

Support:

```text
Range: bytes=<start>-<end>
Range: bytes=<start>-
```

Single range only.

Behavior:

- full download -> `200`;
- valid range -> `206 Partial Content`;
- invalid/out-of-bounds range -> `416 Range Not Satisfiable`;
- always include `Accept-Ranges: bytes`;
- ranged response includes correct `Content-Range` and `Content-Length`;
- full response includes correct `Content-Length`;
- `Content-Type: application/octet-stream`;
- include `ETag` based on SHA-256, formatted as a strong quoted entity tag;
- use `Cache-Control: private, no-store` for the API response so device-specific checks/logging are not bypassed by shared cache.

The Worker should request the corresponding byte range directly from R2 instead of loading the whole `.bin` into Worker memory.

### 9.2 Download logging

For a full request:

- write `DOWNLOAD_START` before returning the stream;
- on successful complete non-range response, record `DOWNLOAD_COMPLETE` using `ctx.waitUntil` where practical;
- increment `download_count` once per completed full download.

For range requests:

- write `DOWNLOAD_RANGE` including `range_start`, `range_end`, and served byte count;
- do not increment `download_count` for every chunk;
- update `ota_devices.last_download_at`.

Because HTTP disconnect detection is not perfectly reliable at the Worker boundary, `DOWNLOAD_COMPLETE` means the Worker successfully produced the full-body response, not cryptographic confirmation that the device flashed it. Device-side install success reporting is explicitly out of scope for this first backend milestone.

## 10. Admin authentication

All admin OTA endpoints reuse the existing `/api/admin/*` authentication mechanism.

No OTA password table, cookie implementation or separate login route is introduced.

Admin UI route:

```text
/admin/ota
```

Admin API namespace:

```text
/api/admin/ota/*
```

An unauthenticated call receives the same `401` behavior as existing admin APIs.

## 11. Admin API

Initial endpoints:

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

### 11.1 Firmware upload

`POST /api/admin/ota/releases` accepts `multipart/form-data` containing:

```text
file
product
version
build_id
channel
secure_version
min_boot_version
release_notes
hardware[]
```

Server validation occurs before publication:

1. filename ends in `.bin` case-insensitively;
2. file is non-empty;
3. first byte is `0xE9`;
4. calculate SHA-256 server-side;
5. calculate exact byte size;
6. validate semantic version;
7. validate channel;
8. resolve all hardware codes to registry rows;
9. require at least one hardware target;
10. write object to `FIRMWARE` R2;
11. create release in `draft` status and target rows;
12. return release metadata.

If the D1 write fails after R2 upload, the Worker must delete the just-uploaded R2 object as compensation.

The admin does not manually enter SHA-256 or file size.

### 11.2 Editing releases

Allowed while `draft` or `disabled`:

```text
version
build_id
channel
secure_version
min_boot_version
release_notes
hardware targets
```

The binary itself is immutable for a release ID. Replacing a `.bin` creates a new release. This keeps SHA-256, logs and historical identity trustworthy.

A `published` release must be disabled before mutable compatibility/version fields can change.

### 11.3 Publish

Publishing verifies again:

- R2 object exists;
- object size equals D1 size;
- SHA-256 metadata is present;
- ESP image validation flag is true;
- at least one target exists;
- release metadata is internally valid.

Then set:

```text
status = published
published_at = now
```

More than one release may remain published for the same hardware/channel. Selection always picks the highest compatible version, allowing older releases to remain downloadable by their pinned `release_id` when needed.

### 11.4 Disable

Disable changes only release availability:

```text
status = disabled
```

Disabled releases are never returned by device check and cannot be downloaded through the device endpoint.

### 11.5 Delete

Published release -> reject with `409`.

Draft/disabled release -> delete R2 object and release metadata while retaining event history.

## 12. Admin UI `/admin/ota`

The new page uses the existing admin shell/look and existing authentication bootstrap.

It contains four functional sections.

### 12.1 Overview

Show compact counts:

- published releases;
- draft releases;
- known devices;
- checks in the last 24 hours;
- downloads in the last 24 hours.

### 12.2 Firmware releases

Table columns:

```text
Version
Build ID
Channel
Hardware
Status
Size
SHA-256 short form
Downloads
Updated
Actions
```

Actions follow status:

```text
draft:    Edit | Publish | Delete
published: Disable
 disabled: Edit | Publish | Delete
```

### 12.3 Create/edit release form

Fields:

```text
Product              fixed DR_GAME in v1
Version
Build ID
Channel               Stable / Beta / Dev
Hardware revisions    multi-select checkboxes
Secure Version
Minimum Boot Version  optional
Release Notes
Firmware .bin         create only
```

Upload UI shows progress where the browser exposes upload progress. If the current fetch-based admin helper cannot provide upload progress without disproportionate complexity, v1 may show an indeterminate uploading state; correctness is more important than synthetic progress.

### 12.4 Devices and history

Device table:

```text
Device ID
Hardware
Game FW
Boot FW
Channel
Last Seen
Last Check
Last Download
Last Release
```

Event table:

```text
Time
Device ID
Hardware
Event
Current FW
Target FW
Release
HTTP
Bytes
IP
```

Initial filters:

```text
Device ID
Hardware
Event type
Channel
```

Pagination is server-side with a bounded default page size. The admin page must not fetch the entire event history into the browser.

## 13. Security and data-integrity rules

- Admin routes use existing authenticated admin identity.
- Device check/download endpoints are intentionally public but strictly validate device metadata and compatibility.
- R2 firmware bucket is accessed only through the Worker binding; no public bucket URL is part of the protocol.
- Firmware SHA-256 is calculated server-side at upload.
- ESP image magic byte `0xE9` is a basic sanity check, not a replacement for Secure Boot signature validation.
- The backend stores `secure_version` for anti-rollback policy integration, but cryptographic signature validation on upload is not part of this first milestone unless the firmware signing format is already available to the Worker.
- Production private signing keys must never be stored in the website repository, frontend JavaScript or D1.
- Device IP/user-agent are operational logs; they are not used as device identity.
- Release binary is immutable after creation.
- Hardware matching is exact and explicit.
- No wildcard hardware target exists in v1.

## 14. Worker/module boundaries

Do not put the complete OTA implementation into the already-large `src/worker.js`.

Create focused modules:

```text
src/ota/version.js
  semantic-version parsing/comparison and version_sort

src/ota/repository.js
  D1 queries and mutations for releases, targets, devices and events

src/ota/storage.js
  R2 firmware upload/get/delete/range helpers

src/ota/device-api.js
  /api/dr/ota and /api/dr/ota/download handlers

src/ota/admin-api.js
  authenticated /api/admin/ota/* handlers
```

The existing Worker entrypoint remains the top-level router and authentication owner. OTA admin handlers receive an already-authenticated admin identity rather than duplicating access-token verification.

This boundary keeps OTA testable independently and avoids further expanding CMS-specific files.

## 15. Admin UI files

Add:

```text
src/pages/admin/ota.astro
```

Reuse existing admin layout/components/styles where practical. Small OTA-specific styles/scripts may live with the page initially; extract only when shared behavior emerges.

Add a navigation entry from the existing admin shell to `/admin/ota`.

## 16. Migration and bootstrap

Create:

```text
migrations/0002_ota.sql
```

The migration creates OTA tables/indexes and seeds:

```text
HW0.4
HW0.5
HW0.5.1
```

Required indexes include at minimum:

```text
ota_releases(status, product, channel, version_sort)
ota_release_targets(hardware_id, release_id)
ota_devices(last_seen_at)
ota_events(created_at)
ota_events(device_id, created_at)
ota_events(event_type, created_at)
```

Migration must be idempotent in repository/bootstrap test flows using `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` where compatible with the project's D1 migration pattern.

## 17. Wrangler and Cloudflare resources

Modify `wrangler.jsonc` to add:

```json
"r2_buckets": [
  {
    "binding": "MEDIA",
    "bucket_name": "retroguyvn-media"
  },
  {
    "binding": "FIRMWARE",
    "bucket_name": "retroguyvn-firmware"
  }
]
```

The existing D1 binding is reused.

The remote bucket `retroguyvn-firmware` must exist in the Cloudflare account before a production deploy that requires the binding. Repository code must not silently fall back to `MEDIA` if `FIRMWARE` is missing.

Admin OTA API should return a clear `503` storage-not-configured error if the Worker runs without `FIRMWARE`; normal public website/CMS routes must continue functioning.

## 18. GitHub CI/CD expectations

Keep the existing build job and extend validation rather than replacing it.

CI must at least run:

```text
npm install
npm run build
```

Add OTA-focused automated tests if the repository test runner can be introduced without destabilizing the existing build. The implementation plan should prefer Node's built-in test runner or a minimal test dependency rather than adding a heavy framework solely for this subsystem.

Production deployment remains tied to the repository/Cloudflare deployment configuration already used by this project. The feature branch is not merged until build and OTA tests pass.

## 19. Error behavior

Device API errors are JSON except firmware bodies.

Representative statuses:

```text
400 missing/malformed device headers or version
404 unknown release ID on download
409 device hardware conflicts with known device record
416 invalid byte range
500 unexpected D1/R2 failure
503 FIRMWARE binding/storage unavailable
```

Admin upload errors:

```text
400 malformed metadata
409 duplicate release identity
413 file exceeds configured firmware upload limit
415 wrong extension/content
422 invalid ESP image or target configuration
503 R2 binding unavailable
```

Set a conservative firmware upload ceiling of 16 MiB for v1. This is comfortably above current DR Game FW size while preventing accidental very-large uploads through the admin form.

## 20. Observability

Continue using Cloudflare Worker observability already enabled in Wrangler.

Server errors should log structured prefixes such as:

```text
[OTA CHECK]
[OTA DOWNLOAD]
[OTA ADMIN]
```

Do not log firmware binary data or admin bearer tokens.

Operational history relevant to devices belongs in D1 `ota_events`; Worker console logs are supplementary diagnostics, not the authoritative device history.

## 21. Acceptance criteria

Implementation is accepted when all of the following are true.

1. `/admin/ota` loads under the existing admin authentication flow.
2. Admin can upload a valid ESP32 `.bin` and create a draft release.
3. Backend calculates file size and SHA-256 itself.
4. Admin can target one or multiple explicit hardware revisions.
5. Admin can publish, disable and delete eligible releases.
6. A published release for `HW0.5` is never returned to `HW0.5.1` unless `HW0.5.1` is also explicitly targeted.
7. `GET /api/dr/ota` selects the latest compatible release by hardware, channel, current version and minimum boot version.
8. No-update responses are deterministic and machine readable.
9. Download URL remains fixed at `/api/dr/ota/download` and uses `X-DR-Release-ID` to pin the selected release.
10. Full firmware download works directly from R2 through the Worker without buffering the complete firmware in application memory.
11. Single-range requests return valid `206`, `Content-Range`, `Content-Length` and exact bytes.
12. Invalid ranges return `416`.
13. A device cannot download a disabled, draft or hardware-incompatible release.
14. Device registry updates on check/download.
15. Check and download activity appears in immutable OTA event history.
16. Existing website, CMS, `/admin`, D1 CMS tables and `MEDIA` R2 behavior continue to work.
17. Build passes in GitHub Actions.
18. OTA unit/integration tests pass in CI.
19. Missing `FIRMWARE` binding degrades OTA endpoints with an explicit error without breaking the rest of the site.
20. No firmware signing private key is committed to GitHub or stored in frontend code.

## 22. Out of scope for this milestone

The following are intentionally deferred:

- Boot FW or Service OS binaries as separate OTA products;
- device-side install-success callback after reboot;
- staged percentage rollout/canary targeting;
- per-device allow/block lists;
- cryptographic firmware signing inside the website;
- private signing-key storage;
- automatic Secure Boot signature verification in Worker;
- automatic firmware build from source inside this website repository;
- wildcard hardware compatibility;
- asset-pack OTA;
- deleting historical OTA event rows through the admin UI.

The schema and module boundaries should make these future additions possible without changing the stable device check/download URLs.