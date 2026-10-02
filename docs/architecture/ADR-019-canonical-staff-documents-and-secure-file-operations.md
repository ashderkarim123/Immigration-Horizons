# ADR-019 — Canonical Staff Documents and Secure File Operations

**Status:** Accepted for Phase 06 implementation  
**Date:** 2026-09-08  
**Branch:** `architecture/angular-enterprise-platform`  
**Phase:** Execution Phase 06 — Staff Documents + Secure File Operations  
**Phase 05 implementation baseline:** `f396cd675356c56ee00f543ba228fefd225a79d2`

---

## 1. Context

Immigration Horizons already has a mature secure document domain implemented in the Express application and client portal. The existing system includes:

- `DocumentCategory`;
- `DocumentRequest`;
- `CaseDocument`;
- `DocumentVersion`;
- `DocumentAccessLog`;
- private storage outside publicly served directories;
- file-size and extension/type validation;
- detected MIME / magic-byte validation;
- scanner status that remains honest when no scanner is configured;
- employee/client uploader separation;
- document review and replacement workflows;
- versioning;
- archive semantics;
- guarded downloads with security headers and audit logging;
- row-level case/workspace authorization.

Legacy staff operations currently live primarily in the Express/EJS document center. Phase 05 added evidence requirements that can link to the existing document system, making a canonical staff document API and Angular document workspace the next genuine enterprise gap.

Phase 06 is therefore a **transport and staff-UI migration of the existing secure document domain**, not a redesign of storage or a second document system.

---

## 2. Decision summary

Phase 06 will expose the existing document-domain services through explicit `/api/v1/staff` contracts and implement equivalent Angular staff workflows inside the case-management application.

The existing secure domain remains authoritative:

```text
DocumentCategory
DocumentRequest
CaseDocument
DocumentVersion
DocumentAccessLog
```

Existing application services and policies remain the first choice:

```text
documentPolicy
documentCategoryService
documentRequestService
documentUploadService
documentReviewService
documentDownloadService
documentValidation
storage provider abstraction
```

Where legacy EJS routes contain transport-only orchestration, Phase 06 may extract reusable application-level functions. It must not create parallel Angular-specific business rules.

---

## 3. Non-goal: no new file collection

Phase 06 must not introduce any second collection such as:

```text
StaffDocument
AngularDocument
EvidenceFile
UploadedFile
```

for data already represented by `CaseDocument` and `DocumentVersion`.

Evidence requirements from Phase 05 continue to reference the existing secure documents.

One document identity, one version history, one storage authority, one download policy.

---

## 4. Storage authority

The backend storage provider remains the only component allowed to resolve physical/private document storage.

Angular must never receive or construct:

```text
storageKey
private filesystem path
temporary upload path
server storage root
bucket-internal key unless a later explicit provider design requires it
```

Angular uploads bytes to authorized API endpoints and downloads bytes through authorized API endpoints.

The browser never reads private storage directly.

Phase 06 does not replace the existing local private-storage provider or force a cloud-storage migration.

---

## 5. Upload security

The existing upload-security invariants remain mandatory.

At minimum:

1. enforce configured maximum file size server-side;
2. permit only approved extensions/types;
3. inspect actual file signature / detected MIME where current validation does so;
4. reject extension/content mismatches;
5. generate server-controlled storage keys;
6. never trust the browser filename as a storage path;
7. clean temporary files after failure;
8. never move invalid files into durable private storage;
9. preserve uploader actor identity;
10. preserve workspace/case/category consistency.

Client-provided metadata is descriptive input, not authority.

---

## 6. Multipart request decision

Employee file uploads and replacement-version uploads remain multipart requests.

The canonical API must preserve the existing same-origin/trusted-origin and CSRF strategy established for staff APIs.

If the API security layer supports a custom CSRF/header token that can be validated before multipart parsing, prefer early rejection before accepting a large file body.

If repository conventions require post-parser verification, preserve the existing safe ordering and guarantee temporary-file cleanup on any authorization/CSRF/validation failure.

Phase 06 must never disable CSRF or trusted-origin controls merely because multipart handling is inconvenient.

---

## 7. Case and workspace ownership

Every `CaseDocument`, `DocumentCategory`, and `DocumentRequest` remains case/workspace scoped.

The backend resolves authoritative context.

Angular-supplied combinations such as:

```text
caseId + workspaceId
caseId + categoryId
caseId + documentId
caseId + requestId
```

must be cross-checked rather than trusted.

Cross-case category, request, document, and version references are rejected.

No route should allow an attacker to move or link a document into another inaccessible case by guessing IDs.

---

## 8. Authorization model

The existing document authorization design remains authoritative:

```text
documents.view
documents.view_all
documents.upload
documents.review
documents.archive
document_categories.manage
document_requests.manage
document_versions.view
workspace membership
```

`documentPolicy` continues to combine capability checks with row-level workspace access.

A UI control being hidden is never authorization.

Removal from a case workspace must remove document access immediately unless an existing explicit organization-wide capability such as `documents.view_all` applies.

Missing/unknown roles fail closed.

---

## 9. Existence concealment

The Phase 03–05 safe-object-access rule applies to documents.

Where the API can reasonably conceal object existence, inaccessible resources should behave like not-found resources rather than exposing whether a hidden document, version, request, category, or case exists.

In particular, direct access by guessed `documentId` or `versionId` must not become a document oracle.

This rule applies to metadata reads and downloads.

---

## 10. Document lifecycle

Phase 06 preserves the existing `CaseDocument` status semantics.

The implementation must inspect the current enum before coding and must not invent replacement states in Angular.

At minimum, existing workflows around these concepts must remain intact:

```text
uploaded
accepted
needs_replacement
rejected
archived
```

where present in the current constants/domain.

Review state remains server-controlled.

Archived documents remain historical records rather than being physically deleted as normal UI behavior.

---

## 11. Review semantics

Staff review remains an explicit action.

Review decisions must preserve existing rules, including required actor/review timestamps and client-visible reasons for decisions such as replacement-needed or rejection where current domain rules require them.

Angular must distinguish:

```text
client-visible review comment
internal review comment
```

and the API must never accidentally expose internal review comments to client-facing surfaces.

Phase 06 does not merge those two fields.

---

## 12. Versioning decision

`DocumentVersion` remains the authoritative immutable/history mechanism for file replacements.

Replacing a document file creates the next version using the existing guarded service rather than mutating historical file metadata in place.

The existing optimistic-concurrency/version-conflict protection remains mandatory.

Angular must surface a controlled conflict when another staff action wins a replacement race rather than reporting a generic success.

Version history is readable only with the existing version capability and case access.

---

## 13. Category management

`DocumentCategory` remains the only case document-category hierarchy.

Phase 06 exposes existing category operations through the canonical staff API:

- list active categories;
- initialize/provision defaults where needed;
- create custom category;
- update category;
- reorder categories;
- disable category;
- reactivate category.

Category mutations must preserve current uniqueness/order/index invariants.

Phase 06 must not infer evidence-satisfaction state from `DocumentCategory.required`; evidence semantics remain owned by Phase 05 `EvidenceRequirement`.

---

## 14. Document requests

`DocumentRequest` remains the client collection-request object.

Phase 06 staff workflows must support the current operational behavior:

- create request;
- select an eligible client workspace member;
- choose category;
- title/instructions;
- optional due date;
- update request metadata allowed by current service;
- cancel request;
- see fulfillment state and linked document.

The API must validate that `requestedFrom` is an eligible client workspace member of the same case/workspace.

A document request is not an evidence requirement. Phase 05 evidence may link to it, but the objects retain separate lifecycles.

---

## 15. Downloads

Downloads remain backend-authorized streaming operations.

The canonical API must reuse `documentDownloadService` or equivalent authoritative logic so download authorization and `DocumentAccessLog` behavior are identical to legacy staff behavior.

A successful download response must preserve safe response headers, including appropriate forms of:

```text
Content-Disposition
Content-Type
X-Content-Type-Options: nosniff
Cache-Control: private, no-store
Content-Security-Policy: sandbox
```

Do not encode file bytes inside normal JSON DTOs.

Do not expose private storage URLs.

Current-version and historical-version downloads must both be audited.

---

## 16. Access history

`DocumentAccessLog` remains the download/access audit authority.

Phase 06 may expose bounded staff access history where it is operationally useful and authorized.

If exposed, return an intentional DTO with only fields such as actor display information, action, timestamp, and safe version/document context.

Do not expose IP/security metadata broadly unless existing permissions/product requirements justify it.

Access-log reads are not required to block completion if the current model/policy intentionally treats them as administrative-only, but downloads themselves must continue logging.

---

## 17. Canonical document service boundary

Phase 06 should not rewrite working document services into one giant new service.

The preferred design is a thin but meaningful canonical orchestration layer that composes the existing specialized services where the `/api/v1/staff` transport needs common loading, DTO mapping, or transaction/cleanup behavior.

A service such as:

```text
server/services/staffDocumentManagement.js
```

may be introduced if justified.

It may own operations such as:

```text
loadAuthorizedDocumentCenter
loadAuthorizedDocumentDetail
mapDocumentCenterDto
mapDocumentDetailDto
resolveUploadContext
resolveVersionUploadContext
```

but upload/review/request/download/category domain rules should continue to live in the existing specialized services unless an extraction demonstrably removes duplication.

---

## 18. Canonical API

The staff contract lives under:

```text
/api/v1/staff
```

Recommended endpoints, adapted to repository route conventions:

```text
GET    /api/v1/staff/cases/:caseId/documents
GET    /api/v1/staff/documents/:documentId

POST   /api/v1/staff/cases/:caseId/documents
POST   /api/v1/staff/documents/:documentId/versions
PATCH  /api/v1/staff/documents/:documentId/review
PATCH  /api/v1/staff/documents/:documentId/category
POST   /api/v1/staff/documents/:documentId/archive

GET    /api/v1/staff/documents/:documentId/download
GET    /api/v1/staff/documents/:documentId/versions/:versionId/download

POST   /api/v1/staff/cases/:caseId/document-categories/initialize
POST   /api/v1/staff/cases/:caseId/document-categories
PATCH  /api/v1/staff/document-categories/:categoryId
POST   /api/v1/staff/document-categories/:categoryId/disable
POST   /api/v1/staff/document-categories/:categoryId/reactivate
POST   /api/v1/staff/cases/:caseId/document-categories/reorder

POST   /api/v1/staff/cases/:caseId/document-requests
PATCH  /api/v1/staff/document-requests/:requestId
POST   /api/v1/staff/document-requests/:requestId/cancel
```

The exact HTTP verbs may follow current API conventions. Do not create hard-delete endpoints simply for CRUD symmetry.

---

## 19. DTO policy

Normal document metadata endpoints return explicit DTOs.

A case document-center response may contain bounded sections such as:

```text
case
categories
documents
requests
clientMembers
capabilities
```

A document summary may expose intentional fields such as:

```text
id
displayName
originalName
category
status
visibility
mimeType
extension
size
scanStatus
uploadedBy
uploadedAt
reviewedBy
reviewedAt
clientVisibleReviewComment
internalReviewComment   # staff endpoint only
currentVersionNumber
versionCount
documentRequestId
createdAt
updatedAt
```

Do not expose:

```text
storageKey
private path
temporary path
raw uploader user documents
password/token/session fields
scanner internals not needed by the UI
raw Mongoose documents
```

---

## 20. Angular document center

Phase 06 adds a real `Documents` surface inside the Angular case workspace.

Required staff UX:

- category-grouped or category-filtered documents;
- status indicators;
- uploader and upload date;
- file size/type;
- document request state;
- upload action when authorized;
- request-document action when authorized;
- review action when authorized;
- move category when authorized;
- archive action when authorized;
- open document detail;
- download current file;
- loading/empty/error/retry states;
- responsive layout;
- accessible controls and status text.

Do not fake browser previews for unsupported file types.

A preview feature is optional only if it can be implemented safely through the same authorization/audit boundary without public URLs.

---

## 21. Angular document detail

Document detail should expose:

- safe metadata;
- current status;
- category;
- upload actor/type;
- scan status;
- review information;
- current-version download;
- version history if authorized;
- replacement-version upload if authorized;
- review controls if authorized;
- category move;
- archive action;
- linked document request;
- related evidence requirements where Phase 05 already provides a safe bounded linkage path.

Do not duplicate evidence business logic inside Documents.

---

## 22. Angular uploads

Angular upload UX must use real multipart uploads.

At minimum:

- one file per request unless the backend deliberately supports safe batching;
- client-side size/extension hints for UX only;
- server remains authoritative;
- visible progress may be added if the existing Angular HTTP stack supports it cleanly;
- disable duplicate submission while active;
- controlled handling of 400/403/404/409/413/415/500-style failures as applicable;
- never claim success until the backend returns success;
- refresh document metadata after success.

Client-side validation must never replace backend validation.

---

## 23. Evidence integration

Phase 05 evidence requirements may link documents.

Phase 06 must preserve those links when reviewing, moving category, replacing a version, or archiving a document.

Archiving a document must not silently delete evidence-link records unless the existing Phase 05 architecture explicitly requires it.

Evidence readiness calculations must continue treating document status according to Phase 05 rules.

The Documents UI may show “used by N evidence requirements” or safe links if the API can produce this without widening access.

---

## 24. Client portal compatibility

The existing client document upload/request flows remain operational during Phase 06.

Staff API migration must not change client-facing contracts accidentally.

Dual-writer ownership established by the secure-document architecture remains respected: client and employee flows may write the same domain records through controlled, non-conflicting fields/services.

Do not migrate the client portal to Angular in Phase 06.

---

## 25. Legacy EJS compatibility

The EJS document center remains available during Phase 06.

Where Phase 06 extracts shared helpers/services, EJS must continue using the same domain behavior.

Do not retire `/admin/...documents...` presentation routes in this phase.

Legacy retirement belongs to the later retirement phase after Angular parity and production observation.

---

## 26. Case activity and audit

Preserve existing audit/activity semantics for document actions.

Candidate case activity events include current equivalents of:

```text
document_uploaded
document_version_added
document_reviewed
document_category_changed
document_archived
document_request_created
document_request_updated
document_request_cancelled
```

Do not store file bytes, storage keys, private paths, or unnecessarily large comments in activity metadata.

Downloads continue through `DocumentAccessLog` rather than bloating `CaseActivity` with every access event.

---

## 27. Error semantics

Document APIs must distinguish useful operational failures without leaking hidden resource existence.

Use the established API error envelope and appropriate semantics for cases such as:

```text
400 validation error
401 unauthenticated
403 action forbidden when revealing the parent context is already safe
404 malformed/nonexistent/inaccessible hidden resource
409 optimistic concurrency/version conflict
413 file too large where middleware exposes it safely
415 unsupported or mismatched media type where appropriate
500 unexpected failure
```

The UI must render safe messages without exposing stack traces, storage paths, or raw validation internals.

---

## 28. OpenAPI

All canonical document metadata/mutation endpoints must be represented in:

```text
server/openapi/v1.yaml
```

Document-download routes should be documented as binary responses with relevant content semantics.

Multipart upload endpoints must be documented as `multipart/form-data` with explicit file and metadata fields.

Do not model binary file content as base64 JSON.

---

## 29. Testing requirements

Phase 06 requires comprehensive automated coverage.

### Authorization

- authorized case member can view document center;
- unauthorized/non-member cannot view;
- `documents.view_all` behavior matches existing policy;
- removed workspace member loses access;
- guessed document/version/request/category IDs do not widen access;
- each mutation requires its correct capability.

### Upload

- valid employee upload succeeds;
- invalid extension/type rejected;
- magic-byte mismatch rejected;
- oversize file rejected;
- invalid case/category/request relationship rejected;
- temporary files cleaned on validation/authorization failure;
- storage key never comes from browser input;
- successful upload creates expected document/version state.

### Versioning

- valid replacement creates next version;
- old version remains downloadable when authorized;
- concurrent replacement conflict is controlled;
- cross-case/version mismatch rejected;
- temporary file cleanup occurs after failure.

### Review

- valid acceptance works;
- replacement/rejection rules enforce required comments where current domain requires;
- unauthorized review denied;
- internal/client-visible comments remain separate;
- category move validates same-case category;
- archive preserves history.

### Requests/categories

- default provisioning idempotent;
- custom category create/update/reorder/disable/reactivate works;
- invalid order/duplicate relationships fail safely;
- request recipient must be eligible same-workspace client member;
- request create/update/cancel lifecycle works;
- fulfilled request linkage remains consistent.

### Downloads/audit

- authorized current-version download works;
- authorized historical-version download works;
- inaccessible download denied/concealed;
- archived/unavailable behavior follows current policy;
- safe response headers present;
- `DocumentAccessLog` written;
- no storage key/private path leaks in JSON.

### Angular

Test document-center loading, category grouping/filtering, empty/error states, upload success/failure, request workflow, review workflow, detail/version history, archive confirmation, capability-driven controls, and binary download initiation.

---

## 30. Security boundaries preserved

Phase 06 must preserve all previous controls, including:

```text
EmployeeSession authentication
mustChangePassword enforcement
trusted-origin / CSRF strategy
capability checks
workspace row-level policy
case/resource existence concealment
SecurityEvent conventions
explicit DTO mapping
private document storage
magic-byte validation
honest scanner state
optimistic concurrency
DocumentAccessLog
```

No broad CORS.

No localStorage bearer tokens.

No private file URLs.

No public-directory storage fallback in production.

---

## 31. Migration and indexes

Phase 06 should not require a major data migration because it reuses the existing document domain.

If implementation uncovers missing schema/index support for canonical query patterns, changes must be additive, documented, dry-run safe, and integrated with existing migration/index tooling.

Do not execute production migrations or index builds during implementation.

Avoid adding indexes merely because a field exists; justify them against real API queries.

---

## 32. Out of scope

Phase 06 does not include:

- cloud-storage migration;
- public CDN document delivery;
- client portal Angular migration;
- OCR/extraction/classification pipeline;
- AI document review;
- AI evidence sufficiency scoring;
- PDF editing/merging/annotation suite;
- filing-packet composition;
- petition generation;
- smart forms;
- full communications module;
- calendar/reminder engine;
- legacy EJS retirement;
- production deployment;
- production migration/index execution.

---

## 33. Consequences

### Positive

- Angular gains production-grade document operations without rebuilding secure storage.
- Staff and legacy EJS can converge on the same document services.
- Evidence requirements use the same authoritative files.
- Access logging, versioning, validation, and review controls remain intact.
- Later petition/filing phases can consume a stable canonical document API.

### Costs

- Multipart uploads and binary downloads require careful API handling beyond ordinary JSON endpoints.
- EJS and Angular presentation surfaces coexist temporarily.
- Existing service boundaries may need modest extraction to avoid duplicated route orchestration.

These costs are preferable to a second document system or weakening existing security.

---

## 34. Rejected alternatives

### A. Create a new Angular-specific document backend

Rejected because it would duplicate storage, validation, review, audit, and authorization logic.

### B. Expose `storageKey` and let Angular build download URLs

Rejected because it bypasses policy and access logging and leaks internal storage identity.

### C. Store uploaded files in the public Next.js/Express static directory

Rejected because case documents are private records.

### D. Send file bytes as base64 JSON

Rejected because it increases memory/transport overhead and bypasses normal streaming/download semantics.

### E. Auto-retire EJS documents as soon as Angular renders them

Rejected because migration requires parity and production observation before presentation retirement.

### F. Merge DocumentRequest and EvidenceRequirement

Rejected because request/collection state and evidence sufficiency remain different business concepts.

---

## 35. Implementation gate

Before substantive Phase 06 code changes:

1. verify branch `architecture/angular-enterprise-platform` is clean and current;
2. verify Phase 05 commit `f396cd675356c56ee00f543ba228fefd225a79d2` is in ancestry;
3. verify the final Phase 05 GitHub Actions run is green;
4. if Phase 05 CI is red, fix Phase 05 with a new commit before implementing Phase 06;
5. do not rebase/reset/amend/force-push completed history.

Documentation commits for Phase 06 may exist before the Phase 05 CI gate closes, but implementation work must respect this gate.

---

## 36. Completion criteria

Phase 06 is complete only when:

- this ADR is implemented consistently;
- no second document/file domain is created;
- `/api/v1/staff` exposes authorized document-center/detail operations;
- category and request staff workflows are canonicalized;
- employee upload and replacement-version upload are secure multipart endpoints;
- review/category/archive mutations reuse authoritative services;
- current and historical downloads stream through backend policy and audit;
- storage keys/private paths never appear in DTOs;
- Phase 05 evidence links remain intact;
- Angular case Documents workspace and document detail are operational;
- OpenAPI documents JSON, multipart, and binary contracts correctly;
- root/server/Angular tests pass;
- lint/typecheck/root build/case-management build/admin-console build pass;
- no production deploy/migration/index execution occurs;
- remote GitHub Actions for the final Phase 06 commit are green.

After completion, stop and report before beginning Phase 07.
