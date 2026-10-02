# ADR-023 — Case-Native Filing Packets V1

**Status:** Accepted for Phase 10 implementation  
**Date:** 2026-10-02  
**Branch:** `architecture/angular-enterprise-platform`  
**Phase:** Execution Phase 10 — Filing Packets V1  
**Roadmap mapping:** Original Phase 13 — Filing Packets  
**Phase 09 implementation SHA:** `2486fabc9c56981e27af74868256d61e3b56ad37`  
**Phase 09 implementation CI:** GitHub Actions #76 — success  
**Phase 09 docs tip:** `1e3929860d44995b8d57efe4f0ec1ac113dca351`  
**Phase 09 docs CI:** GitHub Actions #77 — success

---

## 1. Context

Immigration Horizons now has:

- case-native tasks and deadlines;
- evidence requirements;
- secure case documents and immutable document versions;
- Smart Forms;
- unified client/staff chat;
- case-native petition drafting;
- immutable `PetitionVersion` snapshots.

The next roadmap capability is Filing Packets.

The repository has no filing-packet domain today. The legacy lead-scoped `DeliveryRecord` is not suitable: it stores arbitrary URL-style file entries and its export flow is explicitly a placeholder.

Phase 10 introduces a case-native packet **manifest and immutable packet snapshot**. It does not build a general PDF/ZIP generation platform.

---

## 2. Decision summary

Introduce:

- `FilingPacket` — mutable case-owned ordered filing manifest.
- `FilingPacketVersion` — immutable finalized snapshot of the exact sources selected for filing.

A case may own multiple filing packets.

A packet pins exact versions. Replacing a live document or editing a petition later must never silently alter an already finalized packet.

The core flow is:

```text
Case
  ↓
FilingPacket (draft manifest)
  ├── finalized PetitionVersion
  ├── exact DocumentVersion items
  └── optional reviewed Smart Form provenance
        ↓
validate readiness
        ↓
finalize
        ↓
FilingPacketVersion (immutable snapshot)
```

---

## 3. Launch-speed boundary

Phase 10 intentionally delivers packet assembly and auditability before binary generation.

Required now:

- ordered packet items;
- exact version pinning;
- readiness validation;
- reorder/add/remove;
- packet review metadata;
- immutable finalized snapshot;
- staff Angular workspace;
- secure per-item download links;
- clear printable/export manifest.

Deferred:

- combined PDF generation;
- ZIP generation;
- PDF flattening;
- page numbering/stamping;
- bookmark generation;
- barcode manipulation;
- e-signature;
- official USCIS form rendering;
- electronic filing.

This boundary prevents launch from being blocked on document-rendering infrastructure.

---

## 4. Multiple packets per case

A case may need more than one packet, for example:

- initial filing;
- RFE response;
- NOID response;
- supplemental filing;
- re-filed package.

Therefore:

```text
ClientCase 1 -> many FilingPacket
```

Recommended unique key:

```text
(case, sequence)
```

Do not encode one-packet-per-case.

---

## 5. FilingPacket model

Recommended fields:

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
finalizedAt
finalizedBy

createdAt
updatedAt
```

Recommended kinds:

```text
initial_filing
rfe_response
noid_response
supplemental
other
```

Recommended statuses:

```text
draft
review
needs_changes
approved
finalized
archived
```

---

## 6. Petition source

A filing packet should normally reference one **finalized** `PetitionVersion`.

Rules:

- same case/workspace;
- version exists;
- version is immutable;
- packet stores exact version id;
- finalization requires a finalized petition-version source for packet types that need a petition;
- later petition versions do not update the packet automatically.

Service-only packet kinds may allow no petition source if product rules make that appropriate, but this must be explicit and tested.

---

## 7. Packet items

Items are embedded ordered manifest rows.

Recommended fields:

```text
key
order
type
role
label
required
document
documentVersion
smartForm
smartFormRevision
notes
```

Supported V1 item types:

```text
document_version
smart_form_reference
```

The petition version is a packet-level source, not duplicated as an item.

---

## 8. Document-version items

A filing document item pins:

```text
CaseDocument id
DocumentVersion id
displayName snapshot
versionNumber snapshot
mimeType snapshot
size snapshot
document status snapshot
category name snapshot
role
order
required
```

The server validates:

- same case/workspace;
- version belongs to document;
- exact version exists;
- document is allowed for filing;
- no archived/rejected/infected/unavailable source;
- accepted status is required for finalized packets;
- secure storage metadata is never exposed.

The packet does **not** silently track `CaseDocument.currentVersion` after selection.

If staff wants a newer version, they explicitly replace the packet item before finalization.

---

## 9. Smart Form references

Phase 08 does not generate official USCIS PDFs.

Therefore Smart Forms may be linked to a packet as provenance/reference:

```text
CaseSmartForm id
templateKey
templateVersion
revision
lockedRevision
status
label
order
required
```

Final packet readiness accepts Smart Form references only when they are:

```text
approved
locked
```

A Smart Form reference is **not represented as a downloadable official filing PDF**.

Where an actual form PDF is required, staff must include the corresponding secure `CaseDocument` / `DocumentVersion` item, normally from the `uscis_forms` category.

This keeps the product truthful.

---

## 10. Packet roles

Recommended document roles:

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

Roles aid organization only.

They do not change document authorization.

---

## 11. Ordering

Packet order is explicit and persistent.

Use integer order values normalized server-side.

Reorder operation must:

- authorize the actor;
- validate every item belongs to the packet;
- reject duplicate/missing item ids;
- produce one deterministic contiguous order;
- increment packet revision atomically.

Do not rely on browser array order as authority.

---

## 12. Readiness

A packet has deterministic operational readiness.

For finalization:

### Petition source

Ready when the referenced `PetitionVersion` is the finalization snapshot of an eligible petition.

### Document item

Ready when:

- exact `DocumentVersion` exists;
- parent document belongs to same case/workspace;
- parent document status is `accepted`;
- document is not archived/rejected/quarantined/superseded;
- version scan status is not infected;
- item is otherwise downloadable by current secure document policy.

### Smart Form reference

Ready when status is `approved` or `locked`, and stored revision provenance still exists.

The UI may show ready/not-ready reasons.

Never label packet readiness as legal sufficiency or approval likelihood.

---

## 13. Packet lifecycle

Allowed core transitions:

```text
draft         -> review
needs_changes -> review
review        -> needs_changes
review        -> approved
approved      -> needs_changes
approved      -> finalized
```

Finalized packets are immutable.

No normal reopening of a finalized packet.

A changed filing after finalization becomes a new packet or new sequence/version according to product needs, not mutation of filing history.

---

## 14. Review and approval

Packet review verifies:

- source petition;
- item order;
- item readiness;
- required/optional selections;
- exact source versions.

Approval does not create a binary package.

Approval is a staff workflow gate before finalization.

Recommended permission separation:

- assembler can compose;
- reviewer can approve;
- finalizer can lock filing snapshot.

---

## 15. FilingPacketVersion

`FilingPacketVersion` is immutable.

Create on finalization.

Recommended fields:

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

For V1, `reason` may simply be:

```text
finalization
```

The version must reject application updates/deletes.

---

## 16. Immutable petition provenance

Snapshot:

```text
petitionVersionId
petitionId
petitionVersionNumber
sourceRevision
petitionKind
petitionTitle
createdAt
```

Do not copy private system metadata beyond what is needed to identify the immutable source.

The full petition text remains in `PetitionVersion`; the packet snapshot references it.

---

## 17. Immutable document provenance

For each document item snapshot:

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

A safe server-internal manifest may also use checksum/version identity to compute `manifestHash`, but API DTOs do not need to expose storage keys or checksums.

---

## 18. Manifest hash

On finalization, compute a stable hash over normalized immutable manifest identity, including at least:

- packet id/version;
- petition version id;
- ordered item types;
- document version ids;
- Smart Form ids + revisions/locked revisions;
- roles;
- required flags;
- order.

Purpose:

- detect accidental snapshot drift;
- provide an audit fingerprint.

Do not present it as a cryptographic signature or e-signature.

---

## 19. No binary merge in V1

Phase 10 does not combine documents.

A finalized packet version is an immutable **manifest**.

Staff can:

- view exact order;
- open/download each secure document version;
- print/export a human-readable manifest.

Do not add a PDF library or ZIP library merely for this phase.

If binary assembly is later required, it must consume `FilingPacketVersion`, not the mutable live packet.

---

## 20. Secure downloads

Packet items never expose:

- `storageKey`;
- filesystem path;
- private root;
- raw signed/public URL.

Angular uses existing Phase 06 secure document-version download routes.

`DocumentAccessLog` behavior remains authoritative.

---

## 21. Capabilities

Add mirrored capability identifiers:

```text
filing_packets.view
filing_packets.manage
filing_packets.review
filing_packets.finalize
```

Recommended grants:

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

Every capability remains combined with case/workspace row access.

---

## 22. Authorization

Every packet operation requires:

- EmployeeSession;
- must-change-password rules;
- capability;
- active case/workspace access unless an existing `cases.view_all` rule applies;
- packet belongs to accessible case/workspace;
- current lifecycle state;
- expected revision on mutations.

Removed members lose access immediately.

Guessing a packet/item/version id never grants access.

---

## 23. Existence concealment

Preserve safe not-found behavior for:

- malformed packet id;
- nonexistent packet;
- inaccessible case;
- packet from another case;
- hidden cross-case document/version;
- hidden cross-case Smart Form;
- hidden cross-case petition version.

Do not expose source labels before authorization.

---

## 24. Canonical staff API

Recommended routes:

```text
GET    /api/v1/staff/cases/:caseId/filing-packets
POST   /api/v1/staff/cases/:caseId/filing-packets
POST   /api/v1/staff/cases/:caseId/filing-packets/provision

GET    /api/v1/staff/filing-packets/:packetId
PATCH  /api/v1/staff/filing-packets/:packetId

POST   /api/v1/staff/filing-packets/:packetId/petition-version
POST   /api/v1/staff/filing-packets/:packetId/items
DELETE /api/v1/staff/filing-packets/:packetId/items/:itemId
POST   /api/v1/staff/filing-packets/:packetId/reorder

GET    /api/v1/staff/filing-packets/:packetId/candidates

POST   /api/v1/staff/filing-packets/:packetId/submit
POST   /api/v1/staff/filing-packets/:packetId/return
POST   /api/v1/staff/filing-packets/:packetId/approve
POST   /api/v1/staff/filing-packets/:packetId/finalize

GET    /api/v1/staff/filing-packets/:packetId/versions
GET    /api/v1/staff/filing-packets/:packetId/versions/:versionId
```

Adapt exact route names to established v1 conventions.

No hard-delete packet endpoint.

---

## 25. Candidate selection

Packet candidate APIs should return bounded same-case options only.

Candidate groups:

- finalized PetitionVersions;
- accepted secure document versions;
- approved/locked Smart Forms.

For documents, default candidate should be current accepted version, but staff may select an older immutable version only where product rules allow and the server validates it.

Do not return whole raw document/form objects.

---

## 26. DTOs

Use explicit DTOs.

Packet summary:

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

Packet detail:

```text
summary
petitionSource
items
internalReviewNote
readiness
actions
```

Item DTO:

```text
id
type
role
label
order
required
ready
status
reason
downloadAction where document
source summary
```

Version DTO:

```text
id
versionNumber
manifestHash
createdByName
createdAt
petitionSource
items
```

Never return raw Mongoose documents.

---

## 27. Angular Filing Packet workspace

Add a **Filing Packet** or **Packet** tab to the case workspace.

Required V1 UX:

- list/select packets;
- create/provision initial packet;
- choose finalized petition version;
- candidate picker;
- ordered item list;
- add/remove;
- reorder;
- item role;
- required/optional;
- readiness badge/reason;
- secure per-item download;
- submit for review;
- return with note;
- approve;
- finalize confirmation;
- immutable version history;
- finalized read-only manifest;
- loading/empty/error/retry/conflict states;
- responsive layout;
- accessible controls.

No new UI framework.

---

## 28. Printable manifest

For launch usability, Angular may provide a browser-printable manifest view containing:

- case number/title;
- packet title/version;
- petition source;
- ordered item number;
- item label;
- item role;
- source version;
- readiness/status;
- finalized timestamp.

This is a human-readable manifest only.

Do not call it the filing PDF.

---

## 29. Concurrency

Every packet mutation carries expected `revision`.

Use atomic revision-checked writes.

Stale update:

```text
409 Conflict
```

Do not silently reorder/replace packet content after another staff member changed it.

---

## 30. CaseActivity

Add only material packet events:

```text
filing_packet_created
filing_packet_submitted
filing_packet_returned
filing_packet_approved
filing_packet_finalized
```

Do not create activity rows for every reorder/add/remove.

Do not store filenames or sensitive manifest details in generic activity text beyond a safe packet title/version where appropriate.

---

## 31. Notifications

Notifications are optional in Phase 10.

If implemented, reuse existing internal notification service for:

- packet submitted for review;
- returned for changes;
- approved.

No client notifications.

Notification delivery must never roll back packet persistence.

---

## 32. Legacy DeliveryRecord

Leave `DeliveryRecord` unchanged.

Do not migrate it.

Do not make Filing Packets depend on it.

The future legacy-retirement phase can remove it after packet workflow has production parity.

---

## 33. Indexes

Recommended minimal indexes:

```text
FilingPacket:
  unique { case: 1, sequence: 1 }
  { case: 1, status: 1, updatedAt: -1 }
  { workspace: 1, updatedAt: -1 }

FilingPacketVersion:
  unique { packet: 1, versionNumber: 1 }
  { case: 1, createdAt: -1 }
```

No production index build during Phase 10.

---

## 34. Security and privacy

Mandatory:

- EmployeeSession;
- trusted-origin/CSRF;
- mustChangePassword enforcement;
- capability + row scope;
- same-case source validation;
- exact document-version validation;
- safe 404 concealment;
- DTO-only output;
- no storage metadata;
- no public file URLs;
- no packet data in localStorage;
- no client-facing packet API in Phase 10.

---

## 35. Testing

Required coverage:

### Domain

- multiple packets per case;
- sequence uniqueness;
- idempotent provision;
- packet/version immutability;
- lifecycle transitions.

### Authorization

- capability + membership;
- removed member;
- malformed/other-case concealment;
- cross-case source rejection.

### Sources

- finalized petition version accepted;
- non-final petition source rejected where required;
- exact document version pinned;
- wrong document/version relationship rejected;
- unacceptable/infected/archived document rejected;
- approved/locked Smart Form reference accepted;
- draft/submitted Smart Form blocks readiness.

### Ordering/concurrency

- add/remove;
- reorder;
- deterministic contiguous order;
- stale revision 409;
- concurrent changes do not overwrite.

### Finalization

- required unready item blocks;
- approval required;
- finalization creates immutable version;
- live document replacement after finalization does not change snapshot;
- newer petition version does not change snapshot;
- Smart Form later edit does not change snapshot provenance;
- manifest hash is stable for snapshot.

### Angular

- list/provision;
- source selection;
- add/remove/reorder;
- readiness;
- conflict;
- review/approve/finalize;
- secure download action;
- version history;
- finalized read-only;
- print manifest;
- loading/error/retry.

---

## 36. Out of scope

Not Phase 10:

- binary PDF merge;
- ZIP assembly;
- PDF page numbering;
- PDF bookmarks;
- cover-sheet generation;
- official USCIS PDF generation;
- e-signature;
- electronic filing;
- USCIS receipt/status tracking;
- client packet UI;
- AI;
- production deployment;
- production migrations/backfills/index builds.

---

## 37. Completion gate

Phase 10 is complete only when:

- Phase 09 remains green;
- `FilingPacket` and immutable `FilingPacketVersion` exist;
- exact source-version pinning works;
- packet ordering works;
- readiness/finalization rules work;
- canonical staff API exists;
- Angular packet workspace exists;
- secure per-item downloads work;
- OpenAPI is updated;
- security/concurrency tests pass;
- `docs/implementation/PHASE_10_FILING_PACKETS_REPORT.md` exists;
- final exact Phase 10 SHA has all four CI jobs green;
- no production deploy/migration/backfill/index build occurred.

Then STOP before Phase 11 / USCIS Tracking.
