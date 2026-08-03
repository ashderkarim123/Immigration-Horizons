# Implementation Status — Immigration Horizons Client Portal

**Last updated:** 2026-08-04
**Branch:** `main`
**Worktree at time of writing:** clean except this cycle's own changes (see "Commits" below); no unrelated user changes present.

> **Note on git history:** partway through Cycle 1, a commit (`a28ced0`,
> authored under the repo's configured git identity) appeared on `main`
> that the session at the time did not create — likely a checkpoint from an
> interrupted prior process sharing the working directory. Its contents
> were verified by diff: every difference from the in-progress work at the
> time was a legitimate later refinement, not conflicting/foreign work, and
> no data was lost. It was treated as already-landed history; Cycle 1 and
> Cycle 2 work is committed on top of it, never reset or rewritten.
>
> **Cycle 2 anomaly check:** re-verified at the start of Cycle 2 per its own
> handoff prompt — `git merge-base --is-ancestor a28ced0 HEAD` confirms
> ancestry, `git diff`/`git diff --cached` were empty before any Cycle 2
> edits, and `git reflog` showed no resets/checkouts/merges since Cycle 1's
> last commit (`12ae4a4`). No new anomaly occurred during Cycle 2.

---

## Repository state

- Branch: `main`
- Cycle 1 starting HEAD: `9de340c`. Cycle 1 ending HEAD: `12ae4a4`.
- Cycle 2 starting HEAD: `12ae4a4`. Cycle 2 ending HEAD: see final report / `git log`.
- Nothing has been pushed at any point. `origin/main` is unchanged (still `7ef56da`).
- No production data or indexes were read, written, or modified at any point.

---

# Cycle 1 — Architecture and Client Authentication

Modules implemented: `01_ARCHITECTURE_AND_SHARED_DOMAIN.md`,
`02_CLIENT_AUTHENTICATION_AND_ONBOARDING.md`.

**Why this was the first incomplete cycle:** git history through `9de340c`
covered Phase 1 repository audit, stored-XSS remediation, capability-based
admin authorization, and DB-backed authorization tests only — no
`ClientUser`, portal routes, cases, or workspaces existed anywhere in the
codebase (confirmed by grep across `src/lib`, `src/app`, `server/models`
before writing any code).

### Acceptance criteria — module 01 (Architecture)

- [x] Architecture decisions documented — `docs/architecture/ADR-001-client-portal-foundation.md`.
- [x] Shared modules (`src/lib/auth/actors.ts`, `crypto.ts`, `session.ts`, `csrf.ts`, `http.ts`, `validation.ts`) contain framework-independent logic, importable by both the app and the test runner.
- [x] Both applications can import shared constants safely — N/A beyond this app: the ADR's decision was *not* to force cross-app shared runtime code (Express admin is untouched).
- [x] Tests can boot without production side effects — `test/helpers/testDb.ts` guards against production-like URIs, never reads the real `MONGODB_URI`.
- [x] No existing routes broken — confirmed by `npm run build` (Next.js) and `npm test` in `server/` (77/77 passing, unchanged).

### Acceptance criteria — module 02 (Client Authentication)

- [x] Clients and employees use separate models and sessions (`ClientUser` vs. `server/models/admin/User.js`; DB-backed `ClientSession`, independent of the admin's `express-session`).
- [x] Submitters are redirected safely — consultation submission calls `redirect()` to `/portal/check-email` or `/portal/login?next=...` (user-confirmed product decision, see below).
- [x] No automatic login from form submission — confirmed: submission only creates/reuses an invitation or links an existing account; a session is only created on explicit activation or login.
- [x] New clients can activate and set a password — `POST /api/portal/activate`.
- [x] Existing clients can log in — `POST /api/portal/login`.
- [x] Own-consultation access is enforced server-side — `requireClient()` + `Consultation.findOne({ _id, clientUser })`.
- [x] Integration tests pass against an isolated database — 29/29.

### Product decision made mid-cycle (user confirmed)

The plan's literal spec calls for a hard redirect after consultation
submission to `/portal/check-email` or `/portal/login?next=...`, replacing
the prior inline "Request received" success panel. This is a real UX/
conversion tradeoff on the site's primary lead-capture page, so it was
raised explicitly — the user chose to follow the plan's redirect behavior
as specified.

## Architecture decisions (Cycle 1)

See `docs/architecture/ADR-001-client-portal-foundation.md`. Summary:

1. Portal hosted entirely in Next.js under `/portal/*` and `/api/portal/*`; Express admin untouched.
2. State-changing portal operations are Route Handlers (`Request` → `Response`), not Server Actions — directly testable without a running server.
3. Sessions are DB-backed (`ClientSession`), not `express-session`.
4. CSRF: `Origin` header verification on every mutating route, layered on top of `SameSite=Lax`.
5. Uniform `{ error: { code, message } }` response shape; generic auth-failure messages (no account enumeration).
6. `ClientActor`/`EmployeeActor`/`SystemActor` discriminated union typed now; only `ClientActor` populated by real code in Cycle 1.
7. `getDb()` unchanged as the single connection point, shared with `server/`.
8. Tests run via `node --conditions=react-server --import tsx --test ...` — see "Testing" for why both flags are load-bearing.

## Files created (Cycle 1)

**Docs:** `docs/architecture/ADR-001-client-portal-foundation.md`

**Models:** `src/lib/models/{ClientUser,PortalInvitation,PasswordResetToken,ClientSession}.ts`

**Auth library:** `src/lib/auth/{actors,crypto,session,csrf,http,validation,email,invitations,current-client,portal-fetch}.ts`, `src/lib/content/portal.ts`

**API routes:** `src/app/api/portal/{activate,login,logout,forgot-password,reset-password}/route.ts`

**Pages:** `src/app/portal/{page.tsx,login,activate,forgot-password,reset-password,check-email,consultations,consultations/[id]}`

**Components:** `src/components/portal/{login-form,activate-form,forgot-password-form,reset-password-form,logout-button}.tsx`

**Scripts:** `scripts/createIndexes.ts`

**Tests:** `test/helpers/{testDb,http}.ts`, `test/portal-invitations.integration.test.ts` (9), `test/portal-auth.integration.test.ts` (20 at the time)

## Files modified (Cycle 1)

`src/lib/models/Consultation.ts` (+`clientUser`), `src/lib/db.ts` (autoIndex gate), `src/lib/leads.ts` (`deliverLead()` return shape), `src/app/consultation/actions.ts`, `src/app/contact/actions.ts`, `src/lib/rate-limit.ts` (optional `Request` param), `package.json` (deps + scripts).

## Models and indexes (Cycle 1)

| Model | Collection | Indexes |
|---|---|---|
| `ClientUser` | `clientusers` | `normalizedEmail` (unique), `status`, `lastLoginAt` |
| `PortalInvitation` | `portalinvitations` | `tokenHash` (unique), `expiresAt` (TTL, 7d post-expiry), `normalizedEmail+purpose+usedAt` |
| `PasswordResetToken` | `passwordresettokens` | `tokenHash` (unique), `expiresAt` (TTL, 1d post-expiry), `clientUser+usedAt` |
| `ClientSession` | `clientsessions` | `tokenHash` (unique), `clientUser`, `expiresAt` (TTL, 1d post-expiry) |
| `Consultation` (existing) | `consultations` | + `clientUser+createdAt` |

## Routes added (Cycle 1)

**Pages:** `/portal`, `/portal/login`, `/portal/activate`, `/portal/forgot-password`, `/portal/reset-password`, `/portal/check-email`, `/portal/consultations`, `/portal/consultations/[id]`.
**API:** `POST /api/portal/{activate,login,logout,forgot-password,reset-password}`.
**Deferred:** `/portal/profile`, `/portal/security` — absent from module 02's "Required routes" list.

## Security notes (Cycle 1)

Timing-guarded login (dummy bcrypt compare for unknown emails), 5-failure/15-minute lockout, full session invalidation on password reset, `Origin`-based CSRF (no token library added), in-memory/per-process rate limiting (documented single-instance limitation).

---

# Cycle 2 — Client Cases, Workspaces, and Membership

Module implemented: `03_CLIENT_CASES_AND_WORKSPACES.md`.

## Pre-implementation verification

Re-ran the full Cycle 2 mandatory git-anomaly check (see note at top) before
touching any code — confirmed clean, no new anomaly. Confirmed via grep
that no `ClientCase`/`CaseWorkspace`/`WorkspaceMember` code existed
anywhere before this cycle.

## Architecture decision: ADR-002

`docs/architecture/ADR-002-case-workspace-domain.md`. Summary:

1. **Model ownership:** Express is the *primary* writer of `ClientCase`/`CaseWorkspace`/`WorkspaceMember` (every mutating route is `/admin/*`). Next.js is read-only against `ClientCase`/`CaseWorkspace`, with exactly **one** documented exception: the portal activation route flips a client's own `invited` case membership(s) to `active` the moment their account activates (module doc requirement — the transition can only happen where activation itself happens).
2. **Access:** same `MONGODB_URI`, two independent Mongoose connections — unchanged pattern from `Consultation`.
3. **Collection names:** explicit third-argument names on every new model (`client_cases`, `case_workspaces`, `workspace_members`, `case_activities`) rather than relying on default pluralization agreeing by coincidence.
4. **Enum/field compatibility:** two independent per-app constants modules (`server/utils/caseConstants.js`, `src/lib/content/case-constants.ts`), cross-checked by a shared **JSON test fixture** (`docs/architecture/case-schema-contract.json`) both apps' test suites load natively (CJS `require`, TS `resolveJsonModule`) — a genuine cross-app drift check without any shared runtime module.
5. **Transactions:** `server/utils/transaction.js`'s `withOptionalTransaction()` detects real replica-set/mongos support via the deployment's own `hello` topology response (not a guess from the connection string), uses a real transaction when available (true for the production Atlas cluster), and falls back to sequential writes + unique-index-as-concurrency-guard otherwise. Tested both paths (see Testing).
6. **Case number:** `IH-<year>-<6 random chars>` (no ambiguous characters), never a counted sequence — collision-resistant, retried on the rare duplicate-key hit, no confidential/predictable structure.

## Product/policy decisions made without stopping for confirmation (documented per the module's own guidance to choose and document rather than block)

- **No linked ClientUser at conversion time:** returns a controlled validation error directing the manager to link/invite the client first, rather than building a second invitation subsystem or an Express→Next.js RPC to reuse Cycle 1's TS invitation service across the runtime boundary — explicitly one of the module document's two sanctioned options.
- **Pending ClientUser at conversion time:** case + workspace + an `invited` client membership are created immediately (safe default from the module doc); the membership becomes `active` the moment the client's own account activates (ADR-002 exception above).
- **Client-facing "case created" email:** not sent this cycle. `server/` has no email infrastructure at all today (no `resend` dependency, confirmed via `package.json`) — sending would mean adding a new dependency to introduce a feature the module doc explicitly makes conditional ("only when the current email infrastructure supports it safely"). Documented as deferred, not silently dropped.
- **`status` vs `currentStage` on `ClientCase`:** the module's field list names both without fully disambiguating them. Resolved as: `currentStage` is the 13-value granular pipeline position (intake…archived, mutated by the stage-update route); `status` is a coarse `active`/`archived` flag mechanically derived from `archivedAt` via a pre-save hook (never independently settable) — satisfies the doc's own suggested compound indexes (`projectManager + archivedAt + status`) that name both fields, without risking the two drifting out of sync.
- **Former project manager on a PM change:** demoted to `contributor` role on their existing membership rather than removed — keeps case access (module doc: prefer archive/demote over losing history) while ending the ambiguity of two people holding `project_manager` simultaneously.

## Files created (Cycle 2)

**Docs:**
- `docs/architecture/ADR-002-case-workspace-domain.md`
- `docs/architecture/case-schema-contract.json`

**Server (Express) — models:**
- `server/models/{ClientCase,CaseWorkspace,WorkspaceMember,CaseActivity,ClientUser}.js`

**Server — utils/services:**
- `server/utils/{caseConstants,caseNumber,actorSnapshot,transaction}.js`
- `server/services/{casePolicy,caseConversion,caseManagement,workspaceMembership}.js`

**Server — routes/views:**
- `server/routes/admin/cases.js`
- `server/views/admin/cases/{index,detail}.ejs`

**Server — tests:**
- `server/test/case-models.test.js`, `case-policy.test.js`, `case-schema-contract.test.js`
- `server/test/integration/case-conversion.integration.test.js`

**Root (Next.js) — models:**
- `src/lib/models/{ClientCase,CaseWorkspace,WorkspaceMember,AdminUser}.ts`

**Root — lib:**
- `src/lib/content/case-constants.ts`
- `src/lib/auth/{case-policy,case-membership}.ts`

**Root — portal pages:**
- `src/app/portal/cases/page.tsx`
- `src/app/portal/cases/[caseId]/page.tsx`
- `src/app/portal/cases/[caseId]/team/page.tsx`

**Root — tests:**
- `test/case-schema-contract.test.ts`
- `test/case-authorization.integration.test.ts`

## Files modified (Cycle 2)

- `server/models/Consultation.js` — added `convertedCase`, `convertedAt`, **and `clientUser`** (this last one was a genuine Cycle 1 gap: Cycle 1 only added `clientUser` to the Next.js schema, but Express-side case conversion needs to read it to resolve a case's primary client — discovered via a failing integration test, fixed by mirroring the field, Express remains read-only against it).
- `server/models/admin/ActivityLog.js` — added one new lead-side event type, `case_converted`.
- `server/models/admin/Notification.js` — added `relatedCase` (optional) and two new types (`case_assigned_manager`, `case_member_added`).
- `server/utils/notify.js` — `notify()` accepts an optional `relatedCase`.
- `server/utils/permissions.js` — added `cases.view`, `cases.view_all`, `cases.create`, `cases.manage`, `cases.assign`, `cases.archive`, `workspace.members.manage` to `CAPABILITIES` (see matrix below).
- `server/routes/admin/index.js` — mounts `attachCases(router)`; `GET /admin/leads/:id` now also loads/passes case-conversion context.
- `server/views/admin/leads/detail.ejs` — added a "Case" section (conversion form or existing-case link).
- `server/views/admin/partials/sidebar.ejs` — added "Cases" nav item.
- `server/scripts/createIndexes.js` — added the five new/touched models.
- `server/package.json` — `test` script gets `--test-concurrency=1` (see Testing note — pre-existing flakiness, not a Cycle 2 regression, fixed while it was blocking reliable verification).
- `src/lib/models/Consultation.ts` — added `convertedCase`, `convertedAt`.
- `src/app/api/portal/activate/route.ts` — calls `activateInvitedMembershipsForClient()` after creating the `ClientUser`.
- `src/app/portal/page.tsx` — dashboard now also lists the client's active cases.
- `scripts/createIndexes.ts` — added `ClientCase`, `CaseWorkspace`, `WorkspaceMember`.
- `package.json` — `test` script gets `--test-concurrency=1` (same pre-existing-flakiness fix, root side).

## Models and fields (Cycle 2)

**`ClientCase`** (`client_cases`): `caseNumber`, `title`, `caseType`, `status` (derived), `currentStage`, `consultation`, `primaryClient`, `projectManager`, `createdBy`/`createdByName`, `openedAt`, `targetFilingDate`, `filedAt`, `closedAt`, `archivedAt`, `priority`, `description`, timestamps.

**`CaseWorkspace`** (`case_workspaces`): `case`, `name`, `status`, `workspaceType` (`primary` only for now), `settings` (Mixed), `createdBy`/`createdByName`, timestamps.

**`WorkspaceMember`** (`workspace_members`): `workspace`, `memberType`, `clientUser`/`adminUser` (polymorphic, enforced by a `pre('validate')` hook), `workspaceRole`, `status`, `joinedAt`, `removedAt`, `invitedBy`/`invitedByName`/`invitedByType`, `clientVisible`, `displayRole`, timestamps.

**`CaseActivity`** (`case_activities`): `case`, `workspace`, `type` (9-value enum), `message`, `actorType`/`actorId`/`actorName`, `targetMember`, `meta`, timestamps.

## Indexes (Cycle 2)

| Model | Indexes |
|---|---|
| `ClientCase` | `caseNumber` (unique); `consultation` (unique, **partial** — only when set, so multiple unconverted leads never collide); `primaryClient+archivedAt+createdAt`; `projectManager+archivedAt+status`; `currentStage+createdAt`; `createdAt` |
| `CaseWorkspace` | `case+workspaceType` (unique, partial on `workspaceType: 'primary'` — exactly one primary workspace per case) |
| `WorkspaceMember` | `workspace+clientUser` (unique, partial); `workspace+adminUser` (unique, partial); `clientUser+status`; `adminUser+status`; `workspace+status` |
| `CaseActivity` | `case+createdAt`; `workspace+createdAt` |
| `ClientUser` (server mirror) | same as Next.js's declaration — additive, idempotent no-op if already created |

Verified via `npm run db:indexes:dry-run` (root) and `node scripts/createIndexes.js --dry-run` (server) — both list the new indexes without connecting.

## Capability matrix (Cycle 2)

| Capability | Roles |
|---|---|
| `cases.view` | `super_admin`, `admin`, `pm` |
| `cases.view_all` | `super_admin`, `admin` |
| `cases.create` | `super_admin`, `admin`, `pm` |
| `cases.manage` | `super_admin`, `admin`, `pm` |
| `cases.assign` | `super_admin`, `admin` |
| `cases.archive` | `super_admin`, `admin` |
| `workspace.members.manage` | `super_admin`, `admin`, `pm` |

Specialists/reviewer/editor/viewer hold none of these — the module document requires justifying read-only case access from actual product rules before granting it, and none exist yet.

## Row-level policy (Cycle 2)

**Employee side** (`server/services/casePolicy.js`): every action requires the relevant capability **and** (unless the actor holds `cases.view_all`) an active employee `WorkspaceMember` for that case's primary workspace. `cases.view_all` is used as the single org-wide bypass signal for every case action, not just viewing — deliberate, because in the matrix above only `super_admin`/`admin` hold it, and they're also the only roles holding every manage-tier capability (documented explicitly in the ADR as a coupling to watch if the matrix ever changes).

**Client side** (`src/lib/auth/case-policy.ts`): access requires an active `WorkspaceMember` with `memberType: "client"` — never `ClientCase.primaryClient` alone. A different client's case and a nonexistent case return the identical `null` (→ the page calls `notFound()` either way).

**Environment-credential fallback admin:** has no persistent `AdminUser` id (confirmed: `finishLogin({ adminUser: { name: 'Admin', role: 'super_admin' } })` — no `id` field). It can only act through the `cases.view_all` role-based bypass, never holds a `WorkspaceMember` row, and is never insertable as a project manager or team member (`AdminUser.findOne({ _id, isActive: true })` naturally excludes it since it isn't a real document). `actorFromSession()` snapshots it as `actorType: 'env_fallback'` in every audit record.

## Transaction/idempotency strategy (Cycle 2)

`withOptionalTransaction()` (detailed above). Idempotency independent of transaction support:
- `ClientCase.consultation`'s unique-partial index is the ultimate guard against duplicate conversion — a lost race returns the *other* request's case (`already_converted` outcome) rather than erroring.
- `WorkspaceMember` creation/reactivation goes through one function, `addOrReactivateMember()` (`findOneAndUpdate` with `upsert`), so re-adding an existing/removed member is always safe.
- **Known limitation, non-transactional fallback path only** (not the production Atlas path): if a crash happens *between* case creation and full workspace/membership provisioning on a deployment that doesn't support transactions, a retry of the same conversion short-circuits to "already converted" without completing the missing provisioning — the case is never lost or duplicated (unique indexes still hold), but it can be left partially provisioned, logged via `console.warn`, and would need manual completion through the membership-management routes (which are independently idempotent). Documented rather than silently accepted; building full automatic partial-failure recovery was judged out of proportion for a path the real deployment doesn't exercise.

## Deferred provisioning (explicitly not built this cycle)

Per the module document's own scope boundary: default document categories, default workspace channels, client notification records (beyond the existing employee notifications), case checklists. `server/services/caseConversion.js` creates exactly the case, workspace, and memberships — nothing else — so a later provisioning service can be added and run once without any risk of duplicating what this cycle already created.

## Admin routes/pages (Cycle 2)

`GET /admin/cases`, `GET /admin/cases/:id`, `POST /admin/leads/:id/convert-to-case`, `POST /admin/cases/:id/members`, `DELETE /admin/cases/:id/members/:memberId`, `POST /admin/cases/:id/manager`, `POST /admin/cases/:id/stage`, `POST /admin/cases/:id/archive`. List page: bounded pagination, stage/PM/archived filters, membership-scoped visibility for non-`view_all` roles (resolved via indexed `distinct()`, never an in-memory filter). Detail page: summary, stage control, member table + add/remove, PM reassignment, activity feed, archive action, clearly-labeled empty placeholders for documents/queries/channels (no fake functionality).

## Portal routes/pages (Cycle 2)

`GET /portal/cases`, `GET /portal/cases/[caseId]`, `GET /portal/cases/[caseId]/team`; dashboard (`/portal`) updated to show active cases above the existing consultations list. Client-visible team excludes internal role codes, removed/suspended members, and employees hidden via `clientVisible: false`.

## Activity/audit and notification behavior (Cycle 2)

`CaseActivity` records: case created, workspace created, client/employee membership created, member reactivated, member removed, PM changed, stage changed, case archived — each with actor snapshot (handles the env-fallback admin), previous/new values where relevant, never secrets/tokens. The originating lead's `ActivityLog` gets one `case_converted` entry linking to the case. Employee notifications (PM assignment, member addition) reuse the existing `Notification` model/`notify()` utility; notification failures are caught and logged, never roll back an already-successful conversion or membership change; no notification to the acting user; no duplicate notification on an unchanged PM.

---

## Testing (both cycles, current state)

**Root command:** `npm test` → `node --conditions=react-server --import tsx --test --test-concurrency=1 "test/**/*.test.ts"`
**Server command:** `cd server && npm test` → `node --test --test-concurrency=1`

`--test-concurrency=1` was added to *both* apps' test scripts this cycle — Node's test runner otherwise runs test files as parallel child processes, each starting its own `mongodb-memory-server` instance; under that contention, "Instance failed to start within 10000ms" was observed intermittently in **both** the pre-existing Cycle 1 suite and the new Cycle 2 files. Confirmed via repeated runs that serializing resolves it completely and consistently; this is Windows/resource contention, not a logic bug — the same failure signature disappeared identically on retry with concurrency forced to 1.

**Results (confirmed, full suite run):**
- Root: **45/45 passing** — `test/case-schema-contract.test.ts` (6), `test/case-authorization.integration.test.ts` (8), 2 new activation-membership tests added to `test/portal-auth.integration.test.ts`, plus Cycle 1's original 29.
- Server: **124/124 passing** — `test/case-schema-contract.test.js` (7), `test/case-models.test.js` (11), `test/case-policy.test.js` (9), `test/integration/case-conversion.integration.test.js` (20), plus the pre-existing 77.

**Explicitly not covered** (honest gap, not silently skipped): a fault-injection test proving "notification failure does not delete the case" — the code path is defensive (`try`/`catch` around notification calls, documented in `caseConversion.js`), but simulating a real `Notification.create()` failure would need mocking infrastructure this test suite doesn't otherwise use. Manual code review is the verification for that specific bullet.

**Quality commands, all confirmed:**
- `npx tsc --noEmit` (root) — clean.
- `npm run lint` (root) — clean.
- `npm run build` (root, Turbopack) — succeeds; `/portal/cases`, `/portal/cases/[caseId]`, `/portal/cases/[caseId]/team` all appear in the route manifest as dynamic (ƒ) routes, as expected for session-gated pages.
- `npm run db:indexes:dry-run` (root) and `node scripts/createIndexes.js --dry-run` (server) — both list every declared index (including the 4 new Cycle 2 models) without connecting; collection names (`client_cases`, `case_workspaces`, `workspace_members`) match exactly between the two independently-run scripts, confirming ADR-002's explicit-naming decision works as intended.

**Manual smoke tests performed** (GET-only, no mutations — safe against the real `.env` target since nothing was written):
- Built Next.js app started on a spare port (3412): `GET /portal/cases` and `GET /portal` unauthenticated → `307` to `/portal/login?next=...` (confirms `requireClient()` guards the new pages).
- Express admin app started on a spare port (4011): `GET /admin/cases` unauthenticated → `302` to `/admin/login` (confirms `requireAdmin` guards the new routes); `GET /admin/login` → `200`.
- Both servers stopped immediately after (verified via `netstat`, no lingering listeners).
- Authenticated admin cases list/detail, lead-conversion form, and client-side cross-denial were **not** smoke-tested live (would require either writing test data to the real Atlas database or standing up a second isolated environment) — verified instead via the real-HTTP integration test suites above, which exercise the actual EJS-rendered admin pages (`res.text.includes(...)` assertions against real rendered HTML) and the actual policy/query functions the portal pages call.

## Environment variables (Cycle 2)

None new. `MONGODB_URI` and `SITE_URL` remain load-bearing exactly as Cycle 1 documented.

## Deployment blockers carried forward from Cycle 1 (verified still open, not silently marked resolved)

1. `SITE_URL` must be set in production for CSRF `Origin` verification — **still open**, not touched this cycle.
2. Real Resend activation/reset delivery — **still unverified**, not exercised this cycle either.
3. Root index rollout has not been run against production — **still open**; Cycle 2 adds more indexes to the same deferred rollout, doesn't run it.
4. Rate limiting remains process-local — **still open**, unchanged.
5. `/portal/profile`, `/portal/security` — **still deferred**, not in Cycle 2's scope either.

## New Cycle 2 open items

- Client-facing case-created email — deferred pending `server/` gaining real email infrastructure (see "Product/policy decisions" above).
- Non-transactional-fallback partial-provisioning recovery — manual-only, documented above.
- Notification-failure-during-conversion fault-injection test — not written (see Testing).

## Known limitations (Cycle 2)

- Additional-client-on-a-case UI exists at the service layer (`addClientMember`) but has no dedicated admin form yet (only employee-member-add has a form in `server/views/admin/cases/detail.ejs`) — the route (`POST /admin/cases/:id/members` with `memberType=client`) works, just isn't exposed in the UI this cycle. Noted rather than silently incomplete.
- `Task` records remain attached to `Consultation` only, per the module document's explicit instruction not to migrate them — the case detail page shows them read-only via the originating consultation.

## Recommended next module

`04_CONSULTATION_AND_QUERY_TRACKING.md` — read alongside `00_MASTER_ROADMAP.md` and this status file first, per the plan's own handoff procedure.
