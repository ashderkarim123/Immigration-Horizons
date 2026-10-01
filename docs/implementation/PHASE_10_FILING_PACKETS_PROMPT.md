# Phase 10 — Filing Packets V1 Implementation Prompt

**Branch:** `architecture/angular-enterprise-platform`  
**ADR:** `docs/architecture/ADR-023-case-native-filing-packets-v1.md`  
**Execution Phase:** 10 — Filing Packets V1  
**Roadmap mapping:** Original Phase 13 — Filing Packets  
**Phase 09 implementation SHA:** `2486fabc9c56981e27af74868256d61e3b56ad37`  
**Phase 09 implementation CI:** #76, run ID `36930971463`, all required jobs green  
**Phase 09 latest docs tip:** `1e3929860d44995b8d57efe4f0ec1ac113dca351`  
**Phase 09 docs CI:** #77, run ID `36931640936`, all required jobs green

---

## 1. Mission

Implement the smallest production-ready Filing Packets capability that lets authorized staff assemble, review, approve, and finalize an **ordered immutable filing manifest** from:

- a finalized `PetitionVersion`;
- exact secure `DocumentVersion` records;
- optional approved/locked Smart Form references for provenance.

The successful Phase 10 outcome is:

```text
Case
  ↓
FilingPacket (mutable ordered manifest)
  ↓
review / approve
  ↓
finalize
  ↓
FilingPacketVersion (immutable exact-source snapshot)
```

Do not build PDF merging, ZIP generation, or USCIS tracking in this phase.

---

## 2. ASAP delivery rule

The user wants this product finished and deployable quickly.

Choose:

```text
secure + deterministic + auditable + simple
```

over:

```text
generalized + configurable + binary-generation-heavy
```

Phase 10 must **not** expand into:

- combined PDF generation;
- ZIP export;
- page numbering/stamping;
- bookmarks;
- cover-sheet generation;
- electronic filing;
- e-signature;
- official USCIS PDF rendering;
- client packet UI;
- AI;
- USCIS tracking.

Those are not required to satisfy the packet roadmap decision.

---

## 3. Preflight

Before editing:

```bash
git fetch origin --prune

git branch --show-current
git status --short
git rev-parse HEAD
git rev-parse origin/architecture/angular-enterprise-platform
git log --oneline -25
git diff
git diff --cached
```

Required branch:

```text
architecture/angular-enterprise-platform
```

Do not destroy unknown local work.

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

docs/architecture/ADR-004-secure-document-storage.md
docs/architecture/ADR-015-angular-enterprise-platform.md
docs/architecture/ADR-016-authentication-boundaries.md
docs/architecture/ADR-021-smart-forms-v1.md
docs/architecture/ADR-022-case-native-petition-work-v1.md
docs/architecture/ADR-023-case-native-filing-packets-v1.md

docs/implementation/ANGULAR_ENTERPRISE_PLATFORM_ROADMAP.md
docs/implementation/PHASE_09_PETITION_WORK_REPORT.md
```

Inspect current implementation of:

```text
ClientCase
CaseWorkspace
WorkspaceMember

CaseDocument
DocumentVersion
DocumentCategory
documentPolicy
secure download routes
DocumentAccessLog

CaseSmartForm
Smart Forms service/policy

CasePetition
PetitionVersion
petitionManagement
petitionPolicy

CaseActivity
permissions/capabilities
OpenAPI
Angular case-detail tabs
index dry-run scripts
contract tests
```

Current code is authoritative when older docs disagree.

---

## 5. Phase 09 gate

Do not proceed if Phase 09 is not still green.

Verified:

```text
Phase 09 implementation:
2486fabc9c56981e27af74868256d61e3b56ad37

CI #76 / run 36930971463:
Tests (Next.js app) — success
Lint · types · build — success
Enterprise UI (Angular) — success
Tests (admin CMS) — success

Latest Phase 09 docs tip:
1e3929860d44995b8d57efe4f0ec1ac113dca351

CI #77 / run 36931640936:
all four jobs — success
```

The earlier package-lock problem is fixed in the Phase 09 implementation line. Preserve that fix.

---

## 6. Do not use DeliveryRecord

Legacy:

```text
server/models/admin/DeliveryRecord.js
```

is not the Filing Packet domain.

Rules:

- preserve legacy behavior;
- do not migrate it now;
- do not delete it;
- do not reuse `files[].url`;
- do not make Angular Filing Packet depend on it.

---

## 7. Domain models

Implement:

```text
FilingPacket
FilingPacketVersion
```

### 7.1 FilingPacket

Core fields:

```text
case
workspace

sequence
kind
title
description

status
revision

petitionVersion
petitionVersionNumberSnapshot
petitionTitleSnapshot

items[]

internalReviewNote

createdBy
createdByName
lastEditedBy
lastEditedByName

readyAt
approvedAt
approvedBy
approvedByName
finalizedAt
finalizedBy
finalizedByName

createdAt
updatedAt
```

Statuses:

```text
draft
review
needs_changes
approved
finalized
archived
```

Kinds:

```text
initial_filing
rfe_response
noid_response
supplemental
other
```

### 7.2 FilingPacketVersion

Core fields:

```text
packet
case
workspace

versionNumber
reason
sourceRevision

kind
titleSnapshot
descriptionSnapshot

petitionSource
items[]

manifestHash

createdBy
createdByName
createdAt
```

Immutable after creation.

---

## 8. Multiple packets per case

A case may own many packets.

Unique key:

```text
(case, sequence)
```

Initial packet provision:

```text
kind = initial_filing
sequence = 1
```

Provision idempotently.

Do not encode one-packet-per-case.

---

## 9. Packet item schema

Use embedded packet items.

Fields:

```text
id/_id
order
type
role
labelSnapshot
required

document
documentVersion

smartForm
smartFormRevision
smartFormLockedRevision

notes
```

Supported types:

```text
document_version
smart_form_reference
```

The petition source is packet-level, not duplicated as an item.

---

## 10. Packet roles

Support:

```text
cover_sheet
petition_letter
uscis_form
supporting_evidence
recommendation_letter
expert_opinion_letter
business_plan
identity_civil
immigration_history
exhibit
other
```

Role is organizational only.

It never grants authorization.

---

## 11. Petition source selection

Packet source must be an exact `PetitionVersion`.

Validation:

- exists;
- same case/workspace;
- actor can access case;
- normally `reason = finalization`;
- packet stores exact version id;
- packet stores safe title/version snapshots.

For packet types that require a petition, reject approval/finalization without one.

Do not point at mutable `CasePetition`.

---

## 12. Document item selection

Staff selects:

```text
CaseDocument
+
exact DocumentVersion
```

Server validates:

- document same case/workspace;
- version belongs to document;
- exact version exists;
- document status permitted;
- no archived/rejected/quarantined/superseded source;
- scan is not infected;
- source is downloadable under existing document policy.

For packet finalization, require parent document status:

```text
accepted
```

Pin exact version.

Do not automatically follow `currentVersion` after selection.

---

## 13. Smart Form references

Smart Form references are provenance only.

Store:

```text
smartForm
templateKeySnapshot
templateVersionSnapshot
smartFormRevision
smartFormLockedRevision
statusSnapshot
labelSnapshot
```

Ready when:

```text
approved
locked
```

Do not pretend a Smart Form is an official filing PDF.

Where a real form PDF is required, include an accepted secure document version from the USCIS Forms category.

---

## 14. FilingPacket service

Create a canonical service, e.g.:

```text
server/services/filingPacketManagement.js
```

It should own:

```text
listCasePackets
provisionInitialPacket
createPacket
getPacket
updatePacketMetadata

setPetitionVersion

listCandidates
addDocumentItem
addSmartFormReference
removeItem
reorderItems
updateItemMetadata

resolvePacketReadiness

submitPacket
returnPacket
approvePacket
finalizePacket

listPacketVersions
getPacketVersion
createPacketVersionSnapshot
computeManifestHash
```

Routes remain thin.

---

## 15. Capability contract

Add mirrored capabilities:

```text
filing_packets.view
filing_packets.manage
filing_packets.review
filing_packets.finalize
```

Initial grants:

```text
filing_packets.view:
  super_admin
  admin
  pm
  petition_writer
  uscis_forms_specialist
  reviewer

filing_packets.manage:
  super_admin
  admin
  pm
  uscis_forms_specialist

filing_packets.review:
  super_admin
  admin
  pm
  reviewer

filing_packets.finalize:
  super_admin
  admin
  reviewer
```

Update both capability mirrors/contracts.

Capabilities never replace case membership.

---

## 16. Filing packet policy

Create a thin packet policy.

Every action checks:

```text
EmployeeSession
mustChangePassword rules
capability
case/workspace row access
packet belongs to case/workspace
current lifecycle state
expected revision for mutation
```

Reuse `casePolicy`.

Removed case member loses access immediately.

---

## 17. Existence concealment

Treat these safely and consistently:

```text
malformed packet id
nonexistent packet
packet on inaccessible case
cross-case petition version
cross-case document/version
cross-case Smart Form
hidden source id
```

Do not reveal source labels before authorization.

---

## 18. Packet lifecycle

Allowed transitions:

```text
draft         -> review
needs_changes -> review
review        -> needs_changes
review        -> approved
approved      -> needs_changes
approved      -> finalized
```

Finalized packets are immutable.

No ordinary reopen.

No hard delete.

---

## 19. Submit packet

Requirements:

- `filing_packets.manage`;
- expected revision;
- packet not finalized;
- petition source present where required;
- at least one filing item;
- item ordering valid.

Change:

```text
status -> review
```

Do not require every item ready just to submit for review.

---

## 20. Return packet

Allowed from:

```text
review
approved
```

Requires:

- `filing_packets.review`;
- expected revision;
- internal review note/reason.

Change:

```text
status -> needs_changes
```

---

## 21. Approve packet

Allowed from:

```text
review
```

Requirements:

- `filing_packets.review`;
- expected revision;
- packet source structure valid;
- required items selected;
- no obvious invalid cross-source references.

Do not require binary generation.

Change:

```text
status -> approved
```

Record approval snapshot fields.

---

## 22. Finalize packet

Allowed from:

```text
approved
```

Requirements:

- `filing_packets.finalize`;
- expected revision;
- petition source ready;
- every required item ready;
- exact selected versions still exist;
- ordering valid.

Then:

1. resolve exact provenance;
2. compute normalized manifest hash;
3. create immutable `FilingPacketVersion`;
4. set packet `finalized`;
5. record finalizer/timestamp;
6. create CaseActivity.

If snapshot creation fails, do not report finalization success.

Use existing safe compensating strategy if transactions are not assumed.

---

## 23. Readiness resolver

Create one server-side resolver.

### Petition source ready

Ready when:

- exact `PetitionVersion` exists;
- same case/workspace;
- reason is `finalization` for ordinary filing packet.

### Document item ready

Ready when:

```text
document exists
document version exists
version belongs to document
document same case/workspace
document.status == accepted
document not archived
version scanStatus != infected
```

### Smart Form ready

Ready when:

```text
status == approved || status == locked
```

Return:

```text
ready
status
reason
sourceSummary
```

No legal scoring.

---

## 24. Candidate APIs

Expose bounded same-case candidates only.

Recommended:

```text
GET /api/v1/staff/filing-packets/:packetId/candidates?type=petition_version
GET /api/v1/staff/filing-packets/:packetId/candidates?type=document_version
GET /api/v1/staff/filing-packets/:packetId/candidates?type=smart_form
```

Or one grouped endpoint if cleaner.

Document candidate fields should include safe metadata only:

```text
documentId
versionId
displayName
versionNumber
categoryName
status
mimeType
size
linked
```

No storage keys/checksums/private paths.

---

## 25. Reorder

Implement one explicit reorder operation.

Request should include:

```text
expectedRevision
orderedItemIds[]
```

Server verifies:

- exact set of packet item IDs;
- no duplicates;
- no missing ids;
- no unknown ids.

Then normalize orders:

```text
1..N
```

and increment revision atomically.

---

## 26. Item updates

Allow minimal metadata changes:

```text
role
required
notes
```

Do not allow the browser to mutate authoritative document/version ids through a generic patch.

Replacing a source should use an explicit remove/add or replace-source operation.

---

## 27. FilingPacketVersion snapshot

On finalization snapshot:

### Packet

```text
packet id
case/workspace
sourceRevision
kind
title
description
```

### Petition source

```text
petitionVersionId
petitionId
versionNumber
sourceRevision
petitionKind
petitionTitle
createdAt
```

### Document item

```text
documentId
documentVersionId
displayName
versionNumber
mimeType
size
categoryName
documentStatus
role
order
required
```

### Smart Form item

```text
caseSmartFormId
templateKey
templateVersion
revision
lockedRevision
status
label
role
order
required
```

Do not copy document bytes, paths, URLs, storage keys, secrets.

---

## 28. Immutability

`FilingPacketVersion` rejects:

- updateOne;
- updateMany;
- findOneAndUpdate;
- replaceOne;
- deleteOne;
- deleteMany;
- findOneAndDelete;
- re-save of existing row.

Use test DB teardown instead of mutation APIs for cleanup.

---

## 29. Manifest hash

Use Node's built-in `crypto`.

Normalize a deterministic JSON object containing at least:

```text
packet id
packet sourceRevision
petition version id
ordered items:
  type
  source ids
  source revisions/version ids
  role
  required
  order
```

Hash:

```text
sha256
```

Store hex string.

Do not expose as signature/legal attestation.

Test stability.

---

## 30. Canonical staff API

Implement under:

```text
/api/v1/staff
```

Required family:

```text
GET    /cases/:caseId/filing-packets
POST   /cases/:caseId/filing-packets
POST   /cases/:caseId/filing-packets/provision

GET    /filing-packets/:packetId
PATCH  /filing-packets/:packetId

POST   /filing-packets/:packetId/petition-version

GET    /filing-packets/:packetId/candidates
POST   /filing-packets/:packetId/items
PATCH  /filing-packets/:packetId/items/:itemId
DELETE /filing-packets/:packetId/items/:itemId
POST   /filing-packets/:packetId/reorder

POST   /filing-packets/:packetId/submit
POST   /filing-packets/:packetId/return
POST   /filing-packets/:packetId/approve
POST   /filing-packets/:packetId/finalize

GET    /filing-packets/:packetId/versions
GET    /filing-packets/:packetId/versions/:versionId
```

Adapt details to current API style where materially cleaner.

No hard delete.

---

## 31. DTOs

Explicit only.

### Packet summary

```text
id
sequence
kind
title
status
revision
itemCount
readiness
updatedAt
actions
```

### Packet detail

```text
summary
petitionSource
items
internalReviewNote
readiness
actions
```

### Item

```text
id
type
role
label
order
required
notes
ready
status
reason
source
downloadAction
```

### Version summary

```text
id
versionNumber
manifestHash
createdByName
createdAt
```

### Version detail

```text
summary
petitionSource
items
```

Never return raw models.

---

## 32. Secure document download

Do not create new file-serving logic if existing Phase 06 routes can serve an exact version securely.

Packet item DTO should expose identifiers/action metadata needed by Angular to call the canonical secure route.

Preserve:

```text
authorization
DocumentAccessLog
Content-Disposition
nosniff
private no-store
sandbox CSP
```

No public URLs.

---

## 33. Angular Packet tab

Add a case workspace tab:

```text
Filing Packet
```

Required V1 UX:

- packet list;
- provision/create;
- select finalized petition version;
- add document/form candidates;
- ordered list;
- drag-like buttons or explicit Move Up/Down;
- role selector;
- required toggle;
- remove;
- readiness badge and reason;
- secure download;
- submit;
- return with note;
- approve;
- finalize confirmation;
- immutable version history;
- finalized read-only state;
- print manifest;
- loading/empty/no-access/error/retry/conflict states.

No new UI framework.

Do not require drag-and-drop if Move Up/Down is faster and more accessible.

---

## 34. Print manifest

Add a print-friendly Angular view or print CSS.

Include:

```text
case number/title
packet title
packet status/version
petition source
ordered item number
item label
role
source version
status/readiness
finalized date
manifest hash when finalized
```

This is a manifest.

Do not title it “combined filing PDF”.

---

## 35. Concurrency

Every mutation includes:

```text
expectedRevision
```

Use atomic revision checks.

Stale:

```text
409 conflict
```

Return current revision/status.

Do not silently reorder another user's changes.

---

## 36. CaseActivity

Add mirrored activity types:

```text
filing_packet_created
filing_packet_submitted
filing_packet_returned
filing_packet_approved
filing_packet_finalized
```

Material transitions only.

Do not write filenames/document titles/manifest contents into generic activity metadata unless necessary.

No item add/remove activity spam.

---

## 37. Notifications

Optional.

If implementation is already trivial through existing notification service, notify internal reviewers on submit/return/approve.

If adding notification enums/contracts materially expands work, defer and document it.

Do not create client notifications.

---

## 38. OpenAPI

Update:

```text
server/openapi/v1.yaml
```

Document:

- list/create/provision;
- detail/update;
- petition source;
- candidates;
- item add/update/remove/reorder;
- submit/return/approve/finalize;
- versions;
- revision conflict;
- DTO schemas;
- safe error semantics.

---

## 39. Indexes

Expected minimum:

```text
FilingPacket:
  unique { case: 1, sequence: 1 }
  { case: 1, status: 1, updatedAt: -1 }
  { workspace: 1, updatedAt: -1 }

FilingPacketVersion:
  unique { packet: 1, versionNumber: 1 }
  { case: 1, createdAt: -1 }
```

Update dry-run index scripts/tests.

Do not execute production indexes.

---

## 40. Security tests

Required:

- unauthenticated;
- must-change-password mutation denial;
- no capability;
- no workspace membership;
- removed member;
- malformed packet id;
- other-case packet;
- cross-case petition version;
- cross-case document;
- document version not belonging to document;
- cross-case Smart Form;
- raw storage metadata absent;
- no raw actor/session records;
- Origin/CSRF enforced.

---

## 41. Domain tests

Required:

- multiple packets per case;
- sequence uniqueness;
- provision idempotent;
- packet lifecycle;
- finalized packet immutable;
- packet version immutable.

---

## 42. Source pinning tests

Required:

- finalized PetitionVersion accepted;
- non-final petition version rejected where required;
- exact DocumentVersion accepted;
- live document replacement does not mutate selected version;
- unacceptable document blocks finalization;
- infected version blocks;
- approved Smart Form accepted;
- locked Smart Form accepted;
- draft/submitted Smart Form not ready.

---

## 43. Reorder/concurrency tests

Required:

- add item;
- remove item;
- role/required update;
- reorder;
- duplicate item IDs rejected;
- missing item IDs rejected;
- deterministic contiguous order;
- stale revision 409;
- simultaneous mutations do not silently overwrite.

---

## 44. Finalization tests

Required:

- submit;
- return;
- approve;
- finalize only from approved;
- required unready item blocks;
- optional unready item does not block if ADR says optional;
- finalization snapshot exact sources;
- final snapshot remains unchanged when:
  - CaseDocument.currentVersion changes;
  - Smart Form revision changes;
  - newer PetitionVersion exists;
- manifest hash stable;
- snapshot creation failure does not leave false finalized state.

---

## 45. Angular tests

At minimum:

- empty/provision;
- packet list/select;
- petition source selection;
- candidate add;
- remove;
- role/required edit;
- reorder;
- readiness;
- secure download action;
- 409 conflict;
- submit;
- return note rule;
- approve;
- finalize guard + confirmation;
- version history;
- finalized read-only;
- print manifest;
- loading/error/retry.

---

## 46. No binary package generation

Do not add dependencies for:

```text
PDF merge
ZIP creation
PDF manipulation
canvas/rendering
headless browser export
```

unless the repository already has a production-safe implementation and using it is materially simpler than not using it.

Default decision: no binary generation in Phase 10.

---

## 47. No migration requirement

Existing cases remain valid with zero packets.

Packets are created lazily/explicitly.

No production backfill.

If helper exists, dry-run only and do not run it against production.

---

## 48. Local verification

### Root

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

### Hygiene

```bash
git diff --check
git status --short
```

Do not skip failures.

---

## 49. Manual QA

Verify one full case flow:

### Staff assembler

```text
open case
Packet tab
create initial packet
choose finalized PetitionVersion
add accepted USCIS form DocumentVersion
add accepted petition/supporting documents
add optional approved Smart Form reference
reorder items
mark roles
submit for review
```

### Reviewer

```text
open same packet
review order/source versions
return with note
```

### Assembler

```text
fix manifest
resubmit
```

### Reviewer/finalizer

```text
approve
finalize
open immutable version
download one exact document version
print manifest
```

Then replace a live CaseDocument with a newer version and confirm the finalized packet still points to the old selected version.

Also remove an employee from case membership and verify access disappears immediately.

---

## 50. Completion report

Create:

```text
docs/implementation/PHASE_10_FILING_PACKETS_REPORT.md
```

Include:

```text
starting SHA
ending SHA
implementation commits

models/collections
indexes
packet kinds
multiple-packet decision
petition source rules
packet item model
document version pinning
Smart Form provenance
ordering/reorder semantics
readiness rules
lifecycle
capability changes
staff API
Angular UX
secure download integration
manifest hash
immutable version provenance
DTO/privacy boundaries
CaseActivity
notifications
OpenAPI
tests
manual QA
migration impact
production impact: NONE
legacy DeliveryRecord status
known limitations
binary-generation deferral
USCIS Tracking boundary
rollback
final CI run number
final run ID
job conclusions
```

Do not fabricate final CI data.

---

## 51. Commit strategy

Truthful additive commits.

Possible:

```text
feat(packets): add case-native filing packet domain
feat(api): expose filing packet workflow
feat(angular): add filing packet workspace
test(packets): cover source pinning lifecycle and immutability
docs(phase-10): record filing packet verification
```

Do not manufacture extra commits.

No history rewrite.

---

## 52. Push

Push only:

```bash
git push origin architecture/angular-enterprise-platform
```

Do not merge to main.

Do not deploy production.

---

## 53. Remote CI gate

After push capture:

```bash
git rev-parse HEAD
```

Verify CI on the exact SHA.

Required jobs:

```text
Tests (Next.js app)
Lint · types · build
Enterprise UI (Angular)
Tests (admin CMS)
```

All green.

If red:

1. diagnose;
2. fix;
3. additive commit;
4. push;
5. verify again.

No amend/rebase/force push.

---

## 54. Stop condition

Phase 10 is complete only when:

- Phase 09 remains green;
- FilingPacket exists;
- FilingPacketVersion is immutable;
- exact source pinning works;
- reorder works;
- readiness works;
- review/approval/finalization works;
- secure exact-version download works;
- Angular Packet tab works;
- OpenAPI is current;
- report exists;
- exact final Phase 10 SHA has all four CI jobs green;
- no production deploy/migration/index/backfill occurred.

Then **STOP**.

Do not begin USCIS Tracking automatically.

---

## 55. Release-speed guardrail

Do not turn this into a file-generation project.

The packet feature is complete for Phase 10 when staff can confidently answer:

```text
What exact petition version and exact document versions were assembled,
in what order, reviewed by whom, and finalized when?
```

That is the production-critical capability.

Binary combination can be added later without changing the authoritative packet history.
