# Phase 09 — Case-Native Petition Work V1: Completion Report

**Branch:** `architecture/angular-enterprise-platform`
**Authority:** `ADR-022-case-native-petition-work-v1.md`, `PHASE_09_PETITION_WORK_PROMPT.md`

## Commits

- **Starting SHA:** `ee732b2` (Phase 09 docs tip; Phase 08 implementation `df090f9` and docs `82636a0` are ancestors and unchanged).
- **Implementation commits:** see [Final status](#final-status) — filled in after the push, from the real log.
- **Ending SHA / CI:** see [Final status](#final-status).

## What shipped

```text
ClientCase ─┬─ CasePetition (1..n, unique {case, sequence})
            │     ├─ sections[]       plain text, assignee, review state
            │     ├─ dependencies[]   → EvidenceRequirement | CaseSmartForm | CaseDocument | Task   (same case only)
            │     └─ lifecycle        drafting → internal_review → approved → finalized
            └─ PetitionVersion (immutable)   at approval and at finalization
                                             sections as reviewed + dependency provenance
```

Staff-only. There is no client portal route, no petition DTO in the Next.js app, and no Next.js model mirror (the Next apps never read these collections). `DeliveryRecord` is untouched and nothing here depends on it.

## Models / collections / indexes

| Model | Collection | Indexes |
|---|---|---|
| `CasePetition` | `case_petitions` | unique `{case, sequence}`; `{case, status, updatedAt:-1}`; `{workspace, updatedAt:-1}` |
| `PetitionVersion` | `petition_versions` | unique `{petition, versionNumber}`; `{case, createdAt:-1}` |

The ADR's optional `{ "sections.assignedTo": 1, status: 1 }` index was **not** added: no route or query in this phase reads petitions by assignee. Both models are in `server/scripts/createIndexes.js` (dry-run verified, 3 + 2 indexes listed). **No index was built against any live database.**

## Petition kinds and multiple petitions

Kinds: `primary`, `rfe_response`, `noid_response`, `supplemental`, `other`. A case may own many petitions; `sequence` is server-assigned and unique per case (a lost race retries). `POST …/petitions/provision` is idempotent for `kind=primary, sequence=1` and never runs implicitly on read; `POST …/petitions` creates additional ones. There is no backfill.

## Case-type template catalog (`server/services/petitionTemplates.js`)

Code-owned, **section titles only** — no legal text or standard is shipped, so nothing can misstate law or promise an outcome (a test also bans words like guarantee/attorney/lawyer in titles). Every current `CASE_TYPE_VALUES` entry has an explicit decision, asserted by `petition-templates.test.js`:

| Case type | Decision |
|---|---|
| `eb2_niw`, `eb1a`, `eb1b`, `eb1c`, `o1` | Petition outline tailored to the classification (overview, background, framework / criteria, evidence analysis, conclusion …) |
| `rfe_response`, `noid_response` | Notice structure (summary of the notice, response per issue / ground, supporting evidence, conclusion) — also used for an `rfe_response` / `noid_response` *kind* on any case |
| `recommendation_letters`, `expert_opinion_letters`, `business_plan`, `evidence_packaging`, `uscis_forms` | Minimal **work-product outline** that fits that work (plan/scope/outline + notes) — not a petition-letter outline |
| `other` | **No automatic petition** (provision returns 400); one can still be created deliberately from a generic `work_summary` / `notes` template |

## Sections, assignment and ownership

- Embedded sections: `key, title, order, required, body, reviewStatus, assignedTo(+Name snapshot), lastEdited*, reviewed*, reviewNote`. Body is **plain text** (≤ 50 000 chars, `\r\n` normalised, never HTML; the UI renders it through Angular interpolation and a `<textarea>`).
- **Assignment** (`petitions.manage`): the assignee must be an active `AdminUser`, an **active member of that case workspace**, and hold a role that can draft or review petitions. Failure is a controlled 400 (“Add this employee to the case team before assigning petition work.”). Assignment never creates membership or grants access. The name is snapshotted.
- **Ownership** (server-side, `petitionPolicy.canDraftSection`): editing needs `petitions.edit` **and** (`petitions.manage` **or** the section is assigned to the actor). A `petition_writer` therefore edits only assigned sections; a manager edits any; a `reviewer` (review capability, no edit capability) cannot draft at all. Angular buttons only reflect the `actions` the server computed.

## Section review workflow

`draft | changes_requested → ready_for_review` (assignee or manager; text required) → `approved` (`petitions.review`); `ready_for_review | approved → changes_requested` (note required, reviewer snapshot + time). Editing a `ready_for_review` / `approved` section drops it back to `draft` and clears the reviewer snapshot — approved text that changed must be re-reviewed. A writer cannot approve (no `petitions.review`).

## Petition lifecycle

```text
drafting ─submit─► internal_review ─approve─► approved ─finalize─► finalized
   ▲                    │                        │
   └──── needs_changes ◄┴────────── return ───────┘
```

| Action | Capability | Rules |
|---|---|---|
| submit | `petitions.manage` | from `drafting`/`needs_changes`; every required section has text and is `ready_for_review` or `approved` (400 keyed by section) |
| return | `petitions.review` | from `internal_review`/`approved`; `internalReviewNote` required |
| approve | `petitions.review` | from `internal_review`; every required section `approved`; writes **approval** version |
| finalize | `petitions.finalize` | from `approved`; required sections approved; every dependency with `requiredForFinalization` ready; writes **final** version |

`archived` exists in the enum for completeness but no archive route is exposed (the ADR calls it optional). There is **no hard-delete route**. A finalized petition rejects every mutation (`409 invalid_state`, tested across all eight mutating routes).

**Version milestones:** approval and finalization only (the ADR's stated minimum). A review-submission snapshot was not added: it would double the version count without adding provenance the approval snapshot lacks.

**Finalization atomicity.** MongoDB transactions are not assumed (a standalone deployment has none). The status flips first with an atomic `updateOne({_id, revision, status})`, then the immutable `PetitionVersion` is written; if the version cannot be written the status is put back, the response is a `409`, and no `petition_finalized` activity is recorded — a petition is never reported finalized without its snapshot. Covered by a test that forces `PetitionVersion.create` to throw, then retries successfully. Version numbers are allocated `max + 1` with the unique index as the arbiter and a bounded retry.

## Dependencies and readiness

Types: `evidence_requirement`, `smart_form`, `case_document`, `task`. Fields: `type, refId, labelSnapshot, role, requiredForFinalization, order` (+ server `_id`). `role` (business_plan, recommendation_letter, expert_opinion_letter, supporting_document, other) is valid only for documents — **no new BusinessPlan/RecommendationLetter collection**; work products stay secure `CaseDocument`s, usually driven by case Tasks.

**Same-case integrity.** `loadSameCaseRef` looks the record up by `{_id, case[, workspace]}`; a missing id, another case's id and a malformed id are the same `404`. Tasks must have `task.case == petition.case` (a lead-only task cannot link). Duplicates are idempotent (no revision bump; a concurrent duplicate is refused by the write filter). Archived / quarantined / rejected / superseded documents cannot be linked. At most 100 links.

**One readiness resolver** (`resolveDependencies`), per type, returning `{ready, status, reason, label, provenance}`:

| Type | Ready when |
|---|---|
| Evidence requirement | `satisfied`, `waived` or `not_applicable` |
| Smart Form | `approved` or `locked` |
| Case document | status **`accepted`**, has a current version, not archived/rejected/quarantined/superseded, scan not `infected` |
| Task | `completed` |
| (any) | a record that no longer exists is not ready (`missing`) |

The ADR says to *prefer* `accepted` for documents “where existing review semantics make that meaningful”; this phase requires it, because an unreviewed upload is not final work. If employee-uploaded work products should auto-accept, that is a Documents-module decision, not a petition one. There is **no scoring**: progress is two plain counts (approved required sections / total; ready required dependencies / total) and the UI states they are operational counts, not an assessment of the case.

**Candidate picker.** `GET …/dependency-candidates?type=` (bounded to 100, same case + workspace only, flags `linked`) feeds the Angular picker; petition DTOs do not duplicate the underlying datasets.

## Immutable PetitionVersion / provenance

Fields: `petition, case, workspace, versionNumber, reason (approval|finalization), sourceRevision, kind, titleSnapshot, statusSnapshot, sections[], dependencies[], createdBy(+Name)`. Sections are snapshotted as reviewed (key, title, order, required, body, reviewStatus, assignee/reviewer names, review note). Per-dependency provenance, built by the resolver:

- evidence: `requirementId, title, status`
- Smart Form: `caseSmartFormId, templateKey, templateVersion, revision, status, lockedRevision`
- document: `caseDocumentId, documentVersionId, displayName, versionNumber, status` — the **current version at that moment**
- task: `taskId, title, status, completedAt`

Never copied: storage keys, checksums, file bytes, URLs. The model refuses `updateOne/updateMany/findOneAndUpdate/replaceOne/delete*` and re-`save()`; tested, including that the snapshot does not move when the live document / Smart Form later changes.

## Capabilities

`petitions.view | manage | edit | review | finalize` added to `server/utils/permissions.js` and `src/lib/auth/capabilities.ts`, with `employee-capability-contract.json` regenerated from the server map (never hand-edited); both contract suites pass. Grants exactly as in the ADR/prompt. Capabilities never replace case membership.

## Staff API (`/api/v1/staff`, `server/routes/api/v1/staff/petitions.js`)

```text
GET    /cases/:caseId/petitions
POST   /cases/:caseId/petitions
POST   /cases/:caseId/petitions/provision
GET    /petitions/:petitionId
PATCH  /petitions/:petitionId                              (title/description)
PATCH  /petitions/:petitionId/sections/:sectionKey         (autosave)
POST   /petitions/:petitionId/sections/:sectionKey/assign | review | return | approve
GET    /petitions/:petitionId/dependency-candidates?type=
POST   /petitions/:petitionId/dependencies
DELETE /petitions/:petitionId/dependencies/:dependencyId?revision=
POST   /petitions/:petitionId/submit | return | approve | finalize
GET    /petitions/:petitionId/versions
GET    /petitions/:petitionId/versions/:versionId
```

Capability **and** case membership (or `cases.view_all`) on every route; missing, malformed id, other case and removed member are one identical `404`. Mutations pass `trustedOriginMiddleware` (DELETE included); `mustChangePassword` is blocked by the router prelude. **Every mutation requires the expected petition `revision`** and writes with `updateOne({_id, revision, status:{$in}}, {…, $inc:{revision:1}})` — never `document.save()` — so a stale write is `409 conflict` carrying `{revision, status}`; an illegal state is `409 invalid_state`. An unchanged section body does not bump the revision. All mutations answer with the refreshed detail DTO. Documented in `server/openapi/v1.yaml` (17 paths; 400/403/404/409 semantics and the revision contract).

## Angular Petition workspace

`enterprise-ui/.../case-detail/petition-tab/` (`ih-petition-tab`), wired as a **Petition** tab. Petition list (auto-opens when there is one), capability-gated “Create primary petition” and additional petitions, section navigation with review-status badges and assignee, plain-text editor with **1.2 s debounced autosave** and the Saving / Saved / Unsaved / Conflict / Error states, one in-flight save, flush-before-switch-section and flush-before-any-action so typed text is never lost, **409 → saving halts, the local text is kept in memory, and “Reload latest version” is offered**, assignment, mark-ready / return-with-note / approve section, dependency panel grouped by evidence / forms / documents / tasks with Ready / Not ready + reason, same-case candidate picker with required/optional and document role, petition submit / return (note required) / approve / finalize (confirm dialog, disabled with a visible reason while a required item is not ready), version list with read-only snapshot view, read-only finalized state, loading / empty / no-access / error-retry states, single-column layout under 1100 px, labelled controls, `role="status"` / `role="alert"`. No new framework; no `any` in new code; **petition text is never written to localStorage**.

## DTO / privacy boundaries

Explicit DTOs only (summary, detail, section, dependency, version). Never returned: raw Mongoose documents, `storageKey` / `checksum` / paths, `AdminUser` / `ClientUser` records, session data. Tested with canary strings (`SECRET-STORAGE-KEY-…`, `SECRET-CHECKSUM-…`, `passwordHash`, `tokenHash`) over the petition detail, the candidates list and a version. No client exposure at all. No petition text in `CaseActivity`, logs, notifications or `SecurityEvent` (tested with a canary).

## CaseActivity

`petition_created`, `petition_submitted`, `petition_returned`, `petition_approved`, `petition_finalized` — added to `server/models/CaseActivity.js`, `src/lib/models/CaseActivity.ts` and `case-schema-contract.json` (both contract suites green). Messages carry the petition **title** and actor name only. Autosave and section edits write none (tested: exactly one activity after two autosaves). Recording is fail-open.

## Notifications

**Not implemented in this phase.** The ADR makes them optional (“where low-risk and useful”). Adding a notification type touches the `Notification` enum, its Next.js mirror and a cross-app contract for a convenience feature; that did not fit the “simple + secure + tested” guardrail. Section assignment is visible in the Angular tab and `CaseActivity` records the lifecycle. Follow-up: use `notificationService.notifyEmployee` for assign / submit / return / approve once a petition notification type is agreed. Nothing here sends a client notification.

## Pre-existing defect fixed on the way

`server/models/EvidenceRequirement.js` declared its `pre('save')` hook in the callback form (`function (next) { …; next(); }`). Under the installed Mongoose 9 that throws `next is not a function` on **every** create and save, so evidence provisioning, custom requirements and status updates would fail in any environment using this Mongoose. No existing test covered the model, so it was invisible. The hook is now synchronous (the convention already used in `Task.js`), and `petitions.integration.test.js` exercises create and a status-changing `save()` as a regression guard. This is a one-line, behaviour-restoring fix; it is called out because it changes an existing model.

## Tests added

| Suite | File | Covers |
|---|---|---|
| Server | `petition-templates.test.js` | explicit decision for every case type, unique/ordered section keys, work-product outlines, response structure, banned-language guard |
| Server | `integration/petitions.integration.test.js` (19) | provisioning + idempotency + multiple petitions + sequence uniqueness; no-auto-petition type; 401 / password-setup / no-capability / read-only; no membership, removed member (immediate), other case, malformed ids, org-wide admin; Origin refusal (PATCH/POST/DELETE); writer-only-assigned, manager-any, reviewer-cannot-draft; autosave revision bump, unchanged no-bump, stale 409, simultaneous saves, bounds; section review (empty/ready/note/approve/invalid/re-open on edit); assignment rules; same-case links for all four types, cross-case concealment, duplicates, document role/state; readiness per type incl. scan/no-version; candidates + DTO leakage canaries; submit/approve section rules, approval version; finalize gating (required vs optional dependency), final provenance (document version, Smart Form revision/lockedRevision, evidence, task), snapshot stability; finalized immutability on all mutating routes, version update/delete refusal, no delete route; snapshot-failure rollback and retry; activity milestones without text; version numbering |
| Contracts | `employee-capability-contract` (server + root), `case-schema-contract` (server + root) | five new capabilities, five new activity types |
| Angular | `petition-tab.component.spec.ts` (17) | empty/provision (capability-gated), list + select, no-access, section render and ownership, debounce, revision advance, 409 conflict (text kept, halted, reload), retry, assignment, reviewer controls and note rule, dependency grouping/readiness, candidate link, submit (and flush-first), petition return note rule, finalize guard + confirm, finalized read-only + version snapshot, error/retry |

## Verification

Local, run sequentially (never concurrently):

- root `npm test`: **400/400**
- `cd server && npm test`: **564/564** (includes the 19 petition integration tests and the template tests)
- Angular `ng test case-management`: **47/47**
- `npm run lint`, `npx tsc --noEmit`, `git diff --check`: clean
- `ng build case-management` and `ng build admin-console`: succeed
- `cd server && npm run db:indexes:dry-run`: lists `CasePetition` (3 indexes) and `PetitionVersion` (2 indexes)
- OpenAPI: `server/openapi/v1.yaml` parses; 17 petition paths

A local `next build` is blocked on this machine (Application Control blocks SWC); the production build is covered by the CI `Lint · types · build` job. Phase 09 changed no Next.js pages — only the capability map and the `CaseActivity` type list in `src/lib`.

## Manual QA

**Not performed in a browser.** The manager → writer → reviewer → finalize flow in the prompt (§50) is exercised end to end at the API level by `petitions.integration.test.js` (provision, assign, link all four dependency types, draft/autosave, mark ready, return with note, resubmit, approve sections, submit, approve, finalize, open the immutable version, finalized read-only, removed member loses access immediately) and at component level by the Angular spec. A click-through of the running Angular UI against a real database is still recommended before release.

## Migration and production impact

**Migration impact: none.** Existing cases have zero petitions and stay valid; petitions are created explicitly. **Production impact: NONE** — no deploy, no migration, no index build, no backfill was run, and nothing was merged to `main`.

## Legacy `DeliveryRecord`

Unchanged and unused by this phase. Lead/admin delivery flows and their tests pass untouched. It is not migrated, deleted or referenced; its `files[].url` pattern was deliberately not copied.

## Known limitations

- **No notifications** (see above).
- **No archive route** and no “reopen finalized” — a finalized petition is final; later work is a new petition (`supplemental` / `rfe_response`).
- **Assignee picker** uses the existing case `member-options` list (all active employees); the server rejects non-members with the controlled message instead of the UI pre-filtering to the case team.
- **No field-level merge:** two editors on one petition get a 409 and must reload; unsaved local text is kept in memory for the stale editor but is not auto-merged.
- **`petitions.view` is broad** (every specialist role, per the ADR); content visibility is therefore bounded by case membership, not by role. If narrower reading rights are wanted, that is a capability-matrix change.
- **Document readiness requires `accepted`** (see above).
- **Version creation is two writes, not a transaction** (compensating revert; see above).
- The Angular `case-detail.component.scss` exceeds its 4 kB budget by 448 bytes (pre-existing warning).

## Filing Packet boundary

A finalized `PetitionVersion` is the end of this phase. Nothing here builds a packet: no ordered filing list, no ZIP/PDF, no cover sheet, no export, no official USCIS form rendering. Phase 10 consumes the finalized version plus approved Smart Forms and chosen document versions through the identifiers stored in the provenance snapshot.

## Rollback

Everything is additive and staff-only: revert the Phase 09 commits (no history rewrite needed — a normal `git revert`). The two new collections can be left in place or dropped; nothing else reads them. The only existing-code behaviour change is the `EvidenceRequirement` hook fix, which can be reverted independently (but restores a crash). The five new `CaseActivity` types are inert if unused.

## Final status

**Final Phase 09 code SHA: `2486fabc9c56981e27af74868256d61e3b56ad37`** — GitHub Actions **CI #76**, run ID **36930971463**: **success**. All four required jobs green:

| Job | Conclusion |
|---|---|
| Tests (Next.js app) | success |
| Lint · types · build | success |
| Enterprise UI (Angular) | success |
| Tests (admin CMS) | success |

Commit sequence (additive, no history rewrite):

- `ef78ea3` feat(petitions): add case-native petition domain and staff API
- `38deced` feat(angular): add case petition workspace for staff — **CI #75 failed** (see below)
- `2486fab` fix(deps): restore package-lock.json so npm ci succeeds again — **CI #76 green**

**CI #75 was red for a reason outside Phase 09.** The two root jobs (`Tests (Next.js app)`, `Lint · types · build`) failed at `npm ci`, while `Tests (admin CMS)` and `Enterprise UI (Angular)` passed. Commit `600657e` (“Refactor code structure…”, which predates this phase) had committed a `package-lock.json` with the `firebase` packages removed while `package.json` still requires `firebase`, so `npm ci` refused to install. CI had been red since #72 (`600657e`) and #74 (`ee732b2`); the last green run before this phase was #71 (`82636a0`). The fix restores `package-lock.json` from `82636a0` — no dependency version changed, `package.json` untouched. If removing firebase was intentional, remove it from `package.json` and regenerate the lock instead; that is a product decision this phase did not make.

This report is added in a follow-up docs-only commit; see `git log` for its SHA. No production deploy, migration, index build or backfill was performed, nothing was merged to `main`, and Phase 10 (Filing Packets) was not started.
