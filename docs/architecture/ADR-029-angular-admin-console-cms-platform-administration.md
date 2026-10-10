# ADR-029 — Angular Admin Console, CMS & Platform Administration

**Status:** Accepted for Phase 14 implementation  
**Date:** 2026-10-11  
**Branch:** `phase-14/admin-console-cms`  
**Baseline:** `main@8efa8cf6569f14bb052c968677f21b8cd07906be`

## Context

Phase 13 is merged and deployed. The production Staff application now covers case operations, documents, collaboration, forms, petitions, filing packets, USCIS tracking, calendar/reminders, global search and operational reporting.

The remaining major UI split is the administrative/CMS surface.

Today:

- `admin.immigrationhorizons.com` is an Express/EJS application;
- it already owns website content, SEO, media, settings and employee administration;
- it uses `AdminUser`, `express-session`, synchronizer-token CSRF, capability checks and security-event logging;
- the environment credential is an explicit break-glass fallback;
- operational case work has already moved to the Staff product and should not be re-created in the new Admin Console;
- the Angular `admin-console` project still contains only Phase 01 shell/placeholder routes.

The migration must preserve the working EJS console as a rollback surface while moving the real administrative workflows behind a canonical JSON API and a production-grade Angular interface.

## Decision

Phase 14 implements the new Angular Admin Console and the canonical `/api/v1/admin/*` API for website CMS and platform administration.

The existing EJS routes remain operational during this phase.

No collection is duplicated. The new Angular UI operates on the same authoritative MongoDB models used by the current CMS and public website.

## Product boundary

### Staff application

`app.immigrationhorizons.com/staff/*`

Owns operational immigration work:

- cases;
- clients;
- tasks/deadlines;
- evidence/documents;
- messages;
- forms;
- petitions;
- filing packets;
- USCIS tracking;
- calendar;
- search/reporting.

### Admin Console

`admin.immigrationhorizons.com`

Owns organization/site administration:

- website dashboard;
- Blog;
- FAQs;
- Testimonials;
- Media;
- Services/SEO metadata;
- site settings;
- employee accounts;
- roles/capability reference;
- security-event viewer;
- integration/configuration status.

Case-working modules must not be duplicated back into Admin.

Legacy EJS operational routes may remain temporarily for recovery, but the new Angular navigation does not expose them.

## Canonical data ownership

Existing collections/models remain authoritative:

- `BlogPost`;
- `FAQ`;
- `Testimonial`;
- `Media`;
- `SEOMeta`;
- `Setting`;
- `AdminUser`;
- `EmployeeSession` where Staff sessions must be revoked by admin operations;
- `SecurityEvent`.

The public Next.js website continues reading the same CMS data.

Do not create Angular-specific CMS collections.

Do not introduce Firestore.

## Admin API mount ordering

The existing Staff API is deliberately mounted before `express-session` so a CMS session can never authenticate Staff requests.

That separation must remain.

Target ordering:

```text
Express parsers/static
        ↓
/api/v1/staff and existing canonical Staff API
  - EmployeeSession only
  - NO CMS session
        ↓
express-session
        ↓
/api/v1/admin
  - CMS session only
  - AdminUser live re-check
  - admin CSRF/origin controls
        ↓
legacy EJS CSRF middleware
        ↓
legacy /admin/* EJS routes
```

Do not move the Staff API behind `express-session`.

Do not allow `ih_staff_session` to authenticate Admin API calls.

Do not allow the CMS session to authenticate Staff API calls.

## Admin authentication

The Angular Admin Console uses the same real DB-backed `AdminUser` identities as the EJS CMS.

Requirements:

- valid `AdminUser`;
- `isActive=true`;
- live role re-read on every protected request;
- `admin.cms.access` required;
- existing account lockout rules;
- existing bcrypt password;
- existing CMS session store;
- HttpOnly/Secure/SameSite cookie behavior preserved;
- security events for success/failure/denial/logout.

### No Admin API break-glass identity

The environment fallback administrator remains available only through the legacy EJS emergency login path.

The Angular Admin Console requires an attributable DB-backed `AdminUser`.

Reason:

- user/account/security mutations need a stable actor id;
- audit events must identify the human administrator;
- a break-glass credential should remain an emergency recovery path, not become normal browser identity.

## Admin session endpoints

Recommended API:

```text
GET  /api/v1/admin/session/bootstrap
POST /api/v1/admin/session/login
GET  /api/v1/admin/me
POST /api/v1/admin/session/logout
```

`bootstrap` may establish/return a session-bound CSRF token and whether a real admin session already exists. It must never expose session ids or secrets.

`me` returns intentional presentation fields and capabilities only.

## CSRF

Admin API mutations use the existing synchronizer-token design, not a weaker replacement.

Angular sends the session-bound token in:

```text
X-CSRF-Token
```

The Admin API should also validate trusted same-origin mutation requests.

Login itself requires a CSRF token from the bootstrap endpoint.

The browser cannot read the HttpOnly session cookie.

Do not store auth tokens in localStorage/sessionStorage.

Existing EJS hidden-field CSRF continues unchanged.

## Authorization

The first gate for Angular Admin Console access is:

```text
admin.cms.access
```

Existing module mutation capabilities remain authoritative:

- `blog.manage`;
- `faqs.manage`;
- `testimonials.manage`;
- `media.manage`;
- `settings.manage`;
- `users.manage`;
- `users.delete`.

Add one explicit read capability for the sensitive security-event viewer:

```text
security_events.view
```

Suggested grant:

- `super_admin`;
- `admin`.

Do not grant it to `editor`.

Angular route guards/navigation are UX only; every endpoint checks capabilities server-side.

## Service extraction / strangler rule

Where existing CMS business logic lives directly inside `server/routes/admin/index.js`, extract/reuse a service before exposing it as JSON.

Target:

```text
Legacy EJS route ─┐
                  ├── application/CMS service ── Mongoose
Admin API route ──┘
```

Do not copy route business logic into a second implementation.

EJS and Admin API must agree on:

- validation;
- slug behavior;
- publishing state;
- media rules;
- user privilege rules;
- last-super-admin protection;
- session revocation;
- temporary credentials;
- settings allowlists.

## API namespace

Implemented incrementally under:

```text
/api/v1/admin/
```

Target Phase 14 resources:

```text
session/bootstrap
session/login
session/logout
me

dashboard

blog
blog/:id
blog/:id/publish-state

faqs
faqs/:id

testimonials
testimonials/:id

media
media/:id
media/:id/alt

services
seo
seo/:pageRef

settings
integration-status

users
users/:id
users/:id/reset-credentials
users/:id/revoke-sessions

roles

security-events
```

Use the repository's standard JSON success/error envelope and request ids.

## DTO rules

Never serialize raw Mongoose documents.

Never expose:

- password hashes;
- failed-login counters unless explicitly required by a safe account-status DTO;
- session ids/tokens;
- private document paths;
- environment secrets;
- SMTP/API credentials;
- Google service-account fields;
- security-event metadata fields not intentionally allowed;
- server filesystem paths.

## Website dashboard

The Angular Admin dashboard is a website/platform administration dashboard.

Useful real metrics:

- total Blog posts;
- published Blog posts;
- draft Blog posts;
- FAQs;
- Testimonials;
- Media items;
- SEO entries;
- active employee accounts;
- recent safe security events when permitted.

No fake charts.

No case-work metrics that belong in Staff.

## Blog

Implement real list/create/edit/publish/archive/delete parity with current behavior where supported.

Preserve:

- title;
- slug;
- category;
- excerpt;
- HTML content;
- cover image;
- author;
- tags;
- reading time;
- published state;
- publish date.

### Rich HTML safety

Audit the current public rendering path before changing behavior.

If Blog HTML is not already sanitized at a safe server boundary, Phase 14 must add a shared allowlist sanitizer for newly created/updated content and corresponding public rendering tests.

Do not silently bulk-rewrite existing Blog content.

Do not allow scripts, event-handler attributes, javascript URLs, iframes or arbitrary unsafe HTML.

Editor UX may use a maintained rich-text editor only if it produces server-sanitized HTML and does not introduce a second storage format.

## FAQs

Full current parity:

- question;
- answer;
- category;
- display order;
- homepage visibility;
- service-page targeting;
- schema enabled;
- draft/published.

## Testimonials

Full current parity:

- name;
- country;
- profession;
- service;
- review;
- rating;
- photo;
- verification URL;
- featured;
- display order;
- draft/published/archived.

Validate external verification URLs safely.

## Media

Reuse the existing secure upload middleware and file restrictions.

Admin API supports:

- paginated library;
- folder/filter/search where current model supports it;
- upload;
- alt-text update;
- delete with filesystem + DB consistency handling.

Do not add SVG if the existing security policy forbids it.

Do not expose local filesystem paths.

For public CMS assets, return only public URL and safe metadata.

## Services and SEO

The service catalog remains code-owned unless current code proves otherwise.

Admin Console may list services and deep-link to their SEO metadata.

SEO manager edits existing `SEOMeta` fields:

- pageRef;
- pageType;
- SEO title;
- meta description;
- keywords;
- canonical URL;
- OG title/description/image;
- Twitter image;
- slug;
- robots;
- noindex;
- schema type.

Validate canonical/asset URLs.

Do not let arbitrary pageRef edits orphan the public site unexpectedly without confirmation and tests.

## Settings

The current `Setting` model is generic. The Admin API must expose an intentional allowlist of supported groups/keys rather than accepting arbitrary browser-submitted keys.

Existing groups:

- general;
- social;
- analytics;
- email;
- seo_defaults;
- contact_form.

Never use this API to expose environment secrets.

If a setting represents only whether an integration is configured, return a boolean/status rather than the credential.

## Integration status

Provide read-only operational status such as:

- Mongo connected;
- email provider configured;
- Google Sheets configured;
- USCIS provider configured/enabled;
- Calendar practice timezone configured;
- reminder worker configuration state where safely observable.

Only return status/configuration booleans or safe labels.

Never return secret values.

## Employee administration

The Admin Console must preserve ADR-016 provisioning semantics.

Admin may:

- list employees;
- create employee;
- update name/email/role/job title/department/status;
- reset credentials;
- revoke Staff sessions;
- delete only where current policy permits.

### Temporary password

Create/reset returns the generated temporary password exactly once in that immediate HTTPS JSON response.

The backend stores only the bcrypt hash.

The credential must never be:

- logged;
- written to SecurityEvent metadata;
- returned by later GET;
- stored by Angular after the one-time view is dismissed.

The UI must clearly state it cannot be recovered.

Preserve:

- only `super_admin` can create/promote/demote another `super_admin`;
- cannot disable/delete the last active `super_admin`;
- cannot delete own currently authenticated account;
- changing employee sign-in email revokes Staff sessions;
- deactivation revokes Staff sessions;
- credential reset revokes Staff sessions and forces password setup.

## Roles page

Expose a read-only role/capability reference generated from the canonical permission registry.

Do not allow arbitrary custom role creation in Phase 14.

The page helps administrators understand what roles can do, but the server permission map remains code-owned.

## Security Events

Add a read-only Admin API/UI viewer for `security_events`.

Required filters:

- type;
- result;
- surface;
- actor type;
- actor id/name where safe;
- subject email exact/normalized filter if current privacy policy permits;
- from/to;
- page/limit.

Default newest first.

Bound range and pagination.

Use a safe DTO with an explicit metadata allowlist. Never dump arbitrary `meta` objects to Angular.

No edit/delete.

No clear-log button.

## Angular Admin Console

Replace all Phase 01 placeholders.

Recommended routes:

```text
/login
/dashboard

/content/blog
/content/blog/new
/content/blog/:id
/content/faqs
/content/testimonials
/content/media
/content/services
/content/seo

/settings
/users
/users/new
/users/:id
/roles
/security
/integrations
```

Navigation is capability-aware.

Use the same Immigration Horizons navy/gold identity as Staff.

No purple theme.

## UI/UX

Admin is a premium enterprise administration product:

- deep navy navigation;
- gold active accent;
- clean white/neutral work surfaces;
- Inter for dense UI;
- Source Serif 4 only for restrained brand moments;
- accessible tables/forms/dialogs;
- consistent loading/empty/error states;
- keyboard navigation;
- responsive mobile/tablet behavior.

Content editors should support:

- unsaved-change warning;
- server validation;
- save state;
- publish state;
- preview link where safe;
- clear destructive confirmation.

Do not expose fake modules.

## Angular state

Use HttpClient + Signals/services.

No NgRx unless a measured need appears.

Admin auth/session state is separate from Staff auth.

Do not copy the Staff `AuthService` if it assumes `EmployeeSession`; share only presentation-safe abstractions.

## Media/rich text assets

Reuse the existing public CMS media storage.

Do not introduce a second object store in this phase.

If rich-text images reference Media records, they use the public media URL.

## Admin Console deployment strategy

Phase 14 does not replace `admin.immigrationhorizons.com` routing.

The EJS CMS remains production rollback.

CI must build/test the Angular Admin Console.

The deployment tooling may be extended to package its static output under a dormant release directory such as:

```text
static/admin-console/
```

but nginx routing/cutover is a separate release-gate decision.

A later release gate may expose a canary path and then switch the admin host after parity/human QA.

## EJS retirement

No EJS CMS route is deleted in Phase 14.

Per module:

1. inspect current route/business rules;
2. extract/reuse service;
3. add JSON API and tests;
4. build Angular UI;
5. prove parity;
6. keep EJS rollback.

Removal comes only after a later cutover/rollback window.

## Testing

### Authentication

Test:

- bootstrap CSRF;
- valid DB-backed admin login;
- wrong password;
- lockout;
- inactive user;
- role without `admin.cms.access`;
- live demotion/deactivation invalidates access;
- logout;
- Staff cookie cannot authenticate Admin API;
- Client cookie cannot authenticate Admin API;
- CMS cookie cannot authenticate Staff API;
- CSRF missing/invalid;
- trusted-origin refusal;
- env break-glass not accepted by Angular Admin API.

### CMS

Every mutation needs capability tests and validation tests.

Test public-site read compatibility after CMS writes.

### Users

Test super-admin privilege rules, last-super-admin protection, temporary credential one-time behavior, session revocation and DTO secrecy.

### Security viewer

Test capability, pagination, safe metadata, no secret leakage, immutable/no mutation routes.

### Angular

Test real auth, route guards, capability nav, every implemented list/editor state and destructive confirmations.

### Browser

Synthetic browser journey should cover:

1. admin login;
2. create/edit/publish Blog post;
3. edit FAQ;
4. create Testimonial;
5. upload/update Media;
6. edit SEO;
7. update safe setting;
8. create employee and capture one-time temp password;
9. reset/revoke employee;
10. view Security Event;
11. editor cannot manage Users/Settings/Security;
12. operations_admin cannot enter CMS;
13. legacy EJS remains functional in a separate regression path.

## Data/index changes

Prefer no new collection.

Add indexes only if measured Admin API queries require them.

Do not run production migrations/indexes during implementation.

## SecurityEvent audit

Record administrative mutations with safe, bounded metadata.

Add explicit event types only where the current contract lacks an appropriate type.

Do not misuse `login_succeeded` to represent account creation.

At minimum, account create/update/deactivate/reset/delete/session-revoke actions must be attributable without recording credentials.

Content mutation audit may use a dedicated safe administrative audit event type if introduced consistently in both model mirrors/contract.

## Completion criteria

Phase 14 is complete when:

- Angular Admin login is real and secure;
- admin session/CSRF boundaries are tested;
- Dashboard is real;
- Blog is real;
- FAQs are real;
- Testimonials are real;
- Media is real;
- Services/SEO are real;
- Settings are real;
- Integration status is real and secret-safe;
- Employee administration is real;
- Roles reference is real;
- Security Events viewer is real;
- no placeholder Admin routes remain;
- legacy EJS still works;
- public website content remains compatible;
- root/server/Angular/browser tests are green;
- exact-SHA CI is green;
- no production cutover has occurred.

## Consequence

After Phase 14, Immigration Horizons will have a complete modern Angular administrative application operating on the same CMS/platform data as the legacy EJS console.

A separate release gate can then package/canary/cut over `admin.immigrationhorizons.com` and eventually retire the EJS presentation layer without changing the underlying authoritative data.
