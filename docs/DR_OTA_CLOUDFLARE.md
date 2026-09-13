# Digital Realm OTA on Cloudflare

Version: 2.2.0

This document describes deployment, operation and recovery for the Digital Realm Game Firmware OTA backend hosted by the existing `retroguyvn` Cloudflare Worker.

## Architecture

The public website and CMS keep their existing bindings:

- D1: `DB` -> `retroguyvn-db`
- R2 media: `MEDIA` -> `retroguyvn-media`

OTA adds one isolated binary store:

- R2 firmware: `FIRMWARE` -> `retroguyvn-firmware`

Firmware objects are never exposed by raw R2 URL. Device traffic always goes through the Worker so release status, hardware compatibility, offer pinning, ranged download and event logging are enforced in one place.

The public device endpoints are stable:

```text
GET https://retroguyvn.com/api/dr/ota
GET https://retroguyvn.com/api/dr/ota/download
```

The admin workspace is:

```text
https://retroguyvn.com/admin/ota
```

It reuses the existing Cloudflare Access / Admin Token authentication.

## First production provisioning

Run these commands from an authenticated Cloudflare development environment. Do not create a second D1 database.

```bash
npx wrangler whoami
npx wrangler d1 list
npx wrangler r2 bucket list
```

Confirm `retroguyvn-db` exists. Check whether `retroguyvn-firmware` already exists before creating it.

If the firmware bucket is absent:

```bash
npx wrangler r2 bucket create retroguyvn-firmware
```

Apply the repository migrations to the existing D1 database:

```bash
npx wrangler d1 migrations apply retroguyvn-db --remote
```

Then verify locally before deployment:

```bash
npm install
npm test
npm run build
```

Deploy only after both commands pass:

```bash
npm run deploy
```

The build patcher verifies that generated production Wrangler configuration contains `DB`, `MEDIA`, and `FIRMWARE`. When `.cloudflare-r2-disabled` exists, both R2 bindings are intentionally omitted; OTA binary storage is therefore unavailable until R2 is enabled and that transitional marker is removed.

## Hardware compatibility policy

Compatibility is exact-match only. `HW0.5` does not imply compatibility with `HW0.5.1`, and no future revision may be inferred by prefix.

Initial hardware registry:

```text
HW0.4
HW0.5
HW0.5.1
```

A release can target multiple revisions, but each target is explicitly stored in `ota_release_targets`.

## Release lifecycle

A new upload is always created as `draft`.

The backend validates all of the following before storing metadata:

```text
.bin filename
non-empty file
ESP image magic byte 0xE9
strict MAJOR.MINOR.PATCH version
known enabled hardware targets
valid channel: stable / beta / dev
server-calculated SHA-256
server-calculated byte size
```

Publishing rechecks that the R2 object exists and that its byte size matches D1 metadata. Published releases are metadata-immutable. Disable a release before editing metadata or deleting it. The binary for a release ID is immutable; upload a new release for a new binary.

Deletion order is R2 object first, then D1 release metadata. Historical `ota_events` rows are retained and may reference a deleted release ID as historical text.

## Device check contract

Required headers:

```text
X-DR-Device-ID: <stable-device-id>
X-DR-HW-Version: HW0.5.1
X-DR-FW-Version: 1.2.3
```

Optional headers:

```text
X-DR-Boot-Version: 1.1.0
X-DR-Channel: stable
```

If channel is omitted, `stable` is used.

The server selects only a release that is published, on the requested channel, explicitly targets the exact hardware code, has a version newer than the device, and satisfies `min_boot_version` when specified.

When an update is offered, its `release_id` is written to `ota_devices.last_release_id`. This is the device offer pin.

## Download contract

Required headers:

```text
X-DR-Release-ID: <release-id-returned-by-check>
X-DR-Device-ID: <same-stable-device-id>
X-DR-HW-Version: <same-exact-hardware-code>
```

Download is rejected unless the release is still published, explicitly targets the hardware, the device hardware has not changed since check, and `X-DR-Release-ID` equals that device's current `last_release_id`.

The endpoint supports one HTTP byte range:

```text
Range: bytes=100-199
Range: bytes=900-
```

Multiple ranges and invalid/out-of-bounds ranges return HTTP 416. Valid ranges return HTTP 206 and are read directly from R2 rather than buffering the entire firmware in Worker memory.

## Event semantics

The append-only OTA history records:

```text
CHECK
UPDATE_AVAILABLE
NO_UPDATE
DOWNLOAD_START
DOWNLOAD_RANGE
DOWNLOAD_COMPLETE
DOWNLOAD_FAIL
```

`DOWNLOAD_COMPLETE` means the Worker successfully produced a full-body download response. It does not mean that the device flashed or booted the new firmware successfully. Device-side installation acknowledgement is a separate future protocol milestone.

## Production smoke tests

Run check without required headers and expect HTTP 400:

```bash
curl -i https://retroguyvn.com/api/dr/ota
```

Run a known-device check:

```bash
curl -i https://retroguyvn.com/api/dr/ota \
  -H "X-DR-Device-ID: TEST-DEVICE-001" \
  -H "X-DR-HW-Version: HW0.5.1" \
  -H "X-DR-FW-Version: 0.0.1" \
  -H "X-DR-Boot-Version: 1.1.0" \
  -H "X-DR-Channel: stable"
```

Before a real release is published, the expected response is `update_available: false` with a machine-readable reason.

After publishing a test release, copy the `release_id` returned by the check and test a partial download:

```bash
curl -i https://retroguyvn.com/api/dr/ota/download \
  -H "X-DR-Release-ID: <release-id-from-check>" \
  -H "X-DR-Device-ID: TEST-DEVICE-001" \
  -H "X-DR-HW-Version: HW0.5.1" \
  -H "Range: bytes=0-1023" \
  -o /tmp/dr-ota-range.bin
```

Expect HTTP 206, `Accept-Ranges: bytes`, a valid `Content-Range`, exact `Content-Length`, and a strong SHA-256 `ETag`.

## Operational recovery

If firmware R2 is unavailable, website/CMS traffic remains independent. Device download and firmware mutation operations return an OTA-specific service error rather than falling through to public website handling.

If an R2 upload succeeds but the D1 release insert fails, the release service deletes the just-uploaded object as compensation.

If release deletion removes R2 successfully but the D1 delete later fails, do not publish that row. Retry deletion after confirming the object is absent; published releases are protected from delete by the service.

If a release is suspected unsafe, use Disable immediately. Disabling prevents new check selection and blocks downloads because the download endpoint requires `status = published`.

## Security notes

The first backend milestone accepts an ESP application `.bin` and validates structure only at the image-magic level plus checksum/size integrity. Production signed firmware should be generated outside the website. The private signing key must not be stored in frontend code, GitHub source, Worker variables exposed to application code, or the admin browser.

When Secure Boot v2 and anti-rollback are enabled on production devices, `secure_version` and device-side signature validation remain additional defenses; backend hardware targeting is not a replacement for device-side cryptographic verification.
