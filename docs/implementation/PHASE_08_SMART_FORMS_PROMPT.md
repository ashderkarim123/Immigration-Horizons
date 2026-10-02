# Phase 08 — Smart Forms V1 Implementation Prompt

**Branch:** `architecture/angular-enterprise-platform`  
**ADR:** `docs/architecture/ADR-021-smart-forms-v1.md`  
**Execution Phase:** 08 — Smart Forms V1  
**Roadmap mapping:** Original Phase 11 — Smart Forms  
**Phase 07 verified tip before Phase 08 docs:** `68290a102167958c8aaf460648800cd4aaabc0a9`  
**Phase 07 latest CI:** run #63, ID `36899521938`, all required jobs green.

---

## 1. Mission

Implement the smallest production-ready Smart Forms capability that supports real client/staff structured case intake and review **without delaying deployment with a general-purpose form builder or USCIS PDF engine**.

The Phase 08 completion outcome is:

```text
versioned code-owned form templates
        ↓
case-owned smart form instances
        ↓
client + authorized staff structured editing
        ↓
autosave + server validation + optimistic concurrency
        ↓
submit
        ↓
staff review / return for changes
        ↓
approve
        ↓
lock immutable reviewed revision
```

Do not begin Petition workflow.

---

## 2. Delivery priority

Optimize for deployment speed in this order:

1. data integrity;
2. authorization/privacy;
3. client/staff usable forms;
4. autosave/concurrency;
5. review/lock lifecycle;
6. tests/CI;
7. polish.

Do **not** spend implementation time on:

- drag-and-drop template designers;
- WYSIWYG builders;
- a general rules engine;
- official USCIS PDF generation;
- AI;
- e-signatures;
- broad admin tooling;
- new realtime infrastructure.

If a design choice adds substantial implementation time without improving the Phase 08 completion gate, prefer the simpler approach.

---

## 3. Preflight

Before changing code:

```bash
git fetch origin --prune

git branch --show-current
git status --short
git rev-parse HEAD
git rev-parse origin/architecture/angular-enterprise-platform
git log --oneline -20
git diff
git diff --cached
```

Required branch:

```text
architecture/angular-enterprise-platform
```

Do not destroy unknown local changes.

Never use:

```text
git reset --hard
git clean -fd
git rebase
git commit --amend
git push --force
```

Do not deploy production.

Do not run production DB/index/backfill operations.

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
docs/architecture/ADR-021-smart-forms-v1.md

docs/implementation/ANGULAR_ENTERPRISE_PLATFORM_ROADMAP.md
docs/implementation/PHASE_07_UNIFIED_CASE_CHAT_REPORT.md
```

Inspect current implementations for:

```text
ClientCase
CaseWorkspace
WorkspaceMember
ClientUser
CaseActivity
casePolicy / staff case row-scoping
employee session auth
portal client-session auth
permissions/capabilities
trusted-origin/CSRF middleware
canonical /api/v1/staff route patterns
OpenAPI conventions
Angular case detail tabs
Next.js client portal case workspace
index provisioning scripts
schema contract tests
```

Current code is authoritative when older docs disagree.

---

## 5. Phase 07 gate

Do not proceed if Phase 07 is not still green.

Baseline facts already verified:

```text
Phase 07 branch tip before Phase 08 docs:
68290a102167958c8aaf460648800cd4aaabc0a9

CI run:
#63
ID 36899521938

Jobs:
Lint · types · build — success
Enterprise UI (Angular) — success
Tests (Next.js app) — success
Tests (admin CMS) — success
```

If your local branch is missing Phase 07 implementation/report commits, stop and reconcile with origin non-destructively.

---

## 6. Domain models

Implement the authoritative Smart Forms domain described by ADR-021.

### 6.1 SmartFormTemplate

Create a model equivalent to:

```text
SmartFormTemplate
```

Core fields:

```text
key
version
title
description
caseTypes[]
audience
schemaVersion
sections[]
status
publishedAt
createdBy
timestamps
```

Rules:

- unique `(key, version)`;
- published templates immutable;
- changes require a new version;
- only server-supported schema operators;
- no executable code/expressions in MongoDB.

### 6.2 CaseSmartForm

Create:

```text
CaseSmartForm
```

Core fields:

```text
case
workspace
template
templateKey
templateVersion
templateTitleSnapshot
answers
status
revision
progress
lastSavedAt
lastSavedByType
lastSavedById
lastSavedByName
submittedAt
returnedAt
approvedAt
lockedAt
reviewedBy
clientReviewNote
internalReviewNote
lockedRevision
timestamps
```

Statuses:

```text
draft
submitted
needs_changes
approved
locked
```

### 6.3 SmartFormAudit

Create append-only:

```text
SmartFormAudit
```

Record:

```text
caseSmartForm
case
workspace
eventType
fromStatus
toStatus
revision
changedFieldKeys[]
actorType
actorId
actorName
createdAt
metadata
```

Do not duplicate complete answer values into audit rows.

---

## 7. Mirror/schema consistency

This repository has Express/Next model mirrors for shared collections.

If Smart Forms are accessed from both Express and Next runtimes, maintain equivalent schema definitions where required by the architecture.

Add contract tests that fail if important enums/indexes/fields drift between mirrors.

Do not create two semantically different Smart Forms stores.

---

## 8. Template field schema

Implement a deliberately small supported type set:

```text
text
textarea
email
phone
number
date
yes_no
select
multi_select
country
address
repeated_group
```

Each field can define only server-approved properties such as:

```text
key
label
helpText
type
required
clientEditable
staffOnly
options
validation
visibilityCondition
children
```

Validate template definitions when seeded/provisioned.

Reject duplicate field keys within one template version.

Use stable keys.

---

## 9. Validation

Implement one central Smart Forms validation service.

It must:

- load the referenced published template version;
- normalize answers;
- reject unknown answer keys;
- filter actor-writable keys;
- validate required fields;
- validate field type;
- validate select options;
- validate length/range where configured;
- validate repeated groups;
- evaluate supported conditions;
- return field-level errors.

Do not rely on Angular/React validation as authority.

Do not accept browser-supplied validation expressions.

---

## 10. Conditional logic

Support only a compact whitelist where useful:

```text
equals
notEquals
isTruthy
isFalsy
```

If implementation complexity starts growing, support only `equals` + `isTruthy` for Phase 08 and document the limitation.

Never implement arbitrary JavaScript or an expression interpreter.

---

## 11. Repeated groups

Support one practical repeated-group level.

Examples:

```text
addresses[]
employmentHistory[]
travelHistory[]
familyMembers[]
```

Required operations may be represented as full-array autosave or field patching—choose the simpler safe implementation.

Every update still uses optimistic revision checking.

Do not build recursive arbitrary nested form trees.

---

## 12. Capability contract

Add these capabilities to the authoritative Express map, TS mirror, and capability contract:

```text
forms.view
forms.edit
forms.review
forms.lock
form_templates.manage
```

Initial grants:

```text
forms.view:
  super_admin
  admin
  pm
  petition_writer
  business_plan_specialist
  recommendation_letter_specialist
  uscis_forms_specialist
  evidence_collector
  reviewer

forms.edit:
  super_admin
  admin
  pm
  uscis_forms_specialist

forms.review:
  super_admin
  admin
  pm
  reviewer
  uscis_forms_specialist

forms.lock:
  super_admin
  admin
  reviewer

form_templates.manage:
  super_admin
  admin
```

Capabilities never replace case membership/row scope.

Add/update capability contract tests.

---

## 13. Employee form policy

Create a thin Smart Forms policy service.

Every staff read/action checks:

```text
valid EmployeeSession
mustChangePassword rules
capability
case/workspace row access
form belongs to case/workspace
current status allows action
```

Use existing case/workspace policy helpers wherever possible.

Do not invent a parallel membership system.

Removed workspace members lose form access.

---

## 14. Client form policy

Every client route checks:

```text
valid active ClientSession
active/eligible client workspace membership
form belongs to accessible case/workspace
form/template is client-visible
status allows action
field is client-editable
```

Guessed/malformed/inaccessible resource IDs should use existing safe concealment behavior.

Clients cannot set:

```text
status
revision
reviewedBy
lockedAt
approvedAt
staffOnly values
internalReviewNote
actor metadata
case/workspace/template identity
```

---

## 15. Smart Forms service layer

Prefer a single application service/orchestration module rather than route-level domain logic.

Recommended operations:

```text
listCaseForms
getForm
provisionCaseForms
saveAnswers
submitForm
returnForChanges
approveForm
lockForm
reopenForm
listAudit
```

The service owns:

- state transitions;
- revision increments;
- validation;
- progress;
- audit creation;
- material CaseActivity events.

Routes remain thin.

---

## 16. State machine

Enforce server-side.

Allowed core transitions:

```text
draft          -> submitted
needs_changes  -> submitted
submitted      -> needs_changes
submitted      -> approved
approved       -> locked
```

A controlled staff reopen may support:

```text
submitted     -> needs_changes
approved      -> needs_changes
```

Do not reopen `locked` forms casually.

If locked reopening is implemented at all, require `forms.lock`, create a clear audit event, and make it explicit—not an ordinary edit path.

Simplest safe Phase 08 option: locked forms cannot be reopened.

---

## 17. Optimistic concurrency

Every answer save carries:

```text
expectedRevision
```

Perform an atomic revision-checked update.

If stale:

```text
409 Conflict
```

Return safe current revision/state metadata.

Never last-write-wins silently.

State transitions should also reject stale/incompatible status where practical.

---

## 18. Autosave

Implement autosave in portal and Angular.

Recommended debounce:

```text
~700–1200 ms after last change
```

Do not send on every keystroke.

UI states:

```text
Saving…
Saved
Unsaved changes
Save failed — retry
This form changed elsewhere — reload/review
```

Preserve user input on network failure.

Do not store sensitive form answers in localStorage.

---

## 19. Progress

Server-derived only.

Use a straightforward Phase 08 definition:

```text
completed required currently-visible fields / total required currently-visible fields
```

Return:

```text
completedRequired
totalRequired
percent
```

Do not label progress as eligibility, approval probability, legal readiness, or filing readiness.

---

## 20. Initial template catalog

Create code-owned versioned definitions.

Minimum useful catalog:

### Shared

```text
personal_contact
immigration_travel_history
```

### Case-specific

Provide a minimal explicit intake template for each currently supported case type from `CASE_TYPE_VALUES`, or a smaller set only if some case types are not actually active in code.

Do not hard-code a second case-type universe.

Keep templates concise and operational.

Example sections can include:

```text
Personal information
Current address
Immigration history
Travel history
Education/employment
Case-specific facts
```

Do not attempt to reproduce every field from official USCIS forms.

---

## 21. Template provisioning

Implement an idempotent template bootstrap/seeding mechanism.

Safe choices:

- code-owned definitions upserted by a dedicated script;
- app startup validation + explicit seed script;
- test/dev provisioner.

Do not mutate published versions.

Do not auto-run destructive template migration in production.

If a template key/version exists with different published content, fail loudly instead of silently overwriting.

---

## 22. Case form provisioning

Implement idempotent lazy case provisioning.

Suggested endpoint:

```text
POST /api/v1/staff/cases/:caseId/forms/provision
```

Algorithm:

```text
load authorized case
find published templates eligible for caseType
for each template:
  find case/templateKey/templateVersion
  create only if missing
return form summaries
```

Unique index remains the race-condition backstop.

Do not create duplicate instances.

---

## 23. Prefill

Implement only cheap deterministic prefill that clearly maps semantically.

Possible sources:

```text
ClientUser.firstName
ClientUser.lastName
ClientUser.email
ClientUser.phone
ClientCase.caseNumber
ClientCase.caseType
```

Do not silently overwrite existing answers.

Only prefill on new instance creation, unless an explicit refresh action is separately implemented.

Prefill metadata/provenance is optional in V1 unless easy to add safely.

---

## 24. Canonical staff API

Add explicit routes under:

```text
/api/v1/staff
```

Required family:

```text
GET    /cases/:caseId/forms
POST   /cases/:caseId/forms/provision

GET    /forms/:formId
PATCH  /forms/:formId/answers

POST   /forms/:formId/submit
POST   /forms/:formId/return
POST   /forms/:formId/approve
POST   /forms/:formId/lock

GET    /forms/:formId/audit
```

Only add `reopen` if it is genuinely required.

Routes must preserve:

- staff session auth;
- mustChangePassword handling;
- trusted-origin/CSRF rules for mutations;
- capability checks;
- row scope;
- safe concealment;
- DTO-only responses.

---

## 25. Staff DTOs

Implement explicit DTOs.

Summary:

```text
id
title
templateKey
templateVersion
status
revision
progress
lastSavedAt
submittedAt
approvedAt
lockedAt
actions
```

Detail:

```text
summary fields
sections
answers
clientReviewNote
internalReviewNote
auditSummary
actions
```

Never return raw model documents.

---

## 26. Portal APIs

Create the minimum client routes under existing portal conventions.

Required equivalents:

```text
GET    /api/portal/cases/:caseId/forms
GET    /api/portal/forms/:formId
PATCH  /api/portal/forms/:formId/answers
POST   /api/portal/forms/:formId/submit
```

Reuse existing:

- client auth helpers;
- origin/CSRF protections;
- response/error conventions;
- case membership resolution.

Client DTOs must omit:

```text
staff-only field definitions
staff-only answers
internalReviewNote
reviewer ids
employee private metadata
audit internals
```

---

## 27. Client portal UI

Add a **Forms** surface to case navigation/workspace.

Required:

- list;
- progress;
- status;
- open form;
- section layout;
- typed controls;
- repeated groups;
- validation;
- autosave;
- submit;
- returned-for-changes message;
- read-only submitted/approved/locked state;
- retry/conflict handling;
- mobile responsive;
- accessible labels/errors.

Keep styling consistent with current portal.

Do not add a new component framework.

---

## 28. Angular case workspace UI

Add a **Forms** tab.

Required:

- form list;
- status/progress;
- detail editor;
- section navigation;
- typed controls;
- repeated groups;
- autosave;
- validation;
- conflict handling;
- review notes;
- return for changes;
- approve;
- lock;
- audit summary;
- capability-gated actions;
- empty/loading/error/retry;
- responsive behavior.

Use existing Angular API client/types patterns.

No `any` in new API contracts unless unavoidable and documented.

No new UI framework.

---

## 29. Review UX

For staff:

### Return for changes

Require/allow:

```text
clientReviewNote
internalReviewNote
```

The client-visible note must be separate from internal note.

### Approve

Show current revision and validation status.

Do not approve a form that fails authoritative validation.

### Lock

Make the consequence explicit:

```text
This locks the reviewed revision from normal editing.
```

Lock action requires `forms.lock`.

---

## 30. CaseActivity

Add only material activity types.

Recommended:

```text
form_provisioned
form_submitted
form_returned
form_approved
form_locked
```

Do not record every autosave in CaseActivity.

Keep detailed revisions/history in SmartFormAudit.

Never put actual answers/PII into CaseActivity message strings.

Update schema-contract mirrors/tests if CaseActivity is mirrored.

---

## 31. OpenAPI

Update:

```text
server/openapi/v1.yaml
```

Document staff Smart Forms routes and DTOs.

Include:

- list/provision;
- detail;
- answer patch with expectedRevision;
- transitions;
- audit;
- validation errors;
- 409 conflict.

Do not expose Mongo schema internals.

---

## 32. Indexes

Add only justified indexes:

```text
SmartFormTemplate:
  unique { key: 1, version: 1 }
  { status: 1, caseTypes: 1 }

CaseSmartForm:
  unique { case: 1, templateKey: 1, templateVersion: 1 }
  { case: 1, status: 1, updatedAt: -1 }
  { workspace: 1, updatedAt: -1 }

SmartFormAudit:
  { caseSmartForm: 1, createdAt: -1 }
```

Update index scripts/dry-run tests.

Do not apply indexes to production.

---

## 33. No official USCIS PDF generation in Phase 08

Do not add a PDF dependency just to check a roadmap box.

Do not download or commit arbitrary USCIS PDFs.

Do not create filing-ready output claims.

Instead, ensure the Smart Form model has stable provenance needed for future generation:

```text
form id
form revision
template key/version
locked revision
stable answer keys
```

Document future generated-document metadata in the report.

Generated PDFs, when later implemented, must become secure CaseDocument/DocumentVersion records.

---

## 34. Security tests — required

Cover:

- unauthenticated staff/client;
- must-change-password staff mutation denial;
- staff capability denial;
- staff no-case-membership denial;
- removed staff member denial;
- client no-case-membership denial;
- other-case guessed form 404;
- malformed form id safe response;
- staff-only field omitted from client DTO;
- staff-only answer omitted from client DTO;
- client write to staff-only key rejected;
- internalReviewNote never in client DTO;
- raw actor/session/token fields absent;
- trusted-origin/CSRF enforced on mutations.

---

## 35. Domain tests — required

Cover:

- template key/version uniqueness;
- published template immutability;
- invalid schema rejected;
- duplicate field keys rejected;
- required validation;
- select/multi-select validation;
- repeated group validation;
- conditional requiredness;
- unknown answer key rejected;
- progress calculation;
- deterministic prefill does not overwrite existing answer;
- provisioning idempotent;
- wrong case type template not provisioned.

---

## 36. Concurrency/state tests — required

Cover:

- save increments revision;
- stale revision returns 409;
- concurrent saves do not silently overwrite;
- submit from valid draft;
- invalid form cannot submit;
- submitted form not client-editable;
- return enables client editing;
- approve only from submitted;
- lock only from approved;
- locked form immutable;
- invalid transitions rejected;
- audit rows created;
- audit rows do not duplicate answer values.

---

## 37. Angular tests — required

At minimum:

- form list;
- open form;
- render supported field controls;
- repeated group add/remove;
- autosave debounce;
- successful save;
- validation error;
- 409 conflict;
- returned-for-changes note;
- capability-gated review action;
- lock state read-only;
- retry state.

Use existing Angular testing style.

---

## 38. Portal tests — required

At minimum:

- authorized list/detail;
- save;
- stale revision conflict;
- submit;
- returned form editable;
- submitted/approved/locked read-only;
- staff-only field filtered;
- internal note filtered;
- other-case concealment;
- repeated group round-trip;
- validation response.

---

## 39. No migration requirement

Design this phase so deployment does not require a data migration.

New forms are created lazily.

Existing cases remain valid with zero Smart Form rows.

If a backfill helper is written, it must default to dry-run and is **not** executed against production in this phase.

---

## 40. Local verification

### Root / Next.js

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

### Final hygiene

```bash
git diff --check
git status --short
```

Do not skip failures.

Do not disable tests.

Do not use dependency override flags to force an install.

---

## 41. Manual QA

Before Phase 08 closure, verify at least one test case end-to-end:

### Client

```text
open case
open Forms
open draft
edit normal field
add repeated group row
observe autosave
submit
confirm read-only
```

### Staff

```text
open same case
open Forms
see submitted form
review answers
return for changes with note
```

### Client

```text
see returned note
edit
autosave
resubmit
```

### Staff

```text
approve
lock
confirm edit endpoints reject further mutation
```

Also verify staff-only fields are absent from client network payloads.

---

## 42. Implementation report

Create:

```text
docs/implementation/PHASE_08_SMART_FORMS_REPORT.md
```

Include:

```text
starting SHA
ending SHA
implementation commits

models/collections
indexes
template schema
initial template catalog
provisioning strategy
prefill strategy
validation strategy
conditional/repeated-group support
autosave strategy
concurrency strategy
state machine
capability changes
staff API
portal API
Angular UX
portal UX
DTO/privacy boundaries
audit design
CaseActivity integration
OpenAPI changes
test coverage
manual QA
migration impact
production impact: NONE
known limitations
future USCIS generation provenance contract
rollback notes
final GitHub Actions run number
final run ID
job conclusions
```

Do not fabricate final CI data.

---

## 43. Commit strategy

Use additive truthful commits.

Possible structure:

```text
feat(forms): add versioned smart forms domain
feat(api): expose staff smart forms operations
feat(portal): add client smart forms workflow
feat(angular): add case forms workspace
test(forms): cover smart forms authorization and lifecycle
docs(phase-08): record smart forms verification
```

If the implementation naturally fits fewer commits, do not manufacture artificial history.

No amend/rebase/force push.

---

## 44. Push

Push only:

```bash
git push origin architecture/angular-enterprise-platform
```

Do not merge to `main`.

Do not deploy production.

---

## 45. Remote CI gate

After push, capture:

```bash
git rev-parse HEAD
```

Verify GitHub Actions for that exact SHA.

All required jobs must be green:

```text
Tests (Next.js app)
Lint · types · build
Enterprise UI (Angular)
Tests (admin CMS)
```

If red:

1. diagnose;
2. fix;
3. commit a new fix commit;
4. push;
5. verify again.

Do not rewrite completed history.

---

## 46. Stop condition

Phase 08 is complete only when:

- the Smart Forms domain exists;
- client portal Forms works;
- Angular case Forms works;
- autosave/concurrency works;
- submit/review/return/approve/lock works;
- authorization/privacy tests pass;
- OpenAPI is updated;
- report exists;
- final exact Phase 08 SHA has green remote CI;
- no production deployment occurred;
- no production migration/index operation occurred.

Then **STOP**.

Do not begin Phase 09 automatically.

---

## 47. Speed guardrail

The user wants to finish and deploy as soon as safely possible.

Therefore, when implementation presents optional work, choose:

```text
production-safe + simple + tested
```

over:

```text
more generalized + more configurable + more architectural surface
```

Phase 08 is successful when real clients and staff can collect, review, and lock structured case information reliably. It is **not** necessary to solve every future forms problem in this cycle.
