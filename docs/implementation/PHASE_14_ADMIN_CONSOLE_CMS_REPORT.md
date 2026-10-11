# Phase 14 — Angular Admin Console, CMS & Platform Administration: Implementation Report

Branch `phase-14/admin-console-cms`. Specification: [ADR-029](../architecture/ADR-029-angular-admin-console-cms-platform-administration.md) and the [Phase 14 prompt](PHASE_14_ADMIN_CONSOLE_CMS_PROMPT.md).

## Revisions

- Starting SHA: `363c381` (branch head at start; based on `main@8efa8cf`, the Phase 13 merge). `main` had not advanced.
- Branch: `phase-14/admin-console-cms`. Ending SHA and CI run: see "CI" at the end.
- Implementation commits, in order:
  - `8122aab` Gate A — Admin session, CSRF, Admin API foundation, Angular Admin core, shell and sign-in
  - Gates B and C — CMS and platform services, Admin API routes, EJS routes moved onto the services, Angular screens
  - Gate D — OpenAPI, browser journey and harness, CI build step, documentation
  - this report

Gates B and C share one commit because the legacy router (`server/routes/admin/index.js`) carries both gates' service
extractions; splitting it would have left an intermediate commit that did not load. Each gate was green before the next began.

## Production changes

**None.** No merge to `main`, no deploy, no nginx change, no production index or migration, no EJS route removed, and
`admin.immigrationhorizons.com` still serves the EJS console.

### One incident to know about

While Gate C was being wired, an import (`services/integrationStatus.js` → `workers/calendarReminderWorker.js`) pulled in a
module that calls `dotenv.config()` when required. For a few minutes, test processes started in that window loaded
`server/.env`, which pointed their **session store** (not Mongoose — the test database helper never reads `MONGODB_URI`) at
the production cluster. The evidence is that nothing got through: every session-store operation those processes logged
failed at the TLS handshake (59 log lines), the affected tests failed precisely because no session could be stored, and
the same handshake was refused again from this machine minutes later. No mail-sending code runs in those suites. The
production database itself was not inspected to confirm — connecting to it is exactly what must not happen — so if you
want certainty, check the `sessions` collection for entries created between about 23:25 and 23:40 UTC on 2026-10-10. The import was
removed, the suites were re-run clean, and `admin-api-auth.integration.test.js` now fails if the web app ever loads
`dotenv` on its own.

## Admin API mount ordering

```text
parsers / static
/api/v1            Staff API — EmployeeSession only, OUTSIDE express-session   (unchanged)
express-session
/api/v1/admin      Admin API — CMS session, live AdminUser re-read, own CSRF   (new)
csrfProtection     legacy EJS synchroniser token                               (unchanged)
/admin/*           legacy EJS routes                                           (kept)
```

The Staff API was not moved. `admin-api-auth.integration.test.js` proves a Staff session is not an Admin identity, a CMS
session is not a Staff identity, and Client/Staff cookies presented to the Admin API are nothing. An unparseable body or
an unknown `/api/v1/*` path now answers with the JSON envelope instead of the HTML error page.

## Authentication, session and CSRF decisions

- **One authentication service** (`server/services/adminAuthentication.js`) for the EJS login and the Admin API: email
  normalization, lockout, deactivation, the `admin.cms.access` gate, counter updates and audit. A matched account that is
  refused never falls through to the break-glass credential.
- **DB-backed administrators only.** The environment break-glass credential is tried only by the EJS route, after the
  service reports no matching account. The Admin API refuses it at sign-in, and refuses an existing break-glass session
  on every protected route — without destroying that session, so the EJS recovery path keeps working.
- **Session:** the existing CMS `express-session` cookie (HttpOnly, SameSite=Lax, Secure in production). The session id is
  regenerated at sign-in; the response carries the new CSRF token. Nothing is stored in browser storage.
- **Live re-check:** every protected request re-reads the `AdminUser`. A deleted, deactivated or demoted account is refused
  and its session destroyed, which also ends it for the EJS console.
- **CSRF:** the same session token the EJS forms use, sent as `X-CSRF-Token`, plus a same-origin check (the request's
  `Host`, or `ADMIN_URL`). It applies to sign-in and every mutation. Multipart uploads are verified from the header
  *before* the file is parsed — stricter than the ADR's "after multer", and recorded as a deviation there.
- **Generic refusals:** unknown email, wrong password, locked, inactive, no CMS access and the break-glass credential all
  return the same 401 message.

## Endpoints (42 operations, all documented in `server/openapi/v1.yaml`)

`session/bootstrap`, `session/login`, `session/logout`, `me`, `dashboard`; `blog` (list, create, get, patch, delete,
publish); `faqs` and `testimonials` (list, create, get, patch, delete); `media` (list, upload, alt, delete); `services`;
`seo` (list, get, put); `settings` (list, put by group); `integration-status`; `users` (list, create, get, patch, delete,
reset-credentials, revoke-sessions); `roles`; `security-events` (list, get). A script compared the documented operations
with the live router: 42 documented, 42 real, no difference either way.

## Service extractions (EJS and Admin API call the same code)

| Service | Used by EJS for | Notes |
|---|---|---|
| `services/adminAuthentication.js` | login | break-glass fallback stays in the route |
| `services/cms/blog.js` | create, update, delete, toggle publish | slug rules, publish date, sanitizer |
| `services/cms/faqs.js` | create, update, delete | service targeting validated |
| `services/cms/testimonials.js` | create, update, delete | rating and verification URL validated |
| `services/cms/media.js` | upload record, alt text, delete | delete consistency (below) |
| `services/cms/seo.js` | page registry, edit form, save | registered pages only |
| `services/cms/settings.js` | save | key allowlist |
| `services/adminUserManagement.js` | create, update, reset, delete | ADR-016 rules |
| `services/cms/dashboard.js`, `services/integrationStatus.js`, `services/securityEventViewer.js` | — | Admin API only |

EJS list/read pages still query the models directly; only mutations and rules were extracted.

### Behaviour that changed in the EJS console as a result

These are deliberate, so both consoles agree; each is covered by a test.

- Blog content is sanitized when saved. A new or changed slug must be URL-safe (an existing odd slug can still be re-saved).
  Toggling a post to published stamps a publish date if it had none.
- Testimonial verification links must be http(s) URLs. FAQ service targeting must name a real service.
- SEO saves need `seo.manage` (same roles as before), validate URLs/robots/schema type, set the page type from the
  registry (it was always stored as `static`), and no longer create records for unregistered references.
- Settings saves accept only registered keys. The form's own `_csrf` field is no longer stored as a setting. One existing
  test (`auth.integration`: "settings.manage … upserts") posted an unregistered key and was updated to a registered one.
- Account creation is audited as `admin_user_created` instead of `login_succeeded`; a credential reset as
  `admin_credentials_reset` instead of `password_reset_completed`.
- A media delete whose file cannot be removed keeps the record instead of deleting it.

## Blog sanitization decision

The public site already sanitized Blog HTML at render (`src/components/blog/blog-content.tsx`). Phase 14 adds the same
allowlist at save time for both consoles (`server/utils/blogHtml.js`, new server dependency `sanitize-html`, already used
by the Next app). Allowed: `p br h2 h3 h4 strong em b i ul ol li blockquote a img hr`, with `href/title/target/rel` on
links and `src/alt/title/width/height` on images; schemes http, https, mailto (images http/https or a site path). Tables
and code blocks are not allowed because the public renderer strips them. The two lists are pinned to
`docs/architecture/blog-schema-contract.json` and asserted from both applications. No existing post was rewritten: an edit
that does not touch `content` leaves it byte-for-byte as stored (tested).

## Modules implemented (Angular Admin Console, all on the real API)

Sign-in · Dashboard · Blog (list, editor) · FAQs · Testimonials · Media Library · Services · SEO (list, editor) ·
Settings · Integrations · Users (list, detail/create) · Roles · Security Events. No placeholder route, card or message
remains; the Phase 01 `ContentPlaceholder` and the purple theme are gone.

### Angular routes

`/login`, `/dashboard`, `/content/blog`, `/content/blog/new`, `/content/blog/:id`, `/content/faqs`,
`/content/testimonials`, `/content/media`, `/content/services`, `/content/seo`, `/content/seo/:pageRef`, `/settings`,
`/integrations`, `/users`, `/users/new`, `/users/:id`, `/roles`, `/security`. Everything except `/login` needs a
session; Settings/Integrations need `settings.manage`, Users/Roles `users.manage`, Security `security_events.view`
(navigation and route guards are convenience only — the API refuses regardless).

### UI primitives

Reused from the Staff application (presentation only, through `shared/staff-ui.ts`): confirm dialog, pagination, empty
state, error state, skeleton, icon, toast service, API error helpers. New for Admin: `ModalComponent` (labelled, focus
trap, Escape, focus return), `RichTextComponent`, `MediaPickerComponent`, `FileDropzoneComponent`, `CopyButtonComponent`,
the unsaved-changes guard and dialog, and global styles for page header, filter bar, form fields, tables (stacking to
labelled cards on phones), badges and dialogs. No new Angular dependency.

The Blog editor is a contenteditable surface with a formatting toolbar plus an "Edit HTML" mode; HTML stays the stored
format. It uses `document.execCommand` for formatting (deprecated by browsers but still supported) rather than adding an
editor library.

### Brand and accessibility

Navy sidebar, gold active marker and accents, white work surfaces, Inter with Source Serif 4 for the brand name and
sign-in heading, the real logo, the same icon set as Staff. Skip link, labelled navigation with `aria-current`, labelled
form fields with errors tied to their inputs, status always stated in words, dialogs with focus management, 40px+
controls, reduced-motion support, and tables that collapse on small screens.

## Capabilities added

- `security_events.view` — super_admin, admin.
- `seo.manage` — super_admin, admin, editor (names the access those roles already had).

Both are in `server/utils/permissions.js`, the generated Next mirror and `employee-capability-contract.json`.

## SecurityEvent types added

`admin_user_created`, `admin_user_updated`, `admin_user_deleted`, `admin_credentials_reset`,
`admin_staff_sessions_revoked`, `admin_content_mutated`, `admin_settings_updated` — in the server model, the Next mirror
and `security-event-contract.json`. Content events carry only `resourceType`, `resourceId`, `action`; settings events
carry the group and key names, never values.

## Media behaviour

Upload policy unchanged (png/jpg/jpeg/webp/gif by extension and MIME, 5 MB, sanitized filename, no SVG), answering in
JSON. The DTO returns the public `/uploads/...` path and safe metadata, never a filesystem path. Delete removes the file
first: a file already gone is fine; any other filesystem error keeps the record and returns `media_delete_failed`. The
stored filename is reduced to its basename before any filesystem call. Folders are shown as a read-only filter only
when more than one exists; there is no folder management because the model has none. Uploads still land on local disk.

## User credential lifecycle

Create and reset return `temporaryCredential.password` once, in that response only, marked `no-store`. Only the bcrypt
hash is stored. Tests confirm it is absent from every later GET, from the user list, and from every security event.
The console shows it in a dialog that a stray click cannot dismiss, then drops it from memory; it is never written to
browser storage. Preserved rules: only a Super Admin may create, change, reset or delete a Super Admin or grant that
role; the last active Super Admin cannot be demoted, disabled or deleted; nobody deletes their own account; deactivation,
a changed sign-in email and a reset revoke Staff sessions; a reset clears the lockout and forces password setup.

**Revoke sessions ends Staff application sessions only.** CMS sessions cannot be enumerated per user; they end on the
account's next request when it is deactivated or loses `admin.cms.access`. The UI and the API description say so.

## Roles and security viewer

Roles is a read-only reference built from `ROLE_LABELS` and `CAPABILITIES`; there is no route that changes a role.
Security Events is GET-only: filters for type, result, application, actor type, actor id, exact account email and a
date range (at most 400 days); newest first; page size capped at 100; paged by "has more" with a depth cap of 10,000
rows instead of a count. The DTO is an explicit allowlist: metadata is limited to keys registered per event type,
the address is masked (`203.0.113.x`), and the user agent is not returned.

## Indexes and migrations

No new collection, no new index, no migration. No index definition was changed. Admin lists are
server-paged and use the existing indexes.

## Public website compatibility

- **Blog:** verified in the browser run — a draft is a 404 on the public site; after publishing it is served with the
  edited title and body, and the script that was typed into it is absent.
- **FAQs, Testimonials, SEO, Settings, Media:** the public Next site does not read these collections today (its FAQs,
  testimonials and metadata are code-owned). The Admin Console manages them exactly as the EJS console did, but edits
  to them do not change the public site. This predates Phase 14; it is listed under limitations.
- **Media URLs:** uploaded files are still served with `Cross-Origin-Resource-Policy: cross-origin`.

## Local validation

All run on the final code, sequentially, against disposable in-memory databases.

| Check | Result |
|---|---|
| Root: `npm run lint` | clean |
| Root: `npx tsc --noEmit` | clean |
| Root: `npm test` | 459 / 459 |
| Root: `npm run build` (Next.js, `MONGODB_URI` blanked) | success |
| Server: `npm test` | 868 / 868 (805 before Phase 14) |
| Server: `npm run db:indexes:dry-run` | runs; no index definition changed |
| Angular Staff (`case-management`) tests | 283 / 283 |
| Angular Admin (`admin-console`) tests | 77 / 77 (1 placeholder test before) |
| `ng build case-management` + `verify-staff-build.js` | success, verifier OK |
| `ng build admin-console` | success, 425 kB initial (113 kB transfer), within budgets |
| Browser: `npm run test:e2e` | 16 / 16 (12 existing + 4 Admin Console) |
| `git diff --check` | clean |
| OpenAPI vs live Admin router | 42 documented = 42 real |

New server suites: `admin-api-auth` (15), `admin-api-blog` (11), `admin-api-content` (6), `admin-api-media` (6),
`admin-api-settings` (6), `admin-api-users` (12), `admin-api-security` (6), plus a shared DTO scanner
(`test/helpers/adminApi.js`) that plants sentinel secrets in the environment and fails if any response carries one, a
credential field, a bcrypt hash or a server path.

The browser journey covers: Super Admin sign-in; dashboard counts moving; Blog draft (404 on the public site), edit,
publish (served by the public site, typed script absent); FAQ create and edit; Testimonial with a refused
`javascript:` link; image upload, alt text and a refused SVG; SEO; a setting surviving a reload; employee creation
with the one-time credential, proof that no later response contains it, reset, session revocation; the security record;
the Staff/CMS identity boundary in both directions; sign-out. Then the editor's limits in UI and API, the operations
admin refused by the console but working in Staff, and the legacy EJS console (including break-glass) on the same data.

## Known limitations

- SEO, FAQ, Testimonial, Settings and Media records are not consumed by the public site (see above).
- CMS sessions cannot be revoked per user; they end by the live re-check only.
- Uploads are validated by extension and MIME type, not by file signature (unchanged policy), and stored on local disk.
- The Blog editor relies on `document.execCommand`. If a browser removes it, the "Edit HTML" mode still works.
- Publish dates are entered in the browser's local time zone; the EJS console uses the organisation time zone.
- The Admin Console is not packaged by the deploy tooling and no nginx route serves it. Its build expects to be served
  at `/` on the admin host, next to the EJS console at `/admin/*` (which is how the browser run serves it).
- Locally, `npm run build` must be run with `MONGODB_URI` blanked, because the root `.env` names the production
  database and Next prerendering would try to reach it. CI has no such variable.

## EJS rollback state

Every EJS route still exists and passes its tests, including login, the break-glass fallback, CSRF enumeration and the
Blog/FAQ/Testimonial/Media/SEO/Settings/Users forms. The Angular console and the EJS console share one CMS session, so
either can be used at any time and switching back needs no data change.

## Next step

A dedicated **Admin Console release gate**: package the build into a release directory, decide the nginx route
(canary path or host switch), run production smoke and rollback drills, and only then consider retiring EJS pages.
Separately worth deciding: whether the public site should start reading FAQs, testimonials and SEO metadata from the CMS.

## CI

The CI run for the final commit is reported in the hand-over message rather than here: recording it in this file would
itself create a new commit that needs its own run.
