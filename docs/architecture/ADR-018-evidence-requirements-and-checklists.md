# ADR-018 — Evidence Requirements and Case Checklists

**Status:** Proposed — implementation blocked until Phase 04 completion gate passes  
**Date:** 2026-09-08  
**Execution phase:** Phase 05  
**Depends on:** ADR-002, ADR-004, ADR-007, ADR-010, ADR-015, ADR-016, ADR-017

## Context

Immigration Horizons already has a secure document domain:

- `DocumentCategory` organizes documents within a case;
- `DocumentRequest` asks a specific client workspace member to provide a specific document;
- `CaseDocument` and `DocumentVersion` represent the actual uploaded evidence and its history;
- document review, replacement, archive, private storage, download authorization, access logging, and client/staff visibility are already established by ADR-004.

Those models are necessary but they do not model the higher-level evidentiary question: **what evidence is expected for this type of immigration matter, which requirements apply to this case, and which of those requirements are satisfied, waived, not applicable, blocked, or still missing?**

A document category is too broad to answer that question. A request is also not the same thing as a requirement: one evidence requirement may be satisfied by multiple documents; a requirement may be staff-produced rather than client-requested; a request may be reissued without changing the underlying requirement; and some requirements are optional or conditional.

The Angular enterprise roadmap therefore places an evidence-checklist capability immediately after case-native tasks/deadlines and explicitly requires reuse of the existing document domain rather than creating a second evidence-file collection.

Phase 05 must create a deterministic evidence-planning layer that later petition, smart-form, filing-packet, and AI-assisted workflows can consume without duplicating document ownership or authorization.

## Decision 1 — Keep one authoritative file domain

Phase 05 will **not** create an `EvidenceFile`, `EvidenceDocument`, attachment store, or any alternate upload collection.

All actual files remain:

```text
CaseDocument
  -> DocumentVersion
  -> private storage provider
```

Evidence requirements reference existing documents; they never own file bytes.

This preserves ADR-004 security, download authorization, scanning state, version history, and access logging.

## Decision 2 — Add reusable templates and per-case requirement instances

Phase 05 introduces two domain concepts.

### `EvidenceTemplate`

A reusable, versioned definition for a case type.

Suggested core fields:

```text
key
name
caseType
version
status: draft | active | retired
description
createdBy
publishedAt
retiredAt
timestamps
```

A template is configuration/reference data. Editing a template must never silently rewrite historical case requirements.

### `EvidenceRequirement`

A case-owned snapshot/instance of one evidentiary requirement.

Suggested core fields:

```text
case
workspace
templateKey
templateVersion
requirementKey
title
description
category
importance
status
clientVisible
requestedFrom
sortOrder
source
notes
waiverReason
notApplicableReason
fulfilledAt
createdBy
updatedBy
timestamps
```

The exact final schema may be refined during implementation, but the separation is required: templates define reusable rules; requirements are durable case records.

## Decision 3 — Requirements are snapshots, not live template pointers

When a template is applied to a case, the case receives requirement snapshots.

The requirement stores enough template provenance to identify where it came from:

```text
templateKey
templateVersion
requirementKey
```

but its operational fields are copied into the case requirement.

A later template version must not silently change an existing case.

Template upgrades for an existing case require an explicit compare/apply workflow and must be idempotent.

## Decision 4 — Case type is the primary template selector

The primary template selector is `ClientCase.caseType`, using the existing canonical values in `caseConstants.js`.

Examples include:

```text
eb2_niw
eb1a
eb1b
eb1c
o1
rfe_response
noid_response
recommendation_letters
expert_opinion_letters
business_plan
evidence_packaging
uscis_forms
other
```

Not every case type needs a rich template immediately. Phase 05 may seed a small, reviewed starter set rather than fabricating comprehensive immigration-law checklists.

Templates are operational checklists, not legal conclusions. Content must be reviewable and editable by authorized administrators/managers before being relied on operationally.

## Decision 5 — Do not encode legal eligibility logic as hidden application code

Conditional evidence rules must not be scattered across Angular components or route handlers.

Phase 05 should favor explicit requirement metadata and human-controlled applicability over a speculative rules engine.

Allowed first-release states include:

```text
required
recommended
optional
conditional
```

and operational statuses such as:

```text
not_started
requested
received
under_review
satisfied
replacement_required
waived
not_applicable
```

Exact enums must be documented in the schema contract and tests.

`waived` and `not_applicable` require explicit actor/reason metadata.

## Decision 6 — Fulfillment links to existing documents

A requirement may be linked to zero, one, or multiple `CaseDocument` records.

Use an explicit relation rather than moving file ownership into the requirement.

Preferred shape:

```text
EvidenceRequirement.fulfilledByDocuments: [CaseDocument]
```

or a dedicated relation model only if implementation proves metadata per link is necessary.

Every linked document must belong to the same case.

Cross-case document linking is forbidden.

A document may satisfy more than one requirement in the same case when operationally valid.

## Decision 7 — DocumentRequest and EvidenceRequirement remain distinct

`DocumentRequest` is a communication/collection action directed to a specific workspace member.

`EvidenceRequirement` is the durable case checklist item.

A requirement can optionally reference one or more requests, and a request can originate from a requirement.

Creating a request from a requirement should preserve the requirement identity, but fulfilling/cancelling a request must not automatically erase the requirement.

Requirement status may be derived/updated through an application service after review of linked documents; it must not be based only on “a file was uploaded.”

## Decision 8 — DocumentCategory remains the organizational grouping

Each requirement may reference a `DocumentCategory` for filing/display organization.

Categories and evidence requirements are not interchangeable:

- category = where documents are organized;
- requirement = what evidentiary need must be addressed.

Do not duplicate category names into another taxonomy unless the product need is explicit.

## Decision 9 — Server-side case authorization applies to every evidence operation

Evidence endpoints must reuse existing staff authentication, capabilities, `casePolicy`, and workspace membership semantics.

Knowing a requirement ID or template ID never grants case access.

Case-scoped requirement reads/mutations must preserve Phase 03 existence concealment behavior.

Client-visible evidence data, if exposed later, must use a separate intentional DTO and must never leak staff-only notes, internal rationale, actor metadata, or hidden requirements.

Phase 05 is staff-first unless the implementation prompt explicitly enables a narrowly defined client surface.

## Decision 10 — Central application service owns requirement semantics

Business rules belong in a canonical service such as:

```text
server/services/evidenceManagement.js
```

Responsibilities should include:

```text
applyTemplateToCase
listCaseRequirements
createCustomRequirement
updateRequirement
changeRequirementStatus
linkDocument
unlinkDocument
createDocumentRequestFromRequirement
waiveRequirement
markNotApplicable
reorderRequirements
calculateEvidenceProgress
```

API routes and Angular components must not independently recreate these rules.

## Decision 11 — Progress is derived, not a manually editable percentage

Evidence completion metrics should be computed from requirement state.

Do not persist a user-editable `percentComplete` as the source of truth.

The read model can expose counts such as:

```text
totalApplicable
satisfied
inProgress
missing
waived
notApplicable
percentSatisfied
```

The exact denominator must be documented. `not_applicable` should normally be excluded from the applicable denominator; waived handling must be explicit.

## Decision 12 — No automatic legal determination

Phase 05 does not decide that a case legally satisfies EB-1A, NIW, O-1, or any other immigration classification.

It tracks operational evidence requirements and their supporting records.

Human staff remain responsible for strategy and legal/eligibility conclusions.

Future AI may suggest missing evidence only after deterministic access controls and workflow semantics are stable; AI must not autonomously mark consequential requirements satisfied.

## Decision 13 — Template administration is controlled

Template publishing/retirement is a higher-consequence configuration operation.

Do not make templates editable by every staff user.

Phase 05 should define explicit capabilities or reuse an appropriate administrative capability after reviewing the existing permission registry.

Code-owned permissions remain authoritative; do not introduce DB-editable authorization rules merely for template management.

## Decision 14 — Schema contract and indexes

Add an evidence schema contract under `docs/architecture`, mirrored/tested according to existing cross-app conventions if the Next.js side requires model awareness.

Indexes should be justified by real queries. Likely shapes include:

```text
EvidenceTemplate: caseType + status + version
EvidenceTemplate: key + version (unique)
EvidenceRequirement: case + status + sortOrder
EvidenceRequirement: case + category + status
EvidenceRequirement: case + requirementKey
```

Avoid duplicate/redundant indexes.

If uniqueness applies to template-derived requirement identity within a case, use a carefully designed partial/compound unique index that still permits custom requirements.

## Decision 15 — Template application is idempotent

Applying the same template version to a case twice must not create duplicates.

A dry-run/preview operation should report:

```text
wouldCreate
alreadyPresent
conflicts
obsoleteFromOlderVersion
```

Do not delete or rewrite existing requirements during an upgrade without an explicit reviewed action.

## Decision 16 — Activities and notifications

Material evidence workflow changes may create internal `CaseActivity` entries, for example:

```text
evidence_template_applied
evidence_requirement_created
evidence_requirement_satisfied
evidence_requirement_waived
evidence_requirement_reopened
```

Do not create noisy activity for every trivial field edit.

Notifications should reuse existing notification infrastructure when a meaningful human action is required, such as a new client document request. Evidence persistence must not depend on notification delivery succeeding.

## Decision 17 — Angular case workspace is the primary Phase 05 surface

Phase 05 adds an `Evidence` section to the case workspace and an optional cross-case evidence operations view only if it can be implemented without widening authorization.

Core case Evidence UX should support:

```text
progress summary
filter by status/category/importance
requirement list
requirement detail
link/unlink existing case documents
create request from requirement
custom requirement creation when authorized
waive/not-applicable with reason
reopen requirement
```

No mock evidence data.

## Decision 18 — Phase boundaries

Phase 05 does not migrate the full document-management UI into Angular. That remains the next document-focused execution phase.

Phase 05 may display/link existing document metadata needed to operate evidence requirements, but upload/review/version/archive/access-history parity belongs to the full Documents phase.

Phase 05 also excludes smart forms, petition drafting, filing packets, USCIS tracking, full calendar, real-time transport, and AI automation.

## Consequences

### Positive

- evidence planning becomes a first-class deterministic case capability;
- existing secure documents remain the only file source of truth;
- reusable case-type templates can evolve without rewriting historical cases;
- later petition/forms/filing workflows can depend on stable requirement IDs and statuses;
- Angular gains a meaningful evidence workspace without duplicating document security.

### Costs

- two new domain concepts and their lifecycle must be maintained;
- template versioning requires careful administration and upgrade semantics;
- evidence progress semantics must remain consistent across API/UI/reporting;
- comprehensive immigration-specific template content requires human review and should not be fabricated from application code.

## Phase 05 entry gate

Implementation may begin only when Phase 04 is formally closed:

1. Phase 04 remote CI is green;
2. required Phase 04 task/deadline integration and Angular tests exist;
3. `PHASE_04_CASE_TASKS_DEADLINES_REPORT.md` exists and accurately records verification;
4. Phase 04 working tree/branch is clean apart from intentional Phase 05 documentation commits.

Until those conditions are true, this ADR is planning/preparation only.