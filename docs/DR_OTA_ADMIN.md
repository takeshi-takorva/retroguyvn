# Digital Realm OTA Admin v2

Production workspace:

```text
https://retroguyvn.com/admin/ota
```

The workspace reuses the existing RetroGuy admin authentication (Cloudflare Access first, fallback Admin Token when configured).

## Simplified release model

One OTA release contains:

- one required `DR_Game_FW` ESP-IDF `.bin`;
- one optional `.vgi.pack` SD asset bundle;
- optional release notes.

The server reads the Game FW version directly from the ESP-IDF app descriptor. Operators do not enter version, hardware, build ID, release sequence, channel, boot minimum, security epoch or signatures.

Version format:

```text
v<HW_MAJOR>.<HW_MINOR>.<REVISION>
```

Examples:

- HW1.1 fix129 -> `v1.1.129`
- HW1.1 fix130 -> `v1.1.130`

The first two numbers are the hardware line. Boot OS only accepts a higher revision from the same hardware line.

## Admin workflow

1. Choose Game FW `.bin`.
2. The page detects and displays the embedded version. The binary must identify itself as `DR_Game_FW`.
3. Optionally choose an Assets `.vgi.pack`.
4. Enter release notes if desired.
5. Upload. The release is created as Draft.
6. Review Game/Assets SHA-256 and sizes.
7. Publish.

Published v2 releases are immutable. Create a newer revision for a new production binary.

## Device endpoints

```text
POST /api/dr/ota/v2/check
GET  /api/dr/ota/v2/game/{version}
GET  /api/dr/ota/v2/assets/{version}
```

Check request:

```json
{"version":"v1.1.129"}
```

The response either returns `update:false` or a newer same-hardware Game FW offer with optional Assets metadata.

## Storage and safety

- Game and Assets files are stored in the private `FIRMWARE` R2 binding.
- D1 stores only version, object keys, sizes, SHA-256, notes and Draft/Published state.
- Game FW upload is rejected unless the ESP app descriptor project name is exactly `DR_Game_FW`.
- Game FW is limited to the 0x480000 Game A/B slot size.
- Assets packs are fully parsed on upload: header, every entry SHA-256, `install.md`, allowed paths and pack version are validated.
- Assets pack `VERSION` must equal the Game FW release version.
- Boot FW and Service OS are not OTA targets.
