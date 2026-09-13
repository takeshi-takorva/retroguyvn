# Digital Realm OTA Admin

Production workspace:

```text
https://retroguyvn.com/admin/ota
```

The workspace reuses the existing RetroGuy admin authentication (Cloudflare Access first, fallback Admin Token when configured).

## Firmware file management

Each release row exposes these file actions:

- **Download** streams the immutable `.bin` object from the private `FIRMWARE` R2 binding through the authenticated Worker route.
- **Copy link** copies the absolute protected file URL for that release.

Protected admin file URL format:

```text
https://retroguyvn.com/api/admin/ota/releases/<release-id>/file
```

The URL requires an authenticated admin session. It is intentionally not a raw/public R2 object URL. This keeps firmware storage private while still giving operators a stable direct link for management and download.

The file response supports a single HTTP byte range and returns `Content-Disposition`, exact `Content-Length`, `Accept-Ranges`, and a strong SHA-256 `ETag`.

## Release operations

The Firmware Releases tab supports upload, metadata/target edit, publish, disable, download, copy-link, and delete for non-published releases. Published release metadata is immutable; disable it before editing or deleting it.

Firmware upload validation includes `.bin` extension, non-empty content, maximum 16 MiB, ESP image magic byte `0xE9`, server SHA-256, strict semantic version, channel validation, and explicit enabled hardware targets.

## Device endpoints

These remain fixed and are separate from the protected admin file link:

```text
GET https://retroguyvn.com/api/dr/ota
GET https://retroguyvn.com/api/dr/ota/download
```

Devices must perform the update check first. The device download endpoint enforces the offered release ID, exact hardware target, published status and ranged-download contract.
