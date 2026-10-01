# ADR-022 — Case-Native Petition Work V1

**Status:** Accepted for Phase 09 implementation  
**Date:** 2026-10-02  
**Branch:** `architecture/angular-enterprise-platform`  
**Phase:** Execution Phase 09 — Petition Work V1  
**Roadmap mapping:** Original Phase 12 — Petition Workflow  
**Phase 08 verified branch tip:** `82636a0e5cee6024eafe43a9801980b976098f65`  
**Verified Phase 08 CI:** GitHub Actions run #71 — success

---

## 1. Context

Immigration Horizons now has case-native tasks, evidence, secure documents, unified client/staff chat, and Smart Forms.

The roadmap's next capability is Petition Workflow.

The repository does **not** currently contain a case-native petition drafting domain. The older `DeliveryRecord` is lead-scoped, stores arbitrary URL-style file entries, and explicitly documents automatic package export as a placeholder. It must not become the foundation for enterprise petition work.

Phase 09 therefore introduces a case-native staff petition workspace that reuses the authoritative case, workspace, task, evidence, Smart Form, secure-document, capability, and audit domains.

Phase 09 does not build Filing Packets. That remains the next phase.

---

## 2. Decision summary

Introduce two authoritative collections:

- `CasePetition` — mutable case-owned petition workspace with structured drafting sections, assignments, review state, and dependency links.
- `PetitionVersion` — immutable milestone/final snapshots of the petition and its dependency provenance.

A case may own **multiple petitions**.

The common V1 case will normally have one primary petition, but the model must also support later matters such as an RFE/NOID response or supplemental filing without redesigning the collection.

Do not extend `DeliveryRecord` into this domain.

---

## 3. Product outcome

At completion:

```text
ANGULAR STAFF
Case
└── Petition
    ├── Petition list / primary petition
    ├── Drafting sections
    ├── Section assignees
    ├── Section review status
    ├── Evidence dependencies
    ├── Smart Form dependencies
    ├── Secure document/work-product dependencies
    ├── Task dependencies
    ├── Internal review
    ├── Approval
    ├── Finalize
    └── Immutable versions
```

Petition drafting is staff-only in Phase 09.

The client portal does not expose petition narrative text, reviewer notes, internal dependencies, or work-product status.

Client communication remains through Phase 07 Chat and client-visible Documents/Forms.

---

## 4. Why a case may own multiple petitions

A case is the client matter/workspace; a petition is one filing-oriented work product inside that matter.

One case may eventually contain:

- initial petition;
- supplemental petition;
- RFE response;
- NOID response;
- amended/re-filed work where product policy permits;
- other case-specific filing work.

Therefore:

```text
ClientCase 1 -> many CasePetition
```

Do not encode “one case always equals one petition” as a permanent database invariant.

---

## 5. CasePetition model

Recommended core fields:

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

Recommended petition kinds:

```text
primary
rfe_response
noid_response
supplemental
other
```

The case's `caseType` remains authoritative for the immigration matter type. Petition `kind` describes the work unit, not a second case-type enum.

---

## 6. Petition lifecycle

Use a small explicit lifecycle:

```text
drafting
internal_review
needs_changes
approved
finalized
archived
```

Core transitions:

```text
drafting        -> internal_review
needs_changes   -> internal_review
internal_review -> needs_changes
internal_review -> approved
approved        -> needs_changes
approved        -> finalized
```

`finalized` is immutable in normal Phase 09 operations.

Do not silently edit finalized petitions.

If future product requirements need amendments, create a new petition or explicit later revision workflow rather than mutating the historical finalized version.

---

## 7. Drafting sections

Sections are embedded structured work units in `CasePetition`.

Recommended section fields:

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
reviewNote
```

Recommended section review states:

```text
draft
ready_for_review
changes_requested
approved
```

Text storage for V1 is **plain text** with line breaks.

Do not introduce arbitrary HTML/rich-text storage in Phase 09.

A later editor may add structured formatting with a separate security decision.

---

## 8. Section templates

To ship quickly, section structures are code-owned by case type.

Provision a practical default section set for petition-oriented case types.

Examples for employment/extraordinary-ability matters can include:

```text
case_overview
beneficiary_background
legal_standard
proposed_endeavor_or_field
evidence_analysis
criterion_or_prong_analysis
national_importance_or_merit
positioning_and_conclusion
```

Do not pretend one universal legal outline fits every case type.

Case-type section templates must be explicit, testable, and concise.

For service-only case types such as standalone business plan/recommendation-letter work, provision an appropriate minimal work-product structure rather than an irrelevant petition-letter outline.

No drag-and-drop section template builder in Phase 09.

---

## 9. Section assignments

A section may be assigned to an employee.

Assignment must require:

- employee exists and is active;
- employee is an active member of the case workspace unless existing organization-wide policy explicitly applies;
- employee's role/capability is eligible for petition work;
- assignment never grants case access.

Normal V1 assignment targets include petition writers, reviewers, PMs, and admins according to capability.

Use employee snapshots so historical versions remain understandable if a user is later removed.

---

## 10. Ownership-scoped editing

A petition writer may edit sections assigned to them.

Managers/admins with broader petition management capability may edit unassigned or other sections according to policy.

A reviewer should not gain blanket drafting authority merely because they can review.

Authorization is server-side and combines:

```text
capability
+
case/workspace access
+
petition access
+
section ownership where required
```

---

## 11. Petition dependencies

A petition can link existing case-scoped artifacts as dependencies.

Supported V1 dependency types:

```text
evidence_requirement
smart_form
case_document
task
```

A dependency stores:

```text
type
refId
labelSnapshot
role
requiredForFinalization
order
```

Optional `role` examples for `case_document`:

```text
business_plan
recommendation_letter
expert_opinion_letter
supporting_document
other
```

This avoids creating duplicate BusinessPlan/RecommendationLetter storage models.

Those work products remain secure case documents, often driven by existing case-native tasks.

---

## 12. Same-case dependency integrity

Every dependency is validated by the server.

Requirements:

- referenced object exists;
- referenced object belongs to the same case/workspace;
- actor can access it;
- hidden cross-case IDs are concealed;
- duplicate dependency links are rejected or idempotently ignored;
- dependency identity comes from the server, not trusted UI labels.

Never allow a petition to reference another client's case artifact.

---

## 13. Dependency readiness

Readiness is deterministic and type-specific.

Recommended V1 rules:

### EvidenceRequirement

Ready when:

```text
satisfied
waived
not_applicable
```

### CaseSmartForm

Ready when:

```text
approved
locked
```

### CaseDocument

Ready when:

- same case/workspace;
- not archived/rejected/quarantined/unavailable;
- has a valid current version;
- accepted where current document policy requires acceptance for final work.

### Task

Ready when:

```text
completed
```

The UI may display dependency readiness, but must not convert it into legal-strength scoring.

---

## 14. Finalization rule

A petition may be finalized only when:

- petition is in `approved`;
- all required sections are approved;
- all dependencies marked `requiredForFinalization` are ready;
- actor has `petitions.finalize`;
- petition revision matches expected revision.

Optional/non-required dependencies may remain incomplete and are recorded as such in the snapshot.

Do not silently auto-finalize from section state.

---

## 15. PetitionVersion

`PetitionVersion` is immutable.

Create versions at least on:

```text
submit_for_review
approval
finalization
```

If creating a review snapshot on every review submission proves unnecessarily heavy, approval + finalization are the minimum required milestones, with the implementation report documenting the choice.

Recommended fields:

```text
petition
case
workspace
versionNumber
kind
reason
sourceRevision
statusSnapshot
titleSnapshot

sections[]
dependencies[]

createdBy
createdByName
createdAt
```

The final version must never change after creation.

---

## 16. Version section snapshot

Each immutable version contains section snapshots:

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

This ensures a historical petition version does not change when a later draft changes.

---

## 17. Dependency provenance snapshot

For each linked dependency, the immutable version captures enough provenance to reproduce what was reviewed.

Examples:

### Evidence

```text
requirementId
title
status
```

### Smart Form

```text
caseSmartFormId
templateKey
templateVersion
revision
status
lockedRevision
```

### Document

```text
caseDocumentId
documentVersionId
displayName
versionNumber
status
```

### Task

```text
taskId
title
status
completedAt
```

Do not copy private storage paths or document bytes into petition snapshots.

---

## 18. Filing Packet boundary

A finalized `PetitionVersion` is **not** the filing packet.

Phase 10 will compose an ordered filing packet from:

- finalized petition version;
- approved forms;
- selected document versions;
- approved work products.

Phase 09 must not build package ZIP/PDF export or final filing-order composition.

This boundary is deliberate.

---

## 19. No arbitrary file URLs

The legacy `DeliveryRecord.files[].url` pattern must not be copied.

Petition dependencies use secure `CaseDocument` / `DocumentVersion` references.

Downloads remain governed by Phase 06 secure document routes and `DocumentAccessLog`.

---

## 20. Capabilities

Add mirrored capability identifiers:

```text
petitions.view
petitions.manage
petitions.edit
petitions.review
petitions.finalize
```

Recommended initial grants:

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

Capabilities never replace case/workspace row access.

For petition writers, `petitions.edit` is additionally section-assignment scoped unless manager policy applies.

---

## 21. Canonical staff API

Recommended routes:

```text
GET    /api/v1/staff/cases/:caseId/petitions
POST   /api/v1/staff/cases/:caseId/petitions
POST   /api/v1/staff/cases/:caseId/petitions/provision

GET    /api/v1/staff/petitions/:petitionId
PATCH  /api/v1/staff/petitions/:petitionId

PATCH  /api/v1/staff/petitions/:petitionId/sections/:sectionKey
POST   /api/v1/staff/petitions/:petitionId/sections/:sectionKey/assign
POST   /api/v1/staff/petitions/:petitionId/sections/:sectionKey/review
POST   /api/v1/staff/petitions/:petitionId/sections/:sectionKey/return
POST   /api/v1/staff/petitions/:petitionId/sections/:sectionKey/approve

POST   /api/v1/staff/petitions/:petitionId/dependencies
DELETE /api/v1/staff/petitions/:petitionId/dependencies/:dependencyId

POST   /api/v1/staff/petitions/:petitionId/submit
POST   /api/v1/staff/petitions/:petitionId/return
POST   /api/v1/staff/petitions/:petitionId/approve
POST   /api/v1/staff/petitions/:petitionId/finalize

GET    /api/v1/staff/petitions/:petitionId/versions
GET    /api/v1/staff/petitions/:petitionId/versions/:versionId
```

Adapt exact route shape to current v1 conventions where simpler.

No hard-delete petition route.

---

## 22. DTO boundary

Use explicit DTOs.

Safe petition summary:

```text
id
caseId
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

Safe petition detail:

```text
summary fields
sections
dependencies
internalReviewNote
versionSummary
actions
```

Never return:

- raw Mongoose documents;
- document storageKey/checksum/private path;
- raw AdminUser/ClientUser records;
- session/token data;
- hidden cross-case metadata.

---

## 23. Concurrency

All petition/section mutations include an expected petition `revision`.

Use atomic revision-checked writes.

Stale mutation:

```text
409 Conflict
```

Do not silently overwrite another writer/reviewer.

A section autosave may increment the petition revision.

The Angular UI must preserve local text and show a conflict/reload state when stale.

---

## 24. Autosave

Petition section drafting should autosave with a moderate debounce.

Recommended:

```text
~1000–1500 ms after last edit
```

Do not save every keystroke.

UI states:

```text
Saving…
Saved
Unsaved changes
Conflict
Save failed — retry
```

Do not persist petition narrative text in localStorage.

---

## 25. CaseActivity

Add material case-level petition events only:

```text
petition_created
petition_submitted
petition_returned
petition_approved
petition_finalized
```

Do not add activity rows for every autosave.

Messages must not contain full petition text.

Detailed immutable content history lives in `PetitionVersion`.

---

## 26. Notifications

Reuse existing notification infrastructure only where low-risk and useful.

Reasonable triggers:

- section assigned;
- petition submitted for review;
- petition returned for changes;
- petition approved.

Notification failure must not roll back authoritative petition writes.

Do not create a second notification engine.

No client notifications for internal petition drafting in Phase 09.

---

## 27. Angular Petition workspace

Add a **Petition** tab to the case workspace.

Required V1 UX:

- petition list/selector when multiple exist;
- create/provision primary petition where authorized;
- status and revision;
- section navigation;
- assignee display/change where authorized;
- plain-text drafting editor;
- autosave states;
- section review state;
- return/approve section controls;
- dependency panel grouped by evidence/forms/documents/tasks;
- dependency readiness;
- petition submit/return/approve/finalize actions;
- immutable version history;
- read-only finalized state;
- loading/empty/error/retry/conflict states;
- responsive layout;
- keyboard/label accessibility.

Use the existing Angular design system.

No new UI framework.

---

## 28. Client portal

No petition narrative UI is added to the client portal in Phase 09.

Do not expose:

- section text;
- reviewer notes;
- staff assignments;
- internal dependency readiness;
- version snapshots.

If staff needs client feedback, use the existing shared Chat and secure Documents workflows.

This substantially reduces launch risk and privacy surface.

---

## 29. Provisioning

Primary petition provisioning should be idempotent.

Suggested behavior:

```text
case + kind=primary + sequence=1
```

If an applicable primary petition exists, return it.

Otherwise create it from the case-type code-owned section template.

Do not auto-create a petition for every case merely by reading the case.

Use an explicit provision/create action.

No production backfill in Phase 09.

---

## 30. Special/service-only case types

Not all current `CASE_TYPE_VALUES` represent a full petition filing.

For types such as:

```text
recommendation_letters
expert_opinion_letters
business_plan
evidence_packaging
uscis_forms
other
```

the Phase 09 template catalog may use a minimal work-product structure or declare that no default primary petition is provisioned.

Do not invent irrelevant legal sections merely to cover every enum.

The catalog must explicitly test its decision for every current case type.

---

## 31. Indexes

Keep indexes minimal.

Recommended:

```text
CasePetition:
  unique { case: 1, sequence: 1 }
  { case: 1, status: 1, updatedAt: -1 }
  { workspace: 1, updatedAt: -1 }
  { "sections.assignedTo": 1, status: 1 }

PetitionVersion:
  unique { petition: 1, versionNumber: 1 }
  { case: 1, createdAt: -1 }
```

Review actual query patterns before adding.

No production index build during implementation.

---

## 32. Security and privacy

Petition content is sensitive attorney/work-product style internal material.

Mandatory:

- EmployeeSession auth;
- `mustChangePassword` restrictions;
- trusted-origin/CSRF;
- capability + case membership;
- section ownership checks;
- safe 404 concealment;
- explicit DTOs;
- no client exposure;
- no petition body text in generic logs, notifications, CaseActivity, or SecurityEvent metadata;
- no localStorage persistence;
- secure document references only.

---

## 33. Legacy DeliveryRecord

Preserve legacy behavior for existing lead/admin workflows.

Do not migrate or delete `DeliveryRecord` in Phase 09.

Do not make Angular Petition depend on it.

Future legacy retirement can remove it after filing packet parity and production observation.

---

## 34. Testing

Required automated coverage:

### Model/domain

- multiple petitions per case;
- sequence uniqueness;
- section template validation;
- service-only case-type behavior;
- finalized petition immutability;
- PetitionVersion immutability/version numbering.

### Authorization

- capability + workspace membership;
- removed employee denied;
- petition writer only assigned sections;
- manager broader edit;
- reviewer review but not arbitrary writer ownership bypass;
- guessed/malformed/other-case petition concealed.

### Sections

- autosave + revision increment;
- stale revision 409;
- assign eligible member;
- reject non-member assignment;
- submit section for review;
- return with note;
- approve;
- invalid transitions.

### Dependencies

- same-case evidence/form/document/task accepted;
- cross-case link rejected;
- readiness calculation;
- required dependency blocks finalization;
- document version provenance snapshot;
- Smart Form revision provenance snapshot.

### Petition lifecycle

- submit;
- return;
- approve;
- finalize;
- finalization requires approved required sections;
- finalization requires ready required dependencies;
- finalization creates immutable PetitionVersion;
- finalized mutations rejected.

### Angular

- list/provision;
- section navigation;
- assignment;
- autosave;
- conflict;
- review/approve controls;
- dependency readiness;
- finalization guard;
- version history;
- finalized read-only;
- loading/error/retry.

---

## 35. Out of scope

Not Phase 09:

- Filing Packet composition/export;
- PDF/ZIP package generation;
- official USCIS form rendering;
- e-signature;
- AI drafting;
- client petition editor;
- arbitrary rich text;
- drag-and-drop petition template builder;
- USCIS status tracking;
- production deployment;
- production migration/backfill/index execution.

---

## 36. Completion gate

Phase 09 is complete only when:

- Phase 08 remains green;
- case-native petition models/services exist;
- canonical staff API exists;
- Angular Petition workspace exists;
- section drafting/assign/review works;
- dependency integrity/readiness works;
- finalization creates immutable provenance snapshot;
- security/concurrency tests pass;
- OpenAPI is updated;
- `docs/implementation/PHASE_09_PETITION_WORK_REPORT.md` exists;
- final exact Phase 09 SHA has all required CI jobs green;
- no production deploy/migration/index/backfill occurred.

Then STOP before Phase 10 Filing Packets.
