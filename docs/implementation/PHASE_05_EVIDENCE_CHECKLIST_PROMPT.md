# Immigration Horizons — Phase 05: Evidence Checklist, Evidence Planning & Case Readiness

**Execution branch:** `architecture/angular-enterprise-platform`  
**Phase 04 implementation baseline:** `c3e9441722362b15ed35bcb5bb6a3362819c597f`  
**Architecture reference:** `docs/architecture/ADR-018-evidence-checklists-and-requirements.md`

## 1. Purpose

Implement the next enterprise case-management capability after Phase 04: structured evidence planning.

The system already has secure document categories, requests, uploads, versions, review states, private storage, access logging, and client/staff visibility controls. Phase 05 must build a distinct evidence-requirement layer that tells the case team what evidence is needed, what is still missing, what is in progress, what has been satisfied, and what has been intentionally waived or marked not applicable.

Do not replace the secure document domain. Evidence planning must reuse it.

## 2. Hard safety rules

- Work only on `architecture/angular-enterprise-platform`.
- Before substantive Phase 05 code, verify the Phase 04 implementation commit and remote CI status.
- If Phase 04 CI is red, fix Phase 04 in a new commit first.
- Do not deploy production.
- Do not run production migrations or production indexes.
- Do not reset, rebase, squash, amend, or force-push completed history.
- Do not weaken auth, row-level case access, trusted-origin, CSRF, DTO, secure document storage, or existence-concealment controls.
- Do not use `--force` or `--legacy-peer-deps`.
- Do not skip or weaken tests to obtain green CI.
- Preserve existing EJS/admin, client portal, document, request, and case workflows.

## 3. Mandatory preflight

```bash
git fetch origin --prune
git switch architecture/angular-enterprise-platform
git pull --ff-only origin architecture/angular-enterprise-platform

git status --short
git branch --show-current
git rev-parse HEAD
git log --graph --decorate --oneline -30

git diff
git diff --cached

node -v
npm -v
```

Use Node 22.

Confirm ancestry contains the Phase 04 implementation baseline:

```text
c3e9441722362b15ed35bcb5bb6a3362819c597f
```

If newer legitimate documentation or CI-closure commits exist, inspect and preserve them. Never reset back to the baseline merely to match this prompt.

## 4. Required reading

Read before implementation:

```text
CLAUDE.md
AGENTS.md

.claude/DESIGN_SYSTEM.md
.claude/API_ARCHITECTURE.md
.claude/DATABASE.md
.claude/TESTING.md
.claude/SECURITY.md

docs/architecture/ADR-002-case-workspace-domain.md
docs/architecture/ADR-004-secure-document-storage.md
docs/architecture/ADR-007-admin-case-operations.md
docs/architecture/ADR-009-employee-saas-shell.md
docs/architecture/ADR-010-staff-case-operations.md
docs/architecture/ADR-012-security-privacy-and-audit.md
docs/architecture/ADR-014-migrations-and-retention.md
docs/architecture/ADR-015-angular-enterprise-platform.md
docs/architecture/ADR-016-authentication-boundaries.md
docs/architecture/ADR-017-case-native-tasks-and-deadlines.md
docs/architecture/ADR-018-evidence-checklists-and-requirements.md

docs/implementation/ANGULAR_ENTERPRISE_PLATFORM_ROADMAP.md
docs/implementation/PHASE_04_CASE_TASKS_DEADLINES_PROMPT.md
```

Inspect current implementation before deciding exact names/locations, including:

```text
server/models/ClientCase.js
server/models/CaseWorkspace.js
server/models/WorkspaceMember.js
server/models/DocumentCategory.js
server/models/DocumentRequest.js
server/models/CaseDocument.js
server/models/DocumentVersion.js
server/models/DocumentAccessLog.js
server/models/CaseActivity.js

server/utils/documentConstants.js
server/utils/permissions.js
server/services/casePolicy.js
server/services/caseManagement.js
server/services/*document*
server/services/*workspace*

server/routes/api/v1/staff/cases.js
server/routes/api/v1/staff/index.js
server/routes/admin/*
server/openapi/v1.yaml

scripts/migrate.ts
scripts/createIndexes.ts

enterprise-ui/projects/case-management/src/app/features/cases/
enterprise-ui/projects/case-management/src/app/features/tasks/
enterprise-ui/projects/case-management/src/app/core/api/
enterprise-ui/projects/case-management/src/app/shared/
```

Code is authoritative where old documentation disagrees.

## 5. Product goal

At completion, an authorized staff member should be able to open a case and answer, from a structured Evidence workspace:

```text
What evidence does this case need?
Which items are required, recommended, or optional?
Which items are missing?
Which are being collected?
Which are satisfied?
Which were waived or marked not applicable, and why?
Which secure case documents support each requirement?
Which document requests are still outstanding?
```

The experience should feel like a real immigration case-management evidence checklist, not a folder browser.

## 6. Do not duplicate the secure document architecture

Existing document models remain authoritative for files and collection workflow.

Phase 05 must reuse:

```text
DocumentCategory
DocumentRequest
CaseDocument
DocumentVersion
DocumentAccessLog
```

Do not create:

```text
EvidenceFile
EvidenceUpload
EvidenceFolder
```

or any second file-storage abstraction.

A document category organizes files. A document request collects a file. An evidence requirement tracks evidentiary readiness.

Keep these concepts separate.

## 7. Create the evidence template domain

Introduce a reusable template model following ADR-018, e.g.:

```text
EvidenceTemplate
```

Use repository conventions for exact model location and collection naming.

The model must support versioned, immutable published definitions.

At minimum support metadata equivalent to:

```text
key
name
description
caseType
version
status
items[]
createdAt
updatedAt
```

Template items should have stable identity and ordering, e.g.:

```text
key
title
description
importance
section
order
clientGuidance
staffGuidance
suggestedCategoryKey
```

Published template versions should not be mutated in-place.

## 8. Initial template scope

Do not attempt to author exhaustive legal evidence libraries for every immigration benefit type in this phase.

Implement a generic template engine and a small representative initial set sufficient to prove the architecture.

Prefer one or more supported high-value case types already present in the product, such as:

```text
EB-2 NIW
EB-1A
O-1
```

Only include checklist content that is clearly framed as operational preparation guidance.

Do not state or imply:

```text
checklist complete = USCIS approval
```

The template system must be extensible to EB-1B, EB-1C, EB-3, F-1, B-1/B-2, K-1 and other future case types without schema changes.

## 9. Create the case-native EvidenceRequirement model

Introduce a first-class case requirement model equivalent to:

```text
EvidenceRequirement
```

Recommended fields, adapted to repository conventions:

```text
case
workspace
source
templateKey
templateVersion
templateItemKey
section
order
title
description
importance
status
clientVisible
clientGuidance
staffGuidance
internalNotes
linkedCategories[]
linkedDocuments[]
linkedRequests[]
waivedReason
notApplicableReason
satisfiedAt
satisfiedBy
createdBy
createdAt
updatedAt
```

Use references rather than embedding raw document/request records.

Preserve template provenance on instantiated requirements.

## 10. Requirement importance

Use an explicit importance enum equivalent to:

```text
required
recommended
optional
```

Do not overload `DocumentCategory.required` as the evidence requirement importance.

The two concepts may correlate but are not equivalent.

## 11. Requirement status

Use an explicit status enum equivalent to:

```text
missing
in_progress
satisfied
waived
not_applicable
```

Rules:

```text
waived -> reason required
not_applicable -> reason required
satisfied -> authorized explicit action
```

Do not auto-satisfy a requirement merely because an accepted file exists.

Do not store derived operational states such as `overdue` as persistent evidence statuses unless a separate authoritative due-date concept is deliberately added later.

## 12. Evidence satisfaction semantics

Preserve the difference between:

```text
CaseDocument.status = accepted
```

and:

```text
EvidenceRequirement.status = satisfied
```

Accepted means a file passed document review.

Satisfied means the case team explicitly considers the evidence need satisfied.

The evidence service may derive supporting signals:

```text
accepted linked document count
pending-review linked document count
replacement-needed count
open document request count
```

but these signals must not silently overwrite requirement status.

## 13. Checklist provisioning

Create a canonical provisioning service that instantiates requirements from a template for one case.

Provisioning must be idempotent.

Use stable provenance identity, for example:

```text
case + templateKey + templateVersion + templateItemKey
```

Rerunning the same provisioning must not create duplicates.

Do not rewrite staff-edited existing requirements merely because a template definition changed later.

## 14. Resolve template eligibility server-side

The backend must determine template eligibility from authoritative `ClientCase` data.

Do not trust Angular-supplied `caseType`, `templateKey`, or arbitrary benefit type to authorize provisioning.

If no supported template exists for the case, return a clear safe unconfigured/empty state.

Do not guess among ambiguous case types.

## 15. Custom requirements

Authorized managers/operators should be able to create a case-specific custom evidence requirement.

Custom requirements must:

- belong to one authorized case/workspace;
- use the same status/importance rules;
- be auditable;
- not modify reusable templates;
- expose explicit `source = custom` or equivalent provenance.

Do not allow arbitrary cross-case copying of references.

## 16. Template versioning and upgrades

Implement versioning from the beginning.

Recommended behavior:

- template `key + version` is unique;
- published versions are immutable;
- retired versions cannot be used for new cases unless deliberately allowed;
- existing requirements retain the template version they came from;
- introducing a newer template version does not silently modify existing cases.

If you implement a template upgrade/merge operation, make it explicitly additive and auditable. It is acceptable to defer template upgrade UI to a later phase.

## 17. Link evidence requirements to existing DocumentCategory records

Requirements may reference one or more case document categories.

Template `suggestedCategoryKey` is a hint, not a foreign key supplied by the client.

The server should resolve category references within the same case/workspace.

If no matching category exists, do not fail the entire checklist unless the product rule truly requires it.

Do not create duplicate categories solely to satisfy a requirement if the secure document provisioning system already owns category creation.

## 18. Link requirements to CaseDocument

Authorized staff must be able to associate secure existing case documents with a requirement.

Validate:

- requirement exists and is accessible;
- document exists;
- document belongs to the same case/workspace;
- document is not from another client's case;
- archived/rejected status is represented truthfully;
- linking does not expose `storageKey` or private path details.

Allow one document to support multiple requirements where legitimate.

Never copy file bytes or create duplicate CaseDocument records for evidence linking.

## 19. Link requirements to DocumentRequest

Support associating existing or newly created `DocumentRequest` records with an evidence requirement where practical.

If a new request is created from the evidence UI, reuse the existing request/document services and validation.

Do not implement a second evidence-specific request model.

Validate:

- request belongs to the same case/workspace;
- requestedFrom remains a valid workspace member according to current document-request rules;
- request due/status values remain controlled by existing document domain logic.

A fulfilled request does not automatically mark the requirement satisfied.

## 20. Canonical evidence service

Create or extract a reusable service, e.g.:

```text
server/services/evidenceManagement.js
```

Use another repository-conventional name if better.

The service must own real business semantics such as:

```text
resolveTemplateForCase
provisionEvidenceChecklist
listCaseEvidence
getEvidenceRequirement
createCustomRequirement
updateRequirement
changeRequirementStatus
linkDocument
unlinkDocument
linkDocumentRequest
unlinkDocumentRequest
validateEvidenceLinks
getEvidenceSummary
```

Do not distribute evidence rules across Angular components and route handlers.

## 21. Authorization

Reuse the existing capability and case-policy systems.

Evaluate whether to add explicit capabilities:

```text
evidence.view
evidence.manage
```

If added, integrate them into the current role/capability matrix deliberately.

If not added, map evidence actions onto existing case/document capabilities with a documented decision.

Required behavior:

- actor must first have access to the case;
- mutations require explicit authorization;
- removed workspace members immediately lose case-evidence access unless existing global access applies;
- inaccessible evidence requirement IDs must not become an object-existence oracle;
- client/UI visibility cannot substitute for backend authorization.

## 22. Existence concealment

Preserve prior semantics for malformed, missing, and inaccessible case/requirement IDs.

Where current case policy uses safe 404 concealment, evidence endpoints should do the same.

Do not return revealing `403` responses that prove a hidden case or requirement exists unless the established API policy specifically requires it.

## 23. Canonical API

Add intentional routes under `/api/v1/staff`.

Recommended shape:

```text
GET    /api/v1/staff/cases/:caseId/evidence
POST   /api/v1/staff/cases/:caseId/evidence/provision
POST   /api/v1/staff/cases/:caseId/evidence/requirements
GET    /api/v1/staff/evidence/requirements/:requirementId
PATCH  /api/v1/staff/evidence/requirements/:requirementId
PATCH  /api/v1/staff/evidence/requirements/:requirementId/status
POST   /api/v1/staff/evidence/requirements/:requirementId/documents
DELETE /api/v1/staff/evidence/requirements/:requirementId/documents/:documentId
POST   /api/v1/staff/evidence/requirements/:requirementId/requests
DELETE /api/v1/staff/evidence/requirements/:requirementId/requests/:requestId
```

Adapt to existing API conventions and avoid redundant route proliferation.

Do not add hard DELETE for template-provisioned evidence requirements just for CRUD symmetry.

## 24. Explicit DTOs

Never expose raw Mongoose documents.

Recommended case evidence DTO structure:

```text
summary
sections[]
  key/title
  requirements[]
```

Requirement DTO may expose:

```text
id
source
title
description
section
order
importance
status
templateKey
templateVersion
templateItemKey
clientVisible
clientGuidance
staffGuidance
internalNotes
linkedCategories[]
linkedDocuments[]
linkedRequests[]
waivedReason
notApplicableReason
satisfiedAt
satisfiedBy
createdAt
updatedAt
```

Use bounded nested references for linked documents/requests.

Never expose raw:

```text
storageKey
privatePath
password
passwordHash
token
tokenHash
secret
raw session fields
raw AdminUser/ClientUser docs
```

## 25. Evidence summary/readiness

Return deterministic operational summary metrics, e.g.:

```text
total
requiredTotal
requiredSatisfied
missing
inProgress
satisfied
waived
notApplicable
completionPercent
```

Define the formula in code/tests/docs.

Recommended initial formula:

```text
requiredSatisfied / applicableRequiredTotal
```

Define exactly how waived and not-applicable requirements affect the denominator.

Never label this as:

```text
approval probability
case success score
USCIS likelihood
```

## 26. Angular Evidence workspace

Add a real Evidence area to the case workspace.

Use existing design system and shared Angular primitives.

Required UX:

```text
Evidence summary
Sectioned requirement checklist
Importance badges
Status badges
Filter by status/importance
Missing/in-progress/satisfied/waived/not-applicable views
Requirement detail/edit surface
Linked document list with review state
Linked document-request state
Custom requirement creation when authorized
Link/unlink existing secure case documents
Status updates with required reason inputs
Loading skeleton
Empty state
Retryable error state
Responsive layout
Keyboard/focus/ARIA correctness
```

Do not build a second document manager inside the Evidence page.

Deep-link to the existing document/request surfaces where appropriate.

## 27. Client visibility boundary

Phase 05 is staff-first.

Do not expose all evidence requirements to the client portal merely because fields exist.

Keep these staff-only by default:

```text
internalNotes
staffGuidance
internal sufficiency commentary
waiver strategy notes
internal status reasoning
```

If any existing client endpoint is touched, use explicit client-safe DTO allowlists.

Do not leak internal case strategy.

## 28. Case activity and audit

Add internal `CaseActivity` events where appropriate, for example:

```text
evidence_checklist_provisioned
evidence_requirement_created
evidence_requirement_updated
evidence_status_changed
evidence_document_linked
evidence_document_unlinked
evidence_request_linked
evidence_request_unlinked
```

Follow existing actor snapshot conventions.

Store minimal metadata only.

Never place full uploaded-document metadata, storage keys, large note bodies, tokens, or private paths in activity payloads.

## 29. Notifications

Do not create a new notification architecture.

If evidence actions reuse an existing `DocumentRequest` creation flow, preserve whatever notifications already belong to that flow.

Evidence persistence must not depend on notification delivery success.

No new scheduler/cron is required.

## 30. Indexes

Inspect existing index conventions and tooling before adding indexes.

Evaluate actual query needs. Candidate shapes:

```text
EvidenceTemplate: key + version unique
EvidenceTemplate: caseType + status + version
EvidenceRequirement: case + section + order
EvidenceRequirement: case + status + importance
EvidenceRequirement: case + templateKey + templateVersion + templateItemKey unique/partial
```

Avoid duplicate or redundant prefix indexes.

Update index dry-run tooling if required.

Do not execute production indexes.

## 31. Existing-case provisioning/backfill

Do not infer evidence satisfaction from historical files.

If providing a provisioning/backfill command for existing cases, it must be:

- dry-run capable;
- idempotent;
- explicit about target scope;
- safe to rerun;
- non-destructive;
- conservative about ambiguous case types;
- incapable of auto-satisfying requirements;
- incapable of modifying custom/manual requirements unexpectedly.

Report unsupported/ambiguous cases; do not guess.

Do not execute against production during implementation.

## 32. OpenAPI

Update:

```text
server/openapi/v1.yaml
```

for every added/changed endpoint.

Define explicit request/response schemas.

Avoid broad `additionalProperties: true` shortcuts for core evidence DTOs.

Document nullable fields and enums accurately.

## 33. Angular API types

Introduce explicit types, e.g.:

```text
EvidenceRequirementSummary
EvidenceRequirementDetail
EvidenceDocumentRef
EvidenceRequestRef
EvidenceSection
EvidenceSummary
EvidenceListResponse
EvidenceMutationRequest
EvidenceStatusUpdateRequest
```

Do not use `any` for new evidence contracts.

Fix nearby touched `any` only where safe and within scope.

## 34. Server and integration tests

Add automated coverage for at least:

### Template/provisioning

- template key/version uniqueness;
- published version immutability policy;
- eligible case resolves template;
- unsupported case returns safe unconfigured state;
- initial provisioning creates expected requirements;
- provisioning rerun is idempotent;
- existing manual requirement remains untouched;
- template provenance persists.

### Requirement model

- required/recommended/optional accepted;
- invalid importance rejected;
- valid statuses accepted;
- invalid status rejected;
- waived requires reason;
- not-applicable requires reason;
- satisfied timestamps/actor handled correctly;
- reopening clears or updates satisfaction metadata according to defined rules.

### Authorization

- authorized manager can provision/create/update/link;
- authorized case member can view according to capability;
- inaccessible case returns safe not-found behavior;
- inaccessible requirement ID does not leak existence;
- removed workspace member loses access;
- unauthorized actor cannot mutate by direct ID;
- global view-all behavior exactly matches existing case policy.

### Linking

- same-case document links successfully;
- cross-case document rejected;
- document from wrong workspace rejected;
- same document may link to multiple valid same-case requirements if intended;
- archived/rejected file is represented accurately;
- valid request links successfully;
- cross-case request rejected;
- unlink works and remains auditable.

### Satisfaction semantics

- accepted CaseDocument does not auto-mark satisfied;
- fulfilled DocumentRequest does not auto-mark satisfied;
- explicit authorized satisfy action works;
- waive/not-applicable reason enforcement works.

### DTO safety

Recursively assert prohibited sensitive keys are absent where applicable:

```text
password
passwordHash
token
tokenHash
secret
storageKey
privatePath
```

## 35. Angular tests

Add tests for:

- evidence loading;
- section grouping;
- summary metrics rendering;
- filters;
- empty/unconfigured state;
- API error/retry state;
- custom requirement creation;
- linking/unlinking documents;
- status update success/failure;
- waived/not-applicable reason validation;
- authorization-driven control visibility;
- linked document review status rendering;
- responsive/accessibility-sensitive behavior where current test tooling supports it.

Do not weaken existing Angular tests.

## 36. UI framework constraints

Do not add Bootstrap, Material, PrimeNG, a new icon library, or a new component framework unless explicitly approved.

Reuse existing enterprise tokens/components/services.

Maintain:

```text
focus states
keyboard usability
labels
ARIA where needed
non-color-only statuses
responsive behavior
clear error messages
```

Do not use mock/fake evidence records in production code.

## 37. Security boundaries

Preserve:

```text
EmployeeSession auth
mustChangePassword
trusted-origin checks
same-origin CSRF strategy
capability checks
case workspace row-level access
existence concealment
SecurityEvent conventions
secure document storage
DocumentAccessLog semantics
explicit DTO mapping
```

Angular never reads MongoDB or private storage directly.

No bearer token in localStorage.

No broad CORS.

No public file-system path exposure.

## 38. Out of scope

Do not expand Phase 05 into:

- full petition drafting;
- smart forms;
- filing packet generation;
- USCIS tracking;
- full calendar/reminders;
- AI evidence scoring;
- OCR/content extraction pipeline;
- automated legal sufficiency decisions;
- full client portal checklist redesign;
- billing/time tracking;
- production deployment;
- production migration/index execution;
- legacy EJS retirement.

## 39. Documentation deliverables

Keep these authoritative files updated:

```text
docs/architecture/ADR-018-evidence-checklists-and-requirements.md
docs/implementation/PHASE_05_EVIDENCE_CHECKLIST_PROMPT.md
```

Create a completion report:

```text
docs/implementation/PHASE_05_EVIDENCE_CHECKLIST_REPORT.md
```

The report must include:

- starting SHA;
- ending SHA;
- Phase 04 CI status used as starting gate;
- schema/model decisions;
- template/versioning strategy;
- evidence status semantics;
- capability/authorization decision;
- API changes;
- OpenAPI changes;
- Angular changes;
- migration/backfill behavior;
- index changes;
- tests run/results;
- builds run/results;
- known limitations;
- production impact;
- rollback considerations;
- final GitHub Actions run/result.

## 40. Required local verification

From repository root:

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

Server:

```bash
cd server
npm ci --no-audit --no-fund
TEST_MONGODB_URI=mongodb://127.0.0.1:27017/ih-ci-server \
LOGIN_RATE_LIMIT=1000 \
npm test
cd ..
```

Angular:

```bash
cd enterprise-ui
npm ci --no-audit --no-fund
npm test
npx ng build case-management
npx ng build admin-console
cd ..
```

Then:

```bash
git diff --check
git status --short
```

Do not claim completion if any required verification is red.

## 41. Manual QA

Perform practical QA for at least:

1. employee login;
2. open accessible case;
3. Evidence tab loads;
4. unconfigured state is understandable;
5. provision supported template;
6. rerun provisioning does not duplicate items;
7. filter missing/in-progress/satisfied;
8. open a requirement;
9. link an existing same-case document;
10. confirm cross-case document cannot be linked;
11. confirm accepted file does not auto-satisfy requirement;
12. explicitly mark requirement satisfied;
13. reopen it;
14. waive with reason;
15. verify missing reason is rejected;
16. mark not applicable with reason;
17. create a custom requirement;
18. associate/open a document request if implemented;
19. verify removed/unauthorized user cannot access evidence;
20. test refresh/back/forward navigation;
21. inspect browser console/network for errors or sensitive payload leakage;
22. check responsive layout.

## 42. Git strategy

Do not reset/rebase/amend/force-push completed history.

Suggested commit sequence:

```text
docs(phase-05): define evidence checklist architecture
feat(evidence): add versioned template and requirement domain
feat(api): add canonical evidence operations
feat(angular): add case evidence workspace
test(phase-05): cover evidence authorization and provisioning
docs(phase-05): record implementation and verification
```

A final consolidated feature commit is also acceptable if history remains clean and reviewable.

Push only to:

```bash
git push origin architecture/angular-enterprise-platform
```

After push, verify the exact final head SHA in GitHub Actions.

If remote CI is red, Phase 05 is not complete. Fix the failure in a new commit and rerun CI. Do not rewrite history to hide the failure.

## 43. Completion gate

Phase 05 is complete only when:

- Phase 04 starting gate was verified;
- ADR-018 is implemented consistently;
- evidence templates are reusable and versioned;
- evidence requirements are first-class case records;
- provisioning is idempotent;
- custom requirements work where authorized;
- status/importance validation is server-authoritative;
- accepted files do not auto-satisfy requirements;
- secure existing CaseDocument/DocumentRequest models are reused;
- cross-case links are impossible;
- DTOs are explicit and safe;
- Angular Evidence workspace is operational;
- summary/readiness metrics are deterministic and non-legal-scoring;
- OpenAPI is updated;
- root/server/Angular tests pass;
- lint/typecheck/root build pass;
- case-management and admin-console builds pass;
- `git diff --check` passes;
- final remote GitHub Actions run is GREEN.

Then STOP and report Phase 05 completion. Do not automatically begin Phase 06.
