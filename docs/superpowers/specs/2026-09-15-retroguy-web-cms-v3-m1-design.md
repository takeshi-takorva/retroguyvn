# RetroGuy Web CMS v3 — M1 Design

## Goal

Restructure the public site and CMS foundation around five clear destinations while preserving the current homepage visual concept and existing News/OTA functionality.

## Public information architecture

Canonical public navigation:

- `/` — HOME: product-first landing page and featured product showcase.
- `/product` — PRODUCT: product catalogue landing page. M1 ships the page shell and design contract; product data/detail CMS is M2.
- `/news` — NEWS: public announcements such as product releases, software/firmware releases, features, events, collaborations, and company/community updates.
- `/support` — SUPPORT: public support landing page. M1 ships the page shell and FAQ/contact layout contract; managed FAQ, inbox, tickets, and email reply are M4.
- `/devlog` — DEV LOG: development-journal listing, visually distinct from News but intended to share the post engine in M3.

The primary navigation must contain only HOME, PRODUCT, NEWS, SUPPORT, DEV LOG.

## Legacy routes

Legacy public destinations remain reachable only through redirects so old links do not break:

- `/digital-realm` → `/`
- `/features` → `/`
- `/download` → `/support`
- `/gallery` → `/product`
- `/Support` → `/support`

Homepage anchors `#experience`, `#features`, and `#hardware` may remain in markup for backward compatibility, but must not appear in the primary navigation.

## Shared design system

All public pages use one navigation definition and one shared header/footer implementation. Homepage may retain its current bespoke marketing visual language and product sections, but its site-level navigation and footer must be sourced from the same shared components/configuration used by internal pages.

Navigation labels and URLs must not be duplicated in page-local arrays.

## M1 page contracts

### Home

Preserve the current product-focused homepage visual concept and content sections. Remove shortcut navigation entries for Experience, Features, Hardware, Digital Realm, and Download. Add the canonical five-item navigation.

### Product

Create `/product` with a catalogue-ready layout compatible with the existing RetroGuy visual system. M1 may show the current DR Portal as the featured/initial product using existing product imagery and copy; data persistence and `/product/[slug]` are deferred to M2.

Required visual regions:

1. Product page hero.
2. Featured product block.
3. Catalogue grid container ready for multiple products.
4. Calls to action that can link back to the homepage showcase and future product detail pages.

### News

Keep the current News CMS and `/news` behaviour from News M1.1. Public naming remains `NEWS`; it must no longer be described as Dev Log.

### Support

Replace the current placeholder Support page with a production-ready static shell consisting of:

1. Hero/search presentation.
2. FAQ category/accordion examples.
3. Contact form presentation with Name, Email, Topic, Message, Send Question.
4. Explicit non-submitting M1 behaviour until M4 ticket storage/API exists; the page must not falsely claim a support ticket was sent.

### Dev Log

Create `/devlog` as a development-journal page shell with category vocabulary suitable for HARDWARE, SOFTWARE, GAME, DESIGN, PROTOTYPE, MANUFACTURING. M1 does not duplicate the News backend. It presents the frontend contract to be wired to the shared post engine in M3.

## CMS core boundary

M1 does not build a generic page builder yet. It establishes the contracts required for the later Hybrid CMS:

- shared public navigation/site shell;
- shared media library remains the existing source of site media;
- Homepage CMS remains operational and must not lose existing editable fields;
- News CMS remains operational and must not lose revisions, publishing, media, pagination, or editable publish datetime;
- Product structured CMS is M2;
- News/Devlog unified post model is M3;
- Support FAQ/ticket/email system is M4;
- advanced layout block builder is M5.

## Non-goals for M1

- No product database or `/product/[slug]`.
- No Dev Log database or publishing editor.
- No Support database, ticket inbox, or outbound email.
- No deletion of News APIs or migrations.
- No redesign of the current homepage body content.
- No OTA changes.

## Acceptance criteria

1. Primary navigation is identical across the public site and contains only HOME, PRODUCT, NEWS, SUPPORT, DEV LOG.
2. `/product` and `/devlog` resolve successfully.
3. `/support` shows FAQ and contact-form UI without pretending to submit.
4. Legacy routes redirect to canonical destinations.
5. Homepage product body remains visually/content-wise intact apart from shared site navigation/footer integration.
6. Existing `/news`, `/news/[slug]`, admin News and Homepage CMS continue to compile.
7. Existing automated tests pass and M1 regression tests cover sitemap, canonical navigation, redirects, and new page shells.
8. Astro/Cloudflare production dry-run build succeeds with the compiled Astro Worker entrypoint preserved.
