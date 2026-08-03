# 05 — Secure Document Management

## Purpose

Provide a private, ordered, auditable document center for immigration case evidence, drafting, USCIS forms, recommendation letters, references, and filing packages.

## Dependencies

- Cases and workspaces
- Membership authorization
- Client authentication
- Admin case operations
- Storage architecture decision

## Critical rule

Do not reuse `server/public/uploads` or any publicly served directory for client documents.

## Storage provider interface

Required operations:

- `put(stream, metadata)`
- `getStream(storageKey)`
- `getMetadata(storageKey)`
- `delete(storageKey)`
- `quarantine(storageKey)`
- optional `createSignedDownload(storageKey, expiresIn)`

Providers:

- Local private storage for development
- External object storage for production

Production provider selection is deployment-dependent and should not be guessed.

## Data models

### DocumentCategory

Fields:

- `case`
- `name`
- `slug`
- `description`
- `order`
- `visibility`
- `allowedUploaderTypes`
- `required`
- `active`
- timestamps

### CaseDocument

Fields:

- `case`
- `workspace`
- `category`
- `uploadedByType`
- `uploadedByClient`
- `uploadedByAdmin`
- `originalName`
- `displayName`
- `storageKey`
- `mimeType`
- `detectedMimeType`
- `size`
- `checksum`
- `status`
- `visibility`
- `currentVersion`
- `reviewedBy`
- `reviewedAt`
- `clientVisibleReviewComment`
- `internalReviewComment`
- `uploadedAt`
- `archivedAt`
- timestamps

### DocumentVersion

Fields:

- `document`
- `versionNumber`
- `storageKey`
- `originalName`
- `mimeType`
- `size`
- `checksum`
- `uploadedByType`
- `uploadedByClient`
- `uploadedByAdmin`
- `changeNote`
- timestamps

### DocumentRequest

Fields:

- `case`
- `category`
- `title`
- `instructions`
- `requestedFrom`
- `requestedBy`
- `dueDate`
- `status`
- `fulfilledByDocument`
- `clientVisibleComment`
- `internalComment`
- timestamps

## Default category order

1. Identity and civil documents
2. Immigration history
3. Education and academic records
4. Employment and professional experience
5. Proposed endeavor or case strategy
6. Awards, memberships, and recognition
7. Publications, citations, judging, and media
8. Reference materials
9. Recommendation letters
10. Expert opinion letters
11. Business plan or professional plan
12. USCIS forms
13. Petition letter
14. Exhibits and supporting evidence
15. RFE or NOID materials
16. Filing package
17. USCIS receipts and notices
18. Final decisions
19. Other

Managers may rename, reorder, add, or disable categories by case.

## Statuses

- `uploaded`
- `quarantined`
- `pending_review`
- `accepted`
- `needs_replacement`
- `rejected`
- `superseded`
- `archived`

## Upload validation

- File-size limits
- Extension allowlist
- MIME validation
- Signature/magic-byte validation where practical
- Random storage keys
- Filename sanitization
- Checksum
- Duplicate detection
- Malware scanning integration point
- Quarantine before release when scanner exists
- Rate limiting
- Audit logging

Do not render HTML, SVG, or script-capable files inline.

## Authorization

Clients:

- View client-visible categories and documents in their case.
- Upload only where category and request allow.
- Download only after case membership validation.

Employees:

- Require global document capability and workspace membership.
- Review, move, categorize, replace, version, and archive according to capability.

Suggested capabilities:

- `documents.view`
- `documents.upload`
- `documents.review`
- `document_categories.manage`
- `document_requests.manage`

## Routes

Client:

- `GET /portal/cases/:caseId/documents`
- `POST /portal/cases/:caseId/documents`
- `GET /portal/documents/:id/download`
- `POST /portal/document-requests/:id/upload`

Admin:

- `GET /admin/cases/:caseId/documents`
- `POST /admin/cases/:caseId/document-requests`
- `POST /admin/documents/:id/review`
- `POST /admin/documents/:id/category`
- `POST /admin/documents/:id/version`
- `GET /admin/documents/:id/download`
- `POST /admin/cases/:caseId/categories/reorder`

## Tests

- Authorized upload succeeds.
- Unauthorized upload denied.
- Cross-case access denied.
- Oversized file rejected.
- MIME mismatch rejected.
- Private download requires membership.
- Version history preserved.
- Replacement request visible to client.
- Internal review comment hidden from client.
- Category reorder is stable.
- Removed member cannot download.

## Acceptance criteria

- No client file is publicly addressable.
- Every download checks current authorization.
- Categories are ordered and configurable.
- Review and replacement state is explicit.
- Version history is immutable.
- Client-visible and internal comments are separated.
- Storage provider can be replaced without changing controllers.

## Claude Code handoff

Implement the private storage abstraction, categories, document requests, uploads, downloads, review workflow, replacements, and versions. Stop before adding chat attachments or production object storage credentials.
