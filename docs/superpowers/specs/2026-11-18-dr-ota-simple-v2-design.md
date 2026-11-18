# Simplified Digital Realm OTA v2 Design

**Date:** 2026-11-18

## Intent

Replace the current metadata-heavy OTA workflow with one simple release model:

- one Game FW binary;
- one version embedded in the ESP-IDF app descriptor using `vHW_MAJOR.HW_MINOR.REVISION`;
- one optional `.vgi.pack` asset bundle;
- optional release notes.

Only Game FW is updated. Boot FW and Service OS are never OTA targets.

## User-facing admin

`/admin/ota` keeps only the Firmware Releases workspace.

Create release fields:

- Game FW `.bin` — required;
- Assets `.vgi.pack` — optional;
- Release notes — optional;
- Version — read-only, auto-detected from the Game FW app descriptor.

Remove from the UI:

- Release ID;
- Release sequence;
- Build ID;
- Channel;
- Secure version;
- Minimum Boot FW;
- Asset version;
- Mandatory;
- RSA signature;
- Hardware tab;
- Devices tab;
- Event History tab.

The operator can create a Draft, optionally replace Game/Assets while Draft, then Publish. Published releases are immutable.

## Version contract

Game versions use:

```text
v<HW_MAJOR>.<HW_MINOR>.<REVISION>
```

Examples:

- HW1.1 fix129 -> `v1.1.129`;
- HW1.1 fix130 -> `v1.1.130`;
- HW0.4 fix129 -> `v0.4.129`.

The first two numbers identify hardware compatibility. The last number is the update revision.

Boot OS installs an update only when:

1. candidate major/minor equal the currently installed Game FW major/minor;
2. candidate revision is greater than the installed revision.

## Server release record

OTA v2 uses a new isolated D1 table. Existing legacy OTA tables stay untouched.

Each v2 release stores only:

- version;
- hardware major/minor;
- revision;
- Game FW R2 key, size, SHA-256, filename;
- optional Assets R2 key, size, SHA-256, filename;
- notes;
- draft/published state;
- timestamps.

The server extracts version and project identity from the uploaded ESP-IDF image and rejects any binary whose `project_name` is not `DR_Game_FW` or whose version does not match the v2 format.

## Device API

Boot OS uses:

```text
POST /api/dr/ota/v2/check
GET  /api/dr/ota/v2/game/{version}
GET  /api/dr/ota/v2/assets/{version}
```

Check request:

```json
{"version":"v1.1.129"}
```

Up-to-date response:

```json
{"update":false,"version":"v1.1.129"}
```

Update response:

```json
{
  "update": true,
  "version": "v1.1.130",
  "firmware": {
    "url": "https://retroguyvn.com/api/dr/ota/v2/game/v1.1.130",
    "size": 4123456,
    "sha256": "..."
  },
  "assets": {
    "url": "https://retroguyvn.com/api/dr/ota/v2/assets/v1.1.130",
    "size": 8234567,
    "sha256": "..."
  },
  "notes": "..."
}
```

`assets` is `null` when the release has no asset pack.

## Boot OS flow

1. Read the installed Game FW version from the active `DR_Game_FW` app descriptor.
2. POST current version to the v2 check endpoint.
3. If no newer compatible revision exists, show up-to-date.
4. If a newer revision exists, show confirmation `current -> candidate`.
5. On confirmation, download Game FW to SD staging and verify exact size + SHA-256.
6. If the release has Assets, download `.vgi.pack`, verify exact size + SHA-256, read `install.md`, and apply the pack to SD.
7. Only after Game FW and required Assets are valid, write Game FW to the inactive A/B slot.
8. Verify installed `project_name == DR_Game_FW` and installed version equals the candidate version.
9. Arm the existing ESP-IDF rollback candidate and reboot.
10. Existing Game FW self-test/rollback remains authoritative.

Boot FW, Service OS and `sysres` are never written by this workflow.

## VGI pack format

A `.vgi.pack` is a simple streaming container, not a ZIP dependency.

Magic:

```text
DRVGP001
```

Header:

- 8-byte magic;
- uint16 little-endian format version = 1;
- uint16 little-endian entry count.

Each entry:

- uint16 path length;
- uint32 data length;
- 32-byte SHA-256;
- UTF-8 relative path;
- raw bytes.

The first entry must be `install.md`.

Supported `install.md` commands:

```text
DR_ASSET_PACK_V1
VERSION=v1.1.130
COPY payload/data/assets/ui/foo.vgi /data/assets/ui/foo.vgi
DELETE /data/assets/ui/obsolete.vgi
```

Security rules:

- reject `..`, empty path segments and paths outside `/data/`;
- COPY source must name an entry inside the pack;
- per-entry SHA-256 must match before committing the destination file;
- use `.part` destination then rename;
- an assets install failure prevents Game FW flashing.

## Safety kept from the old system

- HTTPS;
- Game FW SHA-256;
- Assets pack SHA-256;
- per-entry Assets SHA-256;
- `DR_Game_FW` project identity check;
- inactive A/B write;
- ESP-IDF pending verify and rollback;
- SD staging.

## Non-goals

- Boot FW OTA;
- Service OS OTA;
- per-device registry;
- release sequence;
- channel management;
- RSA release signing;
- mandatory releases;
- remote lifecycle telemetry.
