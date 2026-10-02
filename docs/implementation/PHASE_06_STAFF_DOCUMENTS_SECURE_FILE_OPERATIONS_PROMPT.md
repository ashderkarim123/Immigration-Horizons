# Immigration Horizons — Phase 06: Staff Documents & Secure File Operations

**Execution branch:** `architecture/angular-enterprise-platform`  
**Phase 05 implementation baseline:** `f396cd675356c56ee00f543ba228fefd225a79d2`  
**Architecture reference:** `docs/architecture/ADR-019-canonical-staff-documents-and-secure-file-operations.md`

## 1. Purpose

Implement the next genuine enterprise capability after Phase 05: production-grade staff document management in the Angular case-management application using the existing secure document domain.

Do **not** rebuild storage. Do **not** create a second document model. Do **not** weaken the current security controls.

The target is to expose the mature Express/EJS document functionality through the canonical `/api/v1/staff` API and provide equivalent Angular workflows inside the case workspace.

## 2. Implementation gate

Before substantive Phase 06 code changes, verify Phase 05 is truly closed.

Required checks:

```bash
git fetch origin --prune
git switch architecture/angular-enterprise-platform
git pull --ff-only origin architecture/angular-enterprise-platform

git status --short
git branch --show-current
git rev-parse HEAD
git log --graph --decorate --oneline -30
```

Phase 05 commit ancestry must include:

```text
f396cd675356c56ee00f543ba228fefd225a79d2
```

Then verify the final Phase 05 GitHub Actions run for that implementation is green.

If CI is not green, stop Phase 06 implementation and fix Phase 05 in a new commit first.

Do not reset, amend, rebase, squash, or force-push completed history.

## 3. Hard safety rules

- Work only on `architecture/angular-enterprise-platform`.
- Do not deploy production.
- Do not run production database migrations.
- Do not run production index builds.
- Do not move private documents into any public/static directory.
- Do not expose `storageKey`, private paths, temp paths, or server storage roots.
- Do not disable CSRF/trusted-origin protections for multipart convenience.
- Do not bypass dependency/test failures with `--force`, `--legacy-peer-deps`, skipped tests, or weakened assertions.
- Do not retire the legacy EJS document center in this phase.
- Do not migrate the client portal to Angular.

## 4. Required reading

Read before coding:

```text
CLAUDE.md
AGENTS.md

.claude/DESIGN_SYSTEM.md
.claude/API_ARCHITECTURE.md
.claude/DATABASE.md
.claude/TESTING.md
.claude/SECURITY.md

docs/architecture/ADR-004-secure-document-storage.md
docs/architecture/ADR-012-security-privacy-and-audit.md
docs/architecture/ADR-014-migrations-and-retention.md
docs/architecture/ADR-015-angular-enterprise-platform.md
docs/architecture/ADR-016-authentication-boundaries.md
docs/architecture/ADR-018-evidence-checklists-and-requirements.md
docs/architecture/ADR-019-canonical-staff-documents-and-secure-file-operations.md

docs/implementation/ANGULAR_ENTERPRISE_PLATFORM_ROADMAP.md
docs/implementation/PHASE_05_EVIDENCE_CHECKLIST_PROMPT.md
```

Inspect the current implementation, especially:

```text
server/models/CaseDocument.js
server/models/DocumentVersion.js
server/models/DocumentCategory.js
server/models/DocumentRequest.js
server/models/DocumentAccessLog.js
server/utils/documentConstants.js
server/utils/permissions.js
server/services/documentPolicy.js
server/services/documentCategoryService.js
server/services/documentRequestService.js
server/services/documentUploadService.js
server/services/documentReviewService.js
server/services/documentDownloadService.js
server/services/documentValidation.js
server/services/casePolicy.js
server/services/caseManagement.js
server/routes/admin/documents.js
server/routes/api/v1/staff/index.js
server/openapi/v1.yaml
server/middleware/csrf.js
scripts/migrate.ts
scripts/createIndexes.ts
enterprise-ui/projects/case-management/src/app/features/cases/
enterprise-ui/projects/case-management/src/app/features/evidence/
enterprise-ui/projects/case-management/src/app/core/api/
enterprise-ui/projects/case-management/src/app/shared/
```

Code is authoritative if an old document disagrees with current implementation.

## 5. Product outcome

At Phase 06 completion, an authorized employee should be able to operate the full staff document workflow from Angular.

The case workspace must support:

```text
Case
└── Documents
    ├── Categories
    ├── Document Requests
    ├── Uploaded Documents
    ├── Review
    ├── Version History
    ├── Replacement Upload
    ├── Archive
    └── Secure Download
```

Staff should be able to:

- view documents for an accessible case;
- view categories;
- upload a document;
- link upload to a valid document request;
- create/update/cancel document requests;
- initialize/create/update/reorder/disable/reactivate categories where authorized;
- open document detail;
- review a document;
- accept/reject/request replacement according to current domain rules;
- move a document to another same-case category;
- upload a replacement version;
- view version history when authorized;
- archive a document;
- securely download current and historical versions;
- navigate between evidence requirements and documents without duplicating evidence logic.

All authorization remains server-side.

## 6. Preserve the secure document domain

Do not create alternative models such as:

```text
StaffDocument
AngularDocument
UploadedFile
EvidenceFile
```

Continue using:

```text
CaseDocument
DocumentVersion
DocumentCategory
DocumentRequest
DocumentAccessLog
```

These remain authoritative for file identity, storage, request lifecycle, versioning and download audit.

Phase 05 `EvidenceRequirement` must continue linking to these records rather than any new storage model.

## 7. Preserve existing services

The following services already own real business rules and should be reused:

```text
documentPolicy
documentCategoryService
documentRequestService
documentUploadService
documentReviewService
documentDownloadService
documentValidation
```

Do not rewrite them into Angular-specific equivalents.

If canonical API transport needs shared context/DTO orchestration, create a meaningful service such as:

```text
server/services/staffDocumentManagement.js
```

but keep specialized domain rules in their existing services unless refactoring clearly removes duplication.

## 8. Canonical API routes

Add staff document routes under `/api/v1/staff`.

Recommended structure:

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

Adapt verb/path details only when repository API conventions make a different shape materially cleaner.

Do not add hard-delete endpoints for documents or requests just for CRUD symmetry.

## 9. Authorization

Reuse current capabilities and `documentPolicy` semantics:

```text
documents.view
documents.view_all
documents.upload
documents.review
documents.archive
document_categories.manage
document_requests.manage
document_versions.view
```

Case/workspace membership remains part of authorization unless explicit `view_all` behavior applies.

Required behavior:

- active case member + appropriate capability can perform allowed action;
- removed workspace member loses access immediately;
- missing/unknown role fails closed;
- guessing a document/version/category/request ID never bypasses case access;
- Angular visibility is UX only, never authorization.

Preserve existence concealment where appropriate.

## 10. Document-center DTO

Create explicit staff DTOs. Do not return raw Mongoose objects.

A case document center can return bounded sections such as:

```text
case
categories
documents
requests
clientMembers
capabilities
```

Suggested document summary fields:

```text
id
displayName
originalName
category: { id, name }
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
internalReviewComment
versionCount
currentVersionNumber
documentRequestId
createdAt
updatedAt
```

Never expose:

```text
storageKey
privatePath
tempPath
storageRoot
password
passwordHash
token
tokenHash
session secrets
raw AdminUser
raw ClientUser
```

Add recursive DTO-safety tests.

## 11. Multipart upload implementation

Employee upload and replacement upload must use `multipart/form-data`.

Required server behavior:

- one uploaded file per request unless existing service safely supports more;
- server-generated storage key;
- max-size enforcement;
- extension allowlist;
- real MIME/magic-byte validation;
- declared MIME cannot override detected content;
- invalid temp file is deleted;
- authorization failure cleans temp file;
- relationship validation failure cleans temp file;
- no invalid file enters durable private storage;
- uploader actor is recorded;
- case/workspace/category/request relationships are validated server-side.

Do not trust Angular file metadata.

## 12. CSRF / trusted-origin handling for multipart

Do not weaken the current API security model.

Inspect the Phase 02/03 canonical staff mutation security implementation and follow it.

If canonical staff APIs use trusted-origin verification, apply it to multipart routes too.

If a CSRF token/header is part of the current API design, preserve it.

Prefer rejecting unauthorized/cross-origin uploads before durable storage operations.

If middleware ordering means the multipart body must be parsed first, ensure the temp file is cleaned on rejection.

Add negative tests specifically for multipart mutation protection.

## 13. Upload API behavior

Case upload endpoint should accept only intentional metadata, for example:

```text
file
categoryId
documentRequestId? 
displayName? if current domain supports it
visibility? only if current domain permits employee choice
```

The backend resolves:

```text
case
workspace
uploader actor
storage key
actual MIME
extension
checksum
scan status
version state
```

Do not let Angular submit arbitrary uploader IDs, workspace IDs, checksum, storage key, reviewedBy, reviewedAt, or status.

## 14. Version upload

Replacement-version upload must reuse the existing guarded versioning service.

Required behavior:

- document must exist and be accessible;
- actor must have upload authority;
- file must pass full validation;
- next version number is server-controlled;
- currentVersion updates consistently;
- historical versions remain immutable;
- optimistic concurrency conflict returns a controlled `409` or repository-standard conflict response;
- failed replacement cleans temp file.

Angular must show a clear refresh/retry message for version conflict.

## 15. Review workflow

Expose current review semantics through the API.

Angular must support whatever current `DOCUMENT_STATUSES` and review decisions actually allow.

Preserve rules such as:

```text
accepted -> reviewedBy/reviewedAt required
needs_replacement -> review actor/time + client-visible reason required
rejected -> review actor/time + client-visible reason required
```

Do not rely on Angular to enforce these rules.

Keep internal and client-visible review comments separate in both form controls and DTOs.

## 16. Category move

Document category change must validate:

- document access;
- review/manage capability currently required by policy;
- category exists;
- category belongs to the same case;
- category is valid/active according to current service rules.

Do not permit arbitrary cross-case category movement.

## 17. Archive

Archive remains a history-preserving action, not physical deletion.

Required behavior:

- server capability + row authorization;
- current domain archive state/timestamp preserved;
- file remains in private history according to retention rules;
- evidence links are not silently deleted;
- archived document behavior in downloads/readiness follows current ADR/service rules.

Angular must confirm archive action.

## 18. Secure downloads

Current and historical downloads must stream through the backend.

Reuse `documentDownloadService`.

Required response headers should preserve current protections, including appropriate forms of:

```text
Content-Disposition
Content-Type
X-Content-Type-Options: nosniff
Cache-Control: private, no-store
Content-Security-Policy: sandbox
```

Every successful access/download should keep `DocumentAccessLog` behavior intact.

Do not return private storage URLs.

Do not encode file bytes as base64 JSON.

## 19. Document categories

Expose current category management to Angular when authorized.

Required actions:

```text
initialize default categories
create custom category
update category
reorder categories
disable category
reactivate category
```

Preserve existing uniqueness/order/active semantics and indexes.

`DocumentCategory.required` is not a replacement for Phase 05 evidence requirement importance/status.

## 20. Document requests

Expose request workflows to Angular:

```text
create
update due date/instructions/client-visible comment as current service permits
cancel
view fulfillment state
view linked fulfilled document
```

Creation must validate:

- case/workspace;
- category belongs to same case;
- requestedFrom is active/invited client workspace member as current policy allows;
- requestedBy comes from authenticated staff actor;
- due date format/range as current service validates.

Do not accept arbitrary `ClientUser` IDs in place of `WorkspaceMember`.

## 21. Angular Documents workspace

Add a `Documents` tab/surface to the real case workspace.

Required states:

```text
loading
loaded
empty
retryable error
unauthorized/not-found handling
```

Required UX:

- categories as navigation/filter/grouping;
- document rows/cards with status, type, size, uploader, date;
- open requests section;
- upload button when authorized;
- request-document button when authorized;
- category-management controls when authorized;
- status badges with accessible text;
- direct document detail navigation;
- responsive desktop/mobile layout.

Reuse existing design system/shared components.

Do not add Material/PrimeNG/Bootstrap/new CSS framework without explicit approval.

## 22. Angular Document Detail

Create a document detail surface with:

```text
safe metadata
category
status
scan status
uploader
upload date
review details
current download
version history
replacement upload
review controls
category change
archive
linked request
related evidence references where safely available
```

The UI must not render raw storage metadata.

Version history should show safe fields such as version number, original/display filename where appropriate, upload actor, date, change note, size/type, and download action.

## 23. Angular upload UX

For new upload and replacement upload:

- real file chooser;
- show permitted size/types from API/config if available, otherwise use UX constants synchronized with backend tests/docs;
- optional progress indicator if cleanly supported;
- prevent duplicate submission;
- show backend validation errors safely;
- refresh the document center/detail after success;
- never optimistically claim storage success.

Client validation is convenience only.

## 24. Angular request workflow

Provide a real request form/dialog/panel using server-provided eligible client members and categories.

Fields should mirror current service contract:

```text
category
requestedFrom
title
instructions
dueDate
```

Update/cancel controls must follow server capability results.

Do not fabricate client members or categories.

## 25. Angular review workflow

Authorized reviewers should be able to choose a supported review decision and enter the correct comments.

UX rules:

- clearly label client-visible feedback;
- clearly label internal notes;
- when backend requires client-visible reason, mark it required in UI too;
- still rely on backend enforcement;
- show conflict/validation errors without losing entered text where practical.

## 26. Evidence integration

Phase 05 evidence links must continue to function.

Document center/detail may show safe related evidence requirement references if Phase 05 service exposes them cleanly.

Required invariants:

- review does not delete evidence links;
- category move does not delete evidence links;
- replacement version does not change document identity and therefore preserves evidence links;
- archive does not silently delete links;
- evidence readiness continues using Phase 05 rules.

Do not implement evidence status changes inside the document UI unless calling the canonical evidence API deliberately.

## 27. Client portal compatibility

Do not break existing client:

- upload;
- request fulfillment;
- replacement flow;
- document visibility;
- review feedback.

Staff API changes must be additive.

If existing client and employee flows share services, preserve dual-writer ownership assumptions and test both actor types where touched.

## 28. Legacy admin compatibility

Keep the EJS document center working.

Where you refactor route orchestration into reusable helpers/services, add regression coverage to prove legacy admin behavior remains valid.

Do not redirect legacy routes to Angular yet.

Do not delete EJS templates/routes.

## 29. OpenAPI

Update:

```text
server/openapi/v1.yaml
```

Document:

- document-center JSON response;
- document-detail response;
- category/request mutation contracts;
- review/category/archive mutation contracts;
- multipart upload request bodies;
- multipart version upload;
- binary download responses;
- auth/error responses.

Use explicit schemas. Avoid broad `additionalProperties: true` shortcuts.

Do not model downloads as JSON.

## 30. Angular API types

Create explicit contract types, e.g.:

```text
DocumentCategorySummary
DocumentRequestSummary
CaseDocumentSummary
CaseDocumentDetail
DocumentVersionSummary
DocumentUploaderSummary
DocumentReviewerSummary
DocumentCenterResponse
DocumentDetailResponse
DocumentReviewRequest
DocumentRequestCreateRequest
DocumentRequestUpdateRequest
CategoryMutationRequest
```

New touched API code should not default to `any`.

## 31. Case activity / audit

Preserve current document activity events where services already emit them.

If canonical API exposes gaps, use existing activity/audit conventions for:

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

Downloads stay in `DocumentAccessLog` rather than generating noisy CaseActivity entries.

Never put storage keys/private paths/file bytes in activity metadata.

## 32. Error behavior

Use the standard API error envelope.

Test useful mappings such as:

```text
400 invalid metadata / validation
401 unauthenticated
403 forbidden action where safe
404 malformed/nonexistent/inaccessible concealed object
409 concurrent version conflict
413 file too large
415 unsupported or mismatched type where appropriate
500 unexpected failure
```

Do not expose stack traces, filesystem paths, storage roots, or scanner internals in API messages.

## 33. Index and migration review

This phase should mainly reuse existing schema/indexes.

Before changing indexes:

- inspect current model indexes;
- inspect actual new API query shapes;
- avoid duplicate/prefix-redundant indexes;
- update dry-run tooling only if justified.

Do not run production indexes.

No broad migration should be necessary. If one becomes necessary, it must be additive, idempotent, dry-run capable and documented before implementation.

## 34. Required server/integration tests

Add or extend tests covering at least:

### Document-center reads

- authorized member sees same-case categories/documents/requests;
- inaccessible case concealed;
- removed member loses access;
- `documents.view_all` behavior preserved;
- DTO never contains storage/private credential fields.

### Upload

- valid file succeeds;
- bad extension fails;
- MIME/signature mismatch fails;
- oversize fails;
- bad case/category relationship fails;
- bad request relationship fails;
- unauthorized upload fails;
- CSRF/trusted-origin failure fails;
- temp files cleaned after all failure classes;
- successful upload creates correct actor/version/request state.

### Version replacement

- valid replacement increments version;
- old version remains historical;
- cross-case/inaccessible attempt fails;
- conflict returns controlled result;
- temp cleanup on failed replacement.

### Review/category/archive

- accepted works;
- replacement/rejection required-comment rules work;
- unauthorized review fails;
- category must belong to case;
- archive retains history;
- evidence links remain valid after operations.

### Category management

- initialize idempotent;
- create/update works;
- reorder validates full allowed set/order rules;
- disable/reactivate works;
- unauthorized action fails.

### Document requests

- valid request create;
- invalid client member rejected;
- cross-workspace member rejected;
- update works;
- cancel works;
- fulfilled linkage remains intact;
- unauthorized request management fails.

### Downloads

- current download works for authorized staff;
- historical version download works;
- inaccessible current/version download concealed/denied per policy;
- safe headers present;
- access log written;
- response is binary stream, not JSON.

## 35. Required Angular tests

At minimum cover:

- document center loading;
- category grouping/filtering;
- empty state;
- retryable error;
- capability-driven upload/request/review/category/archive controls;
- upload validation/error/success UI;
- document detail;
- version history;
- replacement upload conflict/error/success;
- review form and required comments;
- archive confirmation;
- request create/update/cancel;
- secure download initiation;
- accessibility labels/status text;
- navigation between Documents and Evidence where implemented.

## 36. Manual QA

Manually verify with representative roles:

```text
manager/admin
specialist/reviewer
viewer/non-operational role
removed workspace member
```

Flows:

```text
login
open accessible case
Documents tab
upload valid file
attempt invalid file
create request
update request
review document
request replacement
upload replacement version
view version history
download current version
download old version
move category
archive document
verify evidence link still present
verify inaccessible case/document cannot be opened
refresh/deep-link browser routes
check mobile/responsive states
check browser console/network errors
```

Also verify the legacy EJS document center still works for the touched flows.

## 37. Local verification

Use Node 22.

Root:

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

Do not skip a failing suite.

## 38. Documentation deliverables

Phase 06 should end with:

```text
docs/architecture/ADR-019-canonical-staff-documents-and-secure-file-operations.md
docs/implementation/PHASE_06_STAFF_DOCUMENTS_SECURE_FILE_OPERATIONS_PROMPT.md
docs/implementation/PHASE_06_STAFF_DOCUMENTS_SECURE_FILE_OPERATIONS_REPORT.md
```

The report must record:

- starting SHA;
- ending SHA;
- API routes added;
- services reused/refactored;
- multipart/CSRF strategy;
- DTOs;
- Angular surfaces;
- tests;
- builds;
- migration/index impact;
- production impact (should be none during implementation);
- rollback notes;
- known limitations;
- final GitHub Actions run.

## 39. Git strategy

Do not amend/rebase/reset/force-push completed work.

Suggested commits:

```text
docs(phase-06): define canonical staff document architecture
feat(api): expose canonical staff document operations
feat(angular): add secure case document workspace
feat(documents): integrate evidence and version workflows
test(phase-06): cover secure document api and angular flows
docs(phase-06): record implementation and verification
```

Push only to:

```bash
git push origin architecture/angular-enterprise-platform
```

After push, verify GitHub Actions.

If CI is red, Phase 06 is not complete. Fix failures in a new commit. Do not rewrite history.

## 40. Out of scope

Do not expand Phase 06 into:

- cloud storage migration;
- OCR;
- document AI/classification;
- PDF editor/annotation suite;
- petition drafting;
- filing packet builder;
- smart forms;
- USCIS tracking;
- communications migration;
- full calendar;
- client portal Angular migration;
- EJS retirement;
- production deployment.

## 41. Completion gate

Phase 06 is complete only when all are true:

- Phase 05 baseline/CI is preserved;
- ADR-019 is followed;
- no duplicate document storage/model is created;
- canonical `/api/v1/staff` document center/detail exists;
- multipart employee upload works securely;
- replacement/version history works securely;
- review/category/archive operations work;
- categories and document requests are operational through canonical API;
- downloads stream through existing policy and write access audit;
- no storage key/private path leaks through DTOs;
- Phase 05 evidence links remain valid;
- Angular Documents workspace and detail are operational;
- legacy EJS document workflows remain functional;
- OpenAPI is updated;
- required automated tests pass;
- root lint/type/build/test pass;
- server test suite passes;
- Angular tests and both builds pass;
- `git diff --check` passes;
- no production migrations/indexes/deployments were run;
- final remote GitHub Actions run is GREEN.

Then STOP and report Phase 06 completion. Do not automatically begin Phase 07.
