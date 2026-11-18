# Simplified OTA v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a simplified Game-only OTA path with version `vHW_MAJOR.HW_MINOR.REVISION` and optional `.vgi.pack` assets, synchronized between retroguyvn.com and the HW1.1 Boot OS.

**Architecture:** Add an isolated OTA v2 table/API alongside legacy OTA so existing production data is not destructively migrated. Replace the OTA admin UI with the v2 workflow. Modify the supplied fix129 Boot OS to consume the v2 contract while preserving current SD staging, A/B install and rollback.

**Tech Stack:** Cloudflare Workers, D1, R2, Astro, Node tests, ESP-IDF 5.5.x / Arduino component, Arduino SD, cJSON, mbedTLS SHA-256.

**Spec:** `docs/superpowers/specs/2026-11-18-dr-ota-simple-v2-design.md`

## Global Constraints

- Only `DR_Game_FW` may be installed through OTA.
- Version format is exactly `v<HW_MAJOR>.<HW_MINOR>.<REVISION>`.
- HW1.1 fix129 is `v1.1.129`.
- Candidate hardware major/minor must equal current major/minor and candidate revision must be greater.
- Assets are optional; when present they use `.vgi.pack` with `install.md`.
- Assets install failure must prevent Game FW flashing.
- Keep HTTPS, SHA-256, A/B rollback and project identity checks.
- Do not OTA Boot FW, Service OS or sysres.
- Legacy OTA data/API remain available during the transition but are removed from the admin UI.

## Review Focus

- malformed or non-Game ESP binaries must be rejected before R2 persistence;
- same/lower revision and cross-hardware releases must never be offered;
- missing/corrupt Assets pack must stop installation before A/B flashing;
- pack path traversal must never write outside `/data/`;
- published release binary/assets must remain immutable.

---

### Task 1: Backend v2 version and ESP app descriptor parser

**Files:**
- Create: `src/ota/simple-core.js`
- Test: `test/ota/simple-core.test.js`

**Interfaces:**
- Produces: `parseSimpleVersion(value)`, `compareSimpleVersion(a,b)`, `parseEspGameImage(bytes)`, `validateAssetsPackHeader(bytes)`.

- [ ] Write failing tests for `v1.1.129`, cross-hardware comparison, invalid version, `DR_Game_FW` app descriptor extraction and VGI pack magic.
- [ ] Run the focused test and verify RED.
- [ ] Implement the parser/validators.
- [ ] Run the focused test and verify GREEN.
- [ ] Commit.

### Task 2: D1/R2 simple release model and service

**Files:**
- Modify: `src/ota/schema.js`
- Create: `migrations/0004_ota_simple_v2.sql`
- Create: `src/ota/simple-repository.js`
- Create: `src/ota/simple-service.js`
- Test: `test/ota/simple-service.test.js`

**Interfaces:**
- Consumes: Task 1 parser.
- Produces: create/list/get/replace-assets/publish/delete/check/download operations for `ota_simple_releases`.

- [ ] Write failing service tests for create draft, version extraction, optional assets metadata, publish, immutable published release, check selection and R2 compensation.
- [ ] Verify RED.
- [ ] Implement schema/repository/service.
- [ ] Verify GREEN.
- [ ] Commit.

### Task 3: OTA v2 HTTP API

**Files:**
- Create: `src/ota/simple-http.js`
- Modify: `src/worker-entry.js`
- Test: `test/ota/simple-http.test.js`

**Interfaces:**
- Consumes: Task 2 service.
- Produces admin v2 routes plus `POST /api/dr/ota/v2/check`, Game and Assets download routes with byte-range support.

- [ ] Write failing HTTP contract tests.
- [ ] Verify RED.
- [ ] Implement routes and routing.
- [ ] Verify GREEN.
- [ ] Commit.

### Task 4: Simplified /admin/ota UI

**Files:**
- Modify: `src/pages/admin/ota.astro`
- Modify: `src/components/admin/AdminShell.astro`
- Test: `test/ota/admin-ui.test.js`

**Interfaces:**
- Consumes: Task 3 admin endpoints.
- Produces one Firmware Releases page with Game BIN, optional Assets pack, auto-detected version, notes and release actions.

- [ ] Write failing UI source tests proving removed legacy fields/tabs and required new file inputs/version detector.
- [ ] Verify RED.
- [ ] Implement the simplified page and client upload flow.
- [ ] Verify GREEN.
- [ ] Commit.

### Task 5: Boot OS OTA v2 contract

**Files in supplied fix129 pack:**
- Modify: `sysres/update_config.json`
- Modify: `main/dr_update_manifest.hpp`
- Modify: `main/dr_update_manifest.cpp`
- Modify: `main/dr_ota_update.hpp`
- Modify: `main/dr_ota_update.cpp`
- Modify: `main/dr_boot_ui.cpp`
- Modify: `game_fw/CMakeLists.txt`
- Modify: `VERSION.txt`
- Create: `tools/validate_ota_v2_contract.py`

**Interfaces:**
- Consumes: Task 3 device JSON contract.
- Produces current-version check, update confirmation, Game+Assets download/verify and unchanged A/B install.

- [ ] Write static validator asserting v1.1.129, v2 URL, no release_seq/RSA/device registry fields in OTA request/offer and explicit confirmation state.
- [ ] Verify RED.
- [ ] Implement v2 offer parser and check/confirm/download flow.
- [ ] Verify validator GREEN.
- [ ] Run existing partition and Phase 3/4/5 validators.
- [ ] Commit overlay state locally.

### Task 6: VGI pack builder and Boot installer

**Files in supplied fix129 pack:**
- Create: `main/dr_asset_pack.hpp`
- Create: `main/dr_asset_pack.cpp`
- Modify: `main/CMakeLists.txt`
- Create: `tools/dr_make_vgi_pack.py`
- Create: `tools/validate_vgi_pack.py`
- Create: `docs/OTA_VGI_PACK_V1.md`
- Modify: `main/dr_ota_update.cpp`

**Interfaces:**
- Consumes: Task 5 Assets offer fields.
- Produces streaming DRVGP001 parser/install.md executor and pack creation tool.

- [ ] Write Python pack round-trip/path-traversal tests and static C++ integration validator.
- [ ] Verify RED.
- [ ] Implement pack writer and Boot installer with per-entry SHA-256 and `.part` rename.
- [ ] Verify GREEN.
- [ ] Run firmware static validators.
- [ ] Commit overlay state locally.

### Task 7: Full verification and handoff

**Files:**
- Update backend docs for v2 endpoints/admin workflow.
- Create overwrite ZIP containing only modified/added firmware files.

- [ ] Run full backend test suite and build on branch.
- [ ] Run Cloudflare preview build/canary without merging production.
- [ ] Run all relevant firmware host/static validators and pack round-trip tests.
- [ ] Diff firmware overlay against original fix129 and confirm only intended files changed.
- [ ] Create overwrite ZIP and SHA-256.
- [ ] Review the whole backend branch against this plan.
- [ ] Present branch integration options; do not merge without the user's choice.
