# ADR-018 — Evidence Checklists and Requirements

**Status:** Accepted for Phase 05 implementation  
**Date:** 2026-09-08  
**Branch:** `architecture/angular-enterprise-platform`  
**Phase:** Execution Phase 05 — Evidence Checklist + Evidence Planning  
**Phase 04 implementation baseline:** `c3e9441722362b15ed35bcb5bb6a3362819c597f`

---

## 1. Context

Immigration Horizons is migrating staff case-management workflows to the Angular enterprise application while preserving the existing Next.js public site, Express backend/CMS, MongoDB data, client portal behavior, and production safety controls.

Phase 04 makes operational tasks case-native. The next major gap is evidence planning.

The repository already has a secure document domain with:

- `DocumentCategory` for ordered per-case document buckets;
- `DocumentRequest` for asking a specific client workspace member to provide a document;
- `CaseDocument` for private uploaded files;
- document review states, versions, storage controls, access logging, and client/staff visibility rules.

Those models answer these questions:

```text
Where does a document belong?
Who was asked to upload something?
Which file was uploaded?
Was the uploaded file accepted, rejected, or replaced?
```

They do not answer the core case-preparation question:

```text
What evidence is required or recommended for this immigration case,
and which requirements are satisfied, missing, waived, or not applicable?
```

A document category is not an evidence requirement. A document request is not a reusable case-type checklist. A file is not automatically proof that a legal/evidentiary criterion has been satisfied.

Phase 05 introduces a case-native evidence planning layer without replacing or duplicating the secure document system.

---

## 2. Decision summary

Phase 05 introduces two related domain concepts:

```text
EvidenceTemplate
EvidenceRequirement
```

`EvidenceTemplate` is the reusable definition of an evidence checklist for a supported case type or workflow.

`EvidenceRequirement` is the case-specific instantiated checklist item used by staff to plan, collect, review, and track evidence for one `ClientCase`.

Evidence requirements may link to existing `DocumentCategory`, `DocumentRequest`, and `CaseDocument` records, but they do not own file storage.

The secure document subsystem remains the source of truth for uploaded files and document review.

The evidence subsystem becomes the source of truth for whether the case team considers a requirement satisfied.

---

## 3. Why a separate evidence requirement model is necessary

`DocumentCategory` is intentionally broad. A category such as:

```text
Awards and Recognition
Employment Evidence
Publications
Identity Documents
Recommendation Letters
```

may contain multiple files and may support several evidentiary requirements.

A single evidence requirement may also need multiple documents from different categories.

Therefore this relationship is not safely modeled as:

```text
one DocumentCategory = one legal/evidence requirement
```

Similarly, a `DocumentRequest` is a transaction asking one client workspace member to provide something. It may be cancelled, fulfilled, recreated, or replaced. It is not stable enough to serve as the canonical evidence checklist item.

Evidence requirements must therefore be first-class records.

---

## 4. Evidence template model

Phase 05 should introduce a reusable template model equivalent to:

```text
EvidenceTemplate
```

The exact schema and naming may follow repository conventions, but the template must support intentional versioned checklist definitions.

Recommended conceptual fields:

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

A template item should contain stable product metadata such as:

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

Templates are definitions, not case data.

They must not contain client names, uploaded documents, internal case notes, or other matter-specific data.

---

## 5. Supported template scope

Phase 05 must establish an extensible system rather than hard-code one giant checklist into Angular.

The architecture must support templates for current and future case types such as:

```text
EB-2 NIW
EB-1A
EB-1B
EB-1C
O-1
EB-3
F-1
B-1/B-2
K-1 / fiancé workflows
```

Phase 05 does not need exhaustive production-grade legal templates for every immigration category.

A small, well-tested initial set is acceptable if the template architecture is generic and additional templates can be added without schema changes.

Evidence templates are operational preparation aids. They are not legal advice engines and must not claim that satisfying checklist items guarantees USCIS approval.

---

## 6. Evidence requirement model

A case-level requirement should be represented by a model equivalent to:

```text
EvidenceRequirement
```

Recommended conceptual fields:

```text
case
workspace
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

The implementation may normalize or split links into join collections if repository conventions justify it, but it must preserve explicit ownership and authorization.

---

## 7. Requirement importance

Phase 05 defines requirement importance separately from requirement status.

Recommended importance values:

```text
required
recommended
optional
```

Importance describes how the checklist item should be treated operationally.

It must not be inferred from whether a file currently exists.

The system must allow a required item to be missing and an optional item to be satisfied.

---

## 8. Requirement status

Recommended case requirement statuses:

```text
missing
in_progress
satisfied
waived
not_applicable
```

### `missing`

No acceptable evidence is currently linked or the team has not yet begun collection.

### `in_progress`

Collection/review is underway. This may include open document requests or uploaded documents still awaiting acceptance.

### `satisfied`

Authorized staff explicitly considers the requirement satisfied by the linked evidence and case context.

### `waived`

The team intentionally decides not to pursue an otherwise applicable requirement. A reason is required.

### `not_applicable`

The requirement does not apply to this case. A reason is required.

Status changes are server-authorized business actions.

Phase 05 must not automatically mark a requirement satisfied merely because a document exists in a category.

---

## 9. Evidence satisfaction is explicit

The secure document model already distinguishes document review states.

A document with status `accepted` means that file passed document review. It does not necessarily mean the evidence requirement is legally or strategically sufficient.

Therefore:

```text
CaseDocument.status = accepted
```

does not automatically imply:

```text
EvidenceRequirement.status = satisfied
```

However, accepted documents may contribute to an evidence requirement and should be easy for authorized staff to link.

The server may derive useful readiness indicators such as:

```text
linked accepted documents
linked pending documents
open requests
```

without changing the explicit requirement status automatically.

---

## 10. Relationship to DocumentCategory

`DocumentCategory` remains the per-case document organization layer.

Evidence requirements may link to one or more categories to help staff find or collect relevant files.

Phase 05 must not create a second parallel category hierarchy.

Template items may suggest a category by stable template/category key, but provisioning must resolve that suggestion against the actual case's categories.

If a suggested category is unavailable, requirement creation must still succeed safely unless the requirement itself depends on that category by explicit product rule.

---

## 11. Relationship to DocumentRequest

Evidence requirements may create or associate one or more existing `DocumentRequest` records.

A request answers:

```text
Ask this workspace member to provide this document by this date.
```

A requirement answers:

```text
Track whether this evidence need for the case is satisfied.
```

The relationship is therefore one-to-many or many-to-many depending on implementation needs.

At minimum, Phase 05 should support linking a requirement to a request and exposing request state in the evidence workspace.

Evidence requirement status must not be overwritten merely because a request is cancelled or fulfilled.

---

## 12. Relationship to CaseDocument

Evidence requirements may link to multiple existing `CaseDocument` records.

The same document may support more than one requirement where legitimate.

The evidence service must verify that linked documents belong to the same authorized case and workspace.

Cross-case document linking is prohibited.

Archived or rejected documents should not count as positive evidence readiness.

The UI must clearly distinguish accepted, pending-review, replacement-needed, rejected, and archived linked documents.

---

## 13. Checklist provisioning

Evidence checklist provisioning must be idempotent.

When a supported case is created or when an authorized manager explicitly provisions a template, the system may instantiate `EvidenceRequirement` records from the selected template.

The stable identity should include sufficient template provenance, for example:

```text
case + templateKey + templateVersion + templateItemKey
```

Provisioning must not create duplicates on retries.

A later template version must not silently rewrite historical requirements that staff have already edited, waived, satisfied, or annotated.

Template upgrades require an explicit merge/additive strategy.

---

## 14. Template versioning

Evidence templates must be versionable from the beginning.

A case requirement stores the template provenance used when it was instantiated.

This protects historical meaning when checklist wording or product strategy changes later.

Recommended policy:

- published template versions are immutable;
- new edits create a new version;
- existing cases stay on their instantiated requirement data unless an explicit upgrade action is performed;
- template retirement prevents new provisioning but does not delete historical case requirements.

Phase 05 does not need a full Angular template administration UI unless already trivial within scope.

Seed/config-based template management is acceptable for the first implementation if tested and documented.

---

## 15. Case-type selection

The backend determines which evidence template is eligible for a case from authoritative case data.

Angular must not be trusted to claim an arbitrary case type or template eligibility.

If a case does not have a supported template, the evidence surface should return a safe empty/unconfigured state rather than manufacturing requirements.

Managers may be allowed to add custom requirements manually if authorized.

---

## 16. Custom case requirements

Phase 05 should support manually added case-specific evidence requirements.

Custom requirements must:

- belong to one case/workspace;
- have explicit title, importance, section/order as appropriate;
- be auditable;
- be subject to the same authorization and DTO rules;
- not mutate reusable templates.

A custom requirement should have null template provenance or an explicit `source = custom` indicator.

---

## 17. Authorization model

Evidence access is case access.

A user must first be authorized for the associated case under the existing case policy.

Recommended capability semantics:

```text
evidence.view
evidence.manage
```

If adding new capabilities would create unnecessary churn, Phase 05 may map them deliberately onto existing case/document capabilities, but the decision must be explicit and fail closed.

At minimum:

- authorized case team members may view evidence according to role;
- managers/authorized operators may create, edit, waive, mark not applicable, link/unlink evidence, and provision checklists;
- specialist roles may update evidence only within explicitly permitted ownership/case access rules;
- viewer/editor/non-operational roles must not gain mutation rights by UI exposure alone;
- removal from case workspace removes access to case evidence immediately unless an existing explicit `cases.view_all` capability applies.

No endpoint may authorize solely from a requirement ID or Angular route state.

---

## 18. Existence concealment

Phase 03 and Phase 04 established case-existence protections.

Evidence endpoints must preserve them.

Where appropriate, malformed, nonexistent, and inaccessible case/requirement identifiers should return the same safe not-found behavior.

The system must not reveal that a hidden case contains particular evidence requirements, requests, or documents.

---

## 19. Canonical evidence service

Evidence business logic belongs in a reusable server-side application service equivalent to:

```text
server/services/evidenceManagement.js
```

The exact name may follow repository conventions.

The service should own real semantics such as:

```text
resolveTemplateForCase
provisionEvidenceChecklist
listCaseEvidence
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

Routes should remain transport/validation layers rather than duplicate business policy.

Angular never owns evidence-domain truth.

---

## 20. Canonical API

The canonical staff contract lives under:

```text
/api/v1/staff
```

Recommended endpoints include:

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

The implementation may consolidate link mutation operations into validated PATCH contracts where clearer.

Hard deletion of requirements is not the default. Evidence history should be preserved. If removal is needed, prefer archive/disable semantics or a narrowly defined custom-requirement deletion rule with audit coverage.

---

## 21. Evidence DTO policy

Never return raw Mongoose documents.

The case evidence DTO should intentionally expose fields such as:

```text
id
title
description
section
order
importance
status
source
templateKey
templateVersion
templateItemKey
clientVisible
clientGuidance
staffGuidance
internalNotes
linkedCategories
linkedDocuments
linkedRequests
waivedReason
notApplicableReason
satisfiedAt
satisfiedBy
createdAt
updatedAt
```

Nested documents and requests must use bounded DTOs.

Do not leak:

```text
storageKey
private filesystem paths
session/token fields
password fields
raw AdminUser documents
raw ClientUser documents
internal storage/scanner metadata not needed by the evidence UI
```

---

## 22. Evidence summary/readiness

Phase 05 may expose an evidence summary derived from requirement states, for example:

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

The completion percentage must be operationally defined and documented.

Recommended initial rule:

```text
requiredSatisfied / applicableRequiredTotal
```

where waived/not-applicable treatment is explicit and tested.

Do not present the percentage as a USCIS approval probability or legal success score.

---

## 23. Angular case workspace

Phase 05 adds an `Evidence` surface to the case workspace.

The Angular UI should support:

- evidence summary;
- sectioned checklist;
- requirement importance/status badges;
- missing/in-progress/satisfied/waived/not-applicable filters;
- requirement detail panel or page;
- linked documents with review status;
- linked/open document requests;
- create custom requirement when authorized;
- link/unlink authorized existing case documents;
- change requirement status with required reasons for waived/not-applicable;
- create or associate a document request where existing APIs/services allow safe reuse;
- loading, empty, error, retry and responsive states;
- keyboard and accessible form behavior.

Do not duplicate the full Documents UI inside Evidence.

Evidence should deep-link to the secure document/request workflows where appropriate.

---

## 24. Client visibility

Phase 05 is primarily a staff case-management phase.

Evidence requirements may carry intentional client-visible guidance, but the existing client portal must not suddenly expose all internal evidence planning.

Internal notes, strategy language, internal sufficiency assessments, and staff guidance remain staff-only.

If Phase 05 touches client-facing responses, fields must be explicitly allowlisted.

A later client-portal phase may expose selected requirements or request progress under a separate ADR/product decision.

---

## 25. Case activity and audit

Important evidence changes should be represented in existing activity/audit systems where appropriate.

Candidate internal events include:

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

Use actor snapshots and minimal metadata.

Do not persist full documents, client secrets, file storage keys, or large note bodies into activity metadata.

Evidence activity is internal by default.

---

## 26. Notifications

Phase 05 does not create a new notification engine.

If creating a `DocumentRequest` from an evidence requirement already triggers existing client/staff notification behavior, reuse that infrastructure.

Evidence requirement persistence must not depend on downstream notification delivery succeeding.

No new scheduler is required for Phase 05.

---

## 27. Index strategy

Indexes must follow actual access patterns.

Candidate shapes include:

```text
EvidenceRequirement: case + section + order
EvidenceRequirement: case + status + importance
EvidenceRequirement: case + templateKey + templateVersion + templateItemKey (unique/partial as appropriate)
EvidenceTemplate: key + version (unique)
EvidenceTemplate: caseType + status + version
```

Implementation must inspect current indexes and repository index tooling before adding anything.

No production index execution occurs in Phase 05.

---

## 28. Migration strategy

Phase 05 should not attempt to infer legal/evidence sufficiency from old files automatically.

Existing `DocumentCategory`, `DocumentRequest`, and `CaseDocument` data may be used for optional linkage assistance, but migration must not guess that a requirement is satisfied.

If Phase 05 introduces checklist provisioning for existing cases, provide an idempotent dry-run-capable backfill that:

- identifies supported cases;
- reports which template would be applied;
- provisions only when explicitly executed;
- skips already-provisioned requirements;
- never rewrites custom/manual requirements;
- never marks requirements satisfied automatically;
- reports unsupported or ambiguous case types rather than guessing.

No production migration is executed during Phase 05 implementation.

---

## 29. OpenAPI and Angular typing

Every new evidence endpoint must be documented in:

```text
server/openapi/v1.yaml
```

Schemas must use explicit required/nullable fields and intentional nested objects.

Angular should introduce explicit API types, for example:

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

Do not introduce `any` as the default API contract type.

---

## 30. Testing requirements

Phase 05 requires automated coverage for at least:

### Domain/model

- template version uniqueness;
- requirement status validation;
- waived requires reason;
- not-applicable requires reason;
- case/workspace consistency;
- idempotent template provisioning;
- template provenance preservation;
- custom requirement behavior.

### Authorization

- authorized manager can provision/manage;
- case member can view according to capability;
- inaccessible user gets safe not-found behavior;
- removed workspace member loses access;
- unauthorized actor cannot mutate by guessing requirement ID;
- `view_all` behavior follows existing policy exactly.

### Linking

- same-case accepted document can be linked;
- same-case pending document may be linked but does not auto-satisfy;
- cross-case document rejected;
- rejected/archived document does not produce misleading readiness;
- valid document request link works;
- cross-case/request mismatch rejected;
- unlink behavior is audited and safe.

### Status

- accepted document does not automatically mark requirement satisfied;
- explicit satisfy action works for authorized actor;
- waive/not-applicable requires reason;
- reopening from satisfied/waived/not-applicable works according to defined service rules.

### DTO/security

Recursively assert that sensitive fields such as these do not leak where relevant:

```text
password
passwordHash
token
tokenHash
secret
storageKey
privatePath
```

### Angular

Test loading, section grouping, filtering, empty/error states, linking, status mutations, authorization-driven controls, and accessible status/reason handling.

---

## 31. Security boundaries preserved

Phase 05 must preserve all prior controls, including:

```text
EmployeeSession authentication
mustChangePassword enforcement
trusted-origin checks
same-origin mutation strategy
CSRF protections
capability checks
workspace row-level policy
case existence concealment
SecurityEvent conventions
explicit DTO mapping
secure private document storage
DocumentAccessLog behavior
```

Angular never connects directly to MongoDB or private storage.

No bearer tokens in localStorage.

No broad CORS.

No direct file URL exposure.

---

## 32. Out of scope

Phase 05 does not include:

- full legal strategy engine;
- automated USCIS approval scoring;
- AI-generated evidence sufficiency decisions;
- full petition drafting;
- smart forms;
- filing packet generation;
- USCIS status tracking;
- full calendar/reminder engine;
- OCR/extraction pipeline;
- full client-facing checklist redesign;
- billing/time tracking;
- production deployment;
- production migration/index execution;
- retirement of legacy EJS routes.

---

## 33. Consequences

### Positive

- Case teams gain an explicit evidence preparation workflow.
- Documents remain securely stored in the existing document domain.
- Requirements can span multiple documents and requests.
- Templates support multiple immigration case types without schema rewrites.
- Historical checklist meaning is protected by template provenance/versioning.
- Angular gains a Docketwise-style evidence workspace without creating a second storage system.
- Later petition and filing-packet phases can consume structured evidence readiness.

### Costs

- The system gains another domain object that must be authorized carefully.
- Template lifecycle/versioning requires discipline.
- Requirements and documents have related but intentionally different statuses.
- Existing cases may require explicit checklist provisioning.

These costs are justified because document storage alone cannot model evidence strategy and readiness.

---

## 34. Rejected alternatives

### A. Use `DocumentCategory.required` as the evidence checklist

Rejected because a category is a storage/organization bucket, not a legal/evidentiary requirement, and one requirement may need multiple categories/documents.

### B. Use `DocumentRequest` as the checklist item

Rejected because requests are transactional, recipient-specific collection actions rather than stable case requirements.

### C. Auto-satisfy requirements whenever an accepted document exists

Rejected because file acceptance is not equivalent to evidence sufficiency.

### D. Store evidence files directly on `EvidenceRequirement`

Rejected because this would bypass the secure document architecture, versioning, scanning, review, access logging, and storage controls.

### E. Hard-code all evidence logic in Angular

Rejected because authorization, template eligibility, status rules, and relationship integrity must remain server-authoritative.

### F. Build an AI evidence scoring engine now

Rejected because Phase 05 must first establish deterministic, auditable case data and human-controlled evidence status.

---

## 35. Implementation gate

Phase 05 implementation may begin only from a clean, understood branch state.

Before substantive code changes, verify the Phase 04 implementation commit is present and confirm its GitHub Actions run is green. If Phase 04 CI is red, fix Phase 04 in a new commit before proceeding with Phase 05 domain work.

Do not rewrite completed history.

---

## 36. Completion criteria

Phase 05 is complete only when all of the following are true:

- ADR-018 is implemented consistently;
- reusable evidence template architecture exists;
- case-native evidence requirements exist;
- checklist provisioning is idempotent;
- manual/custom requirements are supported where authorized;
- requirement status/importance semantics are enforced server-side;
- evidence links reuse secure `CaseDocument` / `DocumentRequest` infrastructure;
- cross-case linking is impossible;
- explicit DTOs prevent sensitive data leakage;
- Angular case Evidence workspace is operational;
- evidence summary/readiness is deterministic and not presented as legal success probability;
- OpenAPI is updated;
- server/root/Angular tests pass;
- lint/typecheck/builds pass;
- migrations/index changes are dry-run safe and not executed on production;
- remote GitHub Actions for the final Phase 05 commit are green.

After these conditions are met, stop and report Phase 05 completion before starting Phase 06.
