# RetroGuy Web CMS v3 M1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the public site shell around HOME, PRODUCT, NEWS, SUPPORT and DEV LOG while preserving the current homepage body and existing News/Home CMS functionality.

**Architecture:** Introduce a single shared navigation model plus reusable public header/footer components, then wire internal pages and the bespoke homepage shell to those components. Add static M1 page shells for Product and Dev Log, upgrade Support UI without backend submission, and convert deprecated public routes into server redirects.

**Tech Stack:** Astro 7, `@astrojs/cloudflare`, Cloudflare Workers, existing CSS/CMS/News modules, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-15-retroguy-web-cms-v3-m1-design.md`

## Global Constraints

- Canonical navigation is exactly HOME, PRODUCT, NEWS, SUPPORT, DEV LOG.
- Keep `/news` and current News CMS/API behaviour unchanged.
- Preserve current homepage marketing body and existing Homepage CMS fields.
- Do not implement product persistence, Dev Log persistence, Support ticket persistence/email, or OTA changes in M1.
- Legacy routes redirect instead of returning 404.
- Production build must keep Astro compiled `entry.mjs` as the deployment main.

---

### Task 1: Lock sitemap and shared navigation contracts with regression tests

**Files:**
- Create: `test/site/m1-navigation.test.js`
- Create: `src/site/navigation.js`

**Interfaces:**
- Produces: `PUBLIC_NAV` as an immutable array of `{ href, label }` records.
- Consumed by: shared header/footer and homepage navigation.

- [ ] **Step 1: Write failing tests** asserting `PUBLIC_NAV` contains exactly five canonical entries and public page source does not expose legacy shortcut navigation.
- [ ] **Step 2: Run `npm test`** and confirm failure because `src/site/navigation.js` does not exist.
- [ ] **Step 3: Implement `PUBLIC_NAV`** with `/`, `/product`, `/news`, `/support`, `/devlog`.
- [ ] **Step 4: Run tests** and confirm navigation-contract tests pass.
- [ ] **Step 5: Commit** `test: lock Web CMS v3 M1 navigation contract`.

### Task 2: Add shared SiteHeader and SiteFooter

**Files:**
- Create: `src/components/SiteHeader.astro`
- Create: `src/components/SiteFooter.astro`
- Modify: `src/layouts/BaseLayout.astro`
- Test: `test/site/m1-navigation.test.js`

**Interfaces:**
- Consumes: `PUBLIC_NAV` from `src/site/navigation.js`.
- Produces: reusable public header/footer used by BaseLayout and homepage.

- [ ] **Step 1: Extend tests** to assert BaseLayout imports the shared components and no longer declares a local navigation array.
- [ ] **Step 2: Run tests** and verify RED.
- [ ] **Step 3: Implement shared header/footer** preserving current BaseLayout behaviour and active-route styling.
- [ ] **Step 4: Update BaseLayout** to render the shared components.
- [ ] **Step 5: Run tests** and verify GREEN.
- [ ] **Step 6: Commit** `refactor: centralize public site navigation`.

### Task 3: Integrate homepage with canonical navigation while preserving its body

**Files:**
- Modify: `src/pages/index.astro`
- Test: `test/site/m1-navigation.test.js`

**Interfaces:**
- Consumes: shared `SiteHeader`/`SiteFooter` or `PUBLIC_NAV` without duplicating labels/URLs.
- Preserves: all existing homepage marketing sections and CMS data bindings.

- [ ] **Step 1: Add regression assertions** that Home contains PRODUCT, NEWS, SUPPORT, DEV LOG links and does not render Experience/Features/Hardware/Digital Realm/Download in primary navigation.
- [ ] **Step 2: Run tests** and verify RED against current homepage navigation.
- [ ] **Step 3: Replace only site-level homepage header/footer wiring**, leaving marketing section markup, IDs, copy, images and CMS bindings intact.
- [ ] **Step 4: Run tests and Astro build**.
- [ ] **Step 5: Commit** `refactor: align homepage with canonical site shell`.

### Task 4: Add Product and Dev Log public page shells

**Files:**
- Create: `src/pages/product.astro`
- Create: `src/pages/devlog.astro`
- Test: `test/site/m1-pages.test.js`

**Interfaces:**
- Product M1 page uses existing product assets and BaseLayout; no database dependency.
- Dev Log M1 page exposes frontend taxonomy contract only; no News API reuse yet.

- [ ] **Step 1: Write failing tests** asserting both routes/pages exist, Product includes featured/catalogue structures, and Dev Log includes development category vocabulary.
- [ ] **Step 2: Run tests** and verify RED.
- [ ] **Step 3: Implement `/product`** with hero, DR Portal featured block and responsive catalogue-ready grid.
- [ ] **Step 4: Implement `/devlog`** with development-journal hero, taxonomy chips and empty-state/preview content clearly marked as frontend shell rather than published posts.
- [ ] **Step 5: Run tests** and verify GREEN.
- [ ] **Step 6: Commit** `feat: add Product and Dev Log page shells`.

### Task 5: Upgrade Support frontend without false submission

**Files:**
- Modify: `src/pages/support.astro`
- Test: `test/site/m1-pages.test.js`

**Interfaces:**
- Produces FAQ accordion/search presentation and contact form fields `name`, `email`, `topic`, `message`.
- Does not call a ticket API in M1.

- [ ] **Step 1: Add failing assertions** for FAQ categories and required contact fields.
- [ ] **Step 2: Run tests** and verify RED.
- [ ] **Step 3: Implement Support UI** with FAQ accordion and contact form whose submit handler prevents network submission and clearly reports that direct ticket submission is not yet active.
- [ ] **Step 4: Run tests** and verify GREEN.
- [ ] **Step 5: Commit** `feat: add Support FAQ and contact shell`.

### Task 6: Redirect deprecated public routes

**Files:**
- Replace: `src/pages/digital-realm.astro`
- Replace: `src/pages/features.astro`
- Replace: `src/pages/download.astro`
- Replace: `src/pages/gallery.astro`
- Create or route: `/Support` → `/support`
- Test: `test/site/m1-redirects.test.js`

**Interfaces:**
- Redirect targets: `/digital-realm`→`/`, `/features`→`/`, `/download`→`/support`, `/gallery`→`/product`, `/Support`→`/support`.

- [ ] **Step 1: Write failing redirect source tests** verifying every legacy route uses a permanent redirect target.
- [ ] **Step 2: Run tests** and verify RED.
- [ ] **Step 3: Implement Astro server redirects** without deleting the legacy route files outright.
- [ ] **Step 4: Run tests and build**.
- [ ] **Step 5: Commit** `feat: redirect legacy public routes`.

### Task 7: Full verification and merge readiness

**Files:**
- Modify tests only if verification exposes a genuine uncovered regression.

**Interfaces:** None new.

- [ ] **Step 1: Run `npm test`**; expected 0 failures.
- [ ] **Step 2: Run `npm run build`**; expected Astro build + Wrangler dry-run success and production main preserved as `entry.mjs`.
- [ ] **Step 3: Review PR diff** against the design spec: no M2/M3/M4 scope creep and no News/OTA regression.
- [ ] **Step 4: Open PR to `main`**, wait for GitHub Actions tests/build to pass, then squash merge.
- [ ] **Step 5: Verify merged `main` SHA** and report deployment/runtime verification as a separate production step.
