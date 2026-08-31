# RetroGuy Admin M1.1

M1.1 adds two capabilities on top of Admin M1:

1. Cloudflare Access authentication, with the existing Admin Token kept as a fallback until Access is enabled.
2. Media Library for uploaded images: browse, preview, reuse and delete.

## Cloudflare Access one-time setup

The Worker verifies Cloudflare Access JWTs cryptographically. Your Cloudflare account still needs a Self-hosted Access application.

Protect these paths:

- `retroguyvn.com/admin*`
- `retroguyvn.com/api/admin*`

Create an Allow policy for the email address(es) that should manage the site.

Then add these values to the Worker as Cloudflare secrets/variables (do not commit real values to GitHub):

- `ACCESS_TEAM_DOMAIN` — for example `your-team.cloudflareaccess.com`
- `ACCESS_AUD` — the Application Audience (AUD) tag from the Access application
- `ADMIN_EMAILS` — optional comma-separated allowlist, for example `admin@example.com`

When `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` are present, `/admin` automatically recognizes a valid Access session. If Access is not configured yet, the M1 Admin Token still works.

## Media Library

Uploaded images remain stored in the CMS Durable Object for M1.1. The API exposes:

- `GET /api/admin/media` — list uploaded media and usage
- `POST /api/admin/media` — upload image
- `DELETE /api/admin/media/:id` — delete an image that is not referenced by draft or published content

The admin UI can assign an existing image to Hero, Experience, Product Family or Hardware without uploading it again.

M1.1 keeps the 5 MB upload limit from M1. A later M2 can move media storage to R2 without changing the CMS editing model.
