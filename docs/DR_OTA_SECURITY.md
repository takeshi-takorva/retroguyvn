# Digital Realm OTA Security Model

This note separates protections implemented by the OTA backend from protections that require a future device-authentication protocol.

## What the current backend protects

The Worker enforces exact hardware targeting, release publication state, semantic version ordering, optional minimum Boot FW, server-computed SHA-256/size, ESP image magic validation, and per-device release pinning between check and download.

A download is allowed only when the requested release is still published, targets the exact `X-DR-HW-Version`, matches the device record hardware, and equals the latest `release_id` offered to that Device-ID.

These rules prevent accidental cross-hardware flashing, arbitrary unpublished release download through the API, and silent substitution of a newly published release between check and download.

## Device-ID is not authentication

`X-DR-Device-ID` is an identifier, not a secret. An eFuse/MAC-derived value is stable and useful for inventory and audit, but knowledge of that value does not prove that the caller owns the physical device.

The current milestone therefore does **not** claim cryptographic device authentication. A client that can learn or guess another Device-ID can impersonate that identifier at the HTTP layer. Cloudflare rate limiting/WAF can reduce abuse but does not replace device credentials.

Do not use IP address, COM port, or User-Agent as device identity.

## Future device credential milestone

Before treating OTA access as confidential or device-authenticated, provision a per-device credential during Service OS / factory provisioning. The credential should be independent from the public serial/Device-ID and protected from ordinary firmware/UI access.

A future protocol can add request authentication such as a per-device key and HMAC over a canonical request containing at least:

```text
method
path
device_id
hardware_version
firmware_version or release_id
timestamp / nonce
```

The backend should reject replayed nonces and invalid signatures. Device-ID remains the lookup key; the secret credential becomes proof of possession.

The current fixed endpoint URLs and D1 device registry are intentionally compatible with adding this layer later without changing release storage or hardware targeting.

## Firmware authenticity

Backend SHA-256 verifies transfer/storage integrity but is not a substitute for code signing. Production firmware should be signed outside the website/backend. Never store the private signing key in repository source, browser code, ordinary Worker variables, or Device Studio source.

When production hardware enables ESP32-S3 Secure Boot v2, Flash Encryption and anti-rollback, the device must verify firmware authenticity and secure-version policy before changing the active application partition.

## Admin security

OTA admin APIs reuse the existing Cloudflare Access / Bearer-token identity path. Browser mutations also reject a mismatched `Origin` header. R2 firmware objects have no public raw URL in the application design; administration and device download both traverse the Worker.

Admin actions should be performed only over HTTPS. Rotate the fallback Admin Token if it is exposed and prefer Cloudflare Access for routine operation.
