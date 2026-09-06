# CMS M2.1C — Implementation Task Breakdown

Status: implementation-ready
Base: `main` @ `d2d8583b1a227e30f15d32fc555200f953bc05fd`
Target milestone: `2.1.1` or `2.1C`

## 0. Objective

Replace the current raw key/value editor with a proper CMS workspace that is easy to use, supports richer customization, and treats image/media as a first-class field.

M2.1C must preserve the existing M2.1 D1/R2 architecture and current public routes while improving the admin experience.

Core outcomes:

- Admin shell with persistent navigation.
- Page list instead of a single dropdown-only form.
- Dedicated page editor route.
- Section-oriented editing UI.
- Separate Global Content screen.
- Media Library backed by existing R2 + D1 media metadata.
- Media Picker usable inside page/global fields.
- Upload new images or select existing R2 assets.
- Draft / Publish / Revision behavior retained.
- No internal keys such as `items.0`, `nav.home`, `footer.tagline` shown to normal users.

---

# 1. Guardrails — do not break current production

## Existing production resources

- D1 binding: `DB` → `retroguyvn-db`
- R2 binding: `MEDIA` → `retroguyvn-media`
- Durable Object: `CMS` retained as legacy/fallback source
- Assets binding: `ASSETS`
- Admin auth: Cloudflare Access when configured, token fallback remains supported

## Existing data to preserve

- `pages`
- `page_revisions`
- `global_settings`
- `media_nodes`
- `media_usage`
- `cms_meta`
- `audit_logs` if already present

Do not replace these with a second competing page system. M2.1C should extend current page/revision tables and normalize the JSON payloads.

## Public routes that must remain unchanged

- `/`
- `/digital-realm`
- `/features`
- `/gallery`
- `/news`
- `/download`
- `/support`

`/news` remains static until M2.2 Developer Log.

---

# 2. Recommended delivery sequence

Implement as five small sub-milestones instead of one monolithic change.

## M2.1C-A — Admin Shell + Page List

Goal: remove the current “single giant form” experience.

### Files to add

- `src/components/admin/AdminShell.astro`
- `src/components/admin/AdminSidebar.astro`
- `src/components/admin/AdminTopbar.astro`
- `src/components/admin/StatusBadge.astro`
- `src/styles/admin.css`
- `src/pages/admin/pages/index.astro`

### Files to modify

- `src/pages/admin/pages.astro`
  - temporarily redirect to `/admin/pages/` or retain as compatibility route
- `src/pages/admin/index.astro`
  - add navigation entry to Pages / Media / Global / System
- `src/pages/admin/system.astro`
  - wrap with shared shell when practical

### UI tasks

- [ ] Left sidebar with: Dashboard, Homepage, Pages, Global Content, Media Library, Developer Log, System.
- [ ] Sidebar current-route highlight.
- [ ] Responsive collapse for widths < 900 px.
- [ ] Topbar with page title, environment/status, logout/session action.
- [ ] Page list cards or table with:
  - Page title
  - Route
  - Draft version
  - Published version
  - Unpublished changes badge
  - Last updated
  - Edit
  - Preview
- [ ] Search/filter pages by title/slug.
- [ ] Empty/loading/error states.

### API usage

Reuse existing:

- `GET /api/admin/pages`

Do not add duplicate page-list endpoint unless current response lacks required metadata.

### Acceptance

- [ ] `/admin/pages/` loads with current token/session.
- [ ] No raw JSON keys displayed.
- [ ] All five M2.1 pages visible.
- [ ] Clicking Edit navigates to `/admin/pages/<slug>`.

---

# 3. M2.1C-B — Dedicated Page Editor

Goal: one page per editor screen with a structured, section-oriented UI.

## Files to add

- `src/pages/admin/pages/[slug].astro`
- `src/components/admin/PageEditor.astro`
- `src/components/admin/SectionList.astro`
- `src/components/admin/SectionEditor.astro`
- `src/components/admin/PreviewPanel.astro`
- `src/components/admin/form/TextField.astro`
- `src/components/admin/form/TextareaField.astro`
- `src/components/admin/form/ToggleField.astro`
- `src/components/admin/form/SelectField.astro`
- `src/components/admin/form/RepeaterField.astro`
- `src/components/admin/form/MediaField.astro`

If Astro-only components become too cumbersome for dynamic interactions, use a small client-side JS module under `src/scripts/admin/` rather than adding a heavy framework immediately.

## Files to modify

- `src/cms/m2-pages.js`
- `src/worker.js`

## Data model strategy

Do not create replacement columns like `draft_json` and `published_json` in `pages` because the current revision-pointer model is already sound.

Continue using:

- `pages.draft_revision_id`
- `pages.published_revision_id`
- immutable `page_revisions`

Upgrade only the `content_json` shape.

## New normalized page document

Each page should eventually converge to:

```json
{
  "schemaVersion": 2,
  "seo": {
    "title": "...",
    "description": "...",
    "ogImage": null
  },
  "appearance": {
    "theme": "default",
    "accent": "default"
  },
  "sections": [
    {
      "id": "hero_xxx",
      "type": "hero",
      "label": "Hero",
      "enabled": true,
      "order": 10,
      "data": {}
    }
  ]
}
```

## Compatibility layer

Add to `src/cms/m2-pages.js`:

- `normalizePageDocument(slug, content)`
- `normalizeSection(section)`
- `defaultSectionsForSlug(slug)`

Rules:

- Old M2.1 flat content must render exactly as before.
- If `schemaVersion !== 2`, convert on read for editor usage.
- Do not mutate published DB rows merely by reading them.
- First Save Draft after normalization creates a new revision in schema v2.
- Published content changes only after Publish.

## Initial section mapping

### Digital Realm

- Hero
- Showcase / Image + Text
- Three-card grid

### Features

- Hero
- Feature grid
- Roadmap notice

### Media

- Hero
- Media gallery

### Download

- Hero
- Status notice
- Download/resource list

### Support

- Hero
- Support card grid

## Editor interactions

- [ ] Left section list.
- [ ] Click section → edit fields in center panel.
- [ ] Enable/disable section toggle.
- [ ] Move up/down buttons for v1; drag-and-drop can wait.
- [ ] Duplicate section when type supports repetition.
- [ ] Delete section with confirmation.
- [ ] Add Section modal/menu.
- [ ] Save Draft persists current document.
- [ ] Publish publishes the current draft revision.
- [ ] Unsaved-changes indicator.
- [ ] Navigation-away warning when dirty.

## Preview

M2.1C minimum:

- [ ] Right panel with simplified representation of current draft section.
- [ ] Desktop / tablet / mobile width toggles.
- [ ] “Open public page” button.

Do not block M2.1C waiting for a perfect full iframe draft preview URL.

## Acceptance

- [ ] Existing pages still public-render correctly before any edits.
- [ ] Saving a page produces a new immutable revision.
- [ ] Public page does not change after Save Draft.
- [ ] Public page changes only after Publish.
- [ ] Reopening editor loads latest draft revision.

---

# 4. M2.1C-C — Global Content Editor

Goal: move navigation/footer/SEO out of the page dropdown.

## Files to add

- `src/pages/admin/global.astro`
- `src/components/admin/GlobalEditor.astro`

## Files to modify

- `src/cms/m2-pages.js`
- `src/layouts/BaseLayout.astro`
- `src/worker.js`

## Global content groups

### Brand

- Brand text
- Logo media field
- Favicon media field or URL
- Default OG image media field

### Navigation

Convert fixed labels into repeatable nav items:

```json
{
  "id": "nav_features",
  "label": "FEATURES",
  "href": "/features",
  "visible": true,
  "newTab": false
}
```

Tasks:

- [ ] Add item
- [ ] Remove item
- [ ] Reorder up/down
- [ ] Toggle visibility
- [ ] Edit label/link

### Footer

- Brand
- Tagline
- Repeatable footer links
- Copyright text/template

### SEO

- Default title
- Default description
- Default OG image
- Theme color

## Storage

Continue using existing keys:

- `site:draft`
- `site:published`
- `site:revision`

Normalize old M2.1 global object on read. Save normalized object back only on Save Draft.

## Acceptance

- [ ] Global editor has its own route.
- [ ] No raw keys exposed.
- [ ] Save Draft / Publish behavior identical to page editor.
- [ ] Published nav/footer remains unchanged until Publish.

---

# 5. M2.1C-D — Media Library + R2 Picker

Goal: upload images and select existing images already stored in R2.

This is the most important extension requested in M2.1C.

## Reuse existing M2 storage

Current storage design already has:

- R2 bytes in `MEDIA`
- D1 metadata in `media_nodes`
- stable public `/media/<id>` URLs

Do not expose raw R2 object keys as page content URLs.

Pages should store `mediaId` where possible and derive the stable public URL.

## Files to add

- `src/pages/admin/media.astro`
- `src/components/admin/media/MediaLibrary.astro`
- `src/components/admin/media/MediaGrid.astro`
- `src/components/admin/media/MediaPickerModal.astro`
- `src/components/admin/media/MediaUploadDropzone.astro`
- `src/components/admin/media/MediaInspector.astro`
- `src/components/admin/media/MediaBreadcrumb.astro`
- `src/components/admin/media/FolderTree.astro`
- `src/scripts/admin/media-picker.js`

## Files to modify

- `src/cms/m2-core.js`
- `src/worker.js`
- `src/components/admin/form/MediaField.astro`

## Required media field UX

Every image-capable field must provide:

1. **Upload new**
2. **Choose from Media Library**
3. **Paste URL**

Display:

- Current preview
- File name / source
- Replace
- Remove
- Alt text
- Caption where relevant

## Media API — minimum

Existing endpoints can be retained where compatible.

Required behaviors:

### `GET /api/admin/media`

Support optional query parameters:

- `folder`
- `q`
- `sort`
- `limit`
- `cursor`

Response should include:

- id
- name
- type
- size
- createdAt
- url
- parentId/folder metadata when available
- usage summary

### `POST /api/admin/media`

Upload image to R2 and insert D1 metadata.

Requirements:

- image MIME validation
- max file size 10 MB for M2.1C
- safe generated storage key
- stable media id
- transactional-ish failure cleanup where practical

### `PATCH /api/admin/media/:id`

Update metadata only:

- display name
- alt text
- caption
- parent folder

### `DELETE /api/admin/media/:id`

For M2.1C:

- refuse hard delete if media is used by published content
- allow soft-delete/trash only if implemented safely
- full Drive-like Trash flow can remain M2.3

## Selecting existing R2 files

Important: “Choose from R2” should mean choose from D1-indexed `media_nodes` that point at R2 objects, not listing opaque bucket keys directly in the page editor.

If bucket contains unindexed objects, add a separate future “Import orphaned R2 objects” admin utility rather than mixing them into normal page selection.

## Folder support

M2.1C minimum:

- root
- logical folders using `media_nodes.parent_id`
- create folder
- open folder
- move item to folder

Advanced copy/cut/trash remains M2.3.

## Acceptance

- [ ] Upload from a page MediaField works.
- [ ] Uploaded image appears in Media Library.
- [ ] Select existing image from Media Library works.
- [ ] Selected media survives Save Draft / reload.
- [ ] Published page serves selected image through `/media/<id>`.
- [ ] R2 object is not duplicated when merely selecting it.

---

# 6. M2.1C-E — Revision UI + Validation + Polish

## Revision UI

Add:

- `src/components/admin/RevisionDrawer.astro`

Need API extension if current page bundle does not return enough history:

- `GET /api/admin/pages/:slug/revisions?limit=20`
- `POST /api/admin/pages/:slug/restore/:revisionId`

Restore behavior:

- never overwrite an old revision
- copy old content into a new draft revision
- public content unchanged until Publish

## Validation

Create:

- `src/cms/validators.js`

Rules:

- SEO title <= 120 chars
- SEO description <= 300 chars
- button label <= 40 chars
- href must be `/relative`, `https://`, `mailto:`, or `tel:`
- section ids unique within page
- unsupported section type rejected
- media id must resolve when required

Server-side validation is mandatory. Client validation is only UX assistance.

## UX polish

- [ ] Toast for success/error.
- [ ] Confirm destructive actions.
- [ ] Skeleton loading states.
- [ ] Empty states.
- [ ] Sticky Save/Publish bar.
- [ ] “Draft changed” badge.
- [ ] “Published” badge.
- [ ] Keyboard shortcut: Ctrl/Cmd+S → Save Draft.
- [ ] Responsive behavior.
- [ ] Good label spacing and readable input widths.

---

# 7. Exact file-level change map

## `src/cms/m2-pages.js`

Primary responsibilities after M2.1C:

- page definitions/defaults
- normalize old flat documents
- structured section schema
- save draft revision
- publish draft revision
- revision listing
- restore old revision to new draft
- global normalization
- audit events

Do not put UI-specific field labels in this file beyond schema metadata needed by API.

## `src/cms/m2-core.js`

Extend media operations only:

- paginated media list
- metadata update
- folder operations
- usage lookup helpers

Keep legacy migration logic isolated.

## `src/worker.js`

Add/extend admin routes:

- page revisions
- restore revision
- media metadata patch
- folder operations if included

Keep auth centralized before all `/api/admin/*` actions.

## `src/worker-entry.js`

Do not add M2.1C product logic here.

Keep it focused on:

- D1 schema compatibility shim
- M2 legacy bootstrap/migration
- forwarding to base worker

## `src/layouts/BaseLayout.astro`

Use stable `data-cms` markers only where Worker rewrites are still necessary.

Avoid coupling the layout to the admin implementation.

## `src/pages/admin/pages.astro`

Retire the current giant dynamic form.

Preferred behavior after M2.1C:

- redirect to `/admin/pages/`

## `src/pages/admin/pages/index.astro`

Page listing UI only.

## `src/pages/admin/pages/[slug].astro`

Dedicated editor screen.

## `src/pages/admin/global.astro`

Dedicated global editor.

## `src/pages/admin/media.astro`

Basic R2-backed media manager.

## `src/styles/admin.css`

Centralize all admin visual tokens and reusable layout styles.

Do not keep another giant `<style>` block per admin page.

---

# 8. Suggested admin design tokens

```css
:root {
  --admin-bg: #07111d;
  --admin-surface: #0e1a2a;
  --admin-surface-2: #132238;
  --admin-line: #273b57;
  --admin-text: #f4f7fb;
  --admin-muted: #94a7bf;
  --admin-primary: #e74b3c;
  --admin-success: #2f9f68;
  --admin-warning: #e0a932;
  --admin-danger: #c84848;
  --admin-radius: 12px;
}
```

Keep public-site styling and admin styling separated.

---

# 9. API compatibility rules

Current M2.1 clients may still call:

- `GET /api/admin/pages`
- `GET /api/admin/pages/:slug`
- `PUT /api/admin/pages/:slug`
- `POST /api/admin/pages/:slug/publish`
- global endpoints currently implemented

M2.1C should either retain these routes or introduce new routes while keeping old routes as thin compatibility wrappers until the new admin is confirmed in production.

Do not break existing Homepage CMS endpoints in this milestone.

---

# 10. Deployment/versioning

Every delivered fix/milestone increments version.

Recommended sequence:

- `2.1.1` — Admin shell + pages list
- `2.1.2` — page editor + normalized sections
- `2.1.3` — global editor
- `2.1.4` — media picker + R2 library
- `2.1.5` — revision restore + polish

Or ship as one final `2.2.0` only if all phases are implemented and tested together; smaller increments are safer.

For every release also update:

- `package.json`
- `scripts/patch-generated-wrangler.mjs` fingerprint
- `public/deploy-marker.txt`

---

# 11. Test matrix

## Authentication

- [ ] token login
- [ ] authenticated refresh
- [ ] unauthorized API returns 401

## Page editing

- [ ] load each page
- [ ] modify text
- [ ] modify repeated item
- [ ] disable section
- [ ] reorder section
- [ ] save draft
- [ ] reload draft
- [ ] confirm public unchanged
- [ ] publish
- [ ] confirm public changed

## Global

- [ ] nav label update
- [ ] footer update
- [ ] SEO defaults update
- [ ] draft does not affect public
- [ ] publish affects public

## Media

- [ ] upload JPG
- [ ] upload PNG
- [ ] upload WebP
- [ ] reject unsupported MIME
- [ ] reject oversize
- [ ] select existing R2-backed media
- [ ] reuse same media in multiple fields
- [ ] usage shown
- [ ] protected delete rejected

## Revision

- [ ] list revisions
- [ ] restore old revision to new draft
- [ ] public unchanged until publish

## Regression

- [ ] homepage M1/M2 editor still works
- [ ] `/admin/system` still works
- [ ] D1/R2 status remains active
- [ ] `/media/:id` still streams existing media
- [ ] all public routes return 200

---

# 12. Definition of Done

M2.1C is complete only when all of the following are true:

1. The screenshots that motivated this redesign are no longer representative of the UI; forms are readable, grouped and intentional.
2. Pages are edited from dedicated routes, not one dropdown with raw keys.
3. Global content is edited separately.
4. Image fields support upload + choose existing R2-backed media + URL fallback.
5. Media Library displays existing indexed R2 assets.
6. Draft and Publish remain separate.
7. Revision history can restore an old version without destroying history.
8. Current public site remains compatible during migration.
9. Existing media IDs and URLs remain valid.
10. Cloudflare production deploy passes with explicit DB/R2 bindings.

---

# 13. Recommended first coding PR

Start with **M2.1C-A + MediaField foundation**, not the entire milestone.

PR scope:

- shared AdminShell
- sidebar/topbar
- `/admin/pages/` list
- `/admin/pages/[slug]` route scaffold
- `admin.css`
- reusable `MediaField` visual component with disabled picker placeholder
- no database migration yet

This creates the new UX shell safely before changing document schemas or media APIs.

Second PR then introduces `schemaVersion: 2` normalization and section editing.
