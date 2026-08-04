# ADR-004 — Secure Document Storage

**Status:** Accepted
**Date:** 2026-08-04
**Module:** `05_DOCUMENT_MANAGEMENT.md` (Cycle 5)

## Context

Cycle 5 introduces a private, per-case document center: `DocumentCategory`,
`CaseDocument`, `DocumentVersion`, and `DocumentRequest`. Client immigration
files (identity documents, financial records, employment history) are
highly sensitive — the module's own critical rule forbids reusing
`server/public/uploads` (the existing `Media` library's storage, confirmed
via `server/app.js:49`'s `express.static(path.join(__dirname, 'public'))`
serving that entire tree with no auth check) or any other publicly served
directory.

This domain is also the first to require **both apps to read and write
actual files on disk**, not just MongoDB documents — a new kind of
cross-application coupling beyond anything ADR-002/ADR-003 had to solve.

## Decisions

### 1. Which application owns document mutations

Dual writer, same shape as ADR-003 (`ConsultationInteraction`), not
single-writer like ADR-002 (`ClientCase`): clients upload from the Next.js
portal against categories/requests; employees upload, review, categorize,
version, and archive from the Express admin. Enforced by a **field-ownership
boundary** (§9 below), not by forcing one app to proxy writes through the
other.

### 2. How Next.js and Express access document collections

Unchanged from every prior ADR: same `MONGODB_URI`, two independent
Mongoose connections, no new connection-sharing mechanism.

### 3. How the storage abstraction is shared or mirrored

**Not shared as runtime code** — continuing ADR-001's "no forced shared
package" decision. Each app gets its own `LocalPrivateStorageProvider`
implementing the same documented interface
(`put`/`getStream`/`getMetadata`/`delete`/`quarantine`/`moveFromQuarantine`,
optional `createSignedDownload`):

- `server/services/storage/localPrivateStorageProvider.js`
- `src/lib/documents/local-private-storage-provider.ts`

Unlike every previous mirrored-model pair, these two also share a
**physical filesystem contract**, not just a schema contract: both must
resolve the *same* `storageKey` to the *same* file on disk, because a file
an employee uploads must be downloadable by a client and vice versa. This
only works because both apps' Node processes run on the same host today
(single VPS, per `DEPLOYMENT.md`) — see §22 for the multi-instance
limitation this creates.

### 4. Explicit MongoDB collection names

```text
DocumentCategory -> document_categories
CaseDocument     -> case_documents
DocumentVersion  -> document_versions
DocumentRequest  -> document_requests
DocumentAccessLog -> document_access_logs
```

Continuing ADR-002 §3's explicit-third-argument convention.

### 5. Cross-application schema-contract strategy

`docs/architecture/document-schema-contract.json`, loaded by
`server/test/document-schema-contract.test.js` and
`test/document-schema-contract.test.ts` — same JSON-fixture mechanism as
ADR-002 §4 / ADR-003 §5, extended with this domain's collection names,
enums, and required-field sets. It additionally asserts the **storage-key
format** (§7) and **directory layout** (§8) both apps' providers agree on,
since drift there is a functional bug (a file written by one app becomes
unreadable by the other), not just a rendering inconsistency.

### 6. Local private-storage location

New `PRIVATE_DOCUMENT_ROOT` environment variable — must be an **absolute
path**, outside `server/public/` and outside Next.js `public/`.

**Development default** (only when unset): both apps independently compute
`path.join(os.tmpdir(), 'immigration-horizons-private-documents')`.
`os.tmpdir()` is a host-wide, cwd-independent path, so both apps — which
have different `process.cwd()` values (`server/` vs. repo root) — arrive at
the *identical* absolute path without needing to hardcode a repo-relative
traversal (`../..`) that would be fragile if either app's entry point ever
moved. This also guarantees the dev default can never accidentally land
inside a publicly served directory.

**Production:** `PRIVATE_DOCUMENT_ROOT` must be set explicitly. Each app's
storage-provider module rejects startup (throws before the first request is
served) if, in production (`NODE_ENV=production`), the variable is unset,
or if its resolved path lies inside a known static-serving path (`<app
root>/public`, `server/public`) — implementing module requirements #2–#4
under "Environment configuration".

### 7. Storage-key format

A storage key is `crypto.randomBytes(24).toString('hex')` (48 hex
characters) — opaque, unguessable, carries no information about the
original filename, case, or category. The **filename is never used as a
storage key** anywhere in the pipeline.

### 8. Directory layout / temporary upload location

```text
<PRIVATE_DOCUMENT_ROOT>/
  temp/<uploadId>              # streaming target during validation
  quarantine/<kk>/<kk>/<key>   # infected / scanner-error / scanner-pending
  active/<kk>/<kk>/<key>       # normal, downloadable objects
```

`<kk>` is the storage key's first two, then next two hex characters
(2-level sharding — e.g. key `ab12cd...` → `active/ab/12/ab12cd...`) so no
single directory ever holds more than ~65,536² files at scale; a purely
cosmetic scalability measure, not a security boundary (the key itself is
already unguessable). `uploadId` for temp files is a separate random token,
never reused as the final storage key, so a partially-written temp file can
never collide with or be confused for a committed object.

### 9. File-validation sequence

Exactly the 25-step sequence in module doc §16 (authenticate → CSRF →
rate-limit → resolve case/workspace → membership+capability → resolve
category/request → category active + uploadable-by-actor-type → file-count
and size limits → sanitize filename for **display only** → random storage
key → stream to temp while computing SHA-256 → detect signature → compare
extension/declared-MIME/detected-MIME → reject mismatches → run scanner →
move to active or quarantine → create records → update request → audit →
notify → clean up temp).

**Signature detection:** the `file-type` package (added to both apps this
cycle, v22 — pure ESM; `server/`'s CommonJS upload service consumes it via
a dynamic `import()`, a standard, well-established interop pattern, chosen
over pinning an old CJS-only major version so both apps run the identical,
currently-maintained release rather than diverging by several years on a
security-relevant dependency). `fileTypeFromBuffer()` reads the first
validated bytes; when it returns nothing (a type it doesn't recognize, or a
non-binary plain-text-like file), the upload is rejected — the pipeline
treats "unknown magic bytes" as unsafe by default, not as "assume
declared MIME is correct."

**Allowed types this cycle:** PDF, DOCX, XLSX, JPEG, PNG, TIFF — matching
the module's conservative suggested allowlist. HTML, SVG, and
script/executable-capable types are hard-rejected regardless of extension.

### 10. Checksum strategy

SHA-256, computed server-side while streaming to the temp file. A
client-supplied checksum, if one is ever sent, is never trusted or
compared against — only used values are the ones this pipeline computes
itself.

### 11. Duplicate-file policy

Detection key is `case + checksum + category` (not case-wide, and never
cross-case). An identical file already present in the *same case and
category* and not archived returns a controlled `duplicate_detected`
outcome — no second `CaseDocument` is created, protecting against
accidental double-submission (e.g., a double click). Uploading the same
bytes against a **different** category or a different `DocumentRequest`
within the same case is allowed and creates a normal new record — that is
deliberate reuse (e.g., a passport photo page satisfying two different
checklist items), not a duplicate-submission accident. Never deduplicates
or reveals matches across different cases, and never reveals to one client
that another client uploaded the identical file.

### 12. Malware-scanning integration point

```text
scan(storageKey, metadata) -> { status: 'clean'|'infected'|'error'|'not_configured'|'pending' }
```

This cycle ships a `NullScanner` that always returns `not_configured` — no
real scanner is integrated. **Explicit product decision, not an oversight:**
`not_configured` does **not** block a document from proceeding to its
normal post-upload status (`uploaded`/`pending_review`) — only `infected`
and scanner `error` route a file to quarantine. Blocking every upload
indefinitely until a real scanner exists would make the entire feature
unusable this cycle; the conservative extension/MIME/signature allowlist
(§9) is this cycle's actual defense layer. `CaseDocument.scanStatus` is
always shown honestly as `not_configured` — the UI never claims a file was
scanned when it wasn't. Wiring a real scanner (e.g., ClamAV, a cloud AV
API) behind this same interface is explicitly future work.

### 13. Quarantine behavior

`infected` and scanner `error` results: file moved to `quarantine/`,
`CaseDocument.status = 'quarantined'`. No route in either app serves a
quarantined file's content — not to clients, not to employees — this
cycle. (Module doc: "employees may see safe metadata but should not
download infected content through the normal route" — since no scanner
runs this cycle, quarantine is reachable in practice only via a manual
future status correction, but the code path and status exist and are
tested now so a future real scanner has a correct destination already
wired.)

### 14. Download authorization

Every download (`GET /portal/documents/:id/download`,
`GET /admin/documents/:documentId/download`,
`GET /admin/documents/:documentId/versions/:versionId/download`) re-derives
authorization from scratch on every request: authenticate actor → load
`CaseDocument` → load its `case`/`workspace` → verify **current** capability
(employee) or **current** active `WorkspaceMember` (client and, per
`queries.view_all`-style bypass, employees with an org-wide capability) →
verify the requested `DocumentVersion` actually belongs to that document →
verify status is not `quarantined` → retrieve via `storageKey` → stream →
audit. Knowing any ID (case, workspace, category, document, version,
request, storage key, filename) never grants access by itself — every
handler re-runs the full chain, matching `casePolicy.js`/
`interactionPolicy.js`'s existing "row-level check on every read" pattern,
not a cached/inferred one.

### 15. Download response headers

```text
Content-Disposition: attachment; filename="<sanitized displayName>"
Content-Type: <detectedMimeType>   # the verified type, not the declared one
X-Content-Type-Options: nosniff
Cache-Control: private, no-store
Content-Security-Policy: sandbox
```

No inline rendering this cycle (module's explicit instruction). No range
requests (not implemented — module explicitly says not to add partial
content "merely for completeness").

### 16. Audit strategy — extend `CaseActivity`, add a dedicated access log

`CaseActivity` (ADR-002, already case-scoped and append-only) gets nine new
`type` enum values for document/category/request lifecycle events —
consistent with its existing cardinality (rare, human-meaningful events a
case timeline should show). **Downloads are not added to `CaseActivity`** —
a new `DocumentAccessLog` collection (`document_access_logs`) is added
instead, exactly mirroring the reasoning `CaseActivity.js`'s own file
comment already gives for why it was split out of the lead-scoped
`ActivityLog` in the first place ("kept separate... rather than widening
that model's meaning"): downloads are high-volume and mechanical, and
mixing them into the same collection as case lifecycle events would flood
any future case-timeline UI and degrade `CaseActivity`'s query patterns.
`DocumentAccessLog` records actor type/id, document, version, case,
timestamp, and result (`success`/`denied`/`not_found`) — never file
content, never full filesystem paths.

### 17. Transaction and cleanup behavior

Reuses `withOptionalTransaction` exactly as `caseConversion.js` does.
Storage is outside MongoDB and cannot join a Mongo transaction, so the
order is fixed: write to `temp/` → validate → move to `active/` or
`quarantine/` (filesystem rename, cheap) → **then** open the Mongo
transaction → create `CaseDocument`/`DocumentVersion`/update
`DocumentRequest` → commit. If the transaction fails after the file is
already in `active/`/`quarantine/`, the newly-written storage object is
deleted as compensation; if that deletion itself fails, it's logged as an
orphan-storage error for the reconciliation script (§31 of the module doc)
to catch later — never a hard crash.

### 18. Category provisioning

New cases: hooked directly into `caseConversion.js`, immediately after
`CaseWorkspace` creation (the exact point identified by inspection — the
`createdWorkspace` result, before `addOrReactivateMember` calls), inside
the same `withOptionalTransaction` closure so category provisioning is
atomic with case creation. Existing (pre-Cycle-5) cases: an idempotent
admin action (`POST /admin/cases/:id/initialize-document-categories`) plus
a dry-run-capable script (`server/scripts/provisionDocumentCategories.js
--dry-run`) — same shape as Cycle 3's `initialize-interaction` lazy
backfill, per the module's own preferred option.

### 19. Historical-case provisioning

Covered by §18 — the dry-run script reports how many cases are missing
categories before anything is written, and is never run against production
during this cycle.

### 20. Versioning behavior

`DocumentVersion` rows are immutable and created-only (no update route
touches them after creation). `versionNumber` is unique per document via a
compound unique index (`document + versionNumber`), starting at 1.
`CaseDocument.currentVersion` is an explicit `ObjectId` ref, updated only
as part of the same transaction that creates the new version.
`optimisticConcurrency: true` (the same real mechanism ADR-003 §2
established — plain `.save()` does not check `__v` by default) is set on
`CaseDocumentSchema` specifically to make two concurrent replacement
attempts on the same document fail one of them with a controlled `409`
rather than racing to the same next version number.

### 21. Object-storage replacement strategy

Controllers and services only ever call the provider interface (§3) —
never `fs` directly. A future `S3StorageProvider`/`R2StorageProvider`
implementing the same six-method interface is a configuration change
(`DOCUMENT_STORAGE_PROVIDER=local|s3`), not a rewrite of upload/download/
review/version code. Not built this cycle — no production object-storage
account, credentials, or cost/compliance requirements have been discussed
with the owner (see §25).

### 22. Multi-instance deployment limitations

`LocalPrivateStorageProvider` requires every process that reads or writes
documents to share one filesystem. This is true today (`DEPLOYMENT.md`:
single VPS, PM2, no separate staging/horizontal scaling). If either app is
ever deployed across multiple instances or containers without a shared/
networked filesystem, local storage breaks silently (uploads on instance A
become unreadable from instance B) — object storage (§21) becomes mandatory
*before* any such deployment change, not optional hardening.

### 23. Backup implications

Local private storage is now a second thing (beyond the database) that
needs backing up — `PRIVATE_DOCUMENT_ROOT` must be included in whatever
backup strategy protects the production host, or an accepted-database
backup alone silently stops protecting client files. Flagged here and
carried into `IMPLEMENTATION_STATUS.md`'s deployment blockers; not resolved
in this cycle (no production storage root exists yet to back up).

### 24. Future chat-attachment integration

`CaseDocument`'s shape (case/workspace scoping, polymorphic uploader,
storage key, checksum, versioning) is compatible with being referenced as
a message attachment by a future `WorkspaceMessage` model
(`06_TEAM_COLLABORATION_AND_CHAT.md`) without modification — a chat message
could simply reference an existing `CaseDocument._id`. This cycle does not
build that reference or any chat-specific attachment flow; the decision of
*how* chat attaches documents is explicitly deferred to Cycle 6's own ADR,
mirroring how ADR-003 §9 deferred the "is `InteractionUpdate` chat"
question to this cycle.

### 25. Why production provider selection remains deferred

No deployment requirements — expected file volume, retention/compliance
obligations, budget, or existing vendor relationships — have been discussed
with the practice's owner. Choosing S3 vs. R2 vs. Azure Blob now would be
guessing at infrastructure and recurring-cost commitments that are the
owner's to make, and the module doc explicitly forbids guessing here. The
provider interface (§3/§21) is deliberately the only thing this cycle
commits to.

## Consequences

- Two new per-app storage-provider modules plus one new shared JSON
  contract fixture — consistent with, not a departure from, ADR-002/003's
  established cost/benefit tradeoff, extended with the filesystem-layout
  assertion §5 flags.
- This is the first domain where the two apps' "mirrored" implementations
  must agree on more than a schema — a storage-key format and directory
  layout bug would be a functional cross-app failure, not just a silent
  drift; the schema-contract test's new assertions are the detection
  mechanism, same role as ADR-002 §4/§8 already established.
- Both apps gain a new real dependency (`file-type`) — the first
  signature-detection library in either app — justified because the module
  doc explicitly calls for one rather than "fragile binary parsing
  manually," and because rejecting disguised executables/HTML/SVG is a
  genuine security control, not a nice-to-have.
- `not_configured` scan status shipping to production before a real
  scanner exists is a deliberately accepted risk for this cycle, documented
  in `IMPLEMENTATION_STATUS.md`'s open items so it is never silently
  forgotten as "handled."
