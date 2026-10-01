# ADR-021 — Smart Forms V1: Versioned Case Intake, Review, and Locking

**Status:** Accepted for Phase 08 implementation  
**Date:** 2026-10-01  
**Branch:** `architecture/angular-enterprise-platform`  
**Phase:** Execution Phase 08 — Smart Forms V1  
**Roadmap mapping:** Original roadmap Phase 11 — Smart Forms  
**Phase 07 completion tip:** `68290a102167958c8aaf460648800cd4aaabc0a9`  
**Verified Phase 07 CI:** GitHub Actions run #63 — success

---

## 1. Context

Immigration Horizons now has a stable case workspace, tasks/deadlines, evidence, secure documents, and unified client-employee chat. The next roadmap capability is Smart Forms.

The repository does **not** currently contain an authoritative Smart Forms/questionnaire domain, a reusable questionnaire engine, or a USCIS PDF generation library. Building a visual form designer plus a complete USCIS PDF engine in one cycle would delay deployment and create unnecessary architectural risk.

Phase 08 therefore establishes the smallest production-ready Smart Forms domain that supports real client/staff intake work now and leaves a clean, explicit extension point for later official-form generation.

The core product loop is:

```text
published versioned template
        ↓
case form instance
        ↓
client and/or authorized staff enter structured answers
        ↓
server validation + autosave + optimistic concurrency
        ↓
client submit / staff review
        ↓
needs changes or approval
        ↓
locked immutable case-form revision
```

---

## 2. Decision summary

Phase 08 implements **schema-driven, versioned case forms** shared by the client portal and Angular staff application.

Introduce an authoritative Smart Forms domain with these concepts:

- `SmartFormTemplate` — immutable published schema version;
- `CaseSmartForm` — one case-owned form instance and its current answers/state;
- `SmartFormAudit` — append-only audit events without duplicating sensitive answer values.

Do **not** introduce a visual form-builder platform in this phase.

Do **not** claim that Phase 08 generates official USCIS PDFs unless a later implementation explicitly adds a reviewed generation adapter and official source-form assets. The model must preserve enough provenance to support that safely later.

Templates are code-owned/versioned for Phase 08 and provisioned idempotently.

---

## 3. Product scope

At completion:

```text
CLIENT PORTAL
Case
└── Forms
    ├── Assigned forms
    ├── Structured sections/fields
    ├── Repeated groups
    ├── Validation
    ├── Autosave
    ├── Submit for review
    └── Returned-for-changes workflow

ANGULAR STAFF
Case
└── Forms
    ├── Form list + progress
    ├── Open/edit permitted form
    ├── Review client answers
    ├── Return for changes
    ├── Approve
    ├── Lock final reviewed revision
    └── Audit/history summary
```

Phase 08 is not a general survey product.

---

## 4. Template model

`SmartFormTemplate` is reusable and versioned.

Recommended fields:

```text
key
version
title
description
caseTypes[]
audience
schemaVersion
sections[]
status: draft | published | retired
publishedAt
createdBy
createdAt
updatedAt
```

Unique identity:

```text
(key, version)
```

Published templates are immutable. A change creates a new version.

Existing case forms continue to reference the version they were provisioned from.

---

## 5. Template schema

A template contains ordered sections and stable field keys.

Recommended field types for V1:

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

A field definition may include:

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
children        # repeated_group only
```

No executable JavaScript, regex supplied by browser clients, arbitrary expressions, or code strings are persisted as validation logic.

Server code owns supported validation operators.

---

## 6. Stable field keys

Field keys are part of the durable data contract.

Once a published template version exists, its keys do not change.

A later template version may introduce new keys, but automatic migration of historical answers is not assumed.

Stable keys are also the future basis for explicit USCIS field mapping.

---

## 7. Repeated groups

Phase 08 supports repeated structured groups such as:

- addresses;
- employment history;
- travel history;
- prior immigration filings;
- family members.

Repeated-group values are arrays of typed objects validated against the child schema.

Do not create arbitrary nested recursion. One repeated-group level is sufficient for V1 unless implementation proves deeper nesting is already needed and safe.

Optimistic revision checking protects concurrent reorder/add/remove operations.

---

## 8. Conditional visibility

V1 may support a deliberately small condition vocabulary, for example:

```text
field equals value
field notEquals value
field isTruthy
field isFalsy
```

Conditions may control visibility and conditional requiredness.

Do not build an arbitrary rules engine.

The server evaluates authoritative validation regardless of browser visibility.

---

## 9. Case form model

`CaseSmartForm` is owned by one case/workspace and references one published template version.

Recommended fields:

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
createdAt
updatedAt
```

Recommended status state machine:

```text
draft
submitted
needs_changes
approved
locked
```

Archived case behavior follows current case policy; no hard-delete Smart Form workflow is introduced.

---

## 10. State semantics

### draft

Editable by authorized actors according to field and role policy.

### submitted

Client has submitted for staff review. Client editing pauses until staff returns the form for changes.

### needs_changes

Client may edit client-editable fields again. Staff may provide a client-visible review note.

### approved

Staff has reviewed and approved current answers. Further edits require an explicit return/reopen transition according to policy.

### locked

Final reviewed revision for that form instance. Normal answer mutation is forbidden.

Locking is deliberate and audited.

No UI-only state transitions.

---

## 11. Answers

Answers are stored as a structured object keyed by stable field key.

The browser never gets permission to write arbitrary model fields.

A dedicated service:

1. loads the template version;
2. filters writable fields for the actor;
3. normalizes input;
4. validates type/required/conditions/options;
5. applies the patch;
6. increments revision atomically;
7. records safe audit metadata.

Do not write raw request bodies directly to Mongoose.

---

## 12. Autosave

Autosave is required.

Use bounded debounce in both portal and Angular.

Every mutation includes the expected `revision`.

If the persisted revision changed, return a controlled `409 Conflict` containing the current revision and safe metadata; do not overwrite silently.

Autosave should show:

```text
Saving…
Saved
Unsaved changes
Conflict — reload/review
Error — retry
```

Do not save on every keystroke without debounce.

---

## 13. Progress

Progress is server-derived.

A simple V1 metric is acceptable:

```text
completed required visible fields / total required visible fields
```

Repeated groups count according to server validation rules.

Progress is an intake completeness metric only.

Never present it as legal strength, approval probability, eligibility, or filing readiness.

---

## 14. Client ownership and access

Client access requires:

- active authenticated ClientSession;
- active/eligible case workspace membership;
- form belongs to that case/workspace;
- template/form is client-visible;
- field is client-editable;
- form status allows client editing.

A client cannot select:

```text
case id
workspace id
template version
status
reviewer
lock state
audit actor
staff-only answers
```

Guessed inaccessible form IDs follow existing safe-not-found behavior.

---

## 15. Employee access

Employee access combines:

- EmployeeSession;
- current live role/capabilities;
- case/workspace row-level policy;
- form-specific action policy.

Introduce capability identifiers mirrored in both capability maps/contracts:

```text
forms.view
forms.edit
forms.review
forms.lock
form_templates.manage
```

Recommended initial grants:

```text
forms.view
  super_admin, admin, pm, petition_writer,
  business_plan_specialist, recommendation_letter_specialist,
  uscis_forms_specialist, evidence_collector, reviewer

forms.edit
  super_admin, admin, pm, uscis_forms_specialist

forms.review
  super_admin, admin, pm, reviewer, uscis_forms_specialist

forms.lock
  super_admin, admin, reviewer

form_templates.manage
  super_admin, admin
```

These are capability gates, not substitutes for case membership.

---

## 16. Staff-only fields

A template field may be marked `staffOnly`.

Client DTOs must omit both:

- the staff-only field definition;
- the staff-only answer value.

This prevents the portal from becoming an accidental disclosure surface.

The server must also refuse client writes to such keys.

---

## 17. Review notes

Keep client-visible and internal review notes separate.

```text
clientReviewNote
internalReviewNote
```

Client DTOs never expose `internalReviewNote`.

A `needs_changes` transition should normally include a useful client-visible note, but the service may allow a structured validation-only return when appropriate.

---

## 18. Audit history

`SmartFormAudit` is append-only.

Record events such as:

```text
form_provisioned
answers_saved
submitted
returned_for_changes
approved
locked
reopened
```

For `answers_saved`, record changed field keys and revision numbers, not complete old/new answer values by default. Full PII answer duplication in audit logs is intentionally avoided.

Actor snapshots follow the established case-audit approach.

---

## 19. Initial template catalog

To ship quickly, Phase 08 uses code-owned templates rather than an admin template builder.

At minimum provide a useful baseline catalog:

1. **Personal & Contact Information** — applicable to all supported case types.
2. **Immigration & Travel History** — applicable to all supported case types.
3. **Case-Specific Intake** — one minimal template per supported case type, or one parameterized family where the schema remains explicit and testable.

Current case types must be read from `CASE_TYPE_VALUES`; do not duplicate a divergent enum.

The catalog should be deliberately concise. Exhaustive reproduction of every official USCIS question is not required to complete Phase 08.

---

## 20. Provisioning

Provision forms lazily/idempotently per case.

Recommended service behavior:

```text
eligible published templates for caseType
        ↓
find existing (case, templateKey, templateVersion)
        ↓
create only missing instances
```

A canonical endpoint may trigger provisioning, and case detail/list loading may safely detect unprovisioned forms without mutating unexpectedly.

Do not run a production backfill in this phase.

Provide dry-run tooling if a bulk backfill helper is added.

---

## 21. Prefill

Deterministic prefill is allowed only for explicit, low-risk source mappings such as:

- client first/last name;
- email;
- phone;
- case number/type;
- known case dates where semantically identical.

Prefill is a snapshot at provisioning/explicit refresh time, not a live cross-model binding.

Do not silently overwrite user-edited answers because ClientUser or ClientCase later changes.

Track source/provenance metadata if implementation adds prefill.

---

## 22. Canonical staff API

Recommended routes:

```text
GET    /api/v1/staff/cases/:caseId/forms
POST   /api/v1/staff/cases/:caseId/forms/provision

GET    /api/v1/staff/forms/:formId
PATCH  /api/v1/staff/forms/:formId/answers

POST   /api/v1/staff/forms/:formId/submit
POST   /api/v1/staff/forms/:formId/return
POST   /api/v1/staff/forms/:formId/approve
POST   /api/v1/staff/forms/:formId/lock
POST   /api/v1/staff/forms/:formId/reopen

GET    /api/v1/staff/forms/:formId/audit
```

Exact verbs may follow existing API conventions, but state transitions remain explicit and auditable.

No hard delete.

---

## 23. Client portal API

Keep client authentication separate from staff APIs.

Recommended portal routes:

```text
GET    /api/portal/cases/:caseId/forms
GET    /api/portal/forms/:formId
PATCH  /api/portal/forms/:formId/answers
POST   /api/portal/forms/:formId/submit
```

If a submitted form is returned for changes, the same endpoints expose the new state and client-visible review note.

Clients never call `/api/v1/staff`.

---

## 24. DTOs

All APIs use explicit DTOs.

A safe case-form DTO may contain:

```text
id
caseId
title
templateKey
templateVersion
status
revision
progress
sections
answers
lastSavedAt
submittedAt
approvedAt
lockedAt
clientReviewNote
capabilities/actions
```

Staff DTOs may include `internalReviewNote` and audit metadata when authorized.

Never expose raw Mongoose documents, private actor records, sessions/tokens, or unrelated client fields.

---

## 25. Angular staff UX

Add a real **Forms** tab to the case workspace.

Required V1 UX:

- list provisioned forms;
- status and progress;
- open a form;
- section navigation;
- typed fields;
- repeated groups;
- inline/server validation;
- autosave state;
- conflict handling;
- client-visible versus staff-only indication where relevant;
- submit/review/return/approve/lock actions by capability;
- review notes;
- audit summary;
- loading/empty/error/retry;
- responsive/mobile behavior;
- keyboard and label accessibility.

No new UI framework.

---

## 26. Client portal UX

Add a case-level **Forms** surface.

Required V1 UX:

- list assigned client-visible forms;
- status/progress;
- open and edit;
- clear section structure;
- repeated groups;
- autosave;
- validation summary;
- submit;
- returned-for-changes notice with client-visible note;
- read-only submitted/approved/locked states;
- responsive mobile layout;
- accessible labels/error association;
- unsaved/conflict feedback.

Do not expose staff-only fields or internal notes.

---

## 27. USCIS generation provenance

Phase 08 answers the roadmap's generation-provenance question without pretending a PDF generator already exists.

When official form generation is implemented later, every generated artifact must record provenance equivalent to:

```text
caseSmartFormId
caseSmartFormRevision
templateKey
templateVersion
generatorVersion
officialFormIdentifier
officialFormEdition
sourceAnswerHash
generatedAt
generatedBy
caseDocumentId
documentVersionId
```

The generated PDF itself must live in the existing secure document domain as `CaseDocument` / `DocumentVersion`, not in the Smart Forms collection.

A later generator must consume a reviewed/locked revision or an explicitly snapshotted revision.

No generated artifact may silently change when answers are edited later.

---

## 28. Why official PDF generation is deferred

The current branch has no existing Smart Forms engine and no `pdf-lib`/equivalent dependency or official-form asset management system.

To ship the enterprise migration sooner, Phase 08 does **not** block on:

- downloading/cataloguing all USCIS PDFs;
- AcroForm field mapping;
- flattened PDF rendering;
- edition expiry management;
- barcode handling;
- signature placement;
- filing-ready print QA.

Those are production-sensitive capabilities and require their own tested adapter/asset lifecycle.

This deferral is explicit, not accidental technical debt.

---

## 29. Template management

No drag-and-drop or generic admin template builder in Phase 08.

Templates live as code-owned versioned definitions with tests.

`form_templates.manage` exists for future admin work and controlled seed/publish operations, not as justification to build a builder UI now.

---

## 30. Indexes

Keep indexes minimal and query-driven.

Recommended:

```text
SmartFormTemplate: unique (key, version)
SmartFormTemplate: (status, caseTypes)
CaseSmartForm: unique (case, templateKey, templateVersion)
CaseSmartForm: (case, status, updatedAt)
CaseSmartForm: (workspace, updatedAt)
SmartFormAudit: (caseSmartForm, createdAt)
```

Review existing index tooling first.

No production index execution during implementation.

---

## 31. Security and privacy

Smart Forms contain high-value personal data.

Mandatory:

- session boundaries remain separate;
- trusted-origin/CSRF rules remain intact;
- authorization before object detail;
- safe 404 concealment;
- explicit DTOs;
- staff-only field filtering;
- internal review note filtering;
- no PII values in generic application logs;
- no answer values in CaseActivity message strings;
- no form answers placed in notifications/emails;
- no localStorage persistence of form answers;
- no browser-authoritative validation/state transitions.

---

## 32. CaseActivity integration

Use `CaseActivity` only for material case-level form events, such as:

- form provisioned;
- form submitted;
- returned for changes;
- approved;
- locked.

Do not add an activity row for every autosave.

Detailed form history belongs in `SmartFormAudit`.

---

## 33. Error semantics

Use repository conventions and preserve concealment.

Expected classes:

```text
400 validation error
401 unauthenticated
403 authenticated but capability/action forbidden when non-concealed
404 nonexistent or concealed inaccessible resource
409 revision/state conflict
422 semantically invalid answer set where repository conventions prefer it
500 unexpected server failure
```

Return field-level validation errors without leaking hidden field definitions.

---

## 34. Testing

Required automated coverage:

### Domain/template

- published template immutability;
- unique key/version;
- supported field types;
- repeated groups;
- condition evaluation;
- server validation;
- no arbitrary schema operators.

### Authorization

- staff capability + case membership;
- removed member denied;
- client membership required;
- other-case form concealed;
- malformed/guessed id concealed;
- staff-only field never leaks to client.

### Editing/concurrency

- autosave patch;
- expected revision;
- stale revision -> 409;
- client cannot change staff-only fields;
- submitted client form is read-only;
- returned form editable again;
- locked form immutable.

### State

- submit;
- return;
- approve;
- lock;
- invalid transition rejected;
- audit events;
- no audit answer-value duplication.

### Provisioning

- correct case-type eligibility;
- idempotent;
- no duplicates;
- existing forms retain template version.

### Angular

- list/open;
- status/progress;
- autosave;
- conflict;
- repeated groups;
- validation;
- capability-gated review actions;
- locked state;
- error/retry/a11y.

### Portal

- authorized form list/detail;
- edit/autosave;
- repeated groups;
- submit;
- returned changes;
- staff-only filtering;
- other-case concealment;
- locked read-only.

---

## 35. Deployment-speed rule

Phase 08 is explicitly optimized for a near-term deployment.

Implementation should prefer:

1. existing sessions/policies/services;
2. embedded versioned schema;
3. code-owned templates;
4. lazy/idempotent provisioning;
5. additive indexes only;
6. no mandatory data migration;
7. no new infrastructure;
8. no third-party form platform;
9. no drag-and-drop builder;
10. no official PDF engine.

Do not sacrifice authorization, validation, data integrity, tests, or auditability for speed.

---

## 36. Out of scope

Not Phase 08:

- official USCIS PDF generation/rendering;
- e-signatures;
- arbitrary visual template builder;
- OCR/document-to-form extraction;
- AI answer generation;
- legal eligibility scoring;
- auto-filing;
- Petition workflow;
- Filing Packets;
- USCIS tracking;
- production deployment itself;
- production migrations/index builds.

---

## 37. Completion gate

Phase 08 is complete only when:

- Phase 07 remains green;
- Smart Forms models/services exist;
- canonical staff API exists;
- client portal form API/UX exists;
- Angular Forms workspace exists;
- autosave/concurrency works;
- review/lock state machine is enforced server-side;
- client/staff authorization tests pass;
- OpenAPI is updated for staff endpoints;
- template/catalog tests pass;
- local verification is clean;
- final remote GitHub Actions is green on the exact Phase 08 SHA;
- `docs/implementation/PHASE_08_SMART_FORMS_REPORT.md` records the result;
- no production deployment/migration/index operation occurred.

Then STOP before Phase 09.
