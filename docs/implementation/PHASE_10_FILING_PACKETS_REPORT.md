# Phase 10 — Case-Native Filing Packets V1: Completion Report

**Branch:** `architecture/angular-enterprise-platform`
**Authority:** `ADR-023-case-native-filing-packets-v1.md`, `PHASE_10_FILING_PACKETS_PROMPT.md`

## Commits

- **Starting SHA:** `8d641d6` (Phase 10 docs tip; Phase 09 implementation `2486fab` and docs `1e39298` are ancestors and unchanged).
- **Implementation commits and final CI:** see [Final status](#final-status) — filled in after the push, from the real log.

## What shipped

```text
Case
 └─ FilingPacket (mutable, ordered manifest; many per case, unique {case, sequence})
      ├─ petitionVersion  → exact finalized PetitionVersion (packet-level source)
      └─ items[]          → exact DocumentVersion  |  Smart Form reference (revision pinned)
            │ review → approve → finalize
            ▼
     FilingPacketVersion (immutable)   exact sources · order · roles · required · manifestHash
```

Staff-only. There is no client route, no Next.js model/DTO (the Next apps never read these collections, so no TS mirror), and **no file is generated, merged, zipped, stamped or copied**. A finalized packet is an immutable *manifest*; each document is downloaded individually through the existing Phase 06 secure route. `DeliveryRecord` is untouched and nothing here depends on it.

## Models / collections / indexes

| Model | Collection | Indexes |
|---|---|---|
| `FilingPacket` | `filing_packets` | unique `{case, sequence}`; `{case, status, updatedAt:-1}`; `{workspace, updatedAt:-1}` |
| `FilingPacketVersion` | `filing_packet_versions` | unique `{packet, versionNumber}`; `{case, createdAt:-1}` |

Both are in `server/scripts/createIndexes.js` (dry-run verified: 3 + 2 indexes listed). **No index was built against any live database.**

## Packet kinds and the multiple-packet decision

Kinds: `initial_filing`, `rfe_response`, `noid_response`, `supplemental`, `other`. A case owns many packets; `sequence` is server-assigned and unique per case (a lost race retries). `POST …/filing-packets/provision` is idempotent for `kind=initial_filing, sequence=1`, is never run implicitly on read, and there is no backfill. `POST …/filing-packets` creates additional ones.

## Petition source rules

- A packet pins one **exact `PetitionVersion`** id plus safe snapshots (version number, title) — never the mutable `CasePetition`.
- `setPetitionVersion` requires the version to be in the **same case and workspace** and to be the petition's **finalization** snapshot; an *approval* snapshot is a `400`; a version from another case and a malformed id are the same `404`.
- **Petition required for every kind except `other`** (`PETITION_REQUIRED_KINDS`) — the explicit, tested exception the ADR asks for (`other` = a packet of supporting material with no petition). Required kinds are blocked at **submit** (no source) and at **finalize** (source not ready); the DTO reports `petitionSource.required/present/ready/reason`.
- A later petition version never replaces the pinned one (tested).

## Packet items

Embedded rows: `order, type (document_version | smart_form_reference), role, labelSnapshot, required, document, documentVersion, smartForm, smartFormRevision, smartFormLockedRevision, notes`. The petition is packet-level, not an item. Roles: `cover_sheet, petition_letter, uscis_form, supporting_evidence, recommendation_letter, expert_opinion_letter, business_plan, identity_civil, immigration_history, exhibit, other` — organizational only; a role never grants access. At most 200 items.

**Document-version pinning.** `addDocumentItem({documentId, versionId})` requires: document in this case+workspace; `versionId` is a version **of that document** (a version of another document is the same `404`); document not `archived / rejected / quarantined / superseded`; neither document nor version `infected`. It may be added before it is accepted (then it is simply *not ready*). The packet stores the exact `documentVersion` and **never follows `CaseDocument.currentVersion`** afterwards; the DTO exposes `currentVersionNumber` so the UI can say “a newer version (3) exists; this packet keeps version 1”. Staff may pin an **older immutable version** of a document by id (the candidate list offers the current accepted version; the add endpoint validates any exact version) — documented in OpenAPI. Re-adding the same version changes nothing.

**Smart Form provenance.** `addSmartFormReference({smartFormId})` pins the form's current `revision` / `lockedRevision`. A Smart Form is a **reference only**: it never has a download action and is never presented as a filing PDF — where a real form PDF is needed, staff add the accepted `uscis_forms` document. Draft/submitted forms may be added but are not ready.

**Item metadata.** `PATCH items/:id` changes `role / required / notes` only; source ids are not editable (replace = remove + add; tested that a body carrying `documentVersion` is ignored).

## Ordering and reorder semantics

`POST …/reorder {revision, orderedItemIds}`: the server accepts **exactly** the packet's item ids — duplicates, missing ids, unknown ids and non-arrays are all `400` and write nothing — then renumbers **1..N** and increments the revision atomically. `removeItem` renumbers contiguously. The browser's array order is never authority. Angular uses explicit **Move up / Move down** (no drag-and-drop), which sends the full ordered id list.

## Readiness rules (one resolver, `resolveReadiness`)

| Source | Ready when |
|---|---|
| Petition | the pinned `PetitionVersion` exists in this case and is the finalization snapshot (or no petition is required for the kind) |
| Document version | document in this case; `documentVersion` belongs to that document; document status **`accepted`**; not archived/rejected/quarantined/superseded; neither document nor version `infected` |
| Smart Form reference | live status `approved` or `locked` **and** the live revision equals the pinned revision (a form edited and re-approved after pinning must be removed and re-added — the reason is shown) |
| Any source that no longer exists | `missing`, not ready |

Per-source `{ready, status, reason, source}`; summary `{ready, petitionReady, requiredReady, requiredTotal}`. **No scoring and no legal wording**: the UI states readiness describes the sources, not the case.

## Lifecycle

```text
draft ─submit─► review ─approve─► approved ─finalize─► finalized
  ▲               │                  │
  └─ needs_changes ◄──── return ─────┘
```

| Action | Capability | Rules |
|---|---|---|
| submit | `filing_packets.manage` | from `draft`/`needs_changes`; ≥ 1 item; petition source where required. **Items need not be ready** (ADR/prompt) |
| return | `filing_packets.review` | from `review`/`approved`; `internalReviewNote` required |
| approve | `filing_packets.review` | from `review`; structure valid (petition where required, ≥ 1 item, no source that no longer exists); readiness is *not* required; no file is produced |
| finalize | `filing_packets.finalize` | from `approved`; petition source ready; every **required** item ready; **any missing source blocks, even optional** (it cannot be snapshotted); optional unready items are allowed and recorded as they were |

Manifest edits (source, items, order, metadata) are allowed only in `draft`/`needs_changes`. `archived` exists in the enum, but no archive route is exposed. Finalized packets reject every mutation (`409 invalid_state`, asserted over all ten mutating routes). **No hard-delete route.**

## Capability changes

`filing_packets.view | manage | review | finalize` added to `server/utils/permissions.js` and `src/lib/auth/capabilities.ts`; `employee-capability-contract.json` regenerated from the server map (never hand-edited); both contract suites pass. Grants exactly per the ADR/prompt. Assemble, approve and lock are three separate rights; capabilities never replace case membership.

## Staff API (`/api/v1/staff`, `server/routes/api/v1/staff/filing-packets.js`)

```text
GET    /cases/:caseId/filing-packets
POST   /cases/:caseId/filing-packets
POST   /cases/:caseId/filing-packets/provision
GET    /filing-packets/:packetId
PATCH  /filing-packets/:packetId                         (title/description)
POST   /filing-packets/:packetId/petition-version
GET    /filing-packets/:packetId/candidates?type=petition_version|document_version|smart_form
POST   /filing-packets/:packetId/items
PATCH  /filing-packets/:packetId/items/:itemId
DELETE /filing-packets/:packetId/items/:itemId?revision=
POST   /filing-packets/:packetId/reorder
POST   /filing-packets/:packetId/submit | return | approve | finalize
GET    /filing-packets/:packetId/versions
GET    /filing-packets/:packetId/versions/:versionId
```

Capability **and** case membership (or `cases.view_all`) on every route (`filingPacketPolicy`, reusing `casePolicy` through `petitionPolicy.canAccessCase`); missing, malformed id, other case, removed member, and a source id from another case are one identical `404`. Mutations pass `trustedOriginMiddleware` (DELETE included); `mustChangePassword` is blocked by the router prelude. **Every mutation requires the expected `revision`** and writes with `updateOne({_id, revision, status:{$in}}, {…, $inc:{revision:1}})` — never `document.save()` — so a stale write is `409 conflict` carrying `{revision, status}`; an illegal state is `409 invalid_state`. Documented in `server/openapi/v1.yaml` (14 paths with 400/403/404/409 semantics).

## Secure download integration

The packet **serves no bytes** (a test asserts there is no packet-level download route). A document item's DTO carries `downloadAction {documentId, versionId}`, which Angular passes to the **existing** `GET /staff/documents/:documentId/versions/:versionId/download`. That route keeps its own capability (`document_versions.view`) and row policy, `DocumentAccessLog`, `Content-Disposition: attachment`, `nosniff`, `private, no-store` and `sandbox` CSP — none of it re-implemented. `downloadAction` is omitted when the actor lacks `document_versions.view` (today every role that can view packets can also view versions, so both see it; the flag will follow a future narrower grant). Smart Form items never have one.

## Manifest hash

`computeManifestHash` (Node `crypto`, sha256) over a canonical, fixed-key-order JSON of: packet id, version number, source revision, petition version id, and per item (sorted by `order`) `order, type, role, required, document id, document-version id, Smart Form id, pinned revision, pinned locked revision`. Stored hex on the version. Tests: it is recomputable from the stored immutable data; independent of array order but sensitive to `order`; changes with version number. It is an **audit fingerprint to detect accidental drift — not a signature or attestation**, and the UI says so.

## Immutable `FilingPacketVersion` / provenance

Fields: `packet, case, workspace, versionNumber, reason (finalization), sourceRevision, kind, titleSnapshot, descriptionSnapshot, petitionSource, items[], manifestHash, createdBy(+Name)`.

- `petitionSource`: `petitionVersionId, petitionId, versionNumber, sourceRevision, petitionKind, petitionTitle, createdAt` (full text stays in `PetitionVersion`).
- Document item: `documentId, documentVersionId, displayName, versionNumber, mimeType, size, categoryName, documentStatus, role, order, required`.
- Smart Form item: `caseSmartFormId, templateKey, templateVersion, revision, lockedRevision, status, label, role, order, required`.

Never stored: storage keys, checksums, paths, URLs, bytes (asserted with canaries). The model refuses `updateOne/updateMany/findOneAndUpdate/replaceOne/delete*` and re-`save()`; tested. **Tested that the snapshot and hash do not move** when, after finalization, the live document gets a newer version / is renamed / archived, the Smart Form's revision and status change, or a newer petition version appears.

**Finalization atomicity.** Transactions are not assumed (standalone Mongo has none). Readiness is resolved first; the status flips with an atomic revision-guarded write; then the immutable version is written; if that fails the status is restored, the response is `409`, and no `filing_packet_finalized` activity is recorded — a packet is never reported finalized without its snapshot. Tested by forcing `FilingPacketVersion.create` to throw, then retrying successfully. Version numbers are allocated `max + 1` with the unique index as arbiter and a bounded retry.

## Angular Filing Packet workspace

`enterprise-ui/.../case-detail/packet-tab/` (`ih-packet-tab`), wired as a **Filing Packet** tab. Packet list (auto-opens when there is one) with capability-gated create/provision and additional RFE/NOID/supplemental packets; petition-source panel with a finalized-version picker and Clear; ordered item list with readiness badge + reason, role selector, required toggle, **Move up / Move down**, Remove, and **secure per-item Download**; candidate picker (accepted documents, approved/locked Smart Forms) with role/required; submit / return (note required) / approve / finalize (confirm dialog; disabled with a visible reason while the petition source or a required item is not ready); version history and a read-only exact-manifest view with its hash; finalized read-only state; **Print manifest** (working copy or the opened immutable version); loading / empty / no-access / error-retry / **conflict** (“Reload latest version”) states; responsive; labelled controls with per-item `sr-only` names; `role="alert"`. No new framework; no `any` or non-null assertions in the template; **no packet data is written to localStorage**.

**Print manifest.** A standalone HTML document built by a pure function (`buildManifestHtml`) and printed from a `window.open` window. Every value — filenames, titles, notes — goes through `escapeHtml` (tested with an `<img onerror>` filename); it is titled “Filing manifest”, lists case number, packet title/status/version, petition source, numbered items with label/role/required/source version/status, finalized time and the hash, and states it is “not a combined filing document, a signature or a statement about the strength of the case”. It is never called the filing PDF.

## DTO / privacy boundaries

Explicit DTOs only (summary, detail, item, version summary, version detail). Never returned: raw Mongoose documents, `storageKey` / `checksum` / paths, `AdminUser` / `ClientUser` records, session data. Tested with canaries over the packet detail, candidate lists and a version. No client exposure. No filename or manifest content in `CaseActivity`, logs or notifications (tested with a filename canary).

## CaseActivity

`filing_packet_created`, `filing_packet_submitted`, `filing_packet_returned`, `filing_packet_approved`, `filing_packet_finalized` — added to `server/models/CaseActivity.js`, `src/lib/models/CaseActivity.ts` and `case-schema-contract.json` (both contract suites green). Messages carry the packet **title** and actor name only. Add/remove/reorder write none (tested). Recording is fail-open.

## Notifications

**Not implemented.** The prompt makes them optional and says to defer if they materially expand the work: a petition/packet notification type touches the `Notification` enum, its Next.js mirror and a cross-app contract. The packet status, review note and `CaseActivity` rows carry the workflow. Follow-up: `notificationService.notifyEmployee` for submit / return / approve once a packet notification type is agreed. No client notification exists.

## Tests added

| Suite | File | Covers |
|---|---|---|
| Server | `integration/filing-packets.integration.test.js` (21) | provision/idempotent/multiple + sequence uniqueness; 401 / password-setup / no-capability / view-only; no membership, removed member (immediate), other case, malformed ids, org-wide admin; Origin refusal (POST/PATCH/DELETE); petition source (same-case, cross-case concealed, approval snapshot refused, clear); document pinning (exact version, wrong-document version, cross-case, archived/rejected/infected refused, older version pinnable, duplicate idempotent); live replacement does not change the pin; unaccepted-not-ready then accepted/infected; Smart Form approved/locked/draft/submitted/cross-case/revision-changed; candidates same-case + DTO canaries; secure-download action and no packet download route; metadata/remove/reorder (duplicate, missing, unknown, non-array, contiguous); stale 409 and simultaneous mutations; submit rules; `other` kind without a petition; return/approve/finalize gating and permissions; required-unready blocks, optional does not, exact snapshot content; snapshot + hash stable across live changes and recomputable; finalized immutability on ten routes, version update/delete refusal, no delete route; snapshot-failure rollback and retry; activity milestones without filenames |
| Contracts | `employee-capability-contract` (server + root), `case-schema-contract` (server + root) | four new capabilities, five new activity types |
| Angular | `packet-tab.component.spec.ts` (+ pure-state tests) (22) | escaping and manifest HTML, sizes; empty/provision (capability-gated); list + select; no-access and error/retry; petition source + item order + readiness reasons + newer-version notice; read-only role; petition pick; add document / add Smart Form; remove; role/required; Move up/down (ends cannot move); 409 conflict + reload; secure download route + blob; submit, return-note rule, approve; finalize guard + confirm; finalized read-only + version/hash view; print (escaped, working copy) and blocked pop-up |

## Verification

Local, run sequentially (never concurrently):

- root `npm test`: **400/400**
- `cd server && npm test`: **585/585** (includes the 21 filing-packet integration tests)
- Angular `ng test case-management`: **69/69** (22 new)
- `npm run lint`, `npx tsc --noEmit`, `git diff --check`: clean
- `ng build case-management` and `ng build admin-console`: succeed
- `cd server && npm run db:indexes:dry-run`: lists `FilingPacket` (3 indexes) and `FilingPacketVersion` (2 indexes)
- OpenAPI: `server/openapi/v1.yaml` parses; 14 filing-packet paths

A local `next build` is blocked on this machine (Application Control blocks SWC); the production build is covered by the CI `Lint · types · build` job. Phase 10 changed no Next.js pages — only the capability map and the `CaseActivity` type list in `src/lib`.

## Manual QA

**Not performed in a browser.** The flow in the prompt (§49) is exercised end to end at the API level by `filing-packets.integration.test.js` — create packet, pin a finalized petition version, add accepted/pending documents and Smart Form references, reorder, set roles, submit, return with a note, resubmit, approve, finalize, open the immutable version, replace a live document with a newer version and confirm the finalized packet still points at the old selected version, and a removed employee losing access immediately — and at component level by the Angular spec (including the secure download call and the escaped print window). A click-through of the running Angular UI against a real database, including an actual browser print and a real file download, is still recommended before release.

## Migration and production impact

**Migration impact: none.** Existing cases have zero packets and stay valid; packets are created explicitly. **Production impact: NONE** — no deploy, no migration, no index build, no backfill was run, and nothing was merged to `main`.

## Legacy `DeliveryRecord`

Unchanged and unused. Lead/admin delivery flows pass untouched. It is not migrated, deleted or referenced; its `files[].url` pattern was deliberately not copied.

## Known limitations

- **No notifications** (see above).
- **No archive or reopen of a finalized packet** — a changed filing is a new packet.
- **No binary assembly** — see below.
- **Smart Form reference breaks on any revision change** after pinning (strict by design); staff remove and re-add the reviewed form.
- **The candidate picker offers the current accepted version only**; an older version needs its id through the API (supported and validated, not yet surfaced in the UI).
- **Document readiness requires `accepted`**, as the ADR specifies; an uploaded-but-unreviewed work product must be accepted before it can be filed.
- **Manifest hash includes the packet version number**, so it is only meaningful together with the immutable version row it is stored on.
- **Version creation is two writes, not a transaction** (compensating revert; see above).
- **Print uses a pop-up window**; a browser that blocks pop-ups shows a toast instead.
- The Angular `case-detail.component.scss` exceeds its 4 kB budget by 448 bytes (pre-existing warning).

## Binary-generation deferral

Deliberately not built, per the ADR/prompt: combined PDF, ZIP, flattening, page numbering/stamping, bookmarks, barcode handling, cover-sheet generation, official USCIS PDF rendering, e-signature, electronic filing. **No dependency was added** (`package.json` / lockfiles untouched). If binary assembly is added later it must consume a `FilingPacketVersion`, never the live packet, so packet history is unaffected.

## USCIS Tracking boundary

Nothing here records receipt numbers, filing dates, USCIS statuses or outcomes, and no USCIS API is called. Phase 11 (USCIS Tracking) was not started.

## Rollback

Everything is additive and staff-only: revert the Phase 10 commits with a normal `git revert` (no history rewrite). The two new collections can be left in place or dropped; nothing else reads them. The four capabilities and five `CaseActivity` types are inert if unused. No existing behaviour was changed.

## Final status

**Final Phase 10 code SHA: `07cd8e1f5c00d235a47d461f36abd3b93286b4f6`** — GitHub Actions **CI #80**, run ID **36938005936**: **success**. All four required jobs green:

| Job | Conclusion |
|---|---|
| Tests (Next.js app) | success |
| Lint · types · build | success |
| Enterprise UI (Angular) | success |
| Tests (admin CMS) | success |

Implementation commits (additive, no history rewrite):

- `a043f12` feat(packets): add case-native filing packet domain and staff API
- `07cd8e1` feat(angular): add case filing packet workspace for staff

CI was green on the first push; no repair commit was needed. The Phase 09 lockfile fix (`2486fab`) was preserved.

This report is added in a follow-up docs-only commit; see `git log` for its SHA. No production deploy, migration, index build or backfill was performed, nothing was merged to `main`, and Phase 11 (USCIS Tracking) was not started.
