# Immigration Horizons — Cycle 2 Implementation Prompt


Implement **Cycle 2: Client Cases, Workspaces, and Membership**, corresponding to:

```text
03_CLIENT_CASES_AND_WORKSPACES.md
```

In the master roadmap this may also be described as the Cases/Workspaces phase. Do not confuse the roadmap phase number with the execution-cycle number.

Implement only this cycle.

Do not begin consultation-query tracking, document uploads, document categories, channels, chat, real-time communication, or the complete notification redesign.

---

# 1. Known repository state

The previous cycle reported:

* Branch: `main`
* Reported HEAD: `12ae4a4`
* Working tree: clean
* Nothing pushed
* No production data modified
* Cycle 1 completed:

  * Architecture foundation
  * `ClientUser`
  * `PortalInvitation`
  * `PasswordResetToken`
  * `ClientSession`
  * Client activation
  * Client login/logout
  * Forgot/reset password
  * Consultation-to-client linking
  * Portal onboarding redirects
  * Client consultation dashboard
* Root tests: 29/29 passing
* Express admin regression tests: 77/77 passing
* TypeScript, ESLint and Next.js build passing

Do not assume this state is still unchanged.

Verify it from git, code and tests before editing.

---

# 2. Git anomaly — mandatory handling

A previous session reported that commit `a28ced0` appeared during implementation without the active Claude session explicitly creating it.

The prior session inspected it and determined that it contained an earlier checkpoint of legitimate in-progress Cycle 1 work. It was retained in history, and later refinements were committed on top.

Do not reset, rebase, amend, squash, cherry-pick or remove `a28ced0`.

Before modifying code, run:

```bash
git status
git branch --show-current
git rev-parse HEAD
git log --oneline --decorate --graph -25
git reflog --date=iso -25
git show --stat --oneline a28ced0
git show --stat --oneline 12ae4a4
git diff
git diff --cached
```

Confirm:

1. `a28ced0` is in the ancestry of the current branch.
2. The current HEAD contains the completed Cycle 1 work.
3. The worktree contains no unrelated uncommitted changes.
4. No background process appears to be modifying the repository.

Do not rewrite existing history merely to make it cleaner.

If another unexplained commit, checkout, reset, merge or worktree modification appears during this cycle:

1. Stop making code changes.
2. Record `git status`, `git log`, `git reflog` and the unexpected diff.
3. Do not reset or overwrite it.
4. Report the anomaly clearly in the final response.

---

# 3. Required documents

Locate and read:

```text
00_MASTER_ROADMAP.md
01_ARCHITECTURE_AND_SHARED_DOMAIN.md
02_CLIENT_AUTHENTICATION_AND_ONBOARDING.md
03_CLIENT_CASES_AND_WORKSPACES.md
10_SECURITY_PRIVACY_AND_AUDIT.md
11_DATA_MIGRATIONS_INDEXES_AND_RETENTION.md
12_TESTING_QA_AND_ACCEPTANCE.md
13_DEPLOYMENT_OBSERVABILITY_AND_BACKUPS.md
15_IMPLEMENTATION_SEQUENCE_AND_CLAUDE_HANDOFF.md
IMPLEMENTATION_STATUS.md
```

Also read:

```text
docs/architecture/ADR-001-client-portal-foundation.md
```

The implementation documents were previously reported under a nested `.claude/immigration_horizons_implementation_plan/...` location, while `IMPLEMENTATION_STATUS.md` is under `docs/implementation/`.

Find the files by name rather than assuming one exact directory.

The module document and repository are authoritative. Do not rely only on this prompt.

---

# 4. Cycle objective

Create a formal case layer between consultations and operational work.

Implement:

1. `ClientCase`
2. `CaseWorkspace`
3. `WorkspaceMember`
4. Explicit consultation-to-case conversion
5. Workspace membership management
6. Centralized row-level authorization policies
7. Basic admin case pages
8. Basic client case pages
9. Case-stage management
10. Project-manager assignment
11. Membership auditing
12. Database-backed integration tests

The core authorization rule is:

> A user must not gain access merely by knowing a case, workspace or membership ID.

Clients and normal employees must have an active workspace membership.

Global employee capabilities and workspace membership are separate checks.

---

# 5. Do not cross these scope boundaries

Do not implement:

* Consultation-query scheduling
* Answered/unanswered query tracking
* Document uploads
* Private storage providers
* Document categories
* Document requests
* Document review
* Channels
* Chat messages
* Threads
* Mentions
* Read receipts
* Real-time communication
* Socket.IO
* Generalized client notifications
* Profile and security portal pages
* Analytics
* Production deployment
* Production index execution
* Production database migrations

The case-conversion module document mentions creating default channels and document categories during conversion. Those domains belong to later modules.

For this cycle:

* Do not create partial chat or document systems.
* Design the conversion service so later provisioning steps can be added idempotently.
* Record deferred workspace provisioning in documentation.
* Do not create fake channel or document records merely to satisfy a future step.

---

# 6. Pre-implementation repository inspection

Before editing, inspect at least:

## Root Next.js application

* Cycle 1 models
* Client session utilities
* Client actor definitions
* Client authorization helpers
* Consultation model
* Consultation detail queries
* Portal dashboard
* Portal API conventions
* CSRF utility
* Response/error utility
* Test helpers
* Index script

## Express admin application

* Express application factory and bootstrap
* Admin authentication middleware
* Capability middleware
* Current capability map
* AdminUser model
* Consultation model
* Lead detail route and view
* Lead activity logging
* Assignment workflow
* Notification utility
* Existing DB-backed integration-test setup
* Existing Mongoose connection lifecycle
* Current index-management script

## Cross-application model behavior

Determine how the root application and Express application currently represent the same MongoDB collections, especially `Consultation`.

Do not silently create incompatible schemas for cases.

---

# 7. Architecture decision for cross-application case models

Both Next.js and Express require access to case and workspace records.

Before implementing the models, document the selected strategy in either:

```text
docs/architecture/ADR-002-case-workspace-domain.md
```

or an amendment to the existing ADR if that better matches repository conventions.

The decision must explain:

1. Which application owns each schema.
2. How both applications access the same collections.
3. How collection names are fixed explicitly.
4. How enums and field definitions remain compatible.
5. How index definitions remain compatible.
6. How model recompilation is avoided in Next.js development.
7. How CommonJS/ESM differences are handled.
8. How schema drift will be detected.
9. Why the selected approach fits the existing architecture.
10. How later query, document and chat models will follow the same pattern.

Acceptable strategies include:

* A small framework-neutral shared schema package
* Shared constants plus application-specific Mongoose model wrappers
* Carefully mirrored models with schema-contract tests

Do not introduce a complex build system only to share three schemas.

Do not duplicate models without documenting and testing their compatibility.

The previous ADR intentionally avoided forcing all runtime code into a shared package. Change that decision only where the new cross-application domain genuinely requires it.

---

# 8. Required domain models

## 8.1 ClientCase

Create a `ClientCase` model representing an accepted matter or service project.

Required or expected fields:

```text
caseNumber
title
caseType
status
consultation
primaryClient
projectManager
createdBy
openedAt
targetFilingDate
filedAt
closedAt
priority
currentStage
description
archivedAt
createdAt
updatedAt
```

### Case types

Centralize supported case types.

At minimum, support the service types already used by the platform, including where applicable:

* EB-2 NIW
* EB-1A
* EB-1B
* EB-1C
* O-1
* RFE response
* NOID response
* Recommendation-letter project
* Business-plan project
* USCIS forms support
* Other

Do not spread case-type strings throughout controllers and templates.

Map existing consultation service values deliberately. Do not assume their stored values exactly match display labels.

### Case statuses/stages

Centralize allowed values.

The module proposes values such as:

```text
intake
strategy
document_collection
drafting
review
client_review
ready_to_file
filed
uscis_pending
approved
denied
closed
archived
```

Inspect existing lead and delivery terminology before finalizing them.

Do not invent a restrictive transition graph unless repository or product documentation already defines one.

For this cycle:

* Validate destination stages.
* Allow authorized stage changes.
* Audit previous and new values.
* Document future transition-policy work.

### Case number

Generate a human-readable, collision-resistant case number.

Requirements:

* Unique index
* Safe under concurrent case conversion
* Retry safely on duplicate-key collision
* No dependency on counting all existing cases
* No predictable confidential information embedded in the identifier

Do not use `countDocuments() + 1` as a sequence generator.

### Relationships

Use `primaryClient` as the explicit primary external client.

Additional clients should preferably be represented by workspace memberships rather than an independently maintained array.

Use one source of truth for team membership.

A `projectManager` reference may remain on `ClientCase` for operational querying, but the assigned project manager must also have an active workspace membership. Enforce that invariant through a centralized service.

### Required indexes

Evaluate and implement indexes supporting:

* Unique `caseNumber`
* Unique consultation conversion
* Primary-client case listing
* Project-manager active-case listing
* Status/stage listing
* Recent case listing
* Archived versus active filtering

A unique sparse/partial index on `consultation` should protect against concurrent duplicate conversions.

Avoid redundant indexes.

---

## 8.2 CaseWorkspace

Create a `CaseWorkspace` model.

Expected fields:

```text
case
name
status
settings
createdBy
workspaceType or equivalent
createdAt
updatedAt
```

Requirements:

* Every new case receives one primary workspace.
* The primary workspace must be uniquely identifiable.
* The schema should not prevent supporting additional workspaces later.
* A repeated conversion or provisioning attempt must not create duplicate primary workspaces.

Suggested workspace statuses:

```text
active
suspended
archived
```

Do not treat an archived workspace as active for authorization.

---

## 8.3 WorkspaceMember

Create a `WorkspaceMember` model.

Expected fields:

```text
workspace
memberType
clientUser
adminUser
workspaceRole
status
joinedAt
invitedBy
removedAt
clientVisible
displayRole
createdAt
updatedAt
```

Adapt fields to repository conventions, but preserve the required behavior.

### Member types

```text
client
employee
```

### Workspace roles

Suggested values:

```text
client
project_manager
case_manager
contributor
reviewer
observer
```

Do not derive authorization solely from these display-level roles. They supplement global employee capabilities and membership state.

### Identity validation

Enforce:

* `memberType=client` requires `clientUser`
* `memberType=client` forbids `adminUser`
* `memberType=employee` requires `adminUser`
* `memberType=employee` forbids `clientUser`

Exactly one user identity must be present.

### Membership uniqueness

Prevent duplicate memberships with appropriate partial unique indexes, such as the logical equivalents of:

```text
workspace + clientUser
workspace + adminUser
```

Do not hard-delete membership records as the normal removal path.

Use status and `removedAt`.

When a previously removed member is added again, reactivate the existing membership safely rather than creating ambiguous duplicates.

### Membership statuses

Suggested values:

```text
invited
active
removed
suspended
```

Only active membership grants normal workspace access.

Pending or inactive client accounts may have an invited membership, but must not receive authenticated case access until their client account and membership are active according to the selected policy.

### Client-visible team data

Employee membership records should support controlling whether the employee appears in the client portal.

Clients must not receive:

* Internal capability names
* Internal role codes unless intentionally mapped
* Employee email addresses by default
* Internal membership status
* Internal notes
* Other workspace memberships

Expose only a safe display name and client-facing display role.

---

# 9. Consultation linkage

Inspect both root and server Consultation schemas.

Add an optional case linkage where needed, such as:

```text
convertedCase
convertedAt
```

Requirements:

1. Existing consultations remain valid.
2. Existing public form submissions remain valid.
3. The field is optional.
4. Conversion is protected by the unique `ClientCase.consultation` index.
5. Consultation and case links remain consistent.
6. A conversion failure must not leave a consultation falsely marked as converted.
7. A repeated conversion request must return a controlled conflict or the existing case reference.

Do not use only a boolean `converted` flag.

---

# 10. Explicit consultation-to-case conversion

Implement an authorized admin action equivalent to:

```text
POST /admin/leads/:id/convert-to-case
```

Use repository route conventions.

## Required input

At minimum:

* Case type
* Case title
* Primary client
* Project manager
* Initial employee members
* Target filing date
* Priority
* Optional description

The primary client should normally come from `Consultation.clientUser`.

Do not permit arbitrary reassignment to an unrelated client without an explicit, authorized workflow.

## Client linkage cases

Inspect the actual Cycle 1 invitation behavior and support it safely.

### Consultation linked to active ClientUser

Conversion may proceed.

Create an active client membership.

### Consultation linked to pending ClientUser

Conversion may proceed only when the selected policy is documented.

A safe default is:

* Create the case.
* Create an invited client membership.
* Reuse or issue the existing controlled portal invitation.
* Activate membership when account activation succeeds.

Do not grant portal access to an inactive account.

### Consultation with no linked ClientUser

Do not create an unowned case silently.

Either:

* Reuse the established Cycle 1 invitation/linking service and create a controlled pending account relationship, or
* Return a controlled validation error directing the manager to issue/link the client invitation first.

Choose the option that best matches the actual Cycle 1 implementation.

Do not create a second invitation subsystem.

## Conversion authorization

Require an explicit capability such as:

```text
cases.create
```

Also verify the acting employee is authorized to access and convert the lead under existing lead policies.

Do not assume any logged-in admin may convert a lead.

## Conversion transaction

The conversion service should perform, in order:

1. Validate actor and capability.
2. Validate input.
3. Load consultation.
4. Verify the consultation is not already converted.
5. Resolve primary client.
6. Validate project manager.
7. Validate selected employees.
8. Generate case number.
9. Create `ClientCase`.
10. Create primary `CaseWorkspace`.
11. Create client membership.
12. Create project-manager membership.
13. Create other employee memberships.
14. Link consultation to the case.
15. Write audit/activity records.
16. Notify relevant employees through existing notification utilities.
17. Send a client-facing case-created email only when the current email infrastructure supports it safely.

Core persistence must not depend on email or notification success.

Use MongoDB transactions where supported.

When transactions are unavailable:

* Retain unique indexes as the final concurrency guard.
* Make each step idempotent.
* Add compensating cleanup.
* Never mark the consultation converted before the case and workspace exist.
* Record partial provisioning failures for controlled retry.

## Duplicate conversion

A second conversion attempt must:

* Create no additional case
* Create no additional workspace
* Create no duplicate memberships
* Create no duplicate notifications
* Return a controlled `409`, or return the existing case according to established route conventions
* Include a safe link to the existing case in the admin UI where practical

Test concurrent or near-concurrent duplicate conversion behavior.

---

# 11. Conversion and future provisioning

Do not create channels or document categories in this cycle.

Create the conversion service in a way that later modules can extend safely.

Document the deferred provisioning steps:

```text
default document categories
default workspace channels
client notification records
case checklists
```

A later provisioning service must be able to run once without duplicating records.

Do not add placeholder documents or channels.

---

# 12. Capabilities

Extend the existing capability system.

Evaluate and add:

```text
cases.view
cases.view_all
cases.create
cases.manage
cases.assign
cases.archive
workspace.members.manage
```

Use the smallest set required by the implementation.

## Conservative default matrix

Inspect existing roles before finalizing the matrix.

A safe starting policy is:

### `super_admin` and `admin`

* May receive `cases.view_all`
* May create and manage cases
* May assign project managers
* May manage memberships
* May archive cases

### `pm`

* May create and manage cases
* May assign members when authorized
* Normally requires workspace membership for existing cases
* Should become an active member of cases they create or manage

Do not automatically give every project manager organization-wide access unless existing product rules explicitly require it.

### Specialists and reviewers

* May view cases only when:

  * Their global capability permits case access, and
  * They have active workspace membership

### Viewer

Use least privilege.

Do not grant case access merely because the role exists. Add read-only case access only when the current product rules justify it.

Document the final matrix in code and implementation status.

## Environment-credential fallback admin

Inspect the existing environment-based admin-login fallback.

It may not have a persistent `AdminUser` ID.

Decide and document how it interacts with cases.

A safe approach is:

* Allow explicit elevated global administration where existing behavior requires it.
* Do not create a normal `WorkspaceMember` pointing to a nonexistent AdminUser.
* Audit actions with the available actor type and identity snapshot.
* Require persistent AdminUser records for assignment as project manager or team member.

Do not insert invalid references merely to support the fallback login.

---

# 13. Centralized row-level authorization

Create centralized policy helpers.

Names may differ, but support the equivalent of:

```text
canViewCase(actor, case)
canManageCase(actor, case)
canAssignCase(actor, case)
canArchiveCase(actor, case)
canViewWorkspace(actor, workspace)
canManageWorkspaceMembers(actor, workspace)
canViewClientTeam(actor, workspace)
```

## Client policy

A client may view a case only when:

1. Client session is valid.
2. Client account is active.
3. Case exists.
4. Primary workspace exists.
5. An active `WorkspaceMember` links that workspace to the current ClientUser.
6. Case/workspace state permits viewing.

Do not authorize a client solely because `ClientCase.primaryClient` matches.

Workspace membership is the authorization boundary.

## Employee policy

A normal employee may view a case only when:

1. Admin session is valid.
2. Global capability allows case viewing.
3. An active employee membership exists for the primary workspace.

An explicit `cases.view_all` capability may bypass membership for authorized administrative roles.

Do not infer view-all access from a role name in route handlers.

## Membership removal

When membership is removed:

* Access must end immediately.
* Existing sessions remain valid for unrelated resources.
* Case APIs must deny access on the next request.
* Removal should not depend on cache expiry.
* Re-adding should use a controlled reactivation path.

## Information-disclosure behavior

For client routes:

* Another client’s case and a nonexistent case should produce the same controlled result, preferably `404`.

For admin routes:

* Use existing repository conventions for `403` versus `404`.
* Do not leak confidential case data in authorization errors.

---

# 14. Admin routes and screens

Implement the module’s basic admin case operations inside the existing Express/EJS application.

Required routes or their repository-convention equivalents:

```text
GET    /admin/cases
GET    /admin/cases/:id
POST   /admin/leads/:id/convert-to-case
POST   /admin/cases/:id/members
DELETE /admin/cases/:id/members/:memberId
POST   /admin/cases/:id/manager
POST   /admin/cases/:id/stage
POST   /admin/cases/:id/archive
```

Use POST for form actions when the existing EJS application does not support PUT/PATCH/DELETE naturally.

## Cases list

Provide:

* Bounded pagination
* Predictable default sorting
* Status/stage filter
* Project-manager filter where practical
* Active/archived filter
* Case number
* Case title
* Case type
* Primary client
* Project manager
* Current stage
* Opened date
* Target filing date

Validate all query parameters.

Use an explicit sort allowlist.

Do not load every membership into memory to filter the list.

## Case detail

Provide:

* Case number
* Title
* Type
* Status/stage
* Primary client
* Consultation link
* Project manager
* Workspace members
* Target filing date
* Description
* Recent case activity
* Existing related tasks where safely linkable
* Conversion metadata

Show document, query and channel sections only as clearly labeled future/empty modules. Do not create fake functionality.

## Lead detail conversion UI

On an unconverted consultation:

* Show “Convert to case” only when the current admin has the required capability.
* Preselect the linked client where appropriate.
* Require project-manager selection.
* Validate all submitted users server-side.

On an already converted consultation:

* Show the existing case number and link.
* Do not show an active conversion form.

UI visibility supplements server authorization; it does not replace it.

## Membership management

Authorized managers can:

* Add an active employee
* Add or reactivate a client membership where appropriate
* Remove a member
* Set client-facing display visibility
* Set a client-facing display role
* Change the project manager

Prevent:

* Duplicate memberships
* Assigning nonexistent users
* Assigning disabled users
* Removing the primary client without an explicit future case-transfer workflow
* Removing the current project manager without simultaneously assigning a replacement, unless the case is allowed to be unassigned
* Assigning an environment-only admin identity as a persistent member

## Project-manager change

Changing the project manager must:

1. Validate the new manager.
2. Update `ClientCase.projectManager`.
3. Ensure the new manager has active `project_manager` membership.
4. Adjust the previous manager’s workspace role according to a documented rule.
5. Audit the change.
6. Notify the new manager through the existing employee notification system.
7. Avoid duplicate notifications when unchanged.

Make the database update atomic where supported.

## Stage update

Stage updates must:

* Validate the destination
* Record previous and new values
* Record acting employee
* Record timestamp
* Avoid creating duplicate audit entries for unchanged values

## Archive action

Archive must:

* Require explicit capability
* Set appropriate case archival state
* Preserve historical data
* Avoid hard deletion
* Document whether members retain read-only historical access
* Remove the case from active queues

Do not delete the case, workspace or memberships.

---

# 15. Case activity and auditing

Membership changes and case changes require case-scoped auditing.

Inspect whether the existing `ActivityLog` can safely support case events.

Choose one of:

1. Extend the existing activity system with optional case support while preserving lead behavior, or
2. Add a dedicated `CaseActivity` model following existing conventions.

Do not force case events into free-text lead logs when doing so prevents proper case history.

Audit at minimum:

* Case created
* Consultation converted
* Workspace created
* Client membership created
* Employee membership created
* Member reactivated
* Member removed
* Project manager changed
* Stage changed
* Case archived

Each entry should include:

* Actor type
* Actor ID where available
* Safe actor display snapshot
* Action
* Case
* Workspace where relevant
* Target member where relevant
* Previous values where relevant
* New values where relevant
* Timestamp
* Safe structured metadata

Do not store secrets or invitation tokens.

The original lead activity log should also receive a concise conversion event linking to the case where the existing structure supports it.

---

# 16. Notifications in this cycle

Reuse existing employee notification infrastructure.

Notify employees for:

* Assignment as project manager
* Addition to a case workspace
* Material reassignment

Avoid:

* Duplicate notifications
* Notification to the acting user when unnecessary
* Broadcasting every change to every admin
* Allowing notification failure to roll back an otherwise successful conversion

Do not redesign the notification model in this cycle.

Do not create the complete client-notification center yet.

Client communication may use the established Resend/email abstraction when appropriate, but email failure must be logged and must not destroy a successfully created case.

---

# 17. Client portal routes and screens

Implement:

```text
GET /portal/cases
GET /portal/cases/[caseId]
GET /portal/cases/[caseId]/team
```

Adapt to Next.js App Router conventions.

Also update the existing portal dashboard to show the authenticated client’s recent or active cases.

## Portal cases list

Show only cases accessible through active workspace membership.

Display:

* Case number
* Case title
* Case type
* Current client-visible stage
* Opened date
* Target filing date where client-visible
* Status
* Link to case overview

Use safe empty states.

Use bounded results or pagination.

## Portal case overview

Show:

* Case number
* Title
* Type
* Current client-visible stage
* Opened date
* Target filing date where appropriate
* Project manager’s safe display information
* Client-visible team summary
* Consultation reference where useful
* Clear placeholders for later messages, documents and scheduled consultations

Do not expose:

* Internal activity
* Internal employee role codes
* Internal capabilities
* Internal notes
* Internal assignment metadata
* Employee email addresses
* Other clients unless explicitly permitted

## Portal team page

Show only employee memberships where:

* Membership is active
* `clientVisible` is true
* Employee remains eligible/active
* Display information is intentionally client-facing

Do not expose removed or suspended members.

## Cross-client behavior

A client requesting another client’s:

* Case
* Workspace-derived page
* Team page

must receive the same controlled result as a nonexistent case.

Use membership queries, not `primaryClient` shortcuts.

---

# 18. Existing task compatibility

The existing task system attaches tasks to consultations/leads.

Do not break it.

For this cycle:

* Preserve existing task relationships.
* Do not migrate tasks automatically.
* Do not introduce a destructive task schema change.
* The admin case page may show tasks associated with the originating consultation if authorization allows.
* Document a later decision about adding an optional `case` reference to tasks.

Do not create duplicate tasks during case conversion.

---

# 19. Indexes and migration safety

Add schema indexes based on actual query patterns.

Likely indexes include:

## ClientCase

```text
caseNumber unique
consultation unique partial/sparse
primaryClient + archivedAt + createdAt
projectManager + archivedAt + status
status/currentStage + createdAt
```

## CaseWorkspace

```text
case + workspaceType
unique primary workspace per case
```

## WorkspaceMember

```text
workspace + clientUser partial unique
workspace + adminUser partial unique
clientUser + status
adminUser + status
workspace + status
```

## CaseActivity, if added

```text
case + createdAt
workspace + createdAt
```

Inspect exact queries and avoid redundant indexes.

Update the existing root index-rollout script.

Add an equivalent safe path for server-owned model declarations where required.

Requirements:

* Dry-run support
* No automatic production index deletion
* No `syncIndexes()` in production
* Clear logging
* Environment safety guard
* No production connection during implementation

## Migration

New collections require no migration.

Adding optional case references to Consultation should be backward compatible.

Do not backfill old consultations automatically.

Document:

* Index rollout procedure
* Backup requirement
* Low-traffic execution
* Verification commands
* Rollback considerations
* How duplicate consultation conversions would be identified before creating the unique index

Do not execute indexes against the real Atlas database.

---

# 20. Database transaction strategy

Inspect whether production MongoDB is expected to support replica-set transactions.

Implement a small transaction wrapper or service-level strategy that:

* Uses transactions when available
* Does not silently pretend a transaction succeeded when unsupported
* Supports isolated tests
* Provides controlled fallback behavior
* Preserves idempotency through unique indexes

Prefer testing the transaction path with `MongoMemoryReplSet` when practical.

If the existing test infrastructure uses standalone `MongoMemoryServer`, either:

* Add a dedicated replica-set helper for conversion tests, or
* Test the documented fallback path explicitly

Do not weaken test-database production guards.

---

# 21. Required tests

Add database-backed tests.

## 21.1 Model tests

Test:

* ClientCase validation
* Unique case number
* Unique consultation conversion
* Workspace primary uniqueness
* WorkspaceMember polymorphic identity validation
* Duplicate client membership prevention
* Duplicate employee membership prevention
* Removed-member reactivation behavior

## 21.2 Policy unit tests

Test at least:

* Client with active membership can view
* Client without membership denied
* Client with removed membership denied
* Employee with capability and active membership can view
* Employee with capability but no membership denied
* Employee with membership but no capability denied
* Elevated `cases.view_all` behavior
* Unknown actor denied
* Missing role denied
* Archived/removed membership denied
* Unknown capability denied

## 21.3 Admin integration tests

Using real Express requests, sessions and MongoDB, test:

* Authorized manager converts consultation
* Viewer cannot convert
* Unauthorized specialist cannot convert
* Consultation with valid client converts
* Pending client behavior matches documented policy
* Missing client linkage handled safely
* Invalid primary client rejected
* Invalid project manager rejected
* Disabled employee rejected
* Duplicate conversion rejected safely
* Duplicate conversion leaves one case
* Conversion creates one primary workspace
* Conversion creates correct memberships
* Conversion links consultation
* Conversion logs activity
* Conversion notification failure does not delete case
* Manager adds employee
* Duplicate member is not created
* Removed member is reactivated safely
* Manager removes member
* Unauthorized member management is rejected
* Project manager change updates both case and membership
* Stage update validates enum
* Archive is non-destructive
* Rejected requests leave database unchanged
* Invalid IDs return controlled responses

## 21.4 Portal integration tests

Test:

* Client sees own case
* Client dashboard lists own case
* Client cannot see another case
* Client cannot access case through primary-client match without active membership
* Removed client membership immediately denies access
* Pending membership does not grant access
* Client team page shows client-visible members
* Client team page hides internal members
* Client team page hides removed members
* Invalid case ID produces controlled `404`
* Unauthenticated request redirects to login

## 21.5 Cross-application schema tests

When models are defined separately for Next.js and Express, add contract tests verifying:

* Collection names
* Enum values
* Required fields
* Relevant defaults
* Index intent
* Reference names

Do not allow schema drift to remain untested.

## 21.6 Regression tests

Run:

* All 29 Cycle 1 root tests
* All existing root tests
* All 77 existing server tests
* Existing authorization tests
* Existing lead-operation tests

Do not modify tests merely to make failures disappear.

---

# 22. Quality commands

Use actual configured scripts.

At minimum, run:

## Root

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run db:indexes:dry-run
```

## Server

```bash
cd server
npm test
```

Run additional lint, syntax or build commands where configured.

Perform manual smoke tests against an isolated or non-writing environment for:

* Admin cases list
* Lead conversion page
* Client cases list
* Client case detail
* Cross-client denial

Do not send mutating smoke requests to the real Atlas database.

Do not claim a test passed unless it was executed successfully.

---

# 23. Existing Cycle 1 deployment blockers

Carry these forward without trying to solve unrelated production deployment during Cycle 2:

1. `SITE_URL` must be configured correctly in production for Origin-based CSRF checks.
2. Real Resend activation/reset delivery remains unverified.
3. Root index rollout has not been run against the production database.
4. Rate limiting remains process-local and would require a shared store for horizontal scaling.
5. `/portal/profile` and `/portal/security` remain deferred.

Update `IMPLEMENTATION_STATUS.md` with their current status.

Do not mark them resolved without verification.

---

# 24. Commit strategy

Create logical local commits.

Suggested sequence:

```text
docs(architecture): define case workspace model ownership
feat(cases): add case workspace and membership models
feat(admin): add consultation to case conversion
feat(admin): add case and membership operations
feat(portal): add client case pages
test(cases): add conversion and row access tests
docs(implementation): record cycle 2 completion
```

Adjust to repository conventions.

Before every commit:

* Review the complete diff.
* Confirm no secrets.
* Confirm no generated build output.
* Confirm no database binaries or local DB files.
* Confirm no unrelated user changes.
* Confirm no implementation-plan source files were accidentally edited without reason.

Do not push.

Do not amend or squash Cycle 1 history.

---

# 25. Required implementation status update

Update:

```text
docs/implementation/IMPLEMENTATION_STATUS.md
```

Include:

* Date
* Branch
* Starting HEAD
* Ending HEAD
* Git anomaly status
* Cycle 2 commits
* Models added
* Indexes added
* Routes added
* Portal pages added
* Admin pages added
* Capability matrix
* Row-level policy rules
* Transaction/fallback strategy
* Tests and exact results
* Build results
* Migration requirements
* Environment variables
* Production index status
* Known limitations
* Deferred provisioning
* Recommended next module:

  * `04_CONSULTATION_AND_QUERY_TRACKING.md`

Do not mark Cycle 2 complete unless its acceptance criteria and tests pass.

---

# 26. Pre-implementation response

Before editing, return a concise assessment containing:

1. Current branch and HEAD
2. Worktree status
3. `a28ced0` ancestry/reflog verification
4. Cycle 1 artifacts verified
5. Existing overlapping case code
6. Cross-app model strategy
7. Files likely to change
8. Models and indexes
9. Capability changes
10. Row-level policy design
11. Transaction/idempotency strategy
12. Test strategy
13. Migration and rollback approach
14. External blockers

Then continue implementation without waiting for confirmation.

Only stop before implementation if:

* Required documentation is missing
* The repository is being modified concurrently
* Unrelated uncommitted work would be overwritten
* A destructive production operation is required
* The actual repository contradicts the reported Cycle 1 completion
* A genuinely unresolvable architecture conflict exists

---

# 27. Cycle 2 completion criteria

Cycle 2 is complete only when:

1. `ClientCase` exists separately from Consultation.
2. Every new case has exactly one primary workspace.
3. Every client and employee with case access has an explicit membership.
4. Clients require active membership.
5. Normal employees require capability plus active membership.
6. Elevated organization-wide access is explicit.
7. Missing identities and memberships fail closed.
8. Consultation conversion is authorized.
9. Conversion is idempotent.
10. Duplicate conversion is database-protected.
11. Conversion creates the case, workspace and memberships safely.
12. Consultation is linked only after successful provisioning.
13. Project-manager assignment is consistent with membership.
14. Membership removal ends access immediately.
15. Membership changes are audited.
16. Case stage changes are validated and audited.
17. Case archival is non-destructive.
18. Admin cases list and detail pages work.
19. Client case list, overview and team pages work.
20. Client APIs expose no internal membership metadata.
21. Existing lead/task behavior remains compatible.
22. Database-backed integration tests pass.
23. Cross-client tests pass.
24. Existing Cycle 1 tests pass.
25. Existing server tests pass.
26. TypeScript, lint and Next.js build pass.
27. Index dry-run succeeds.
28. Migration and rollback procedures are documented.
29. Logical local commits exist.
30. Nothing has been pushed.
31. No production data or indexes were modified.
32. Chat and document modules have not been started.

---

# 28. Final report

At completion, return:

## Repository

1. Starting branch and HEAD
2. Ending branch and HEAD
3. Final git status
4. Git anomaly verification
5. Local commits created
6. Confirmation nothing was pushed
7. Confirmation no production data was modified

## Architecture

8. Cross-application model decision
9. Collection ownership
10. Transaction strategy
11. Idempotency strategy
12. Deferred provisioning strategy

## Implementation

13. Files created
14. Files modified
15. Models and fields
16. Indexes
17. Capabilities
18. Row-level policies
19. Admin routes
20. Admin pages
21. Portal routes
22. Portal pages
23. Activity/audit behavior
24. Notification behavior

## Tests and quality

25. Tests added
26. Authorization scenarios
27. Conversion scenarios
28. Cross-client scenarios
29. Commands executed
30. Exact test counts
31. Build results
32. Manual smoke results
33. Failures or environment limitations

## Database and deployment

34. Schema compatibility
35. Migration requirements
36. Index rollout procedure
37. Rollback procedure
38. Environment variables
39. Remaining deployment blockers

## Remaining work

40. Known limitations
41. Deferred document/category provisioning
42. Deferred channel provisioning
43. Open security risks
44. Recommended next cycle
45. Exact next module file to read

Be explicit about anything not implemented or not verified.

---

# 29. Start now

Begin with git and repository verification.

Read the required documentation.

Verify Cycle 1.

Present the concise pre-implementation assessment.

Then implement exactly Cycle 2.

Run all tests and quality checks.

Create logical local commits.

Update `IMPLEMENTATION_STATUS.md`.

Do not push.

Do not deploy.

Do not run production indexes.

Do not modify production data.

Stop after Cycle 2 and provide the full final report.
