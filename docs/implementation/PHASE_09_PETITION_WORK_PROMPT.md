# Phase 09 — Case-Native Petition Work V1 Implementation Prompt

**Branch:** `architecture/angular-enterprise-platform`  
**ADR:** `docs/architecture/ADR-022-case-native-petition-work-v1.md`  
**Execution Phase:** 09 — Petition Work V1  
**Roadmap mapping:** Original Phase 12 — Petition Workflow  
**Phase 08 verified docs tip before Phase 09:** `82636a0e5cee6024eafe43a9801980b976098f65`  
**Phase 08 implementation tip:** `df090f967be8a6b588673b5f59cda18a1294f03f`  
**Phase 08 implementation CI:** #69, run ID `36911437173`, all required jobs green.  
**Phase 08 latest docs CI:** #71, run ID `36912052500`, all required jobs green.

---

## 1. Mission

Implement the smallest production-ready, case-native Petition Work module that lets authorized staff draft, assign, review, approve, and finalize petition work inside the Angular case workspace.

The outcome is:

```text
ClientCase
   ↓
CasePetition
   ├── structured drafting sections
   ├── section assignments
   ├── review states
   ├── evidence/form/document/task dependencies
   └── lifecycle
          ↓
     finalized
          ↓
PetitionVersion (immutable provenance snapshot)
```

Do not begin Filing Packet composition.

---

## 2. Delivery priority

Optimize for launch speed in this order:

1. authorization/privacy;
2. case-native data integrity;
3. usable drafting/review;
4. dependency integrity/readiness;
5. immutable final version;
6. Angular UX;
7. tests/CI.

Do not spend this phase on:

- PDF/ZIP packet generation;
- official USCIS form rendering;
- client petition editing;
- rich-text frameworks;
- AI drafting;
- a general workflow engine;
- drag-and-drop petition templates.

---

## 3. Preflight

Before changing code:

```bash
git fetch origin --prune

git branch --show-current
git status --short
git rev-parse HEAD
git rev-parse origin/architecture/angular-enterprise-platform
git log --oneline -25
git diff
git diff --cached
```

Required branch:

```text
architecture/angular-enterprise-platform
```

Do not destroy unknown local work.

Never use:

```text
git reset --hard
git clean -fd
git rebase
git commit --amend
git push --force
```

Do not deploy production.

Do not run production migrations, index builds, or backfills.

---

## 4. Required reading

Read completely:

```text
CLAUDE.md
AGENTS.md

.claude/API_ARCHITECTURE.md
.claude/DATABASE.md
.claude/TESTING.md
.claude/SECURITY.md
.claude/DESIGN_SYSTEM.md

docs/architecture/ADR-015-angular-enterprise-platform.md
docs/architecture/ADR-016-authentication-boundaries.md
docs/architecture/ADR-017-case-native-tasks-and-deadlines.md
docs/architecture/ADR-018-evidence-checklists-and-requirements.md
docs/architecture/ADR-019-canonical-staff-documents-and-secure-file-operations.md
docs/architecture/ADR-021-smart-forms-v1.md
docs/architecture/ADR-022-case-native-petition-work-v1.md

docs/implementation/ANGULAR_ENTERPRISE_PLATFORM_ROADMAP.md
docs/implementation/PHASE_08_SMART_FORMS_REPORT.md
```

Inspect current implementation of:

```text
ClientCase
CaseWorkspace
WorkspaceMember
Task
EvidenceRequirement
CaseDocument
DocumentVersion
CaseSmartForm
CaseActivity
permissions/capabilities
casePolicy
documentPolicy
smartFormPolicy
taskManagement
canonical /api/v1/staff patterns
OpenAPI
Angular case-detail tabs
index scripts
schema contract tests
```

Current code is authoritative where older docs differ.

---

## 5. Phase 08 gate

Do not proceed if Phase 08 is not still green.

Already verified:

```text
Implementation tip:
df090f967be8a6b588673b5f59cda18a1294f03f

CI #69 / run 36911437173:
Tests (Next.js app) — success
Lint · types · build — success
Enterprise UI (Angular) — success
Tests (admin CMS) — success

Latest docs tip:
82636a0e5cee6024eafe43a9801980b976098f65

CI #71 / run 36912052500:
all four required jobs — success
```

If local history is missing these commits, reconcile non-destructively before coding.

---

## 6. Do not reuse DeliveryRecord as the petition domain

The existing `DeliveryRecord` is legacy lead-scoped workflow state.

It stores URL-style file records and has placeholder export semantics.

Rules:

- preserve it;
- do not delete it;
- do not migrate it in this phase;
- do not make Angular Petition depend on it;
- do not copy its `files[].url` pattern.

Petition uses case-native secure document references only.

---

## 7. Models

Implement:

```text
CasePetition
PetitionVersion
```

Use repository conventions for collection naming and JS/TS mirroring if both runtimes touch a collection.

### 7.1 CasePetition

Core fields:

```text
case
workspace

sequence
kind
title
description

status
revision

sections[]
dependencies[]

createdBy
createdByName
lastEditedBy
lastEditedByName

submittedForReviewAt
approvedAt
approvedBy
finalizedAt
finalizedBy

internalReviewNote

createdAt
updatedAt
```

Status enum:

```text
drafting
internal_review
needs_changes
approved
finalized
archived
```

Kinds:

```text
primary
rfe_response
noid_response
supplemental
other
```

### 7.2 PetitionVersion

Core fields:

```text
petition
case
workspace

versionNumber
reason
sourceRevision

kind
titleSnapshot
statusSnapshot

sections[]
dependencies[]

createdBy
createdByName
createdAt
```

Immutable after create.

---

## 8. Multiple petitions per case

A case may have multiple petitions.

Unique key:

```text
(case, sequence)
```

Primary V1 provision:

```text
kind = primary
sequence = 1
```

Do not encode one-petition-per-case.

Do not create a duplicate primary petition when provision is retried.

---

## 9. Section schema

Use embedded sections.

Fields:

```text
key
title
order
required
body
reviewStatus
assignedTo
assignedToName
lastEditedAt
lastEditedBy
lastEditedByName
reviewedAt
reviewedBy
reviewedByName
reviewNote
```

Section review statuses:

```text
draft
ready_for_review
changes_requested
approved
```

Body is plain text.

Do not store arbitrary HTML.

---

## 10. Code-owned section template catalog

Create code-owned case-type templates.

Do not build an admin template UI.

For petition-oriented case types, provision concise useful structures.

Examples may include:

```text
case_overview
beneficiary_background
legal_standard
proposed_endeavor_or_field
evidence_analysis
criterion_or_prong_analysis
positioning_and_conclusion
```

Tailor explicitly by case type.

For:

```text
recommendation_letters
expert_opinion_letters
business_plan
evidence_packaging
uscis_forms
other
```

either:

- provide a minimal work-product structure that actually fits; or
- explicitly mark the case type as having no automatic primary petition.

Test the decision for every current `CASE_TYPE_VALUES`.

Do not fabricate irrelevant legal sections.

---

## 11. Capabilities

Add to both capability maps/contracts:

```text
petitions.view
petitions.manage
petitions.edit
petitions.review
petitions.finalize
```

Initial grants:

```text
petitions.view:
  super_admin
  admin
  pm
  petition_writer
  reviewer
  uscis_forms_specialist
  evidence_collector
  business_plan_specialist
  recommendation_letter_specialist

petitions.manage:
  super_admin
  admin
  pm

petitions.edit:
  super_admin
  admin
  pm
  petition_writer

petitions.review:
  super_admin
  admin
  pm
  reviewer

petitions.finalize:
  super_admin
  admin
  reviewer
```

Capabilities do not replace workspace membership.

Update employee capability contract tests.

---

## 12. Petition policy

Create a petition policy service.

Every staff operation checks:

```text
EmployeeSession
mustChangePassword policy
capability
case/workspace access
petition belongs to accessible case/workspace
section assignment where required
current lifecycle state
```

Reuse `casePolicy`.

Do not duplicate row-access logic.

Removed workspace member loses access immediately.

---

## 13. Petition writer ownership rule

A normal petition writer may edit only:

```text
sections assigned to them
```

Managers with `petitions.manage` may edit sections more broadly.

Reviewers with `petitions.review` can review but do not get arbitrary drafting rights unless they separately have edit authority.

Implement this server-side.

Angular buttons do not authorize.

---

## 14. Section assignment

Assignment operation validates:

- valid active AdminUser;
- employee active on same case workspace unless existing policy explicitly permits elevated bypass;
- actor can manage/assign petition work;
- target role is operationally eligible.

Assignment must not create workspace membership.

If target is not on case team, return a controlled validation error such as:

```text
Add this employee to the case team before assigning petition work.
```

Persist snapshot name.

Optional: reuse existing task-assignment notification style.

---

## 15. Section editing

Use one application service for section mutation.

Recommended operation:

```text
saveSection({
  petitionId,
  sectionKey,
  expectedRevision,
  body,
  actor
})
```

Rules:

- section exists;
- actor may edit section;
- petition status allows drafting edits;
- finalized petition cannot edit;
- revision must match;
- body length bounded;
- update last-editor snapshot;
- increment petition revision atomically.

Stale:

```text
409
```

---

## 16. Section review flow

Support:

```text
draft
  -> ready_for_review
  -> approved

ready_for_review
  -> changes_requested

changes_requested
  -> ready_for_review
```

Managers/reviewers according to capability can return/approve.

Return for changes requires a useful review note.

Approval records reviewer snapshot/time.

Do not let a section's author silently approve their own section unless the actor independently holds the review capability and product policy permits that role.

---

## 17. Dependencies

Petition dependency types:

```text
evidence_requirement
smart_form
case_document
task
```

Dependency fields:

```text
id
type
refId
labelSnapshot
role
requiredForFinalization
order
```

For `case_document`, optional roles:

```text
business_plan
recommendation_letter
expert_opinion_letter
supporting_document
other
```

Do not create new BusinessPlan/RecommendationLetter collections.

Use secure documents + tasks.

---

## 18. Dependency same-case validation

When adding dependency:

### EvidenceRequirement

Check:

```text
requirement.case == petition.case
requirement.workspace == petition.workspace
```

### CaseSmartForm

Check same case/workspace.

### CaseDocument

Check same case/workspace and document state policy.

### Task

Check `task.case == petition.case`.

Legacy lead-only tasks cannot become petition dependencies unless they have the correct case linkage.

Cross-case IDs return safe concealed failure.

---

## 19. Dependency readiness service

Create one server-side readiness resolver.

### EvidenceRequirement ready

```text
satisfied
waived
not_applicable
```

### CaseSmartForm ready

```text
approved
locked
```

### CaseDocument ready

Use current document policy/state.

At minimum reject:

```text
archived
rejected
quarantined
unavailable
missing currentVersion
```

Prefer `accepted` for finalization where existing review semantics make that meaningful.

Document the exact rule in Phase 09 report.

### Task ready

```text
completed
```

Return:

```text
ready
status
reason
```

No legal-strength score.

---

## 20. Petition lifecycle

Implement explicit service transitions.

Allowed:

```text
drafting        -> internal_review
needs_changes   -> internal_review
internal_review -> needs_changes
internal_review -> approved
approved        -> needs_changes
approved        -> finalized
```

Optional archive can be manager-only and non-destructive.

Do not invent additional states unless needed by current code.

---

## 21. Submit for internal review

To submit petition:

- actor authorized;
- expected revision matches;
- at least one meaningful section exists;
- required sections are not blank;
- all required sections are at least `ready_for_review` or `approved`;
- change petition status to `internal_review`;
- set submitted time;
- create CaseActivity;
- optionally create immutable review snapshot if implementation chooses review milestone snapshots.

Do not auto-approve sections.

---

## 22. Return for changes

Allowed from:

```text
internal_review
approved
```

Requires:

- `petitions.review`;
- expected revision;
- internal review note/reason;
- status -> `needs_changes`;
- audit/activity.

A returned petition becomes editable again according to normal section ownership.

---

## 23. Approve petition

Allowed only from:

```text
internal_review
```

Requirements:

- `petitions.review`;
- every required section is `approved`;
- expected revision matches.

Then:

- status -> `approved`;
- approvedAt/by snapshot;
- create immutable `PetitionVersion` with reason `approval`;
- CaseActivity `petition_approved`.

Do not require all dependencies ready at approval unless ADR's finalization rule does so.

---

## 24. Finalize petition

Allowed only from:

```text
approved
```

Requirements:

- `petitions.finalize`;
- expected revision;
- all required sections approved;
- every dependency with `requiredForFinalization = true` is ready.

Then atomically/logically:

1. create immutable final `PetitionVersion`;
2. set petition status `finalized`;
3. set finalizedAt/by;
4. increment revision;
5. record CaseActivity.

If version creation fails, do not falsely report finalized.

Use transaction support only if existing infrastructure safely supports it; otherwise design compensating/idempotent logic and document it.

---

## 25. PetitionVersion snapshot

On approval/finalization capture:

### Petition

```text
petition id
case/workspace ids
kind
title
sourceRevision
status
```

### Sections

```text
key
title
order
required
body
reviewStatus
assignedToName
reviewedByName
reviewNote
```

### Dependencies

Store type-specific provenance.

#### Evidence

```text
id
title
status
```

#### Smart Form

```text
id
templateKey
templateVersion
revision
status
lockedRevision
```

#### Document

Resolve current version and snapshot:

```text
documentId
documentVersionId
displayName
versionNumber
status
```

#### Task

```text
taskId
title
status
completedAt
```

Do not copy document storage paths/checksums/private URLs.

---

## 26. PetitionVersion immutability

At model/service layer reject:

- update;
- replace;
- delete;

for normal application code.

No editing a historical version.

If tests need cleanup, use test database teardown/drop database, not public mutation APIs.

---

## 27. Canonical service layer

Implement a petition application service, e.g.:

```text
server/services/petitionManagement.js
```

or a dedicated folder if repository conventions prefer.

It should own:

```text
listCasePetitions
provisionPrimaryPetition
createPetition
getPetition
updatePetitionMetadata
saveSection
assignSection
submitSectionForReview
returnSection
approveSection
addDependency
removeDependency
resolveDependencyReadiness
submitPetition
returnPetition
approvePetition
finalizePetition
listVersions
getVersion
createVersionSnapshot
```

Keep routes thin.

---

## 28. Canonical staff API

Implement intentional endpoints under:

```text
/api/v1/staff
```

Required family:

```text
GET    /cases/:caseId/petitions
POST   /cases/:caseId/petitions
POST   /cases/:caseId/petitions/provision

GET    /petitions/:petitionId
PATCH  /petitions/:petitionId

PATCH  /petitions/:petitionId/sections/:sectionKey
POST   /petitions/:petitionId/sections/:sectionKey/assign
POST   /petitions/:petitionId/sections/:sectionKey/review
POST   /petitions/:petitionId/sections/:sectionKey/return
POST   /petitions/:petitionId/sections/:sectionKey/approve

POST   /petitions/:petitionId/dependencies
DELETE /petitions/:petitionId/dependencies/:dependencyId

POST   /petitions/:petitionId/submit
POST   /petitions/:petitionId/return
POST   /petitions/:petitionId/approve
POST   /petitions/:petitionId/finalize

GET    /petitions/:petitionId/versions
GET    /petitions/:petitionId/versions/:versionId
```

You may simplify route names if current API style strongly favors another shape.

Do not add hard delete.

---

## 29. DTOs

Explicit only.

### Petition summary

```text
id
sequence
kind
title
status
revision
sectionProgress
dependencyProgress
updatedAt
actions
```

### Section DTO

```text
key
title
order
required
body
reviewStatus
assignee
lastEditedAt
lastEditedByName
reviewedAt
reviewedByName
reviewNote
actions
```

### Dependency DTO

```text
id
type
refId
label
role
requiredForFinalization
ready
status
reason
```

### Version DTO

```text
id
versionNumber
reason
sourceRevision
createdByName
createdAt
```

Do not return raw Mongoose documents.

---

## 30. Angular API types

Create explicit petition API contracts.

Avoid `any`.

Recommended:

```text
PetitionSummary
PetitionDetail
PetitionSection
PetitionDependency
PetitionActions
PetitionVersionSummary
PetitionVersionDetail
PetitionMutationResult
```

Follow existing core/api patterns.

---

## 31. Angular case workspace

Add **Petition** to case-detail navigation.

Required layout can be:

```text
Petitions / sections | Draft editor | Dependencies / review / versions
```

or a responsive equivalent.

Required behavior:

- load petition list;
- provision primary petition if eligible;
- create additional petition where authorized;
- select petition;
- section navigation;
- show assignment + review state;
- plain-text editor;
- autosave;
- save status;
- conflict state;
- assign section;
- submit section for review;
- return/approve section;
- dependency list;
- add/remove dependency;
- readiness indicator;
- submit petition;
- return petition;
- approve petition;
- finalize petition;
- immutable version list/detail;
- finalized read-only state;
- loading/empty/error/retry.

No new framework.

---

## 32. Autosave

Use a bounded debounce around:

```text
1000–1500 ms
```

One in-flight save per active section.

Every save includes:

```text
expectedRevision
```

After success:

- update revision;
- show Saved.

After 409:

- stop further automatic overwrites;
- preserve local body in memory;
- show conflict;
- offer reload latest.

Do not use localStorage.

---

## 33. Petition list/progress

Section progress:

```text
approved required sections / total required sections
```

Dependency progress:

```text
ready required dependencies / total required dependencies
```

These are operational completion metrics only.

Do not label them as:

- legal strength;
- approval probability;
- filing eligibility;
- chance of success.

---

## 34. Dependency picker

For usability, expose safe candidate-list routes or embed candidates in detail only if bounded.

Possible read helpers:

```text
GET /petitions/:id/dependency-candidates?type=evidence_requirement
GET /petitions/:id/dependency-candidates?type=smart_form
GET /petitions/:id/dependency-candidates?type=case_document
GET /petitions/:id/dependency-candidates?type=task
```

If simpler, reuse existing case Evidence/Documents/Forms/Tasks endpoints and let the UI submit the selected id.

The server still validates same-case integrity.

Do not duplicate whole evidence/document/form datasets in petition DTOs.

---

## 35. CaseActivity

Add types in all mirrored contracts:

```text
petition_created
petition_submitted
petition_returned
petition_approved
petition_finalized
```

Only material petition-level transitions.

Do not add autosave/section-keystroke activity.

Never place petition body text in activity message/meta.

---

## 36. Notifications

If implemented, use current `notificationService`.

Safe internal notification triggers:

- section assigned;
- petition submitted for review;
- petition returned;
- petition approved.

No client notification from internal drafting.

Notification failure is best-effort and must not roll back persisted petition state.

Do not build new notification infrastructure.

---

## 37. OpenAPI

Update:

```text
server/openapi/v1.yaml
```

Document:

- petition list/create/provision;
- detail;
- section save/review/assignment;
- dependencies;
- lifecycle transitions;
- versions;
- 400/403/404/409 behavior;
- revision contract;
- DTO schemas.

Do not expose Mongo schemas.

---

## 38. Indexes

Evaluate real queries.

Expected minimum:

```text
CasePetition:
  unique { case: 1, sequence: 1 }
  { case: 1, status: 1, updatedAt: -1 }
  { workspace: 1, updatedAt: -1 }

PetitionVersion:
  unique { petition: 1, versionNumber: 1 }
  { case: 1, createdAt: -1 }
```

Only add `sections.assignedTo` index if actual query/API needs it.

Update index scripts/dry-run tests.

Do not build production indexes.

---

## 39. Security tests

Required:

- unauthenticated;
- mustChangePassword mutation denial;
- missing capability;
- no workspace membership;
- removed member;
- malformed id;
- inaccessible other-case petition;
- petition writer cannot edit unassigned section;
- reviewer cannot draft without edit authority;
- manager edit rules;
- cross-case dependency concealment;
- no storage metadata in DTOs;
- no raw user/session data;
- CSRF/trusted-origin mutation enforcement.

---

## 40. Domain tests

Required:

- multiple petitions per case;
- sequence uniqueness;
- primary provision idempotency;
- section template catalog valid;
- every case type has explicit catalog decision;
- finalized petition immutable;
- PetitionVersion immutable.

---

## 41. Section tests

Required:

- assigned writer edit;
- unassigned writer denial;
- manager edit;
- autosave increments revision;
- stale revision 409;
- ready-for-review transition;
- return requires note;
- approve;
- invalid transition rejected.

---

## 42. Dependency tests

Required:

- same-case evidence link;
- same-case Smart Form link;
- same-case secure document link;
- same-case case task link;
- cross-case denial;
- duplicate handling;
- readiness for each type;
- required unready dependency blocks finalize;
- optional unready dependency does not block if ADR says optional.

---

## 43. Lifecycle/version tests

Required:

- submit to internal_review;
- return -> needs_changes;
- approve only with required sections approved;
- approval version snapshot;
- finalize only from approved;
- finalize blocks on required dependency;
- final version snapshots current document version;
- final version snapshots Smart Form revision/lockedRevision;
- finalized petition mutation rejected;
- version cannot be updated/deleted.

---

## 44. Angular tests

At minimum:

- empty/provision state;
- petition list selection;
- section render;
- assignment action;
- autosave debounce;
- save success;
- 409 conflict;
- writer ownership controls;
- reviewer controls;
- dependency readiness;
- submit;
- approve;
- finalize guard;
- version history;
- finalized read-only;
- error/retry.

---

## 45. Legacy regression

Run existing tests for:

- DeliveryRecord/lead delivery;
- Tasks;
- Evidence;
- Documents;
- Smart Forms;
- case authorization;
- capability contracts.

Do not break lead-only Task/DeliveryRecord flows.

---

## 46. No migration requirement

Phase 09 should not require data migration.

Existing cases remain valid with zero petitions.

Petitions are created explicitly/lazily.

If a backfill helper is added, it must default to dry-run and is not run against production.

---

## 47. No client petition UI

Do not add client portal petition routes or narrative DTOs.

This phase is internal staff drafting.

Use existing client-visible workflows for collaboration:

```text
Chat
Documents
Smart Forms
```

This keeps Phase 09 smaller and safer.

---

## 48. No Filing Packet

Do not build:

- ordered filing document list;
- filing packet snapshots;
- ZIP;
- combined PDF;
- cover sheets;
- packet delivery;
- packet export.

Phase 09 ends with:

```text
finalized PetitionVersion
```

Phase 10 consumes that.

---

## 49. Local verification

### Root

```bash
npm ci --no-audit --no-fund
npm run lint
npx tsc --noEmit

SITE_URL=https://app.example.invalid \
NEXT_PUBLIC_SITE_URL=https://example.invalid \
npm run build

TEST_MONGODB_URI=mongodb://127.0.0.1:27017/ih-ci-root \
npm test
```

### Server

```bash
cd server

npm ci --no-audit --no-fund

TEST_MONGODB_URI=mongodb://127.0.0.1:27017/ih-ci-server \
LOGIN_RATE_LIMIT=1000 \
npm test

npm run db:indexes:dry-run

cd ..
```

### Angular

```bash
cd enterprise-ui

npm ci --no-audit --no-fund
npm test
npx ng build case-management
npx ng build admin-console

cd ..
```

### Hygiene

```bash
git diff --check
git status --short
```

Do not skip failures.

---

## 50. Manual QA

Verify one real case flow:

### Manager

```text
open case
Petition tab
provision primary petition
assign two sections
link one EvidenceRequirement
link one Smart Form
link one secure CaseDocument
link one case Task
```

### Petition writer

```text
open assigned section
draft text
autosave
submit section for review
```

### Reviewer

```text
return section with note
```

### Writer

```text
revise
resubmit
```

### Reviewer/manager

```text
approve required sections
submit petition
approve petition
observe required dependency readiness
finalize
open immutable final version
confirm petition editor is read-only
```

Also verify an employee removed from the case immediately loses access.

---

## 51. Completion report

Create:

```text
docs/implementation/PHASE_09_PETITION_WORK_REPORT.md
```

Include:

```text
starting SHA
ending SHA
implementation commits

models/collections
indexes
petition kinds
case-type template catalog
multiple-petition decision
section model
assignment policy
section ownership policy
section review workflow
petition lifecycle
dependency types
dependency readiness rules
secure document integration
Smart Form integration
Evidence integration
Task integration
version snapshot/provenance design
capability changes
staff API
Angular UX
DTO/privacy boundaries
CaseActivity
notifications
OpenAPI
tests
manual QA
migration impact
production impact: NONE
legacy DeliveryRecord status
known limitations
Filing Packet boundary
rollback
final CI run number
final CI run ID
job conclusions
```

Do not fabricate final CI data.

---

## 52. Commit strategy

Truthful additive commits.

Possible:

```text
feat(petitions): add case-native petition domain
feat(api): expose petition workflow on staff API
feat(angular): add case petition workspace
test(petitions): cover authorization lifecycle and provenance
docs(phase-09): record petition verification
```

Do not manufacture extra commits if fewer are natural.

No history rewrite.

---

## 53. Push

Push only:

```bash
git push origin architecture/angular-enterprise-platform
```

Do not merge to `main`.

Do not deploy production.

---

## 54. Remote CI gate

After push:

```bash
git rev-parse HEAD
```

Verify GitHub Actions for the exact SHA.

Required jobs:

```text
Tests (Next.js app)
Lint · types · build
Enterprise UI (Angular)
Tests (admin CMS)
```

All must be green.

If red:

1. diagnose;
2. fix;
3. new additive commit;
4. push;
5. verify again.

No amend/rebase/force push.

---

## 55. Stop condition

Phase 09 is complete only when:

- Phase 08 remains green;
- Petition models/services are real;
- staff canonical API is real;
- Angular Petition workspace is real;
- section assignment/edit/review works;
- dependency integrity/readiness works;
- approval/finalization works;
- final immutable PetitionVersion exists;
- security/concurrency tests pass;
- OpenAPI is current;
- report exists;
- exact final Phase 09 SHA has all four CI jobs green;
- no production deploy/migration/index/backfill occurred.

Then **STOP**.

Do not begin Phase 10 automatically.

---

## 56. Deployment-speed guardrail

The product needs to reach production soon.

Prefer:

```text
simple + case-native + secure + tested
```

over:

```text
generalized + highly configurable + future-proof beyond actual requirements
```

The most important Phase 09 artifact is a trustworthy finalized immutable petition version. Phase 10 can then build filing packets without reopening petition architecture.
