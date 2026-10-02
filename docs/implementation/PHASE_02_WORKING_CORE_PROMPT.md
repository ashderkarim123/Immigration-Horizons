# Phase 02 — Working Enterprise Case-Management Core

Use this prompt in Antigravity with Claude or Gemini.

Repository: `ashderkarim123/Immigration-Horizons`  
Branch: `architecture/angular-enterprise-platform`

Read first:

- `docs/architecture/ADR-015-angular-enterprise-platform.md`
- `docs/architecture/ADR-016-authentication-boundaries.md`
- `docs/implementation/ANGULAR_ENTERPRISE_PLATFORM_ROADMAP.md`
- `docs/implementation/PHASE_01_ANGULAR_WORKSPACE_REPORT.md`
- `CLAUDE.md`
- `AGENTS.md`
- `.claude/DESIGN_SYSTEM.md`
- `.claude/SECURITY.md`
- `.claude/API_ARCHITECTURE.md`
- `.claude/DATABASE.md`
- `.claude/TESTING.md`

## 1. Mission

Phase 02 must turn the Angular shell into the first **real, working Immigration Horizons staff case-management product**.

This cycle intentionally absorbs the original roadmap objectives for API foundation, employee session bootstrap, dashboard, clients, and case read experiences.

At completion, a real provisioned employee must be able to:

1. sign in through Angular using an admin-created credential;
2. be forced to replace a temporary password on first sign-in when required;
3. remain signed in across refresh using `ih_staff_session`;
4. sign out;
5. see their real role/capabilities;
6. see a real role-scoped dashboard;
7. browse/filter/search/paginate real authorized cases;
8. open a real case workspace read view;
9. see real case team and activity data;
10. browse real clients when their role allows it;
11. open a real client operational view;
12. see real assigned tasks;
13. never see restricted case/client data outside policy;
14. use a polished Immigration Horizons navy/gold enterprise UI.

This is not a placeholder cycle.

## 2. Production safety

Before editing:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log --graph --decorate --oneline -20
git diff
git diff --cached
git fetch origin --prune
```

Expected branch: `architecture/angular-enterprise-platform`.

At the time this Phase 02 document was created, the branch had already completed and pushed Phase 01. Verify the actual current remote/local SHA before starting; do not assume a hard-coded SHA if new documentation commits exist.

Never:

- work directly on `main`;
- force push;
- reset or clean unknown user changes;
- deploy;
- edit production secrets;
- connect automated tests to production MongoDB;
- apply migrations/indexes to production;
- change nginx/PM2 production routing in this cycle;
- replace MongoDB with Firestore;
- add MongoDB/Mongoose to Angular;
- merge the Vite/React reference repository;
- weaken existing authorization/tests to make the cycle pass.

## 3. Approved identity architecture

ADR-016 is authoritative.

### Clients

Clients move toward Firebase Authentication:

- Google Sign-In;
- passwordless email link;
- legacy password login temporarily retained.

Firebase is identity only. Firestore is not used for Immigration Horizons domain data.

**Client Firebase implementation is not the primary delivery target of this Phase 02 cycle.** Do not let Firebase setup delay the working Angular employee core. If safe, establish only the backend/frontend seams or documentation needed for the later client-auth cycle.

### Employees/admins

Employees are not Firebase users for staff authorization.

Employees are explicitly provisioned by administrators through `AdminUser`.

No employee self-signup exists.

Employee flow:

```text
Admin creates employee
        ↓
AdminUser
        ↓
strong temporary password
        ↓
mustChangePassword = true
        ↓
employee signs in
        ↓
forced private password change
        ↓
EmployeeSession
        ↓
role/capabilities
        ↓
workspace/case access
```

The admin may know the temporary credential once; the admin must never know the employee's permanent password.

## 4. Existing employee identity — preserve it

Do not create a new employee collection.

Reuse:

- `AdminUser` / `adminusers`;
- `EmployeeSession` / `employee_sessions`;
- `ih_staff_session`;
- current role/capability map;
- current workspace/member case authorization;
- current lockout helpers;
- current SecurityEvent model/logging.

The existing Next.js `AdminUser` is a mirror; Express/admin owns employee credential creation and validation. Keep cross-runtime schema compatibility.

## 5. Additive AdminUser credential-lifecycle fields

Audit actual current models first.

If not already present, add backwards-compatible fields to the Express-owned `AdminUser` and the Next.js mirror as appropriate:

```text
mustChangePassword: boolean, default false
credentialIssuedAt: Date | null
passwordChangedAt: Date | null
jobTitle: string (optional)
department: string (optional)
createdBy: ObjectId | null (only if useful and safe)
```

Do not make newly added fields required for legacy rows.

Do not hand-edit only one runtime's shared schema.

If schema-contract fixtures exist for shared models, update/generate them according to existing repo conventions.

## 6. Admin-created employee credentials

The current CMS already owns `/admin/users` and `users.manage`.

Enhance this existing administrative surface rather than creating a parallel employee-provisioning system.

Required behavior:

- authorized admin chooses name, email, role and status;
- server generates a cryptographically strong temporary password OR accepts an explicitly chosen temporary password only if existing UX/requirements demand it;
- prefer server-generated temporary credential;
- hash through the existing bcrypt ownership path;
- set `mustChangePassword = true`;
- set `credentialIssuedAt`;
- record a SecurityEvent;
- display the temporary password to the creating/resetting administrator **once**;
- never persist plaintext temporary password;
- never put it in application logs, activity metadata, URL params or analytics;
- never add a "view password" function.

Reset-credential operation:

- requires `users.manage`;
- generates a fresh temporary credential;
- sets `mustChangePassword = true`;
- updates `credentialIssuedAt`;
- revokes every EmployeeSession for that employee;
- records SecurityEvent;
- returns/displays the new temporary password once.

Account deactivation must continue to revoke/fail existing sessions according to existing semantics.

Do not build the future Angular admin-console user-management module in this cycle unless it is tiny and does not distract from the staff working core. Existing EJS admin can remain the provisioning surface for Phase 02.

## 7. Canonical Express API

Create a versioned JSON API under `/api/v1` inside the existing Express application.

Recommended structure (adapt to existing conventions where justified):

```text
server/routes/api/v1/
  index.js
  staff/
    session.js
    me.js
    dashboard.js
    cases.js
    clients.js
    tasks.js

server/middleware/api/
  requestId.js
  apiError.js
  staffAuth.js
  trustedOrigin.js
  validation.js

server/services/staff/
  staffSession.js
  staffDashboard.js
  staffCaseRead.js
  staffClientRead.js
  staffTaskRead.js
```

Do not introduce NestJS or another backend runtime.

Angular never imports backend models.

## 8. API mount and CSRF/origin boundary

Current EJS admin uses synchronizer-token CSRF via Express session.

Do not make Angular JSON API calls depend on EJS form CSRF tokens.

Keep two deliberate boundaries:

```text
Legacy EJS admin mutations
→ existing express-session + synchronizer CSRF

Angular staff API mutations
→ EmployeeSession cookie + trusted Origin verification + server auth/policy
```

Mount `/api/v1` so existing EJS CSRF behavior is preserved while API JSON calls have their own reviewed middleware.

Do not disable current admin CSRF globally.

## 9. EmployeeSession support in Express

Express canonical API must be able to validate/create/revoke the exact existing `employee_sessions` contract.

If Express currently lacks an EmployeeSession model/service, add a mirror matching the actual Next.js collection/schema semantics.

Preserve:

- opaque random session token in browser;
- SHA-256 token hash at rest;
- absolute timeout;
- idle timeout;
- HttpOnly;
- Secure in production;
- SameSite=Lax unless an explicit reviewed host requirement says otherwise;
- live `AdminUser` lookup each request;
- deactivated user fails closed;
- role changes become effective without waiting for a new login.

Do not use JWT/localStorage.

## 10. Staff authentication endpoints

Implement real endpoints such as:

```text
POST /api/v1/staff/session/login
POST /api/v1/staff/session/logout
GET  /api/v1/staff/me
POST /api/v1/staff/account/initial-password
```

Exact names may differ slightly if REST consistency improves them.

### Login

Preserve existing production security behavior:

- normalize email;
- generic invalid-credential response;
- constant-cost password comparison for unknown accounts;
- per-account lockout;
- IP rate limiting;
- inactive-account denial;
- role validation;
- trusted Origin/CSRF strategy;
- SecurityEvent recording;
- session token generation only after successful credential validation.

### First-login password rule

If an otherwise valid employee has `mustChangePassword === true`:

- authenticate the credential but do **not** grant unrestricted normal app access;
- issue only the minimum short-lived state/session necessary to complete password setup, or use a carefully designed session flag/state that every protected endpoint enforces;
- route the user to `/setup-password`;
- block dashboard/cases/clients/tasks APIs until the password has been changed;
- require current temporary password or equivalent proof if the design does not already preserve that proof safely;
- validate new password quality using one central policy;
- update the bcrypt hash via the credential-owning backend path;
- set `mustChangePassword = false`;
- set `passwordChangedAt = now`;
- revoke any bootstrap/old sessions and establish a fresh normal EmployeeSession;
- record SecurityEvent;
- never return the new password anywhere.

Do not store the temporary or new password in Angular state longer than the form submission requires.

### `/me`

Return an intentional DTO only, e.g.:

```json
{
  "data": {
    "user": {
      "id": "...",
      "name": "...",
      "email": "...",
      "avatar": null,
      "jobTitle": "...",
      "department": "..."
    },
    "role": {
      "code": "pm",
      "label": "Project Manager"
    },
    "capabilities": ["cases.view"],
    "mustChangePassword": false
  },
  "meta": { "requestId": "..." }
}
```

Never expose password, hashes, lockout counters, session token/hash or unrelated database fields.

## 11. Request IDs and JSON contract

Every API request gets a correlation/request ID.

Return `X-Request-Id` and/or the ID in response metadata.

Use one JSON error format. Example:

```json
{
  "error": {
    "code": "unauthenticated",
    "message": "Authentication required.",
    "fieldErrors": null,
    "requestId": "..."
  }
}
```

Use stable machine-readable codes such as:

- `invalid_input`;
- `unauthenticated`;
- `forbidden` where appropriate;
- `not_found` for concealed restricted resources;
- `conflict`;
- `rate_limited`;
- `password_change_required`;
- `server_error`.

No production stack traces in JSON.

## 12. Health/readiness

Implement:

```text
GET /api/v1/health
```

Optionally add readiness with a tight Mongo check if helpful.

Never expose credentials, Mongo URI or secrets.

## 13. Real dashboard

Implement:

```text
GET /api/v1/staff/dashboard
```

Reuse/migrate the existing dashboard semantics rather than inventing new metrics.

Preserve values such as:

- `myCases`;
- `unassignedCases`;
- `upcomingDeadlines`;
- `documentsAwaitingReview`;
- `overdueDocumentRequests`;
- `unansweredQueries`;
- `queriesAwaitingScheduling`;
- `unreadClientMessages`;
- `myOpenTasks`;
- `myOverdueTasks`.

Preserve semantic difference:

- `null` = employee role does not hold that remit;
- `0` = employee may see the metric but no records exist.

Return actionable recent/priority case rows and assigned work where useful.

No fake cards or fake chart data.

## 14. Real cases API

Implement real authorized reads such as:

```text
GET /api/v1/staff/cases
GET /api/v1/staff/cases/:caseId
GET /api/v1/staff/cases/:caseId/members
GET /api/v1/staff/cases/:caseId/activity
```

Reuse current policy semantics from `employee-case-policy` / server case policy.

List supports server-side:

- search;
- stage;
- case type;
- priority;
- scope;
- archived state;
- page;
- limit.

Filters may only narrow the caller's authorized set.

Search input must be literal/escaped, not arbitrary regex execution.

Respect capability plus membership / `cases.view_all` semantics.

Restricted or nonexistent case behavior must remain indistinguishable where current policy requires concealment.

Return deliberate DTOs. Do not serialize raw Mongoose documents.

Useful list fields:

- id;
- case number;
- title;
- case type;
- stage;
- priority;
- target filing date;
- project-manager summary;
- primary-client summary where allowed;
- updated time;
- archived state.

## 15. Real client API

Implement:

```text
GET /api/v1/staff/clients
GET /api/v1/staff/clients/:clientId
```

Preserve existing client policy:

- directory is gated by `clients.view`;
- case-scoped panels inside a client record remain filtered by case access;
- restricted case identities must not leak through memberships or counts.

Support existing useful filters:

- search;
- status;
- case state;
- page;
- limit.

Preserve:

- `null` panel = caller has no capability for that panel;
- `[]` = caller can see it and there are no rows.

Never expose `passwordHash` or internal auth fields.

## 16. Real assigned-task API

Implement:

```text
GET /api/v1/staff/tasks?scope=mine
```

Current Task is still consultation/lead-scoped. Do not falsely present it as a case-native task system.

Return real assigned work and label its source honestly.

Case-native tasks/deadlines remain the next domain cycle.

## 17. OpenAPI

Create a real OpenAPI spec for **only the endpoints implemented in Phase 02**, e.g. `server/openapi/v1.yaml`.

Document:

- auth cookie/session behavior;
- request/response envelopes;
- errors;
- pagination;
- filters;
- implemented DTOs.

Do not describe speculative future endpoints as implemented.

## 18. Angular API/auth foundation

In `case-management`, replace the Phase 01 placeholder `ApiService` / `AuthService` with real infrastructure.

Use Angular `HttpClient`.

Use same-origin relative URLs:

```text
/api/v1/...
```

For local development, configure Angular dev proxy to the local Express API.

Do not solve local development by enabling wildcard production CORS.

Auth service should expose real state using Signals/services as appropriate:

- `login()`;
- `logout()`;
- `loadSession()`;
- `changeInitialPassword()`;
- current user;
- role;
- capabilities;
- authenticated state;
- password-change-required state;
- `hasCapability()`.

Refresh must work because the browser session is HttpOnly.

Angular must not attempt to read the cookie.

## 19. Angular routing

Functional routes after Phase 02:

```text
/login
/setup-password
/dashboard
/cases
/cases/:caseId
/clients
/clients/:clientId
/tasks
```

Root should redirect based on session state.

Do not expose Evidence, Forms, Petition, Filing, USCIS, Reports, etc. as fake routes/nav items yet.

If a route is visible, it must work with real backend data.

## 20. Immigration Horizons UI/UX

Phase 01 generic bright-blue/violet styling is temporary and must be replaced.

Follow the existing production brand system.

Canonical colors:

```text
Navy 950  #08132A
Navy 900  #0F1F3D
Navy 800  #152C54
Navy 700  #223A61

Gold 500  #C9992E
Gold 400  #D6AC46
Gold 300  #E4C46F

White     #FFFFFF
Ink 50    #F7F8FA
Ink 100   #EFF1F5
Ink 200   #E1E5EC
Ink 500   #6B7688
Ink 700   #38414E
Ink 900   #141922
```

Admin must not use an unrelated violet brand.

Typography:

- Inter for application UI/tables/forms/navigation/body;
- Source Serif 4 only for selective premium brand/display moments;
- no third font family;
- prefer bundled/self-hosted fonts rather than runtime Google Fonts import.

Use real Immigration Horizons logo assets from the repo. Remove the generic Phase 01 inline SVG logo.

The owner has also provided additional brand artwork outside the repo. If those exact files are available in the Antigravity worktree, normalize and bundle useful logo variants. Do not block if they are not locally available; use the existing official `public/images/logo-header.png` / other approved repo assets.

Social/poster artwork is a design reference, not an authenticated dashboard wallpaper.

## 21. Premium staff shell

Build a real professional enterprise shell:

- deep navy sidebar;
- real Immigration Horizons logo;
- gold active-state rule/accent;
- white header;
- light neutral work surface;
- role-aware navigation;
- employee name/avatar initials/role;
- real logout;
- responsive mobile drawer;
- keyboard navigation;
- no fake search/notification buttons unless they perform a real function.

Visible nav in this cycle should normally be only:

- Dashboard;
- Cases;
- Clients when capability allows;
- Tasks.

## 22. Login UX

Create a premium two-panel desktop login page and a clean single-column mobile version.

Use real brand identity, not a generic Angular admin template.

Fields:

- email;
- password;
- password visibility toggle;
- submit/loading state;
- accessible validation and server error states.

Do not show a public employee signup link.

Do not show a fake forgot-password flow. Admin-provisioned credential reset is the approved first recovery mechanism.

Helpful copy can state that staff accounts are created by Immigration Horizons administrators.

## 23. Setup-password UX

When `mustChangePassword` is true, route to `/setup-password`.

Page should clearly explain that the temporary password must be replaced before accessing client matters.

Fields:

- current/temporary password if required by backend design;
- new password;
- confirm password;
- show/hide controls;
- clear password policy guidance;
- strength/validation feedback that is useful, not gimmicky.

After success, create/confirm a normal fresh employee session and route to dashboard.

## 24. Dashboard UX

Remove all Phase 01 placeholder cards and the `Phase 01 — Shell` badge.

Use real authorized metrics only.

Recommended hierarchy:

1. concise page title/welcome;
2. role-relevant metrics;
3. cases needing attention/recent cases;
4. my tasks;
5. operational queues relevant to the employee role.

Do not render a metric when backend returns `null` for no remit.

Every action/link must lead to a real working screen.

## 25. Case list UX

Enterprise data table with real server filtering/pagination.

Filters:

- search;
- stage;
- case type;
- priority;
- scope;
- archived toggle.

Columns as data permits:

- case number;
- case/title;
- client;
- type;
- stage;
- project manager;
- priority;
- target filing date;
- updated.

Use URL query params for shareable/back-button-friendly filters where practical.

Include polished skeleton/loading, empty and failure states.

Do not show Create Case in Angular yet unless a canonical create API is deliberately implemented and tested; case writes are next cycle.

## 26. Case workspace UX

Build the first real read-only case workspace.

Header:

- case number;
- title;
- case type;
- current stage;
- priority;
- primary client;
- project manager;
- target filing date.

Tabs in Phase 02 only where real data exists:

- Overview;
- Team;
- Activity.

Do not add empty Evidence/Forms/Petition/Filing/USCIS tabs.

Overview can show real:

- case information;
- client summary;
- stage/progress;
- important dates;
- team summary;
- currently available operational counts/metadata.

Team uses actual workspace membership.

Activity uses actual CaseActivity.

## 27. Client list/detail UX

Client list:

- Name;
- Email;
- Status;
- Case count;
- Last login;
- Created;
- real search/status/case-state filters;
- pagination.

Client detail:

- identity/header information;
- cases;
- consultations;
- memberships;
- documents where authorized;
- queries where authorized;
- communication where authorized;
- notifications where appropriate.

The UI must distinguish "no permission for this panel" from "permission but no records" according to API `null` vs empty-list semantics.

## 28. Tasks UX

Build a real My Tasks view using existing assigned tasks.

Show:

- task/title;
- type;
- status;
- priority;
- due date;
- source lead/consultation as applicable.

Do not imply case-native task linkage that does not exist yet.

## 29. Shared UI primitives

Build only reusable primitives needed by real Phase 02 screens, such as:

- BrandLogo;
- Button/IconButton;
- Input/Select;
- Badge/StatusBadge;
- Card/MetricCard;
- table primitives;
- Pagination;
- FilterBar;
- Skeleton;
- EmptyState;
- ErrorState;
- PageHeader;
- Breadcrumb;
- Avatar;
- Tabs;
- Timeline.

Do not generate a huge unused design system.

Use one consistent icon family compatible with Angular; the existing design system specifies Lucide.

## 30. Accessibility

Target WCAG 2.1 AA minimum.

Required:

- semantic headings;
- visible focus;
- keyboard-operable navigation/forms/tabs;
- accessible mobile drawer;
- `aria-current` navigation;
- form labels and associated errors;
- adequate contrast;
- reduced-motion respect;
- no color-only status meaning;
- touch-friendly interactive targets.

Gold 500 is an accent/fill, not small body text on white.

## 31. Security test matrix

Employee auth tests:

- valid provisioned employee login;
- wrong password;
- unknown email constant-cost path;
- lockout;
- inactive employee;
- missing/invalid role;
- employee with `mustChangePassword=false` gets normal session;
- employee with `mustChangePassword=true` cannot access working APIs;
- successful initial password change;
- old temporary password no longer works;
- permanent password is never returned/logged;
- admin reset creates a new one-time temporary credential;
- reset revokes all EmployeeSessions;
- idle expiry;
- absolute expiry;
- logout;
- revoked session;
- role change takes effect next request;
- deactivation takes effect next request;
- client cookie cannot authenticate staff API;
- trusted-origin rejection;
- rate limiting;
- SecurityEvent recording.

Case authorization tests:

- unauthenticated denied;
- employee lacking `cases.view` denied/concealed;
- specialist without active membership cannot see case;
- specialist with active membership can see it;
- `cases.view_all` role can see allowed org-wide case data;
- removed membership revokes access;
- filters/search cannot widen access;
- malformed case id follows concealment behavior;
- client session cannot access staff case endpoint.

DTO contract tests must assert sensitive fields never leak:

- password;
- passwordHash;
- token/tokenHash;
- private storage key/path;
- secrets;
- irrelevant auth metadata.

## 32. Angular tests

Test user-visible behavior, not just component creation.

At minimum cover:

- AuthService session bootstrap;
- login success/failure;
- password-change-required flow;
- setup-password form;
- auth guard;
- capability-aware nav;
- dashboard `null` vs `0` rendering;
- case filters/pagination states;
- case detail/team/activity;
- client list/detail states;
- task list;
- loading/error/empty states;
- API error handling.

## 33. CI and regression

Preserve all existing CI jobs.

Run all relevant validation before completion.

Root:

```bash
npm ci --no-audit --no-fund
npm run lint
npx tsc --noEmit
npm test
npm run build
```

Server:

```bash
cd server
npm ci --no-audit --no-fund
npm test
cd ..
```

Angular:

```bash
cd enterprise-ui
npm ci --no-audit --no-fund
npm test
npm run build
cd ..
```

Also:

```bash
git diff --check
```

Do not apply production migrations/indexes.

## 34. Database/index policy

Prefer no new domain collections in this cycle.

Permitted additive auth lifecycle fields on `AdminUser` are part of this approved design.

If a new index is genuinely required for a new field:

- document it;
- register it through existing index tooling;
- dry-run only;
- do not apply it to production in Phase 02.

No collection renames.

No destructive migration.

## 35. Git commits

Use atomic commits, for example:

```text
docs(auth): define employee credential lifecycle
feat(auth): add employee credential lifecycle fields
feat(admin-users): issue temporary employee credentials
feat(api): add v1 request and error infrastructure
feat(api-auth): add canonical employee session endpoints
feat(api): expose staff dashboard reads
feat(api): expose authorized case and client reads
feat(api): expose assigned task reads
feat(angular-auth): connect employee sign-in and initial password setup
feat(angular-ui): apply Immigration Horizons enterprise design system
feat(angular-dashboard): render real operations dashboard
feat(angular-cases): add authorized case workspace reads
feat(angular-clients): add client operations reads
feat(angular-tasks): add assigned work view
test(phase-02): cover auth and row-level API boundaries
docs(phase-02): record working core implementation
```

Do not push to `main`.

Do not deploy.

## 36. Completion report

Create:

`docs/implementation/PHASE_02_WORKING_CORE_REPORT.md`

Record:

- starting SHA;
- ending SHA;
- working branch;
- starting worktree state;
- pre-existing anomalies preserved;
- files changed;
- model/schema additions;
- API endpoints implemented;
- employee credential lifecycle;
- Angular routes implemented;
- UI/brand changes;
- services extracted/reused;
- OpenAPI location;
- tests and exact results/counts;
- database effects;
- index effects;
- migration effects;
- production routing effects;
- deployment effects;
- known limitations;
- rollback procedure.

Update the roadmap honestly. This Phase 02 absorbs the old roadmap objectives for original Phases 02–05 only if every relevant exit criterion truly passes.

## 37. Completion gate

Phase 02 is complete only when all of the following are true:

- an admin can provision/reset an employee with a temporary credential using the existing admin-owned user path;
- plaintext employee credentials are never stored;
- first-login password change is enforced when required;
- real Angular employee login works;
- real session survives refresh;
- real logout works;
- `/me` works;
- real dashboard works;
- real case list/filter/pagination works;
- real authorized case detail works;
- real team/activity reads work;
- real client list/detail works for authorized roles;
- real assigned tasks work;
- row-level access tests pass;
- client/staff cookie isolation tests pass;
- no fake case/client/task/dashboard data exists;
- no Phase 01 placeholder copy remains in the staff application;
- real Immigration Horizons branding is used;
- purple admin branding is removed;
- loading/empty/error states are polished;
- responsive/mobile behavior is usable;
- Angular tests/build pass;
- server tests pass;
- existing Next.js tests/build pass;
- CI remains green;
- production routing is unchanged;
- Firestore has not been introduced.

## STOP

Stop after Phase 02.

Do not begin case write/mutation migration, evidence, documents migration, smart forms, petition workflow, filing packets or USCIS tracking in the same cycle.

The next planned cycle after successful Phase 02 is **Canonical Case Mutations**: assignment, stage changes, workspace membership and related writes through the canonical API.