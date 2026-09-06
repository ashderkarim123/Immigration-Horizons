# Phase 03 — Core Hardening + Canonical Case Operations

This document is an **implementation command** for Antigravity / Claude / Gemini working in the live Immigration Horizons repository.

Do not treat this as a planning-only cycle. It has a strict two-gate execution order:

1. **Gate A — close Phase 02 correctly and make the working core safe/green.**
2. **Gate B — make real case operations writable through the canonical API and Angular UI.**

Gate B must not begin until every Gate A P0/P1 item is fixed and verified.

---

## Repository / branch

Repository:

```text
ashderkarim123/Immigration-Horizons
```

Working branch:

```text
architecture/angular-enterprise-platform
```

Do **not** work on `main`.

The Phase 02 implementation that was externally audited was:

```text
5e9ec0c0cb2ff5b13d235071a7bd223e63b9b2b1
```

Documentation-only commits were added after that implementation. Always pull the latest remote branch and record the actual starting SHA before editing.

---

# 0. Mandatory preflight

Before changing anything:

```bash
git fetch origin --prune
git switch architecture/angular-enterprise-platform
git pull --ff-only origin architecture/angular-enterprise-platform
git status --short
git branch --show-current
git rev-parse HEAD
git log --graph --decorate --oneline -25
git diff
git diff --cached
```

Read:

```text
CLAUDE.md
AGENTS.md
.claude/DESIGN_SYSTEM.md
.claude/SECURITY.md
.claude/API_ARCHITECTURE.md
.claude/DATABASE.md
.claude/TESTING.md

docs/architecture/ADR-002-case-workspace-domain.md
docs/architecture/ADR-007-admin-case-operations.md
docs/architecture/ADR-009-employee-saas-shell.md
docs/architecture/ADR-010-staff-case-operations.md
docs/architecture/ADR-012-security-privacy-and-audit.md
docs/architecture/ADR-014-migrations-and-retention.md
docs/architecture/ADR-015-angular-enterprise-platform.md
docs/architecture/ADR-016-authentication-boundaries.md

docs/implementation/PHASE_02_WORKING_CORE_PROMPT.md
docs/implementation/PHASE_02_WORKING_CORE_REPORT.md
docs/implementation/PHASE_02_VERIFICATION_AUDIT.md
```

Code is authoritative where documentation is stale.

Never discard unexplained local changes.

---

# Product mission reminder

Immigration Horizons is becoming a **complete immigration case-management platform**, not an Angular demo and not a collection of static dashboard pages.

Long-term surfaces:

```text
immigrationhorizons.com
    Next.js public marketing / SEO / services / blog / lead capture

app.immigrationhorizons.com
    Angular employee case-management application

admin.immigrationhorizons.com
    Angular administration/CMS application later

/api/v1/*
    canonical Node/Express API

MongoDB
    authoritative application database
```

Angular never accesses MongoDB directly.

Do not phase out the public Next.js site.

Do not begin client Firebase migration in this cycle.

Do not introduce Firestore.

---

# PHASE 03 GOAL

When this cycle is complete, a properly authorized employee must be able to use the Angular case-management application to do actual case work—not only read it.

A real employee should be able to:

- sign in through the corrected internal employee-auth flow;
- complete mandatory first-login password setup;
- see only their authorized cases/clients;
- search/filter/paginate real case and client directories;
- open a complete real case workspace overview;
- view the real case team and `CaseActivity` timeline;
- update case stage when authorized;
- change the project manager when authorized;
- add/reactivate/remove case team members when authorized;
- archive a case when authorized;
- publish a client-visible case update when authorized;
- see every successful mutation reflected in the case activity/system-message/notification behavior already implemented by the domain services;
- receive clear validation, conflict, empty, loading and success/error feedback;
- never obtain a mutation simply by manipulating Angular state.

Additionally, administrators must be able to provision employee credentials according to ADR-016 so the employee login architecture is actually usable in practice.

---

# HARD RULE: reuse the existing domain services

Do not recreate case business logic in the API route or Angular.

The repository already has real write services:

```text
server/services/caseManagement.js
server/services/casePolicy.js
server/services/workspaceMembership.js
server/services/systemMessageService.js
server/services/caseConversion.js
```

Existing `caseManagement.js` already owns semantics for:

```text
loadCaseAndWorkspace
updateStage
changeProjectManager
archiveCase
addEmployeeMember
addClientMember
removeMemberFromCase
```

The canonical API must call these services.

The legacy EJS admin routes and the new API must converge on the same service behavior.

Never implement a separate Angular interpretation of:

- PM reassignment;
- membership reactivation;
- former-PM downgrade behavior;
- primary-client removal restriction;
- current-PM removal restriction;
- case activity events;
- notification emission;
- system-message emission;
- valid stage transitions/values.

---

# GATE A — PHASE 02 CLOSURE

Gate A must be completed and committed before case-write work begins.

## A1. Make CI green without dependency bypasses

The latest audited Phase 02 CI failed at Angular `npm ci` because `lucide-angular@1.0.0` does not declare Angular 22 support.

Resolve it properly.

Allowed approach:

- verify whether a newer maintained Lucide Angular package/version explicitly supports Angular 22;
- if yes, pin/use that compatible version;
- otherwise implement a small reviewed icon adapter using safe static SVG assets/components until official support exists.

Not allowed:

```text
--force
--legacy-peer-deps
npm config set legacy-peer-deps true
ignoring peer dependency failures in CI
```

After the dependency fix, both Angular applications must install from the committed lockfile and build in a clean environment.

## A2. Remove Firebase from employee case-management runtime

ADR-016 is explicit:

```text
clients      → Firebase identity later
employees    → Immigration Horizons managed credentials
```

The Phase 02 implementation added Firebase/Analytics to the employee Angular application even though no employee feature requires it.

Unless the audit proves a concrete approved employee requirement, remove:

```text
case-management/core/firebase/firebase.service.ts
Firebase environment generation used only by staff
Firebase staff Angular dependency
unused Firebase build scripts/config
```

If the root `firebase` dependency was added only for this unfinished staff integration and no current client feature uses it, remove it too. Re-add Firebase when the client authentication phase actually begins.

Do not introduce Firestore.

## A3. Fix staff login lockout persistence

Read:

```text
server/utils/lockout.js
src/app/api/staff/login/route.ts
server/routes/api/v1/staff/session.js
```

`failedLoginUpdate()` and `successfulLoginUpdate()` return patches. They do not save the user.

Fix the Express API login path to apply the patches through `AdminUser.updateOne()` exactly as the existing hardened Next/admin login flows do.

Required behavior:

- wrong password increments account failure count;
- fifth failure creates the shared lock;
- the lock applies to both admin and API login surfaces;
- successful login clears counters and stamps `lastLoginAt`;
- do not use a full `user.save()` in the login path if that revalidates unrelated legacy fields or double-hashes credentials.

Use a valid precomputed/computed dummy bcrypt hash with the same cost for nonexistent accounts.

## A4. Restore the security-event contract

Read:

```text
server/models/SecurityEvent.js
src/lib/models/SecurityEvent.ts
docs/architecture/security-event-contract.json
server/utils/securityEvents.js
```

The API must use existing allowed values.

Correct at minimum:

```text
surface: staff
login success type: login_succeeded
```

Never use undeclared `staff_api` or `login` values unless the shared contract is deliberately and compatibly extended.

Add tests proving emitted events are actually persisted, not merely attempted.

Origin/CSRF rejections on the staff API should also record a valid `csrf_rejected` event where the existing contract requires it.

## A5. Generic anonymous login errors

Unknown account, bad password, account lock, deactivated account and unusable role must not unnecessarily reveal account state to an anonymous caller.

Return a generic external auth failure such as:

```text
Invalid email or password.
```

Record the real failure reason only in `SecurityEvent.meta.reason`.

A successful credential for an account that must change its password may return the setup requirement after authentication.

## A6. Server-side first-login enforcement

Angular guards are not security controls.

Apply `mustChangePassword` enforcement on the API.

While `mustChangePassword === true`, the authenticated employee may access only the minimum required endpoints, for example:

```text
GET  /api/v1/staff/me
POST /api/v1/staff/session/logout
POST /api/v1/staff/account/initial-password
```

Normal dashboard/case/client/task/mutation endpoints must reject until setup completes.

Add direct HTTP integration tests that bypass Angular and prove this.

## A7. Complete administrator-provisioned employee credentials

The existing `/admin/users` CMS still requires the administrator to type a password and does not automatically enter the ADR-016 lifecycle.

Complete the provisioning flow now.

### Create employee

An authorized user with `users.manage` should enter:

```text
name
email
role
job title (optional)
department (optional)
```

The server should generate the temporary credential using `crypto.randomBytes()` / a cryptographically strong generator.

Do not let the admin choose a weak permanent employee password.

On creation:

```text
mustChangePassword = true
credentialIssuedAt = now
passwordChangedAt = null
isActive = true unless explicitly creating inactive
```

Only the bcrypt hash is persisted.

The generated temporary credential may be shown **once** in the immediate success response/page so the administrator can securely copy/share it.

It must never be:

- stored in plaintext;
- written into SecurityEvent metadata;
- written into ActivityLog metadata;
- logged to stdout/stderr;
- placed in a query string;
- included in analytics.

Refreshing the page must not reveal it again.

### Reset employee credentials

Add a `users.manage`-protected reset operation.

Reset must:

- generate a new strong temporary password;
- replace the bcrypt hash;
- set `mustChangePassword=true`;
- set `credentialIssuedAt=now`;
- revoke all `EmployeeSession` rows for that employee;
- show the temporary credential once;
- audit the reset without recording the credential.

Privilege safety:

- an ordinary `admin` must not be able to create/reset/demote/disable a `super_admin` in a way that violates existing super-admin protections;
- preserve all existing anti-privilege-escalation rules.

### Deactivate employee

When an employee is deactivated, revoke all employee sessions immediately.

### Permanent password

The employee sets their own private password on first login.

The admin can never retrieve/view it.

Improve the setup form to include confirmation and accessible validation.

Use a reasonable minimum length (at least 12 characters unless an existing stronger project policy already exists). Do not impose arbitrary periodic expiry.

## A8. Security-event lifecycle for employee administration

Use existing event types where semantically correct. If new types are required for provisioning/status/role events, extend the shared security-event contract **additively and in both runtimes**.

Potential explicit events if required:

```text
employee_account_created
temporary_credential_issued
employee_account_status_changed
employee_role_changed
```

If added:

- update Express model;
- update Next model;
- update `security-event-contract.json`;
- update generated/contract tests;
- add no destructive migration.

Never record a password or temporary credential.

## A9. Fix trusted-origin matching

Do not use:

```js
host.endsWith('immigrationhorizons.com')
```

because it also matches `evilimmigrationhorizons.com`.

Allow only:

```text
host === immigrationhorizons.com
OR
host ends with .immigrationhorizons.com
```

plus explicitly supported localhost development hosts.

Test the malicious suffix case.

## A10. Replace raw ClientUser responses with explicit DTOs

`GET /api/v1/staff/clients/:id` must never spread a raw ClientUser document.

Build/reuse an Express equivalent of the existing hardened Next read model:

```text
src/lib/auth/employee-client-policy.ts
```

The Express implementation should preserve its semantics rather than re-inventing them.

Client list DTO:

```text
id
name (derived firstName + lastName, email fallback)
email
status
caseCount (authorized cases only)
lastLoginAt
createdAt
```

Do not expose:

```text
passwordHash
failedLoginCount
internal session values
tokens
secrets
raw Mongoose document
```

Client detail may expose intentional operational security state only where product requirements justify it, e.g. `lockedUntil` or `hasPassword`; never the credential itself.

## A11. Restore client row-level case scoping

Mirror `employee-client-policy.ts` behavior.

The client directory itself is organization-wide for a role with `clients.view`.

But every **case-scoped panel** on a client record must be intersected with the actor's case access.

A PM must not learn another team's case number/title through a client detail page.

Preserve the useful semantic:

```text
null = this role does not have this panel/capability
[]   = authorized, but nothing exists
```

## A12. Correct client field mapping

`ClientUser` has:

```text
firstName
lastName
email
status
```

It does not have a canonical persisted `name` field or `portalStatus` field.

Derive a display name. Do not add duplicate fields solely to satisfy Angular.

Remove `portalStatus` UI unless it maps to a real existing concept.

## A13. Fix case detail read model

Do not use lead `ActivityLog` for case history.

Use:

```text
CaseActivity
```

Read/reuse the semantics of:

```text
src/lib/staff/case-detail.ts
```

Correct document DTO fields:

```text
displayName
status
category
uploadedAt
uploadedByType
size
versionCount
scanStatus
```

Do not request a nonexistent `CaseDocument.title`.

Correct client population to `firstName lastName email`, not a nonexistent `name`.

## A14. Preserve case-existence concealment

For case-scoped APIs, an inaccessible case must not become an existence oracle.

Unless an ADR explicitly says otherwise, use the same external not-found response for:

- malformed case ID;
- nonexistent case;
- inaccessible case;
- archived case where the route intentionally excludes archived records.

Do not return `403` merely because the record exists but the user lacks workspace access.

## A15. API DTO discipline

Every API endpoint must return an intentional DTO.

Do not spread `.lean()` records directly into JSON.

Add contract tests that recursively reject sensitive property names such as:

```text
password
passwordHash
token
tokenHash
storageKey
privatePath
secret
```

where those values are not explicitly part of a secure endpoint contract.

## A16. Finish case/client directory UX

Phase 02 backend pagination/filtering exists, but Angular does not expose it.

Before Gate A closes, make the read screens truly operational.

### Cases

Working server-backed controls:

```text
search
stage
case type
priority
scope
archived toggle when authorized/useful
page
page size
```

Keep filters in URL query parameters where practical so refresh/back/forward works.

Render:

```text
Case #
Client
Title
Type
Stage
Project Manager
Priority
Target Filing
Updated
```

### Clients

Working server-backed controls:

```text
search
status
caseState
page
page size
```

Render:

```text
Name
Email
Status
Authorized Case Count
Last Login
Created
```

Both pages require:

- skeleton/loading state;
- explicit empty state;
- retryable error state;
- accessible pagination;
- responsive horizontal-table handling;
- no fake data.

## A17. Split/normalize case-detail reads where useful

Prefer clear bounded endpoints rather than one uncontrolled document dump.

A good target is:

```text
GET /api/v1/staff/cases/:caseId
GET /api/v1/staff/cases/:caseId/members
GET /api/v1/staff/cases/:caseId/activity
```

Additional panel endpoints should be introduced only when real features need them.

Case detail response may also include server-computed action flags such as:

```text
canManageCase
canAssignManager
canManageMembers
canArchive
canPublishClientUpdate
```

These flags improve UX but never replace server authorization on mutations.

## A18. OpenAPI must describe the real contract

Expand `server/openapi/v1.yaml` for every implemented Phase 02 endpoint with:

- cookie auth scheme;
- DTO schemas;
- pagination schemas;
- filter parameters;
- error envelope;
- request ID;
- 400/401/403/404/409/429/500 behavior where relevant.

Do not document future endpoints until they exist.

## A19. Add the missing tests

No Phase 02 implementation should be accepted without tests for the new API.

Create real Express API integration tests using the isolated test DB and `createApp()`/supertest conventions already used by the server test suite.

Required minimum matrix:

### Authentication

- valid employee login;
- unknown email generic failure;
- wrong password generic failure;
- lockout increments/persists;
- fifth failure locks;
- locked response remains generic;
- deactivated response remains generic;
- successful login clears counters and stamps login;
- correct security events persist;
- logout deletes session;
- session refresh/idle touch;
- absolute expiry;
- idle expiry;
- deactivation revokes/invalidates current session;
- role change takes effect on next request;
- client cookie cannot authenticate as employee;
- temp-password user cannot directly call dashboard/cases/clients/tasks;
- initial password change revokes old sessions and creates a fresh usable one.

### Trusted origin

- valid app origin accepted;
- valid admin/subdomain accepted only where intended;
- missing origin on mutation rejected;
- `evilimmigrationhorizons.com` rejected;
- CSRF rejection event persists where required.

### Case read

- no `cases.view` denied;
- specialist without membership concealed;
- specialist with active membership allowed;
- removed membership concealed;
- admin/view_all allowed;
- malformed/nonexistent/inaccessible behavior indistinguishable;
- list filters never widen access.

### Client read

- no clients.view denied;
- PM may open client directory;
- PM sees only case-scoped panels for cases they may view;
- passwordHash never appears;
- client list displayName is correct;
- caseCount is based only on authorized cases;
- null-vs-empty panel semantics preserved.

### Angular

Add meaningful tests for:

- AuthService session bootstrap;
- auth/first-password guards;
- login success/failure;
- setup-password confirmation/flow;
- capability-aware navigation;
- case filters/pagination URL state;
- client filters/pagination;
- loading/empty/error states;
- case detail read rendering.

Do not count "component instantiates" as sufficient behavior coverage.

## A20. Gate A verification

Run from clean installs:

```bash
# root
npm ci --no-audit --no-fund
npm run lint
npx tsc --noEmit
npm test
npm run build
npm run db:indexes:dry-run

# server
cd server
npm ci --no-audit --no-fund
npm test
cd ..

# angular
cd enterprise-ui
npm ci --no-audit --no-fund
npm test
npm run build
cd ..

git diff --check
```

Do not proceed to Gate B unless all applicable checks are green.

Commit Gate A separately.

Recommended commit grouping:

```text
fix(auth): restore staff login lockout and audit contract
fix(api): enforce initial password boundary server-side
feat(admin-users): add temporary employee credential lifecycle
fix(api): harden client and case read DTOs
fix(angular): restore Angular 22 dependency compatibility
feat(angular): finish case and client directory controls
test(api): cover staff auth and row-level read boundaries
test(angular): cover working core behavior
docs(phase-02): close verification findings
```

---

# GATE B — CANONICAL CASE OPERATIONS

Only begin after Gate A is green.

## B1. API actor snapshot

The existing `server/utils/actorSnapshot.js` currently normalizes the legacy EJS `req.session.adminUser`.

The canonical API authenticates through `req.staff`.

Create/extend one actor helper that safely supports both transports without changing legacy behavior.

Expected API actor:

```text
type: admin_user
id: req.staff._id
name: req.staff.name
```

This actor must be passed to `caseManagement` so `CaseActivity`, membership invitation snapshots, notifications and system messages name the actual employee—not `System`.

Add a contract test for both EJS-session and API-staff actor shapes.

## B2. Case mutation API endpoints

Expose the existing domain operations under `/api/v1/staff/cases`.

Recommended routes:

```text
PATCH  /api/v1/staff/cases/:caseId/stage
PATCH  /api/v1/staff/cases/:caseId/project-manager
POST   /api/v1/staff/cases/:caseId/members
DELETE /api/v1/staff/cases/:caseId/members/:memberId
POST   /api/v1/staff/cases/:caseId/archive
POST   /api/v1/staff/cases/:caseId/client-updates
```

Exact REST naming may be adjusted if there is a strong project convention, but keep one canonical versioned contract.

Do not use the legacy EJS routes from Angular.

Each mutation must:

1. authenticate employee;
2. require completed initial-password setup;
3. load case + primary workspace through `caseManagement.loadCaseAndWorkspace`;
4. conceal inaccessible case existence;
5. apply the correct capability/row-level `casePolicy` check;
6. validate body strictly;
7. call the existing domain service;
8. map service outcomes to stable JSON responses;
9. preserve existing CaseActivity/system-message/notification side effects;
10. return an intentional DTO;
11. include request ID;
12. never trust a capability/action flag sent from Angular.

## B3. Stage change

Authorization:

```text
cases.manage
+
casePolicy.canManageCase
```

Use `caseManagement.updateStage`.

Do not duplicate `CASE_STAGE_VALUES` validation in Angular as the security source. Angular may use the values for presentation; backend remains authoritative.

Map outcomes:

```text
updated          → 200
unchanged        → 200 with changed:false
validation_error → 400 fieldErrors
not found/access → 404
```

Verify `CaseActivity.stage_changed` and the existing client-facing stage system message are produced exactly once.

## B4. Project manager change

Authorization:

```text
cases.assign
+
casePolicy.canAssignCase
```

Use `caseManagement.changeProjectManager`.

Preserve these existing invariants:

- new manager must be an active AdminUser;
- new manager gets/reactivates `project_manager` membership;
- previous project manager remains a contributor unless explicitly removed separately;
- never leave two active project_manager-role memberships because of the handover logic;
- notification is emitted to the new manager;
- CaseActivity records the previous/new manager IDs.

Do not broaden `cases.assign` to PM merely to make the UI easier. Current capability policy keeps reassignment admin-tier.

## B5. Employee team membership

Authorization:

```text
workspace.members.manage
+
casePolicy.canManageWorkspaceMembers
```

Use `caseManagement.addEmployeeMember` and `removeMemberFromCase`.

Support:

- add employee;
- reactivate removed employee;
- select workspace role from existing allowed values;
- set client-visible team flag only if existing model/service supports it;
- remove employee;
- protect current PM from removal until reassigned;
- update activity/notification/system messages through existing service side effects.

Do not permit arbitrary workspace-role strings.

## B6. Additional client member

The service already supports `addClientMember`.

Implement the API only if the UI can choose clients without exposing unauthorized client/case information.

Requirements:

- caller must satisfy `workspace.members.manage` and any additional `clients.view` requirement needed to browse candidate clients;
- primary client cannot be removed;
- invited/active membership semantics remain as implemented by `caseManagement`;
- no case access is granted merely because the client directory is visible.

If this cannot be completed safely in this cycle, implement employee team management first and document additional-client membership as the one deferred sub-operation. Do not fake it.

## B7. Archive case

Authorization:

```text
cases.archive
+
casePolicy.canArchiveCase
```

Use `caseManagement.archiveCase`.

Archive is non-destructive.

Require an explicit confirmation in Angular.

Do not create hard-delete behavior.

After archive:

- default active-case list should no longer show the case;
- authorized archived filter may show it if the API supports that scope;
- case activity remains intact.

## B8. Publish client-visible case update

Authorization:

```text
client_updates.publish
+
casePolicy.canViewCase
```

Reuse the existing service/system-message behavior from the legacy admin route.

The update is a deliberate client-visible message, not an internal note.

Validate body length against the existing collaboration constant.

If the required case-updates channel is missing, return a useful structured error rather than pretending success.

Record `CaseActivity.client_update_published` only when the publish succeeds.

## B9. Candidate employee directory for case operations

Angular needs a safe list for assignment/team dialogs.

Create a bounded API only for authorized case managers, for example:

```text
GET /api/v1/staff/cases/:caseId/member-options
```

or a reusable staff directory endpoint if architecture warrants it.

Return only:

```text
id
name
role
jobTitle
department
```

No password/lockout/session fields.

Only active employees.

Apply the record-level case permission before exposing assignment controls/options where appropriate.

## B10. Case workspace Angular UX

Replace the minimal Phase 02 case-detail screen with a professional operational workspace.

Do not build future fake tabs.

For this cycle use only real functionality:

```text
Overview
Team
Activity
```

Documents may appear as a bounded overview card only if it uses correct real read data; the dedicated Documents module remains a later phase.

### Header

Show real:

```text
case number
title
case type
stage
priority
primary client
project manager
target filing date
updated timestamp
```

Show actions only where server-computed/capability state allows them.

Potential actions:

```text
Change stage
Change project manager
Manage team
Publish client update
Archive case
```

### Overview

Show useful real operational cards, not vanity metrics:

```text
case information
important dates
client summary
team summary
available task summary
recent documents summary if authorized
recent activity summary if authorized
```

### Team

Professional member table/list:

```text
Name
Member type
Workspace role
Department / job title when employee
Client-visible state
Membership status
Joined/added date
Actions
```

Provide Add Member and Remove actions only when authorized.

### Activity

Use real `CaseActivity` rows:

```text
type
message
actorName
createdAt
```

Render a chronological/timeline treatment with readable event labels.

Do not render raw meta JSON unless a specifically designed row needs it.

## B11. Mutation UI behavior

Use dialogs/drawers or focused inline panels where they improve workflow.

Requirements:

- forms are keyboard accessible;
- destructive archive/remove requires explicit confirmation;
- submit button has loading state;
- duplicate submissions prevented;
- server validation errors appear beside the relevant field when possible;
- success produces a restrained toast/banner and refreshes affected real data;
- failure preserves user input;
- 401 routes back to login through the existing interceptor/session behavior;
- 404 case mutation behaves like lost/inaccessible case, not "you found a secret case";
- do not use optimistic UI for high-consequence case operations unless rollback is fully handled.

## B12. Capability-aware navigation/actions

Angular may use the `/me` capability list and server-returned record action flags to hide unavailable controls.

But every mutation endpoint must re-check authorization.

Test both:

```text
UI hides control
AND
direct HTTP request is denied/concealed
```

## B13. Keep admin console and staff app visually one brand

Phase 03 case-management UI continues to use the Immigration Horizons system:

```text
navy
#08132A
#0F1F3D
#152C54
#223A61

gold
#C9992E
#D6AC46
#E4C46F

white / ink neutrals
```

Use the real logo.

Do not reintroduce purple admin branding.

Use Inter for dense UI and Source Serif 4 only for limited premium display moments.

Do not turn case pages into marketing landing pages.

## B14. Shared Angular primitives driven by real needs

Refactor repeated Phase 02 markup into a small set of reusable product primitives as they are needed by these screens.

Likely useful:

```text
PageHeader
Breadcrumb
Button / IconButton
Input
Select
Badge / StatusBadge
Card
DataTable
FilterBar
Pagination
Skeleton
EmptyState
ErrorState
Dialog or Drawer
Toast/InlineNotice
Avatar
Tabs
Timeline
ConfirmDialog
```

Do not create a giant speculative component library.

Do not put authorization policy inside presentation primitives.

## B15. API mutation tests

For every mutation test:

### Authentication / setup

- unauthenticated denied;
- client cookie cannot authenticate;
- employee with `mustChangePassword=true` denied;
- valid fully initialized employee proceeds.

### Authorization

- missing capability denied/concealed;
- capability without required membership denied/concealed;
- active membership + capability succeeds;
- removed membership fails immediately;
- `cases.view_all` actor behaves according to the current policy;
- role change takes effect on next request.

### Stage

- valid change succeeds;
- invalid stage 400;
- unchanged does not duplicate activity/system messages;
- correct CaseActivity created.

### PM reassignment

- unauthorized PM cannot use admin-only assignment capability;
- valid admin reassignment succeeds;
- new manager membership active/project_manager;
- old PM downgraded to contributor;
- notification created;
- activity created;
- unchanged assignment no duplicate side effects.

### Membership

- valid add;
- reactivate removed;
- duplicate safe behavior;
- invalid employee rejected;
- remove valid employee;
- cannot remove current PM;
- cannot remove primary client;
- activity/notification/system-message behavior correct.

### Archive

- admin-only according to capability map;
- archive sets archivedAt/currentStage/status consistently;
- second archive is safe no-op;
- activity written once;
- no hard delete.

### Client update

- authorized PM/admin on accessible case succeeds;
- inaccessible case concealed;
- empty body rejected;
- oversize behavior follows existing max;
- missing updates channel reports failure;
- system message/client visibility correct;
- activity written only on success.

## B16. Angular behavior tests

Add tests covering at least:

- stage dialog uses real endpoint and refreshes case;
- unauthorized action hidden;
- manager selector receives only safe employee DTOs;
- team add/remove interaction;
- remove/archival confirmation;
- server field errors displayed;
- client update publish interaction;
- activity timeline refresh after mutation;
- loading/error states;
- case list filter/pagination behavior from Gate A remains working.

## B17. OpenAPI

Extend OpenAPI only for routes implemented in Gate B.

Document:

- request bodies;
- enums where stable;
- response DTOs;
- validation errors;
- auth cookie;
- concealment behavior;
- capability expectations in descriptions;
- idempotent/unchanged outcomes where relevant.

## B18. Database/index safety

Prefer **no new collections** in Phase 03.

Expected schema changes are limited to additive AdminUser/security-event contract fields/types already justified by ADR-016 and Gate A.

Do not rename collections.

Do not migrate production data automatically.

Do not apply indexes to production.

If a new index is proven necessary by the implemented query:

- add it to both applicable schema mirrors;
- register in dry-run tooling;
- document it;
- do not apply to production in this cycle.

## B19. No Next.js phase-out yet

The Phase 02 agent report proposed "Next.js Phase-Out & Client Transition".

That is not the accepted next step.

Do not remove:

```text
existing Next staff routes
existing client portal
existing Next staff auth
existing EJS case operations
```

They remain rollback/reference surfaces until Angular/API parity is demonstrated and a separate cutover phase is approved.

## B20. No client Firebase implementation yet

The client Firebase architecture is accepted in ADR-016, but it is a later client-portal migration.

Do not mix it into case mutation work.

No Firestore.

No Firebase employee auth.

---

# Git discipline

Gate A and Gate B must be distinguishable in history.

Use small atomic commits.

Suggested Gate B commits:

```text
feat(api-cases): add canonical stage mutation
feat(api-cases): add project-manager mutation
feat(api-cases): add team membership mutations
feat(api-cases): add archive and client-update commands
feat(angular-cases): build operational case workspace actions
feat(angular-cases): add case team management
feat(angular-cases): add activity timeline and client-update UX
test(api-cases): cover mutation authorization and side effects
test(angular-cases): cover case operation workflows
docs(phase-03): record hardened case operations
```

Do not squash the entire phase into one giant commit unless tooling absolutely forces it.

Never push `main`.

Never force-push.

Never deploy.

---

# Full verification after Gate B

Run:

```bash
# inspect history/worktree
git status
git diff --check
git log --oneline -20

# root Next
npm ci --no-audit --no-fund
npm run lint
npx tsc --noEmit
npm test
npm run build
npm run db:indexes:dry-run

# Express/API
cd server
npm ci --no-audit --no-fund
npm test
cd ..

# Angular
cd enterprise-ui
npm ci --no-audit --no-fund
npm test
npm run build
cd ..
```

Then ensure GitHub Actions is green after push.

Do not claim completion based only on local builds if remote CI is red.

---

# Manual QA checklist

Use isolated development/test data, never production mutation testing.

Verify as at least these roles:

```text
super_admin
admin
pm
petition_writer or another membership-scoped specialist
viewer/editor where appropriate
```

Manual flows:

1. Admin creates a new employee and receives a temporary credential once.
2. Employee logs in with temporary credential.
3. Dashboard/cases direct URL cannot be used until permanent password is set.
4. Employee sets permanent password and reaches dashboard.
5. Refresh preserves session.
6. Wrong password lockout works across staff/admin surfaces.
7. Case list search/filter/page works.
8. PM sees only assigned/member cases.
9. PM cannot discover an inaccessible case by URL.
10. Client directory works without leaking raw credential fields.
11. Client detail does not reveal another team's case.
12. Authorized PM changes a case stage.
13. Unauthorized specialist cannot change stage.
14. Admin changes PM.
15. Authorized employee team member is added and notified.
16. Current PM cannot be removed without reassignment.
17. Authorized member is removed and immediately loses case access.
18. Admin archives a case after confirmation.
19. PM/admin publishes a client-visible update on an accessible case.
20. Case activity reflects each successful operation once.
21. Logout revokes session.
22. Admin credential reset revokes old employee sessions and forces setup again.

---

# Documentation deliverable

Create:

```text
docs/implementation/PHASE_03_CORE_HARDENING_CASE_OPERATIONS_REPORT.md
```

The report must include:

```text
starting SHA
ending SHA
branch
initial worktree status
Gate A commits
Gate B commits
CI run URL/id and conclusion
all changed routes
all API endpoints
all Angular routes/features
all AdminUser field changes
security-event contract changes
employee provisioning flow
case mutation behavior
authorization rules
row-level concealment behavior
DTO/security fixes
OpenAPI changes
new tests + exact passing counts
root tests/build results
server tests results
Angular tests/build results
database changes
index changes
migration changes
deployment changes
known limitations
rollback plan
```

Amend `PHASE_02_WORKING_CORE_REPORT.md` only if needed to make its final status truthful; preserve the original history/context rather than deleting it.

Update the enterprise roadmap only after all completion gates pass.

---

# PHASE 03 COMPLETION GATE

Do **not** mark Phase 03 complete unless all of the following are true:

## Phase 02 closure

- remote CI green;
- clean `npm ci` in Angular;
- no dependency bypass flags;
- lockout counters persist correctly;
- successful login stamps lastLogin;
- valid `SecurityEvent` rows actually persist for staff API;
- anonymous auth errors are generic;
- first-password restriction is server-enforced;
- admin-generated temporary employee credentials work;
- employee credential reset works and revokes sessions;
- employee deactivation revokes sessions;
- raw ClientUser/passwordHash cannot cross API;
- PM client-detail case leakage fixed;
- case detail uses CaseActivity;
- case concealment policy restored;
- client name/status field mapping fixed;
- Phase 02 API/Angular test matrix exists and passes;
- Firebase removed from employee runtime unless explicitly justified.

## Case operations

- authorized stage change works through Angular → API → existing service;
- authorized PM reassignment works;
- authorized team add/reactivate/remove works;
- primary-client/current-PM removal invariants preserved;
- archive works and is non-destructive;
- client-visible update works;
- CaseActivity records actual staff actor, not `System`;
- existing notifications/system messages still occur;
- all mutations are capability + row-scope checked server-side;
- inaccessible cases remain concealed;
- Angular controls are capability-aware but never the security boundary;
- case workspace has polished real Overview/Team/Activity UX;
- case/client directories have real filtering and pagination;
- mutation integration tests pass;
- Angular behavior tests pass;
- root regression tests pass;
- server regression tests pass;
- all builds pass;
- remote CI green;
- production routing/deployment remains unchanged.

---

# STOP

STOP when Phase 03 is fully tested and documented.

Do not begin case-native task/deadline schema work, Evidence Checklist, Documents migration, Smart Forms, Petition Workflow, Filing Packet, USCIS tracking, CMS migration, client Firebase migration, or production Angular cutover in this cycle.

After Phase 03 succeeds, the next domain phase should be **Case-Native Tasks & Deadlines**, because the current `Task` model is still consultation/lead-scoped and should be corrected before evidence/petition workflows depend on it.