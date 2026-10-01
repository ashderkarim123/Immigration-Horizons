# Phase 08 — Smart Forms V1: Completion Report

**Branch:** `architecture/angular-enterprise-platform`
**Authority:** `ADR-021-smart-forms-v1.md`, `PHASE_08_SMART_FORMS_PROMPT.md`

## Commits

- **Starting SHA:** `f47e950` (Phase 07 merge tip; no Phase 08 code existed before this session).
- **Implementation commits:**
  - `fc9fe72` feat(api): add Smart Forms domain and canonical staff API
  - `621d643` feat(portal): add client Smart Forms with autosave and submit
  - `df090f9` feat(angular): add case Forms tab for staff
- **Ending SHA / CI:** see [Final status](#final-status).

## What shipped

```text
code-owned templates ─► SmartFormTemplate (published, immutable)
                              │ provision (idempotent, prefilled snapshot)
                              ▼
                       CaseSmartForm  ◄── client (Next.js portal)  autosave / submit
                              ▲        ◄── staff  (Express /api/v1/staff → Angular)  edit / review
                              │
                       SmartFormAudit (append-only, field KEYS only)
```

State machine, enforced only on the server:

```text
draft ─submit─► submitted ─approve─► approved ─lock─► locked (immutable)
  ▲                │                    │
  └─needs_changes◄─┴──────return────────┘      (return needs a client-visible note)
```

| Actor | May edit answers in | May transition |
|---|---|---|
| Client (portal) | `draft`, `needs_changes` | submit |
| Staff (`forms.edit`) | `draft`, `needs_changes`, `submitted` | submit on behalf |
| Staff (`forms.review`) | — | return, approve |
| Staff (`forms.lock`) | — | lock |

## Domain model

Three new collections, mirrored (Express JS ↔ Next TS) and pinned by `docs/architecture/smart-form-contract.json`, asserted from both suites:

- `smart_form_templates` — `{key, version}` unique; published = frozen (`pre('save')` guard + seeder refuses to rewrite).
- `case_smart_forms` — unique `{case, templateKey, templateVersion}`; `answers` keyed by stable snake_case field keys; `revision`, `progress`, `clientReviewNote` / `internalReviewNote`, `lockedRevision`.
- `smart_form_audits` — append-only at the model layer (update/delete hooks throw); `changedFieldKeys`, never values or note text.

Capabilities (mirrored map + regenerated `employee-capability-contract.json`): `forms.view`, `forms.edit`, `forms.review`, `forms.lock`, `form_templates.manage`. Five `CaseActivity` types added (`form_provisioned|submitted|returned|approved|locked`), in both models and `case-schema-contract.json`. Activity messages carry the form title and actor name only — never answers.

## Engine

`server/services/smartForms/engine.js` (pure, no I/O) and its TypeScript mirror `src/lib/forms/engine.ts` are both asserted against one shared fixture, `docs/architecture/smart-form-engine-vectors.json` (27 normalisation, 8 visibility, 7 submit/progress vectors). 12 field types, one level of repeated group, a closed condition vocabulary (`equals`, `notEquals`, `isTruthy`, `isFalsy`) with **no expression language**. Autosave normalises non-strictly (a half-typed email is stored); submit/approve re-validate strictly. Hidden-field answers are retained but never block submission or count towards progress. A `staffOnly` field cannot be required or client-editable (rejected at template validation).

## Template catalog and provisioning

`catalog.js` ships 15 intake templates (Personal & Contact; Immigration & Travel History; one `intake_<caseType>` per case type, derived from `CASE_TYPES` so there is no second list). Deliberately concise intake forms — **not** reproductions of official USCIS forms. `templateSeeder.js` is insert-only with a content-hash divergence check; `npm run forms:seed-templates` (dry run) / `:apply` in `server/`. `POST /cases/:id/forms/provision` seeds on first use, creates one form per template key the case lacks, and prefills given/family name, email and phone from the primary client **once, as a snapshot** (a later provision never overwrites an edit).

## Staff API (`/api/v1/staff`, `server/routes/api/v1/staff/forms.js`)

```text
GET    /cases/:caseId/forms                 summaries + canProvision
POST   /cases/:caseId/forms/provision       idempotent (201 created / 200 nothing to add)
GET    /forms/:formId                       sections + answers + actions{canEdit,canSubmit,canReturn,canApprove,canLock}
PATCH  /forms/:formId/answers               { revision, answers }
POST   /forms/:formId/submit | return | approve | lock    { revision, … }
GET    /forms/:formId/audit                 newest 100, keys only
```

Capability **and** case membership (or `cases.view_all`) on every route; missing, malformed id, other case and removed member are one identical `404`. Mutations pass `trustedOriginMiddleware`. `actions` is computed from capability + status, so the Angular UI never infers authority from a role. Documented in `server/openapi/v1.yaml` (400 / 403 / 404 / 409 semantics included). **Deviation from ADR §22:** no separate `reopen` route — `return` already covers `approved → needs_changes`, so a second verb would be a duplicate transition.

## Concurrency

Every mutation carries `revision`. Writes are `updateOne({ _id, revision, status: { $in: allowed } }, { $set, $inc: { revision: 1 } })` — never `document.save()`. A stale revision is `409 conflict` carrying `{ revision, status }`; an illegal state is `409 invalid_state`. Tested with two simultaneous saves of the same revision on both apps: exactly one `200`, one `409`.

## Client portal

- `GET /api/portal/cases/:caseId/forms`, `GET /api/portal/forms/:formId`, `PATCH …/answers`, `POST …/submit` (`src/app/api/portal/…`), through the shared `guardPortalRequest` gate (Origin → rate limit → session → live account). `guardPortalRequest` gained `readOnly` and `rateLimitMax` options (autosave ceiling 120/min; submit 10/min); existing callers are unchanged.
- `getAccessibleForm` (`src/lib/auth/form-policy.ts`): active client `WorkspaceMember` on the form's workspace, re-checked every request.
- **Client DTO** (`toClientDto`) removes staff-only field definitions, staff-only answers, and `internalReviewNote`; `clientReviewNote` is exposed only while the form is `needs_changes`.
- UI: Forms card with a "to complete" badge on the case page, `/portal/cases/:caseId/forms` list, and `/portal/cases/:caseId/forms/:formId` editor (`smart-form-editor.tsx`): debounced autosave (1.2 s) with `Saving… / Saved / Unsaved changes / Conflict / Error` states, single in-flight save, conflict banner with reload, server field errors, repeated groups, address and country (from `Intl.DisplayNames`), read-only states per status, returned-note callout, progress bar with `role="progressbar"`, announced status (`role="status"`), labelled fieldsets. **Answers live only in component state — no localStorage.**

## Angular staff Forms tab

`enterprise-ui/.../case-detail/forms-tab/` — `ih-forms-tab` + recursive `ih-form-field`: list with status and progress, empty state with capability-gated "Add case forms", full editor with section navigation, all 12 field types, staff-only marker, debounced autosave, 409 handling (halts saving, explains, "Reload latest version"), server validation errors on the field, capability-gated Submit / Return for changes (client note required) / Approve / Lock (confirm dialog), review notes (client vs internal clearly separated), on-demand history, loading / empty / error / no-access states, single-column layout under 900 px. No `any` in the new code.

## Security and privacy

- Staff-only fields: omitted from client DTOs (definition **and** answer) and refused on client write (`This field cannot be edited`, never silently dropped).
- Internal review note: never in a client DTO; not copied to audit or activity.
- Audit and `CaseActivity` hold keys / titles / actor names only — asserted in tests with a canary value (`Zanzibar-Secret-Street-77`) that must not appear in either.
- Sessions stay separate (`ClientSession` vs `EmployeeSession`); CSRF: portal `verifyOrigin`, staff `trustedOriginMiddleware`.
- Audit write failures are fail-open (logged, never undo the change) — the same stance as `SecurityEvent`.
- No answer values in logs, notifications or emails; no email is sent by this phase.

## Tests added

| Suite | File | Covers |
|---|---|---|
| Server | `smart-form-engine.test.js` | shared vectors, template-definition rejection, catalog validity + case-type coverage, content hash |
| Server | `smart-form-schema-contract.test.js` | collections, field sets, vocabularies |
| Server | `integration/smart-forms.integration.test.js` | provisioning/prefill/idempotency, template immutability, 401 / password-setup / no-capability, no-membership & removed-member 404, cross-case 404, org-wide admin, read-only role, Origin refusal, save/normalise/audit, validation, stale 409, simultaneous saves, staff-only write, hidden answers, full lifecycle, locked immutability, audit/activity PII canary, append-only audit |
| Root | `smart-form-engine.test.ts` | the same vectors against the TS engine |
| Root | `smart-form-schema-contract.test.ts` | the same contract fixture |
| Root | `portal-forms.integration.test.ts` | client DTO leakage, cross-client 404 / 401, removed member, autosave + audit, staff-only/unknown key refusal, stale 409, simultaneous saves, Origin, submit validation, edit freeze, return loop, locked immutability |
| Angular | `forms-tab.component.spec.ts` | list / empty / provision / no-access, staff-only marker & conditional fields, capability-gated controls, autosave dirty-key patches, conflict halt & reload, validation mapping, submit flush order, return note rule, lock confirmation |

Existing contract tests (`case-schema-contract`, `employee-capability-contract`) were updated by regeneration / extension and pass on both sides.

## Verification

Local, run sequentially (never concurrently):

- root `npm test`: **400/400**
- `cd server && npm test`: **540/540**
- Angular `ng test case-management`: **29/29**
- `npm run lint`, `npx tsc --noEmit`, `git diff --check`: clean
- `ng build case-management` and `ng build admin-console`: succeed
- `cd server && npm run db:indexes:dry-run`: lists the three new collections

A local `next build` is blocked on this machine (Application Control blocks SWC). `next dev` compiled and served the portal pages (`/portal/login`, `/portal`, `/portal/cases/:id`, `/portal/cases/:id/forms`); the production build is covered by the CI `Lint · types · build` job.

## Explicitly out of scope (unchanged)

No Petition workflow, no official PDF / USCIS form generation, no form-builder UI, no AI assistance, no new realtime channel, no email/notification on form events, no production deployment, migration, backfill or index build. The three new collections' indexes are included in both `db:indexes` scripts (dry-run verified); **nobody has run them against a live database.**

## Known limitations / follow-ups

- **Indexes not built in production.** Deploy blocker #1 now also covers `smart_form_templates`, `case_smart_forms`, `smart_form_audits`.
- **Templates are seeded on first provision.** Fine for an empty collection; for a deliberate rollout run `npm run forms:seed-templates` (dry run) then `:apply` in `server/`.
- **One form per template key per case.** A new template version applies to new cases; there is no in-place version upgrade of an existing form (ADR defers it).
- **Client notifications for returned forms are not sent** (no email, no in-app notification) — the client sees the state and note on the portal and the case-activity row exists; wiring the Cycle 7 notification service is a small follow-up if wanted.
- **No staff Smart Forms surface in the Next.js `/staff` console** — the ADR scopes staff editing to Angular.
- **No field-level merge.** Two tabs (or a client and a staff member) editing the same form: the later save gets a 409 and must reload; unsaved local edits in the stale view are discarded on reload.
- The Angular `case-detail.component.scss` exceeds its 4 kB budget by 448 bytes (pre-existing warning, not caused by this phase).

## Final status

Implementation tip `df090f967be8a6b588673b5f59cda18a1294f03f` — GitHub Actions **CI #69** (run id 36911437173): success. All four jobs green: Tests (Next.js app), Lint · types · build, Enterprise UI (Angular), Tests (admin CMS).

Pushed only to `architecture/angular-enterprise-platform`; not merged to `main`. No production deploy, migration, index build or backfill was performed. This report was added in follow-up docs commits (documentation only); see `git log` for their SHAs.
