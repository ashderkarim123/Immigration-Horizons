# Stabilization Phase 01 — Angular Staff Feature Parity Audit & Master Command Prompt

**Status:** Ready for implementation  
**Branch:** stabilization/angular-feature-parity-audit  
**Audit baseline:** main @ 26ed89725651b079e505540c2cffe474b0379d5f  
**Date:** 2026-10-02  
**Project:** Immigration Horizons

---

## 1. Why this stabilization phase exists

Do not begin Phase 11 USCIS Tracking yet.

The platform has substantial backend/domain functionality, but the audit found multiple places where the Angular staff application is incomplete, disconnected from the canonical Express API, or reading/writing a different contract than the backend actually exposes.

The result is that features may exist in models, services, APIs, and automated tests while still appearing missing or broken to a real user.

This stabilization phase must convert the already-built feature set into a coherent, usable end-to-end product before new feature phases continue.

The current intended production architecture remains:

~~~text
immigrationhorizons.com
  -> Next.js public website

app.immigrationhorizons.com
  /portal/*       -> Next.js client portal
  /api/portal/*   -> Next.js portal API
  /staff/*        -> Angular employee case-management app
  /api/v1/*       -> Express canonical staff API

admin.immigrationhorizons.com
  -> Express/EJS admin CMS
~~~

Do not replace the Next.js public site, Next.js client portal, or Express API as part of this stabilization phase.

---

## 2. Audit summary

Use these statuses:

| Status | Meaning |
|---|---|
| GREEN | Core workflow is substantially implemented as intended |
| YELLOW | Implemented but incomplete, difficult to discover, or still needs production browser QA |
| RED | Concrete defect, contract mismatch, or major missing workflow |
| WHITE | Intentionally not implemented yet |

| Module | Audit status |
|---|---|
| Production routing/deployment | GREEN |
| Existing staff login/session | GREEN |
| First-login permanent-password setup | RED |
| Dashboard | YELLOW |
| Cases directory | RED |
| Case overview | YELLOW |
| Case permission/action visibility | RED |
| Team / workspace members | RED |
| Activity timeline | RED |
| Clients directory/detail | RED |
| Tasks | YELLOW |
| Deadlines | YELLOW |
| Evidence | RED |
| Documents | GREEN/YELLOW |
| Case chat | GREEN/YELLOW |
| Global staff Messages / Communications inbox | RED / missing |
| Smart Forms | GREEN/YELLOW |
| Petition Work | GREEN/YELLOW |
| Filing Packets | GREEN/YELLOW |
| Client Portal | GREEN/YELLOW |
| Staff notifications | RED / incomplete |
| Queries/consultation workflow in Angular | RED / not migrated |
| Leads in Angular | WHITE |
| USCIS Tracking | WHITE |
| Calendar/reminders | WHITE |
| Search/reporting | WHITE |
| Angular Admin Console cutover | WHITE |

---

## 3. Critical findings that must be treated as authoritative starting hypotheses

Code is authoritative. Re-check every item below before editing, but do not ignore these findings.

### 3.1 First-login password setup contract mismatch

Angular:

enterprise-ui/projects/case-management/src/app/features/setup-password/setup-password.component.ts

currently sends approximately:

~~~text
currentPassword
newPassword
~~~

and communicates an 8-character minimum.

Express:

server/routes/api/v1/staff/account.js

requires:

~~~text
currentPassword
newPassword
confirmPassword
~~~

with a 12-character minimum.

Required repair:

- Angular must include confirmPassword.
- Angular validation and help text must match the backend minimum.
- New password and confirm password must match client-side for UX.
- Backend remains authoritative.
- Add Angular tests and server integration coverage proving a mustChangePassword employee can complete setup and continue into the staff application.

This is P0.

---

### 3.2 Cases directory contract mismatch

Relevant files:

- enterprise-ui/projects/case-management/src/app/features/cases/cases.ts
- enterprise-ui/projects/case-management/src/app/features/cases/cases.html
- server/routes/api/v1/staff/cases.js

Audit found Angular using or expecting:

~~~text
c._id
q
includeArchived
data.pagination.total
data.pagination.pages
~~~

while the canonical API uses/returns:

~~~text
id
search
archived
data.total
data.totalPages
~~~

Required repair:

- Use explicit TypeScript DTO types.
- Remove accidental _id assumptions from Angular staff contracts.
- Search must use the backend query parameter actually supported.
- Archived filter must use the backend query parameter actually supported.
- Pagination must consume total / totalPages / page / pageSize.
- Case links must navigate with id.
- Preserve scope, stage, case type, priority, archived, page and search state in URL query params.
- Add tests with fixtures matching the real Express response shape.

This is P0.

---

### 3.3 Case-detail permissions are inferred incorrectly

Relevant files:

- enterprise-ui/projects/case-management/src/app/features/cases/case-detail/case-detail.component.ts
- enterprise-ui/projects/case-management/src/app/core/auth/auth.service.ts
- server/routes/api/v1/staff/me.js
- server/routes/api/v1/staff/cases.js
- server/utils/permissions.js

The canonical staff identity response provides:

~~~text
user
role: { code, label }
capabilities[]
~~~

The case detail API also provides action flags such as:

~~~text
canManageCase
canAssignManager
canArchive
canManageMembers
canPublishClientUpdate
~~~

Do not make Angular authorization decisions by inventing or checking role arrays such as:

~~~text
case_manager
paralegal
attorney
~~~

The real role set contains values such as:

~~~text
super_admin
admin
pm
petition_writer
business_plan_specialist
recommendation_letter_specialist
uscis_forms_specialist
evidence_collector
reviewer
editor
viewer
~~~

Required repair:

- Angular visibility must use server-provided action flags and/or canonical capabilities.
- Server remains authoritative for every mutation.
- Remove role-name inference from case-detail action visibility.
- A legitimate pm must see the actions its server capabilities permit.
- Specialist/reviewer roles must see only what the server permits.
- Add Angular tests for PM, reviewer, specialist, viewer and admin behavior.

This is P0.

---

### 3.4 Team tab is disconnected from its real endpoint

Relevant files:

- server/routes/api/v1/staff/cases.js
- server/routes/api/v1/staff/case-mutations.js
- enterprise-ui/projects/case-management/src/app/features/cases/case-detail/case-detail.component.ts
- enterprise-ui/projects/case-management/src/app/features/cases/case-detail/case-detail.component.html

The server exposes:

~~~text
GET /api/v1/staff/cases/:id/members
GET /api/v1/staff/cases/:id/member-options
~~~

Member DTO fields include concepts such as:

~~~text
id
memberType
workspaceRole
status
clientVisible
joinedAt
employee
client
~~~

Do not rely on caseData.team unless the API intentionally supplies that field.

Audit also found mutation payload drift.

Project-manager mutation must use the backend's real contract, including:

~~~text
projectManagerId
~~~

Team-member mutation must use the backend's real contract, including:

~~~text
adminUserId
workspaceRole
clientVisible
~~~

Required repair:

- Load members from the canonical members endpoint.
- Load member options only when the user has the relevant action.
- Render employee/client member DTOs exactly as returned.
- Use correct mutation payload fields.
- Reload the canonical case/member state after successful mutation.
- Do not replace the full case object with a small mutation response.
- Test add/remove member, PM change, forbidden actions and removed-member behavior.

This is P0.

---

### 3.5 Activity Timeline is disconnected

Server exposes:

~~~text
GET /api/v1/staff/cases/:id/activity
~~~

Angular currently needs to consume that endpoint directly.

Required repair:

- Add explicit activity DTO types.
- Fetch/paginate activity independently from case detail.
- Show loading, empty, error and retry states.
- Do not expect caseData.activities unless the server explicitly adds it.
- Do not expose private document paths, form answers, petition text or other sensitive content in activity UI.

This is P0.

---

### 3.6 Case mutation refresh behavior is unsafe

Some mutation APIs return a compact result such as:

~~~text
outcome
caseId
stage
~~~

This is not the full case-detail DTO.

Required repair:

- Never replace the full Angular case detail state with a compact mutation response.
- After stage/PM/member/client-update/archive mutations, reload the canonical data required by the screen.
- Preserve modal/input state on recoverable error.
- Use one consistent refresh strategy.

This is P0.

---

### 3.7 Clients directory/detail contract drift

Relevant files:

- enterprise-ui/projects/case-management/src/app/features/clients/clients.component.ts
- enterprise-ui/projects/case-management/src/app/features/clients/client-detail/client-detail.component.ts
- server/routes/api/v1/staff/clients.js
- server/models/ClientUser.js

Audit found mismatches including:

~~~text
Angular q               vs API search
Angular pagination.*    vs API total / totalPages
Angular statuses        vs database status enum
Angular name            vs API displayName
Angular portalStatus    vs no such canonical field
Angular cases[]._id     vs API cases[].id
~~~

Canonical client status values are:

~~~text
pending
active
locked
disabled
~~~

Required repair:

- Align query params, response DTOs, status filters and pagination.
- Client detail must use displayName and cases[].id.
- Do not display a fabricated portalStatus.
- Keep credential and lockout secrets out of DTOs/UI.
- Add component tests with real response-shaped fixtures.

This is P0/P1.

---

### 3.8 Evidence currently has a real backend integrity defect

Relevant files:

- server/services/evidenceManagement.js
- server/routes/api/v1/staff/evidence.js
- server/models/ClientCase.js
- server/models/CaseWorkspace.js
- server/models/EvidenceRequirement.js
- enterprise-ui/projects/case-management/src/app/features/cases/case-detail/evidence-tab/

ClientCase does not own a canonical workspace field.

Evidence currently relies on clientCase.workspace in places where the authoritative workspace must be resolved through CaseWorkspace / case-management services.

EvidenceRequirement requires a workspace.

Required repair:

- Resolve the primary CaseWorkspace explicitly for every case-scoped Evidence operation.
- Never persist workspace: null for a real case requirement.
- Authorization must use the resolved workspace ID.
- Same-case document linking must remain enforced.
- Add dedicated integration tests for evidence provisioning, custom requirements, status changes, linking/unlinking and removed-member authorization.
- Add negative tests for malformed IDs, cross-case document linking, inaccessible case and missing workspace.

This is P0.

---

### 3.9 Evidence product surface is incomplete

The API/domain supports:

~~~text
provision checklist
list requirements
create custom requirement
change status
link document
unlink document
~~~

Angular currently exposes only part of that.

Required Angular parity:

- Provision checklist.
- Create custom requirement.
- Update requirement status.
- Display linked documents.
- Link an eligible same-case document.
- Unlink a document.
- Show client/staff guidance safely where appropriate.
- Navigate to document detail.
- Use capabilities/action flags rather than role-name guesses.

Template provisioning must not be hard-coded to only two options in the component.

Provide a safe server-owned list of available active templates for the case type or another explicit canonical source.

Current seed migration only establishes initial EB-2 NIW and EB-1A templates. Inspect whether that migration is registered and whether production data contains the templates before relying on it. Do not silently run production migrations from this stabilization implementation.

This is P0/P1.

---

### 3.10 Tasks domain is ahead of the UI

The backend supports meaningful task operations, but the Angular Tasks page is primarily a list/filter surface.

Required parity:

- Create case task.
- Edit title/description/type/priority/due date where the domain allows it.
- Assign/reassign when authorized.
- Change status.
- Complete/reopen only according to existing task rules.
- Case-detail Tasks tab and global Tasks page must use the same canonical task contracts.
- Preserve ownership-scoped permissions for specialist/reviewer roles.
- Do not create a second Angular-only task model.

This is P1.

---

### 3.11 Chat exists, but a global Communications surface is missing

Do not rewrite the chat domain.

Continue using:

~~~text
WorkspaceChannel
WorkspaceMessage
ChannelReadState
CaseDocument / DocumentVersion for chat attachments
~~~

Existing case chat should remain:

~~~text
Cases -> Case -> Chat
~~~

But add a discoverable staff-level Messages / Communications module.

Minimum product outcome:

~~~text
Sidebar
  -> Messages

Messages
  -> unread conversations first
  -> case number / case title
  -> channel name
  -> audience label
  -> latest message preview
  -> latest activity time
  -> unread count
  -> participant/sender display
  -> open conversation
~~~

Prefer reusing existing chat services and policies.

If an aggregation API is needed, add a canonical endpoint under /api/v1/staff rather than querying MongoDB directly from Angular.

Do not duplicate WorkspaceMessage data.

When a conversation is opened, either:

- provide a dedicated communications route that reuses the existing chat UI/state helpers, or
- navigate to the relevant case Chat tab with a stable channel-selection mechanism.

Required filters:

- unread
- all
- search by case/channel where practical

Required security:

- row-level case/channel authorization is re-derived server-side.
- restricted/internal channels never leak.
- client-visible/staff-only audience labels remain explicit.
- secure document download routes remain unchanged.

This is P1.

---

### 3.12 Notifications are incomplete

Do not build a second notification engine casually.

First audit the existing Notification domain and existing mention/reply notification behavior.

The stabilization goal is to ensure staff can discover operational events that require action.

At minimum determine and document behavior for:

- new client chat activity
- client document upload / requested document fulfillment
- Smart Form submitted / returned
- petition assignment / review transitions
- filing packet review transitions
- approaching deadline

If adding new persistent notification types would materially expand risk, it is acceptable to use the global Communications inbox plus dashboard/action queues for this stabilization phase, but the limitation must be explicit in the final report.

This is P1/P2.

---

## 4. Modules that should be preserved, not rewritten

### Documents

Documents is one of the strongest existing modules.

Preserve:

- CaseDocument
- DocumentVersion
- DocumentCategory
- DocumentRequest
- DocumentAccessLog
- private storage
- secure download streaming
- review lifecycle
- version history

Close only verified UI parity gaps such as category edit/reorder or request editing if the canonical API already supports them and they are needed for the intended workflow.

### Smart Forms

Preserve:

- SmartFormTemplate
- CaseSmartForm
- SmartFormAudit
- autosave
- submit / return / approve / lock
- revision conflict protection
- client/staff field privacy

Do not turn Smart Forms into official USCIS PDF forms during stabilization.

### Petition Work

Preserve the current case-native petition architecture and immutable version snapshots.

Do not redesign it.

### Filing Packets

Preserve the current filing-manifest architecture.

Do not introduce PDF merge, ZIP generation, official USCIS rendering, e-signature or e-filing during this stabilization cycle unless separately approved.

---

## 5. Features intentionally deferred until stabilization is complete

Do not start these while P0/P1 stabilization work is unresolved:

- Phase 11 USCIS Tracking
- full calendar/reminder engine
- global search/reporting
- Angular CMS replacement
- Angular admin-console production cutover
- legacy staff retirement
- AI features
- official USCIS PDF rendering
- binary filing packet assembly
- e-signatures
- electronic filing

---

## 6. Mandatory testing strategy

Green CI alone is currently insufficient because independent API/component tests can both pass while their contracts disagree.

Add tests that explicitly close this gap.

### 6.1 Server contract tests

For touched canonical staff APIs, verify exact response/request fields used by Angular.

At minimum cover:

- GET /staff/me
- GET /staff/cases
- GET /staff/cases/:id
- GET /staff/cases/:id/members
- GET /staff/cases/:id/activity
- member-options
- case mutations
- clients list/detail
- evidence
- tasks
- any new Messages inbox endpoint

### 6.2 Angular contract-shaped fixtures

Angular component tests must use fixtures shaped like the actual Express DTO.

Do not mock convenient imaginary fields such as:

~~~text
_id
pagination
team
activities
portalStatus
roles[]
~~~

unless the canonical API truly returns them.

### 6.3 Evidence integration tests

Create a dedicated evidence integration suite if one does not already exist.

It must prove:

- a real ClientCase plus primary CaseWorkspace can provision evidence
- workspace is persisted correctly
- PM/member authorization works
- removed member immediately loses access
- custom requirement works
- status transitions work
- waived/not-applicable reasons are enforced
- same-case document link works
- cross-case document is rejected/concealed
- unlink works
- idempotent provisioning works

### 6.4 Two-session browser QA

Before this stabilization phase is declared complete, perform or provide an executable manual QA checklist for:

Client session + PM session:

1. client opens case
2. client sends chat message
3. PM sees it from global Messages and case Chat
4. PM replies
5. client sees reply
6. client uploads/request-fulfills a document
7. PM sees and reviews it
8. client completes/submits a Smart Form
9. PM returns or approves it
10. client sees returned state/note
11. PM works a task
12. PM updates evidence and links a document
13. petition dependency sees the evidence/form/document/task state correctly
14. petition can proceed through intended workflow
15. filing packet consumes finalized petition and pinned sources

Reviewer/specialist session:

- verify role/capability-specific action visibility
- verify server denial remains authoritative
- verify removed workspace member loses access immediately

---

## 7. UI/UX acceptance criteria

The staff application should feel like one product.

Required top-level navigation after stabilization should at least include:

~~~text
Dashboard
Cases
Clients
Tasks
Deadlines
Messages
~~~

Case-scoped specialist work remains inside Case:

~~~text
Overview
Team
Tasks
Activity
Evidence
Documents
Chat
Forms
Petition
Filing Packet
~~~

Do not create top-level duplicate modules for Evidence/Petition/Packets merely for visual symmetry unless a real cross-case workflow requires it.

Every major screen must implement:

- loading
- loaded
- empty
- retryable error
- unauthorized/not-found handling where appropriate
- capability-aware action visibility
- responsive layout
- accessible labels/status text
- no raw Mongo/Mongoose/private-storage metadata

---

## 8. Implementation order

Follow this sequence unless current code proves a dependency requires a small adjustment.

### Batch A — P0 authentication and canonical DTO repair

1. first-login password setup
2. Cases list contract
3. Clients list/detail contract
4. case-detail permission/action flags
5. Team loading and mutation contracts
6. Activity endpoint integration
7. safe case mutation refresh behavior
8. dashboard navigation under /staff

Run tests and commit.

Suggested commit boundary:

~~~text
fix(staff-ui): align Angular core workflows with canonical staff API
~~~

### Batch B — Evidence repair

1. correct CaseWorkspace resolution
2. dedicated evidence integration tests
3. canonical evidence-template discovery
4. Angular create custom requirement
5. link/unlink documents
6. evidence capability/action UX
7. evidence/document navigation

Run tests and commit.

Suggested commit boundary:

~~~text
fix(evidence): repair case workspace integrity and complete staff workflow
~~~

### Batch C — Tasks parity

1. task create
2. task edit
3. status transitions
4. assignment
5. case/global task UX consistency
6. permission tests

Run tests and commit.

Suggested commit boundary:

~~~text
feat(tasks): complete Angular staff task operations
~~~

### Batch D — Communications

1. add global Messages route/navigation
2. add canonical inbox aggregation API if needed
3. unread-first workflow
4. open case/channel conversation
5. preserve existing chat domain/security
6. add tests

Run tests and commit.

Suggested commit boundary:

~~~text
feat(chat): add global staff communications inbox
~~~

### Batch E — Existing advanced-module production QA

Audit/fix only verified defects in:

- Documents
- Smart Forms
- Petition
- Filing Packets
- Client Portal interoperability

Do not expand scope into deferred features.

Suggested commit boundary:

~~~text
fix(workflows): close end-to-end case preparation parity gaps
~~~

### Batch F — Stabilization report

Create:

docs/implementation/STABILIZATION_PHASE_01_REPORT.md

Report must include:

- starting SHA
- implementation commits
- final SHA
- exact CI run
- all job conclusions
- defects fixed
- remaining limitations
- browser/manual QA performed
- migrations/indexes required
- production actions NOT performed
- rollback notes
- explicit decision whether Phase 11 is now unblocked

---

## 9. Database/index/migration rules

Do not run production mutations as part of implementation.

Allowed during coding:

- local/test MongoDB
- dry-run index tooling
- dry-run migration tooling
- test fixtures
- additive schema code

Not allowed without explicit release approval:

- production migration apply
- production index apply
- production backfill
- production nginx change
- production deploy
- direct production DB edits

If evidence template data needs a production seed, document the exact dry-run and apply procedure in the report/runbook. Do not silently execute it.

Never use syncIndexes against production.

---

## 10. Git safety rules

- Work from stabilization/angular-feature-parity-audit or an additive child branch.
- Do not force push.
- Do not rebase shared history.
- Do not amend already-published commits.
- Do not use git reset --hard or git clean -fd.
- Prefer small additive commits by stabilization batch.
- Do not merge to main automatically.
- Do not deploy production automatically.
- Stop for release approval only after final CI is green.

Because main is connected to deployment automation, treat merging into main as a release action.

---

# MASTER COMMAND PROMPT

Copy the entire section below into a fresh coding session when starting implementation.

---

You are implementing **Stabilization Phase 01 — Angular Staff Feature Parity & End-to-End Contract Repair** for the Immigration Horizons repository.

Repository:

~~~text
ashderkarim123/Immigration-Horizons
~~~

Starting branch:

~~~text
stabilization/angular-feature-parity-audit
~~~

Authoritative stabilization document:

~~~text
docs/implementation/STABILIZATION_PHASE_01_FEATURE_AUDIT_AND_MASTER_PROMPT.md
~~~

## Mission

Do not build Phase 11 USCIS Tracking yet.

Audit and repair the already-implemented case-management platform so that the features that exist in backend/domain code are actually usable end-to-end from the Angular staff application and interoperable with the existing Next.js client portal.

Treat current repository code as authoritative when an old document disagrees.

The target production architecture remains:

~~~text
Public website       = Next.js
Client portal        = Next.js
Staff case app       = Angular
Canonical staff API  = Express /api/v1/staff
Admin CMS            = Express/EJS
Database             = MongoDB
~~~

Do not replace those boundaries during this task.

## Non-negotiable engineering rules

1. Never infer authorization in Angular from invented role names.
2. Use server-provided action flags and canonical capabilities for UI visibility.
3. Server-side capability + row-level authorization remains authoritative.
4. Do not introduce duplicate case/task/document/evidence/chat/form/petition/packet models.
5. Use explicit DTO types. Remove touched uses of any where practical.
6. Do not make Angular depend on raw Mongoose fields such as _id when the API contract returns id.
7. Do not weaken trusted-origin, session, secure-download, concealment or capability checks.
8. Do not expose private storage keys, paths, checksums, password data, session tokens, internal form answers or petition text in generic DTOs/logs.
9. Do not run production deploys, indexes, migrations or backfills.
10. Do not merge to main automatically.
11. Use additive commits. No force push/rebase/reset-hard/clean.
12. Every repaired Angular workflow must be covered by tests using response fixtures shaped like the real Express DTO.
13. Add integration tests where a backend bug previously escaped because no real-domain test covered it.
14. Continue until the stabilization scope below is complete and the exact final SHA has all CI jobs green, or document a concrete blocker that cannot safely be solved from the repository.

## First action: re-audit the baseline

Before editing:

- read this stabilization document completely
- inspect current main and this branch
- inspect current CI workflow
- inspect the canonical staff OpenAPI
- inspect the exact files named in the findings
- verify whether each defect still exists
- record any finding that changed since the audit baseline

Do not blindly patch based only on prose.

## Batch A — repair P0 Angular/API contracts

### A1. First-login password setup

Align Angular with server/routes/api/v1/staff/account.js.

Required:

~~~text
currentPassword
newPassword
confirmPassword
minimum 12 characters
~~~

Add test coverage proving a mustChangePassword employee can complete setup.

### A2. Cases directory

Align Angular Cases with server/routes/api/v1/staff/cases.js.

Verify/fix:

~~~text
id vs _id
search query parameter
archived query parameter
pagination total/totalPages
case links
URL filter persistence
scope
stage
caseType
priority
~~~

Use explicit DTO types.

### A3. Clients directory/detail

Align with server/routes/api/v1/staff/clients.js and ClientUser status enum.

Verify/fix:

~~~text
search
pagination
pending/active/locked/disabled
displayName
cases[].id
remove fabricated portalStatus assumptions
~~~

### A4. Case action permissions

Use case-detail actions and/or canonical AuthService capabilities.

Remove role-name lists such as case_manager/paralegal/attorney from touched staff authorization UI.

Verify PM, admin, reviewer, specialist and viewer behavior.

### A5. Team

Consume:

~~~text
GET /staff/cases/:id/members
GET /staff/cases/:id/member-options
~~~

Align member DTO rendering.

Align mutation bodies exactly with Express:

~~~text
projectManagerId
adminUserId
workspaceRole
clientVisible
~~~

Reload canonical state after mutations.

### A6. Activity

Consume the real activity endpoint.

Implement loading/empty/error/pagination.

### A7. Mutation refresh

Never overwrite the full case state with compact mutation responses.

Use a consistent reload strategy.

### A8. Dashboard routing

Ensure navigation remains under the Angular /staff base.

Prefer Angular RouterLink over raw root-relative href for staff routes.

After Batch A:

- run server tests
- run root tests
- run Angular tests
- lint/typecheck
- build case-management
- verify staff build
- commit Batch A

## Batch B — repair and complete Evidence

The highest-priority backend defect to verify is the use of clientCase.workspace even though ClientCase does not own the authoritative workspace relationship.

Resolve the primary CaseWorkspace explicitly.

Required backend behavior:

- evidence provisioning works on a real case/workspace
- EvidenceRequirement.workspace is always correct
- PM/member authorization uses real workspace ID
- removed employee loses access
- malformed/inaccessible targets conceal safely
- same-case document links only
- custom requirement works
- status change works
- link/unlink works
- provisioning is idempotent

Create a dedicated evidence integration test suite if one is absent.

Then complete Angular Evidence parity:

- provision
- custom requirement
- status
- linked documents
- link eligible same-case document
- unlink
- guidance display as appropriate
- document navigation

Do not hard-code evidence templates in Angular.

Create/read a canonical list of active templates appropriate for the case type.

Inspect the existing template seed migration. Do not apply production migrations. Document any production seed requirement.

Run the full verification set and commit Batch B.

## Batch C — complete Task operations

Keep the existing Task model/services.

Implement staff UX for:

- create case task
- edit allowed fields
- assign/reassign when permitted
- status transitions
- completion
- global task list consistency
- case task consistency

Specialists/reviewers with ownership-scoped permissions must not gain blanket task management.

Add tests and commit Batch C.

## Batch D — make Chat discoverable as a global module

Do not rewrite chat.

Keep:

~~~text
WorkspaceChannel
WorkspaceMessage
ChannelReadState
existing attachment rules
existing case Chat tab
~~~

Add top-level Angular navigation:

~~~text
Messages
~~~

Build a global staff communications inbox using canonical API aggregation.

Minimum row:

~~~text
case number
case title
channel
audience
latest sender
latest message preview
latest activity time
unread count
~~~

Unread first.

Allow opening the correct case/channel conversation.

Preserve restricted/internal-channel concealment.

Add API and Angular tests.

Commit Batch D.

## Batch E — end-to-end parity verification

Audit the already-developed modules without redesigning them:

- Documents
- Smart Forms
- Petition Work
- Filing Packets
- Client Portal interoperability

Fix only real defects discovered during end-to-end testing.

Do not add:

- USCIS tracking
- PDF packet merge
- ZIP assembly
- official USCIS form rendering
- e-signature
- e-filing
- AI
- Angular admin cutover

Perform the two-session workflow from the stabilization document.

Create regression tests for every defect found.

## Definition of done

Stabilization Phase 01 is complete only when:

1. first-login staff password setup works
2. Cases list/search/filter/pagination/navigation works
3. Clients list/detail works
4. PM sees case actions permitted by the server
5. Team loads real members and add/remove/PM change works
6. Activity timeline loads real CaseActivity
7. case mutations do not corrupt local case state
8. Evidence works on a real CaseWorkspace and has integration coverage
9. Evidence custom/link/unlink workflow is usable
10. Tasks can be operated, not merely listed
11. staff has a discoverable global Messages inbox
12. case Chat remains interoperable with Client Portal Chat
13. Documents, Forms, Petition and Filing Packet core flows pass regression verification
14. removed workspace members lose access immediately
15. Angular tests use canonical DTO-shaped fixtures for touched workflows
16. root tests are green
17. server tests are green
18. Angular case-management tests are green
19. lint/typecheck/build are green
20. final GitHub CI for the exact final SHA has all required jobs successful

## Final report

Create:

~~~text
docs/implementation/STABILIZATION_PHASE_01_REPORT.md
~~~

Include:

- baseline SHA
- final SHA
- commits
- audit defects confirmed
- defects fixed
- tests added
- manual/browser QA results
- remaining limitations
- production migration/index/seed requirements
- production actions not performed
- rollback notes
- whether Phase 11 USCIS Tracking is now unblocked

Stop after the exact final SHA is green and request explicit release/merge approval.

Do not merge main or deploy production as part of this implementation command.

---

## 11. Expected outcome

After this stabilization phase, the staff product should no longer be judged by whether a model or route exists.

It should be judged by whether a real employee can:

~~~text
sign in
open their cases
manage the case team
see activity
work tasks
manage evidence
handle documents
communicate with the client
review forms
prepare petition work
assemble the filing manifest
and move between those workflows without contract failures
~~~

Only after that standard is met should Phase 11 USCIS Tracking begin.
