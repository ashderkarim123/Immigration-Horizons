# Phase 14 — Angular Admin Console, CMS & Platform Administration Implementation Prompt

**Working branch:** `phase-14/admin-console-cms`  
**Production baseline:** `main@8efa8cf6569f14bb052c968677f21b8cd07906be`  
**Architecture:** `docs/architecture/ADR-029-angular-admin-console-cms-platform-administration.md`  
**Prepared:** 2026-10-11

> This is a production administration phase. Do not build placeholder Admin pages, fake CMS records, mock security events or a parallel content database. Every visible module must use the real canonical API, real MongoDB models and real capability checks.

---

## 1. Mission

Replace the Phase 01 Angular Admin shell with a **fully working Immigration Horizons Admin Console** while preserving the Express/EJS CMS as a rollback surface.

Deliver real:

1. Admin authentication/session bootstrap;
2. CMS dashboard;
3. Blog management;
4. FAQs;
5. Testimonials;
6. Media Library;
7. Services + SEO Manager;
8. Site Settings;
9. Integration Status;
10. Employee/User Administration;
11. Roles & Capability reference;
12. Security Event viewer;
13. production-grade Immigration Horizons UI/UX;
14. full API/OpenAPI/security/browser coverage.

Do not migrate case-working features back into Admin.

---

## 2. Verified production baseline

Phase 13 is merged to `main` at:

```text
8efa8cf6569f14bb052c968677f21b8cd07906be
Merge phase-13/search-reporting: authorized search and operational reporting
```

The exact main SHA passed CI run #146 and production deploy run #35 successfully.

The new branch was created directly from that production baseline.

---

## 3. Git preflight

Before editing:

```bash
git fetch origin --prune

git branch --show-current
git status --short
git rev-parse HEAD
git rev-parse origin/phase-14/admin-console-cms
git rev-parse origin/main
git log --graph --decorate --oneline -30
git diff
git diff --cached
git rev-list --left-right --count origin/main...HEAD
```

Required branch:

```text
phase-14/admin-console-cms
```

If main has advanced, inspect those commits before doing any integration.

Never:

```text
git reset --hard
git clean -fd
git rebase shared history
git commit --amend shared commits
git push --force
work directly on main
```

Do not deploy.

---

## 4. Required reading

Read completely before implementation:

```text
CLAUDE.md
AGENTS.md

.claude/SECURITY.md
.claude/API_ARCHITECTURE.md
.claude/DATABASE.md
.claude/TESTING.md
.claude/DEPLOYMENT.MD
.claude/DESIGN_SYSTEM.md

docs/architecture/ADR-008-application-separation.md
docs/architecture/ADR-009-employee-saas-shell.md
docs/architecture/ADR-012-security-privacy-and-audit.md
docs/architecture/ADR-015-angular-enterprise-platform.md
docs/architecture/ADR-016-authentication-boundaries.md
docs/architecture/ADR-024-angular-staff-production-cutover.md
docs/architecture/ADR-025-stabilization-staff-cms-and-guided-work.md
docs/architecture/ADR-029-angular-admin-console-cms-platform-administration.md

docs/implementation/STABILIZATION_PHASE_01_REPORT.md
docs/implementation/PHASE_13_SEARCH_REPORTING_REPORT.md
docs/implementation/ANGULAR_ENTERPRISE_PLATFORM_ROADMAP.md

server/README.md
```

Inspect current code, especially:

```text
server/app.js
server/routes/admin/index.js
server/routes/admin/
server/middleware/auth.js
server/middleware/csrf.js
server/middleware/upload.js
server/utils/permissions.js
server/utils/securityEvents.js
server/utils/lockout.js
server/services/notificationService.js

server/models/BlogPost.js
server/models/admin/FAQ.js
server/models/admin/Testimonial.js
server/models/admin/Media.js
server/models/admin/SEOMeta.js
server/models/admin/Setting.js
server/models/admin/User.js
server/models/SecurityEvent.js
server/models/EmployeeSession.js

server/views/admin/
server/openapi/v1.yaml

enterprise-ui/projects/admin-console/
enterprise-ui/projects/case-management/
enterprise-ui/shared/
```

Do not trust route comments over current tests/code.

---

# ORDERED IMPLEMENTATION GATES

Phase 14 has four ordered gates.

Do not begin a later gate if the preceding gate is red.

---

# GATE A — ADMIN AUTH, API BOUNDARY & ANGULAR FOUNDATION

## A1. Preserve the Staff/CMS security boundary

Current `server/app.js` deliberately mounts the Staff API before `express-session`.

Do not change that behavior.

Required ordering:

```text
parsers/static

/api/v1/staff + existing API
(EmployeeSession only)

express-session

/api/v1/admin
(CMS session only)

legacy EJS csrfProtection

legacy /admin routes
```

The Admin API needs the CMS session, so mount its router after `express-session`.

Do NOT move the existing Staff router behind the CMS session middleware.

Add a clear integration test proving:

```text
CMS session != Staff identity
Staff EmployeeSession != Admin API identity
Client session != Admin API identity
```

---

## A2. Admin API infrastructure

Create a dedicated Admin API router, e.g.:

```text
server/routes/api/v1/admin/index.js
```

Use:

- request ID;
- standard JSON error envelope;
- safe 404;
- Admin session auth;
- live AdminUser re-read;
- capability middleware;
- Admin API CSRF middleware;
- trusted-origin mutation check where appropriate.

Do not return HTML errors from JSON API endpoints.

Example error:

```json
{
  "error": {
    "code": "forbidden",
    "message": "You do not have permission to perform this action.",
    "fieldErrors": null,
    "requestId": "..."
  }
}
```

No stack traces in production.

---

## A3. Shared Admin authentication service

The legacy EJS login logic currently lives in `server/routes/admin/index.js`.

Extract/reuse real DB-backed authentication logic so EJS and JSON login cannot drift.

Suggested service:

```text
server/services/adminAuthentication.js
```

It should own:

- email normalization;
- AdminUser lookup;
- account lockout;
- constant/appropriate password verification behavior;
- active account check;
- `admin.cms.access`;
- successful/failed login counter updates;
- SecurityEvent logging payloads;
- session identity shape.

Do not accidentally enable the environment fallback in the Angular API.

The EJS route may still invoke the fallback after the shared DB-backed login result says no real account matched.

---

## A4. Admin API authentication policy

Angular Admin accepts only real `AdminUser`.

Rules:

```text
email/password
     ↓
AdminUser exists
     ↓
not locked
     ↓
password valid
     ↓
isActive
     ↓
admin.cms.access
     ↓
regenerate CMS session id
     ↓
session.isAdmin=true
session.adminUser={id,name,role}
```

No self-registration.

No Firebase.

No JWT.

No localStorage bearer token.

No env fallback identity in Angular.

---

## A5. Session endpoints

Implement:

```text
GET  /api/v1/admin/session/bootstrap
POST /api/v1/admin/session/login
GET  /api/v1/admin/me
POST /api/v1/admin/session/logout
```

### Bootstrap

Returns:

- authenticated boolean;
- session-bound CSRF token;
- safe product config if needed.

Do not return session id/cookie/token hash.

### Login

Body:

```json
{
  "email": "admin@example.com",
  "password": "..."
}
```

Use generic invalid-credentials messages.

On successful privilege change regenerate the session id.

Because regeneration discards the pre-login CSRF token, return the new authenticated CSRF token in the success response.

### Me

Return:

```text
id
name
email
role { code, label }
jobTitle
department
capabilities[]
```

No password/lockout internals.

### Logout

Audit and destroy CMS session.

---

## A6. Admin API CSRF

Reuse the existing synchronizer-token design.

Refactor `server/middleware/csrf.js` only as necessary so the same token primitives can protect JSON Admin API requests.

Angular sends:

```text
X-CSRF-Token
```

Mutations require:

- authenticated CMS session where applicable;
- matching session CSRF token;
- trusted same-origin request.

Login also requires a bootstrap CSRF token.

CSRF rejection for `/api/v1/admin/*` must be JSON with the standard envelope.

Legacy EJS hidden `_csrf` behavior must continue passing all existing tests.

Multipart Admin API uploads must be verified after multer has parsed the request, exactly as the EJS upload path requires.

---

## A7. Live AdminUser authorization

Every protected Admin API request re-reads the AdminUser.

If:

- user deleted;
- user deactivated;
- role changed and no longer has `admin.cms.access`;

then the session is no longer authoritative.

Destroy/deny the session consistently.

Do not trust the role snapshot in `req.session.adminUser.role` as authorization.

---

## A8. Angular Admin core

Replace the placeholder Admin Auth state with real core infrastructure:

```text
core/
  api/
  auth/
  guards/
  interceptors/
  errors/
  permissions/
```

Configure HttpClient.

Same-origin API paths only:

```text
/api/v1/admin/...
```

No production hostname hard-coded.

For local Angular serve, use a dev proxy to local Express.

---

## A9. Angular Admin AuthService

Implement:

```text
bootstrap()
login()
logout()
loadMe()
currentAdmin signal
capabilities signal
csrfToken signal
isAuthenticated signal
hasCapability()
```

After login, keep CSRF token in memory only.

On full refresh, call bootstrap/me and get a fresh token.

Do not persist passwords or CSRF tokens to localStorage.

---

## A10. Admin guards

Routes under the Admin shell require real authentication.

Login redirects authenticated users to Dashboard.

Capability route guards control UX only.

The server remains authoritative.

---

## A11. Admin login UI

Replace Phase 01 placeholder.

Use the actual Immigration Horizons logo and navy/gold brand.

Desktop two-panel premium sign-in is acceptable.

Fields:

- Email;
- Password;
- Show/hide password;
- loading;
- generic error;
- keyboard submit.

Do not show:

- Google sign-in;
- client Firebase;
- fake forgot-password;
- self-signup.

Provide a discreet note:

```text
Authorized administrators only.
```

Do not expose that a particular email exists.

---

## A12. Gate A tests

Before Gate B:

- DB-backed login success;
- wrong password;
- unknown email;
- locked account;
- inactive account;
- operations_admin correct password denied;
- editor/admin allowed where `admin.cms.access`;
- session id regenerated;
- live demotion revokes access;
- logout;
- Staff cookie denied by Admin API;
- Client cookie denied;
- CMS cookie denied by Staff API;
- bootstrap CSRF;
- invalid/missing CSRF;
- login CSRF;
- multipart CSRF;
- env fallback rejected by Admin API;
- legacy EJS login + fallback still pass;
- Angular AuthService/guards/login tests.

Gate A must be green before CMS work.

---

# GATE B — CMS CONTENT MIGRATION

## B1. Service extraction pattern

Do not duplicate route logic.

For each CMS module:

```text
EJS route ─┐
           ├── CMS service ── Mongoose
Admin API ─┘
```

When logic is trivial, a focused repository/service module is still preferable to copy/paste.

After extraction, existing EJS tests must stay green.

---

## B2. Dashboard

Implement:

```text
GET /api/v1/admin/dashboard
```

Real metrics only:

- total Blog posts;
- published;
- drafts;
- FAQs;
- Testimonials;
- Media count;
- SEO entry count;
- active AdminUser count if actor has users.manage;
- recent Blog posts;
- recent SecurityEvents only if actor has security_events.view.

A missing capability returns unavailable/null, not a fake zero.

Angular `/dashboard` displays useful administrative work.

No case operations metrics.

---

## B3. Blog service/API

Implement real endpoints, e.g.:

```text
GET    /api/v1/admin/blog
POST   /api/v1/admin/blog
GET    /api/v1/admin/blog/:id
PATCH  /api/v1/admin/blog/:id
POST   /api/v1/admin/blog/:id/publish
DELETE /api/v1/admin/blog/:id
```

Use current behavior/capabilities.

List supports:

- search;
- status published/draft;
- category;
- page;
- limit;
- stable sort.

DTO:

- id;
- title;
- slug;
- category;
- excerpt;
- content;
- coverImage;
- author;
- tags;
- readingTime;
- published;
- publishDate;
- createdAt;
- updatedAt;
- safe preview URL;
- actions.

### Slugs

Preserve automatic slug generation semantics.

Handle duplicate slug as controlled validation/conflict.

Do not let browser-generated slug be the only validation.

### Blog HTML

Audit current public render.

If not already sanitized, introduce a server-side allowlist sanitizer.

Allowed content should support normal Blog needs:

- paragraphs;
- headings;
- lists;
- links;
- strong/emphasis;
- blockquotes;
- code/pre where needed;
- images only from safe URL schemes/known media patterns if allowed;
- tables if the current editor/public design supports them.

Reject/remove:

- script;
- style;
- iframe unless there is an explicit reviewed requirement;
- event-handler attrs;
- javascript/data dangerous URLs;
- forms;
- embedded executable content.

Add stored-XSS regression tests against both Admin preview and public Blog rendering.

Do not bulk rewrite existing posts.

---

## B4. Angular Blog UX

Routes:

```text
/content/blog
/content/blog/new
/content/blog/:id
```

Real UX:

- search/filter;
- status;
- table/cards;
- create;
- edit;
- save draft;
- publish/unpublish;
- preview;
- delete confirmation;
- unsaved change guard;
- validation;
- loading/error.

If a maintained rich-text editor is introduced, keep bundle size reasonable and server sanitization mandatory.

Do not import an editor that stores a proprietary document format unless the public site is also deliberately migrated.

HTML remains the canonical content format.

---

## B5. FAQs

API:

```text
GET    /api/v1/admin/faqs
POST   /api/v1/admin/faqs
GET    /api/v1/admin/faqs/:id
PATCH  /api/v1/admin/faqs/:id
DELETE /api/v1/admin/faqs/:id
```

Fields:

- question;
- answer;
- category;
- displayOrder;
- showOnHomepage;
- showOnServicePage;
- schemaEnabled;
- status.

Angular:

```text
/content/faqs
```

Support create/edit/delete/status/order and current service targeting.

Use real service slugs as selectable values.

---

## B6. Testimonials

API:

```text
GET    /api/v1/admin/testimonials
POST   /api/v1/admin/testimonials
GET    /api/v1/admin/testimonials/:id
PATCH  /api/v1/admin/testimonials/:id
DELETE /api/v1/admin/testimonials/:id
```

Preserve:

- name;
- country;
- profession;
- service;
- review;
- rating;
- photo;
- verificationUrl;
- featured;
- displayOrder;
- status.

Validate rating and URLs.

Angular route:

```text
/content/testimonials
```

---

## B7. Media Library

API:

```text
GET    /api/v1/admin/media
POST   /api/v1/admin/media
PATCH  /api/v1/admin/media/:id/alt
DELETE /api/v1/admin/media/:id
```

Reuse existing upload middleware/file policy.

Do not weaken:

- extension/MIME allowlist;
- file-size bounds;
- sanitized filenames;
- no SVG if current policy blocks it.

List supports:

- search;
- folder if real;
- mime category;
- page;
- limit.

DTO returns:

- id;
- public URL;
- originalName;
- mimeType;
- size;
- altText;
- folder;
- uploadedBy safe display;
- createdAt.

Never filesystem path.

### Delete consistency

If file delete fails, handle/report safely.

Do not silently delete DB row while leaving untracked unexpected state unless current service deliberately defines that behavior.

Add tests.

Angular route:

```text
/content/media
```

UX:

- drag/drop and file picker if accessible;
- upload progress/state;
- thumbnails for images;
- copy public URL;
- edit alt text;
- delete confirmation;
- no fake folders if model behavior does not support real folder operations.

---

## B8. Services

Implement read-only:

```text
GET /api/v1/admin/services
```

Use the current code-owned service catalogue.

Return:

- title;
- slug;
- safe public URL;
- associated SEO pageRef.

Angular:

```text
/content/services
```

This page does NOT turn code-owned service copy into database content.

It provides:

- public preview;
- link to SEO edit.

---

## B9. SEO Manager

API:

```text
GET   /api/v1/admin/seo
GET   /api/v1/admin/seo/:pageRef
PUT   /api/v1/admin/seo/:pageRef
```

Preserve `SEOMeta`.

Validate:

- pageType;
- bounded title/description;
- canonical URL;
- OG/Twitter image URL;
- robots;
- slug;
- schemaType.

Use explicit allowlists.

Angular routes:

```text
/content/seo
/content/seo/:pageRef
```

UX should show:

- page;
- current title;
- meta description length;
- index/noindex;
- canonical;
- OG metadata;
- public preview link.

Do not invent fake SEO score percentages.

---

## B10. CMS permissions

Reads require authenticated `admin.cms.access`.

Mutations require existing capability:

```text
blog.manage
faqs.manage
testimonials.manage
media.manage
```

SEO mutations: inspect current permission convention; if no dedicated capability exists, use the narrowest existing documented CMS content capability or add `seo.manage` deliberately to super_admin/admin/editor and all capability mirrors/contracts.

Do not use role checks directly in route code.

---

## B11. Content audit events

Add a safe audit event type if the current SecurityEvent contract has no correct generic content event.

Recommended:

```text
admin_content_mutated
```

Metadata allowlist:

```text
resourceType
resourceId
action
```

Do not record Blog body, FAQ answer, testimonial review or upload filename if avoidable.

All events attributable to a real AdminUser.

---

## B12. Gate B tests

Test:

- permissions for editor/admin vs non-CMS role;
- CRUD validation;
- pagination;
- literal search;
- duplicate slug;
- XSS sanitizer;
- media restrictions;
- SEO URL validation;
- public website sees content changes using the same collection;
- EJS parity routes still pass;
- Angular Blog/FAQ/Testimonial/Media/SEO behavior.

Gate B must be green before Gate C.

---

# GATE C — PLATFORM ADMINISTRATION & SECURITY

## C1. Settings API

Implement:

```text
GET /api/v1/admin/settings
PUT /api/v1/admin/settings/:group
```

Requires:

```text
settings.manage
```

Build a server-owned schema/allowlist for supported setting keys and types.

Do NOT accept arbitrary key/value pairs from Angular.

For every current EJS field, audit:

- key;
- type;
- max length;
- URL/email/boolean validation;
- whether it is safe to return to browser.

Never expose env secrets.

---

## C2. Angular Settings

Route:

```text
/settings
```

Group tabs/cards:

- General;
- Social;
- Analytics;
- SEO Defaults;
- Contact Form;
- Email/public settings only if safe.

Do not surface raw SMTP/Resend/service-account secrets.

Unsaved-change warning and clear save status.

---

## C3. Integration Status

Implement:

```text
GET /api/v1/admin/integration-status
```

Requires `settings.manage` or another deliberate admin-tier read capability.

Return safe state only, for example:

```json
{
  "mongo": { "status": "connected" },
  "email": { "configured": true },
  "googleSheets": { "configured": false },
  "uscisCaseStatus": { "configured": false, "enabled": false },
  "calendar": { "practiceTimeZoneConfigured": true },
  "reminders": { "configured": true, "enabled": false }
}
```

Do not return:

- keys;
- secrets;
- private email addresses from credentials;
- Mongo URI;
- file paths.

Angular route:

```text
/integrations
```

---

## C4. Employee administration service/API

Extract/reuse the existing user-management rules from `server/routes/admin/index.js`.

Suggested service:

```text
server/services/adminUserManagement.js
```

API:

```text
GET    /api/v1/admin/users
POST   /api/v1/admin/users
GET    /api/v1/admin/users/:id
PATCH  /api/v1/admin/users/:id
POST   /api/v1/admin/users/:id/reset-credentials
POST   /api/v1/admin/users/:id/revoke-sessions
DELETE /api/v1/admin/users/:id
```

Reads/mutations:

```text
users.manage
```

Delete additionally:

```text
users.delete
```

---

## C5. Employee account invariants

Preserve and test all:

- only super_admin may create super_admin;
- only super_admin may modify another super_admin;
- cannot demote/deactivate/delete the last active super_admin;
- cannot delete the currently logged-in account;
- valid role only;
- email unique;
- deactivation revokes `EmployeeSession`;
- sign-in email change revokes `EmployeeSession`;
- reset credential revokes `EmployeeSession`;
- reset clears lockout;
- reset sets `mustChangePassword=true`;
- credential reset does not expose password after response.

Also consider CMS-session implications:

If an admin edits/deactivates another AdminUser, that target's existing EJS/Admin Console CMS sessions must be denied on the next request through live AdminUser re-read even if they cannot be enumerated/destroyed directly.

---

## C6. Temporary credential response

Create:

```json
{
  "data": {
    "user": { ...safe user dto... },
    "temporaryCredential": {
      "password": "...",
      "purpose": "created"
    }
  }
}
```

Only immediate create/reset success.

Response headers:

```text
Cache-Control: no-store
Pragma: no-cache
```

Never return it later.

Never log it.

Never record it in SecurityEvent.

Angular must not persist it.

Show one-time modal:

```text
Temporary credential
Copy this password now. It will not be shown again.
```

On dismiss, remove from memory.

---

## C7. Revoke sessions

```text
POST /api/v1/admin/users/:id/revoke-sessions
```

Deletes target EmployeeSession rows.

This revokes Staff application sessions.

Do not claim it revokes CMS sessions if it does not.

Document the distinction.

A target deactivation still denies CMS on next protected request through live re-read.

---

## C8. Angular Users UI

Routes:

```text
/users
/users/new
/users/:id
```

Table:

- name;
- email;
- role;
- department;
- active;
- must change password;
- last login;
- created.

Detail/edit:

- name;
- email;
- role;
- job title;
- department;
- active status;
- credential lifecycle;
- reset credential;
- revoke Staff sessions;
- delete when allowed.

Dangerous actions use explicit confirm dialogs.

Do not show failed-login counters unless product needs them; if shown, expose only safe account state.

---

## C9. Roles reference

Implement:

```text
GET /api/v1/admin/roles
```

Requires `users.manage`.

Server derives it from canonical:

```text
ROLE_LABELS
CAPABILITIES
```

Return:

- role code;
- label;
- capability list grouped by domain.

Do not implement arbitrary custom-role mutation in Phase 14.

Angular:

```text
/roles
```

Display matrix/readable capability groups.

---

## C10. Security event capability

Add:

```text
security_events.view
```

Grant only:

```text
super_admin
admin
```

Update:

- `server/utils/permissions.js`;
- Next mirror;
- generated capability contract;
- tests.

No editor access.

---

## C11. Security Event API

Implement:

```text
GET /api/v1/admin/security-events
GET /api/v1/admin/security-events/:id
```

Read-only.

Requires:

```text
security_events.view
```

Filters:

- type;
- result;
- surface;
- actorType;
- actorAdminId;
- subjectEmail if intentionally supported;
- from;
- to;
- page;
- limit.

Bound maximum date range or pagination workload.

Default newest first.

No delete.

No update.

No clear.

---

## C12. Security Event DTO

Explicit fields only:

```text
id
type
result
surface
actorType
actorAdmin { id/name only if safe }
actorName
subjectEmail
ipMasked or omit full IP according to current policy
createdAt
meta
```

For `meta`, define a safe-key registry by event type.

Do not pass unknown arbitrary metadata keys.

Never return:

- password;
- credential;
- token;
- hash;
- authorization header;
- raw request body;
- filesystem path;
- private storage key.

---

## C13. Angular Security UI

Route:

```text
/security
```

Only visible with `security_events.view`.

Features:

- filter bar;
- paginated table;
- event detail drawer/dialog;
- readable labels;
- timestamp;
- actor;
- result;
- surface;
- safe metadata.

Do not make it look like a destructive "log management" tool.

It is an append-only audit viewer.

---

## C14. Administrative security event types

Audit current event enum before extending.

Do not use:

```text
login_succeeded
```

for employee account creation.

Add specific types only if needed, e.g.:

```text
admin_user_created
admin_user_updated
admin_user_deactivated
admin_user_activated
admin_user_deleted
admin_credentials_reset
admin_staff_sessions_revoked
admin_content_mutated
admin_settings_updated
```

Keep the list minimal and meaningful.

Update both SecurityEvent model mirrors and contract.

Metadata remains safe/bounded.

---

## C15. Gate C tests

Test:

- settings allowlist rejects unknown keys;
- no secrets in settings/integration DTO;
- create employee;
- one-time temp password;
- admin cannot create super_admin;
- super_admin can;
- last-super-admin protection;
- self-delete protection;
- deactivation/email/reset session revocation;
- credential response no-store;
- roles derived from canonical permissions;
- security viewer denied to editor;
- security viewer pagination/filter;
- security event safe meta;
- no security mutation routes;
- Angular Users/Settings/Roles/Security flows.

Gate C must be green before final browser/cutover packaging work.

---

# GATE D — ADMIN CONSOLE PRODUCT PARITY & RELEASE READINESS

## D1. Remove all placeholders

The Admin app currently has:

```text
/dashboard
/content
```

with Phase 01 placeholder behavior.

At completion:

- no `ContentPlaceholder`;
- no "coming later";
- no fake dashboard cards;
- no fake settings;
- no fake users.

All visible navigation destinations work.

---

## D2. Navigation

Recommended:

```text
Dashboard

WEBSITE
  Blog
  FAQs
  Testimonials
  Media
  Services
  SEO

PLATFORM
  Settings
  Integrations

ACCESS & SECURITY
  Users
  Roles
  Security Events
```

Only render items the actor can access.

An editor sees content modules but not Users/Settings/Security.

An operations_admin cannot enter this app at all.

---

## D3. Shared Admin UI primitives

Create only what the actual Phase 14 features need:

- PageHeader;
- DataTable;
- Pagination;
- FilterBar;
- FormField;
- Input/Textarea/Select;
- Toggle;
- StatusBadge;
- EmptyState;
- ErrorState;
- Skeleton;
- ConfirmDialog;
- Modal/Drawer;
- FileDropzone;
- CopyButton;
- UnsavedChanges guard/dialog;
- Toast/inline save feedback.

Reuse presentation primitives from shared enterprise UI where safe.

Do not put authorization/business rules into shared UI.

---

## D4. Brand and UX

Admin Console and Staff product must look like the same company.

Use:

- navy sidebar;
- real logo;
- gold active marker;
- neutral workspace;
- Inter;
- Source Serif 4 sparingly;
- Lucide icon family if already adopted/compatible;
- accessible focus;
- no purple identity.

Admin can be denser than Staff but not visually unrelated.

---

## D5. Accessibility

WCAG 2.1 AA minimum.

Required:

- semantic forms/headings;
- field error association;
- keyboard dialogs;
- focus restoration;
- visible focus;
- aria-current navigation;
- touch targets;
- no color-only status;
- responsive tables;
- reduced-motion support.

---

## D6. Admin static build

CI already builds `admin-console`.

Do not switch nginx in Phase 14.

Do not replace the EJS host.

If packaging scripts are touched, static output must be release-local and rollback-safe.

No production route cutover.

A later Release Gate will decide:

- canary URL/path;
- nginx;
- production smoke;
- rollback;
- EJS retirement.

---

## D7. Legacy EJS regression

Run/retain tests proving:

- EJS admin login works;
- break-glass fallback works;
- EJS Blog/FAQ/Testimonial/Media/SEO/Settings/User actions still use the same business rules;
- CSRF still works;
- permissions still work.

Do not remove EJS routes in this phase.

---

## D8. Admin Browser journey

Add Playwright coverage using synthetic isolated DB.

Required scenario:

### Super Admin

1. sign into Angular Admin Console;
2. Dashboard real counts;
3. create Blog draft;
4. edit content;
5. publish;
6. confirm public/preview read path reflects it;
7. create/edit FAQ;
8. create/edit Testimonial;
9. upload allowed image;
10. update alt text;
11. edit SEO;
12. update safe setting;
13. create employee;
14. copy one-time temp credential;
15. verify later GET never returns credential;
16. reset credential;
17. revoke Staff sessions;
18. inspect security event.

### Editor

- login works;
- content mutation works according to capabilities;
- Users hidden/403;
- Settings hidden/403;
- Security hidden/403.

### Operations Admin

- valid credentials;
- Admin API login denied because no `admin.cms.access`;
- Staff application remains available according to Staff capability.

### Security boundary

- Staff cookie cannot call Admin API;
- CMS cookie cannot call Staff API.

### Legacy

At least one EJS CMS mutation/read regression remains verified separately.

---

## D9. Public website compatibility

Content written through Admin API must still render from the public Next site using the same collections.

At minimum verify:

- published Blog discoverable;
- draft not public;
- FAQ behavior;
- testimonial status behavior;
- SEO metadata resolution;
- media URL works cross-origin as intended.

Do not change public SEO/indexing boundaries accidentally.

---

## D10. Performance

Admin lists use server pagination.

Do not fetch entire Blog/Media/User/SecurityEvent collections.

Search is bounded/literal.

Media thumbnails lazy-load where appropriate.

Rich-text editor lazy-load if used.

No giant analytics/chart dependency.

---

# DATA & SCHEMA

## 5. New collections

Prefer:

```text
NONE
```

Phase 14 should use existing collections.

If implementation discovers a genuinely missing audit/domain concept requiring a collection, STOP and document before creating it.

---

## 6. Indexes

Audit real Admin API query plans.

Likely existing indexes are sufficient for most CMS collections.

SecurityEvent already has operational indexes.

Only add additive indexes if actual list/filter queries require them.

Register in dry-run tooling.

Do not apply to production.

Never `syncIndexes()`.

---

## 7. Migration

No broad data migration.

Do not:

- rewrite Blog HTML in bulk;
- re-slug posts;
- migrate Media;
- rewrite Settings;
- recreate users.

Schema changes must be additive/backward-compatible.

---

# OPENAPI

## 8. Admin OpenAPI

Extend:

```text
server/openapi/v1.yaml
```

Document implemented `/api/v1/admin/*` endpoints.

Include:

- CMS session cookie;
- CSRF header;
- request ids;
- auth errors;
- validation;
- pagination;
- upload multipart;
- safe DTOs;
- capability errors;
- one-time credential response/no-store note.

Do not document unimplemented future routes.

---

# TESTING

## 9. Server integration coverage

Create focused integration suites, e.g.:

```text
admin-api-auth.integration.test.js
admin-api-blog.integration.test.js
admin-api-content.integration.test.js
admin-api-media.integration.test.js
admin-api-settings.integration.test.js
admin-api-users.integration.test.js
admin-api-security.integration.test.js
```

Do not make one 5,000-line test file.

---

## 10. Sensitive DTO regression

Automated tests must assert Admin API never exposes:

```text
password
passwordHash
session id
token
tokenHash
ADMIN_PASSWORD
SESSION_SECRET
MONGODB_URI
RESEND_API_KEY
GOOGLE_PRIVATE_KEY
USCIS_CASE_STATUS_CLIENT_SECRET
PRIVATE_DOCUMENT_ROOT
filesystem paths
```

Use recursive DTO scanning where practical.

---

## 11. CSRF regression

Existing EJS CSRF tests must remain.

Add API-specific tests:

- bootstrap token;
- token header;
- bad token;
- missing token;
- login token;
- authenticated mutation;
- multipart mutation;
- token after session regeneration;
- logout.

---

## 12. Angular tests

Increase admin-console tests from placeholder-level coverage to real behavior.

Test:

- auth;
- guards;
- capability navigation;
- dashboard;
- Blog;
- FAQ;
- Testimonial;
- Media;
- SEO;
- Settings;
- Integrations;
- Users;
- Roles;
- Security;
- one-time credential modal;
- unsaved changes;
- error/empty/loading;
- mobile nav.

---

# LOCAL VALIDATION

## 13. Run full repository gate

Use current package scripts as authoritative.

At minimum:

```bash
# root
npm ci --no-audit --no-fund
npm run lint
npx tsc --noEmit
npm test
npm run build

# server
cd server
npm ci --no-audit --no-fund
npm test
npm run db:indexes:dry-run
cd ..

# Angular
cd enterprise-ui
npm ci --no-audit --no-fund
npm test
npx ng build case-management
npx ng build admin-console
cd ..

# staff release verifier remains green
node scripts/deploy/verify-staff-build.js enterprise-ui/dist/case-management/browser

# browser
npm run test:e2e

git diff --check
git status --short
```

If an Admin build verifier is added, run it too.

No automated test connects to production.

---

# CI

## 14. Exact-SHA gate

Push only after local validation.

The exact final Phase 14 SHA must have all required CI jobs green.

Do not weaken existing Staff/Client tests.

Admin Console work may not regress case management.

---

# IMPLEMENTATION REPORT

## 15. Create

```text
docs/implementation/PHASE_14_ADMIN_CONSOLE_CMS_REPORT.md
```

Record:

- starting SHA;
- ending SHA;
- branch;
- commits;
- Admin API mount ordering;
- auth/session/CSRF decisions;
- endpoints;
- service extractions;
- Blog sanitization decision;
- modules implemented;
- capabilities added;
- SecurityEvent types added;
- Angular routes;
- UI primitives;
- media behavior;
- user credential lifecycle;
- role/security viewer behavior;
- indexes;
- migrations;
- exact local test counts;
- browser test result;
- exact CI run id/url;
- production changes (must be none);
- known limitations;
- EJS rollback state;
- next phase recommendation.

---

# COMPLETION GATE

Phase 14 is NOT complete merely because Admin builds.

It is complete only when all are true:

### Authentication

- real Angular Admin login;
- DB-backed AdminUser only;
- env fallback excluded from Angular;
- CMS session separate from Staff;
- session fixation protection;
- live role/status recheck;
- CSRF works;
- logout works.

### CMS

- Dashboard real;
- Blog real;
- FAQ real;
- Testimonials real;
- Media real;
- Services real;
- SEO real.

### Platform

- Settings real;
- Integrations real;
- Users real;
- Roles real;
- Security Events real.

### Security

- capabilities server enforced;
- editor boundaries;
- operations_admin denied CMS;
- no secrets in DTOs;
- no password retrieval;
- temp credential one-time only;
- no arbitrary SecurityEvent meta dump;
- EJS CSRF not weakened.

### UI

- no placeholders;
- navy/gold brand;
- responsive;
- accessible;
- polished loading/error/empty/save states.

### Compatibility

- public website still reads CMS data correctly;
- legacy EJS remains functional;
- Staff case-management regression suite remains green.

### Verification

- root tests green;
- server tests green;
- Angular case-management tests green;
- Angular admin-console tests green;
- both Angular builds green;
- Next build green;
- browser tests green;
- exact-SHA CI green.

### Safety

- no main merge by the agent;
- no deploy;
- no nginx change;
- no production index apply;
- no production migration;
- no EJS deletion.

---

# STOP

When the exact Phase 14 SHA is green:

**STOP.**

Do not cut over `admin.immigrationhorizons.com` automatically.

Do not retire EJS.

Do not start client Firebase migration automatically.

The next step should be a dedicated **Admin Console Release Gate / production canary and cutover** after human QA, followed by the remaining client-auth/platform work.
