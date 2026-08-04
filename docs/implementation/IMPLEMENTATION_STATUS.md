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
>
> **Cycle 3 anomaly check:** re-verified again at the start of Cycle 3 —
> same ancestry/reflog checks, HEAD confirmed at Cycle 2's reported ending
> commit (`a423a47`), no new git anomaly. A **separate, pre-existing**
> anomaly was also carried forward and re-verified this cycle:
> `server/public/css/admin.css` has two uncommitted color-value edits
> (visible in `git status` since before Cycle 2) that this session did not
> make and does not recognize. Captured via `git diff` at the start of
> Cycle 3 and re-diffed at the end — byte-identical, confirming nothing in
> this cycle touched it. It remains deliberately uncommitted, unstaged, and
> unreverted — treated as the user's own in-progress work, not code to fix,
> revert, or silently absorb into a Cycle 3 commit.

---

## Repository state

- Branch: `main`
- Cycle 1 starting HEAD: `9de340c`. Cycle 1 ending HEAD: `12ae4a4`.
- Cycle 2 starting HEAD: `12ae4a4`. Cycle 2 ending HEAD: `a423a47`.
- Cycle 3 starting HEAD: `a423a47`. Cycle 3 ending HEAD: see final report / `git log`.
- Nothing has been pushed at any point. `origin/main` is unchanged (still `7ef56da`).
- No production data or indexes were read, written, or modified at any point.
- Worktree at the end of Cycle 3 is **not** fully clean: `server/public/css/admin.css` remains modified (pre-existing, unrelated, deliberately left as-is — see anomaly note above). This is expected and correct, not an oversight.

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

---

# Cycle 3 — Consultation, Query, and Scheduling Tracking

Module implemented: `04_CONSULTATION_AND_QUERY_TRACKING.md`.

## Pre-implementation verification

Re-ran the full git-anomaly check (ancestry, reflog, HEAD match) and
captured the pre-existing `admin.css` diff before any edits (see the note
at the top of this file). Confirmed via grep that no scheduling/timezone
concept (`scheduledFor`, `timezone`, `appointment`, `responseDueAt`,
`answeredAt`, `noShow`, `rescheduled`) existed anywhere in either app
before this cycle — genuinely new domain, nothing to reconcile with.

## Architecture decision: ADR-003

`docs/architecture/ADR-003-consultation-interactions.md`. Summary:

1. **Model ownership — the one real departure from ADR-002's pattern:** unlike Cases (Express-only writer), **both apps write** `ConsultationInteraction`/`InteractionHistory`/`InteractionUpdate` — clients create queries/follow-ups from Next.js, employees run the operational lifecycle from Express. Resolved via a **field-ownership boundary** (client-writable vs. employee-writable fields are disjoint, enforced by code review + the schema-contract test) rather than forcing one app to proxy through the other.
2. **Concurrency — a real bug caught and fixed during this cycle:** the plan assumed Mongoose's default `__v` protects every `.save()` from a lost concurrent update. Verified empirically that it does **not** — a bare schema's `__v` only guards array-subdocument modifications; a second concurrent `.save()` on a plain field change silently overwrote the first with no error. Fixed by adding `optimisticConcurrency: true` to `ConsultationInteractionSchema` in **both** apps, which makes every `.save()` actually include `__v` in its update filter. Caught by the suite's own concurrency test (`interaction-lifecycle.integration.test.js`) failing exactly as it should have before the fix — the test did its job.
3. **Interaction number:** `IQ-<year>-<6 random chars>` — same collision-resistant, non-sequential design as `caseNumber`, different prefix.
4. **Explicit collection names:** `consultation_interactions`, `interaction_history`, `interaction_updates` — verified identical between both apps' independently-run index scripts.
5. **Cross-app schema-contract:** `docs/architecture/interaction-schema-contract.json`, same JSON-fixture mechanism as ADR-002, extended with this domain's enums.
6. **Timezone:** `scheduledFor` stored as absolute UTC; `timezone` validated as a real IANA `Area/Location` identifier (`Intl.DateTimeFormat` construction, plus a `/`-presence check to reject fixed-offset legacy abbreviations like `EST`/`PST`, which `Intl` itself actually accepts but the module doc explicitly calls out as unacceptable). New `APP_TIMEZONE` env var (default `UTC`) is the organization-timezone source for the "scheduled today" queue boundary.
7. **Consultation-scoped authorization:** capability alone (`queries.view` etc.) is sufficient for any consultation-scoped interaction — matching this app's existing, established "leads have no per-lead row restriction" convention exactly, rather than inventing a stricter rule the codebase doesn't otherwise have. Case-scoped interactions use the identical membership-based rule as `casePolicy.js`.
8. **Route naming:** `/portal/consultations` and `/portal/consultations/[id]` are untouched (still `Consultation` records); new interaction routes live at `/portal/queries`, `/portal/queries/new`, `/portal/queries/[interactionId]` — the plan's own suggested naming, adopted as-is.
9. **Priority is server-controlled:** client-created interactions always get `priority: "normal"`; only employees can change it — prevents client self-escalation.

## Product/policy decisions made without stopping for confirmation

- **"Notify appropriate triage users on submission"** (module doc §23) was deliberately **not** implemented as a broadcast-on-every-submission notification. There is no natural single/small recipient for a brand-new, unassigned query (unlike leads, which have `ASSIGNMENT_SLOTS` mapping task types to roles), and the same module doc explicitly warns against "broadcast to all admins for every routine event." Notifications instead fire at points with a clear, specific recipient: assignment (the assignee), client follow-up (the assignee), client needs-more-help (the assignee). Documented here as an intentional scope reduction, not a silent omission.
- **Historical-consultation backfill:** implemented the smallest safe option from the module's own menu — a lazy, idempotent admin action (`POST /admin/leads/:id/initialize-interaction`) rather than a bulk script. No dedicated UI button was added for it this cycle (known limitation, below) — the route exists and is capability-gated, callable directly.
- **`overdueResponse` queue:** the module doc explicitly forbids hardcoding an SLA without a configured business rule, and none exists. `responseDueAt` is a real, indexed schema field with a fully correct, tested queue definition — it will simply stay empty in practice until a future cycle defines and sets that field. Not a bug; documented and tested as designed (`interaction-queues.test.js` covers both the empty-by-default case and the once-set-and-passed case).
- **`server/` gains a real `resend` dependency this cycle** — its first actual email-sending capability — specifically to send the five client-facing interaction emails the module doc requires (scheduled/rescheduled, clarification requested, answered, cancelled). Built with the same test-double injection pattern (`_setMailerForTests`) Cycle 1's Next.js email code established, so failure-mode behavior is testable without a real Resend account (module doc's own explicit requirement).

## Files created (Cycle 3)

**Docs:**
- `docs/architecture/ADR-003-consultation-interactions.md`
- `docs/architecture/interaction-schema-contract.json`

**Server — models:**
- `server/models/{ConsultationInteraction,InteractionHistory,InteractionUpdate}.js`

**Server — utils/services:**
- `server/utils/{interactionConstants,interactionNumber,timezone}.js`
- `server/services/{interactionPolicy,interactionService,interactionQueues,interactionEmail}.js`

**Server — routes/views:**
- `server/routes/admin/queries.js`
- `server/views/admin/queries/{index,detail}.ejs`

**Server — tests:**
- `server/test/{interaction-models,interaction-policy,interaction-queues,timezone,interaction-schema-contract}.test.js`
- `server/test/integration/interaction-lifecycle.integration.test.js`

**Root — models:**
- `src/lib/models/{ConsultationInteraction,InteractionHistory,InteractionUpdate}.ts`

**Root — lib:**
- `src/lib/content/interaction-constants.ts`
- `src/lib/auth/{interactions,interaction-policy,interaction-number}.ts`

**Root — API routes:**
- `src/app/api/portal/interactions/route.ts`
- `src/app/api/portal/interactions/[id]/follow-up/route.ts`
- `src/app/api/portal/interactions/[id]/resolution/route.ts`

**Root — portal pages/components:**
- `src/app/portal/queries/{page.tsx,new/page.tsx,[interactionId]/page.tsx}`
- `src/components/portal/{new-query-form,query-actions}.tsx`

**Root — tests:**
- `test/interaction-schema-contract.test.ts`
- `test/interaction-authorization.integration.test.ts`
- `test/interaction-routes.integration.test.ts`

## Files modified (Cycle 3)

- `server/models/admin/Notification.js` — gains `relatedInteraction` (optional) and three new types (`query_assigned`, `query_client_follow_up`, `query_needs_more_help`). `ActivityLog.js` is unchanged this cycle (Cycle 3 events are case/interaction-scoped, not lead-scoped).
- `server/utils/notify.js` — `notify()` accepts an optional `relatedInteraction`.
- `server/utils/permissions.js` — added `queries.view`, `queries.view_all`, `queries.create`, `queries.triage`, `queries.assign`, `queries.schedule`, `queries.answer`, `queries.manage`, `queries.close`.
- `server/routes/admin/index.js` — mounts `attachQueries(router)`.
- `server/views/admin/partials/sidebar.ejs` — added "Queries" nav item.
- `server/scripts/createIndexes.js`, `scripts/createIndexes.ts` — added the three new interaction models (both apps).
- `server/package.json` — added `resend` as a real dependency (see above).
- `src/lib/auth/invitations.ts` — `linkOrInviteAfterConsultation()` now also calls `createInitialConsultationInteraction()` when linking to an already-active client.
- `src/app/api/portal/activate/route.ts` — calls `createInitialConsultationInteraction()` for the deferred case (consultation submitted before the client had an account) right after linking the consultation.
- `src/app/portal/page.tsx` — (unchanged this cycle — dashboard still shows cases + consultations; queries were deliberately given their own top-level nav entry point at `/portal/queries` rather than a third dashboard section, to keep the dashboard from growing unbounded every cycle).

## Models and fields (Cycle 3)

**`ConsultationInteraction`** (`consultation_interactions`): `interactionNumber`, `scopeType`, `clientUser`, `consultation`, `case`, `workspace`, `subject`, `description`, `type`, `status`, `priority`, `scheduledFor`, `timezone`, `responseDueAt`, `assignedTo`, `answeredBy`/`answeredAt`, `resolutionSummary`, `clientVisibleResponse`, `internalResponse`, `clientResolutionStatus`/`clientResolvedAt`/`clientResolutionNote`, `cancelledAt`, `closedAt`, `createdByType`/`createdByClient`/`createdByAdmin`, timestamps. `optimisticConcurrency: true`.

**`InteractionHistory`** (`interaction_history`): `interaction`, `eventType` (14-value enum), previous/new status/scheduledFor/timezone/assignee pairs, actor snapshot (`actorType`/`actorClient`/`actorAdmin`/`actorName`), `reason`, `clientVisibleSummary`, `internalMetadata`. Append-only — no update/delete route exists in either app.

**`InteractionUpdate`** (`interaction_updates`): `interaction`, `authorType`/`authorClient`/`authorAdmin`/`authorName` (polymorphic, enforced by a `pre('validate')` hook), `updateType`, `body`, `visibility`, `editedAt`, `deletedAt`.

## Indexes (Cycle 3)

| Model | Indexes |
|---|---|
| `ConsultationInteraction` | `interactionNumber` (unique); `consultation+type` (unique, partial on `type: 'initial_consultation'`); `clientUser+createdAt`; `case+createdAt`; `workspace+createdAt`; `assignedTo+status+scheduledFor`; `status+responseDueAt`; `status+scheduledFor`; `status+answeredAt`; `type+status+createdAt`; `scopeType+status+createdAt` |
| `InteractionHistory` | `interaction+createdAt` |
| `InteractionUpdate` | `interaction+createdAt`; `interaction+visibility+createdAt` |

Verified via both apps' `--dry-run` index scripts — collection names match exactly between the two independent declarations.

## Interaction types, statuses, priorities (Cycle 3)

Types: `initial_consultation`, `follow_up_query`, `scheduled_consultation`, `client_question`, `document_question`, `case_update_request`.
Statuses: `submitted`, `acknowledged`, `scheduled`, `in_progress`, `answered`, `awaiting_client`, `rescheduled`, `cancelled`, `no_show`, `closed`.
Priorities: `low`, `normal`, `high`, `urgent` (server-controlled only, see above).

## Scope rules (Cycle 3)

`scopeType: "consultation" | "case"` is an explicit, required, validated field — never inferred from which optional refs happen to be set. Enforced identically in both apps' `pre('validate')` hooks: consultation scope requires `consultation`, forbids `case`/`workspace`; case scope requires both `case` and `workspace`.

## Capability matrix (Cycle 3)

| Capability | Roles |
|---|---|
| `queries.view` | `super_admin`, `admin`, `pm` |
| `queries.view_all` | `super_admin`, `admin` |
| `queries.create` | `super_admin`, `admin`, `pm` |
| `queries.triage` | `super_admin`, `admin`, `pm` |
| `queries.assign` | `super_admin`, `admin`, `pm` |
| `queries.schedule` | `super_admin`, `admin`, `pm` |
| `queries.answer` | `super_admin`, `admin`, `pm` |
| `queries.manage` | `super_admin`, `admin`, `pm` |
| `queries.close` | `super_admin`, `admin`, `pm` |

Same conservative-matrix philosophy as `cases.*` — specialists/reviewer/editor/viewer hold none of these; no product rule yet justifies it.

## Row-level policy (Cycle 3)

**Employee side** (`server/services/interactionPolicy.js`): consultation-scoped interactions require only the relevant `queries.*` capability (matching the existing, established "leads have no row-level restriction" convention). Case-scoped interactions require capability **and** active employee `WorkspaceMember` on the interaction's workspace, with `queries.view_all` as the membership bypass — identical shape to `casePolicy.js`.

**Client side** (`src/lib/auth/interaction-policy.ts`): consultation-scoped access requires the interaction's `clientUser` to match (set at creation from the linked `Consultation.clientUser`, never trusted from client input). Case-scoped access requires an active client `WorkspaceMember`, re-checked on every read (defense in depth beyond the `clientUser` filter already on the query) so a removed member loses access immediately. A different client's interaction and a nonexistent one return the identical `null`.

## Concurrency and idempotency (Cycle 3)

`optimisticConcurrency: true` (see "Product/policy decisions" above) is the real mechanism — not the assumed-but-nonfunctional default `__v` behavior. Idempotency: the unique-partial index on `(consultation, type: 'initial_consultation')` guards initial-tracking duplicates (a lost race returns `already_exists`, never errors); every lifecycle mutation checks "is this actually a change" before writing, so re-submitting the same acknowledge/cancel/schedule/etc. creates no duplicate history or notification (tested explicitly for acknowledge and cancel).

## Notification behavior (Cycle 3)

Employee notifications (assignment, client follow-up, client needs-more-help) reuse the existing `Notification` model/`notify()` utility exactly as Cycle 2 did for cases — no new notification system. Client emails (scheduled/rescheduled/clarification/answered/cancelled) go through the new `server/services/interactionEmail.js` adapter — logs and degrades gracefully when `RESEND_API_KEY` is unset (matching the Next.js app's established pattern exactly), and never rolls back the interaction mutation that triggered it (verified: every `notifyClientEmail()` call site is wrapped so an email failure is caught and logged, not propagated).

## Admin routes/pages (Cycle 3)

`GET /admin/queries`, `GET /admin/queries/:id`, `POST /admin/queries/:id/{acknowledge,assign,schedule,status,answer,request-clarification,no-show,cancel,close,notes}`, `POST /admin/leads/:id/initialize-interaction`. List page: 8 indexed operational queues (unanswered, unassigned, awaiting scheduling, scheduled today, overdue response, awaiting client, no-show follow-up, recently answered) as clickable filter shortcuts with live counts, plus status/type/priority/scope/search filters, bounded pagination. Detail page: full operational history, all lifecycle actions gated by both capability and row policy, internal response visibly marked as never-shown-to-client.

## Portal routes/pages (Cycle 3)

`GET /portal/queries`, `GET /portal/queries/new`, `GET /portal/queries/[interactionId]`. New-query form lets a client choose between their consultations and active cases (only shown when both exist). Detail page shows a simplified client-visible timeline (never internal reasons/metadata), client-visible updates only, follow-up form (hidden once closed/cancelled), and resolution confirmation (shown only when `status === "answered"`).

## Testing (Cycle 3)

**Results (confirmed, full suite run at the final commit):**
- Root: **76/76 passing** (Cycle 3 added 31: 4 in `interaction-schema-contract.test.ts`, 19 in `interaction-authorization.integration.test.ts`, 8 in `interaction-routes.integration.test.ts`; plus the existing 45 from Cycles 1-2).
- Server: **190/190 passing** (Cycle 3 added 66: 12 in `interaction-models.test.js`, 9 in `interaction-policy.test.js`, 11 in `interaction-queues.test.js`, 9 in `timezone.test.js`, 5 in `interaction-schema-contract.test.js`, 20 in `interaction-lifecycle.integration.test.js`; plus the existing 124 from Cycles 1-2).

**A real bug was caught by this cycle's own test suite before being shipped:** the concurrency test failed on first run (`Missing expected rejection` — a second concurrent `.save()` was *not* throwing `VersionError`), which is exactly what led to discovering and fixing the `optimisticConcurrency` gap described above. The test suite worked as intended.

**Two test-authoring bugs were also caught and fixed** (not code bugs): two `resolution confirmation` tests set `status: "answered"` without the required `answeredAt`/`answeredBy`, correctly tripping the model's own validation — fixed by completing the test fixtures, not by loosening validation.

**Explicitly not covered** (honest gaps): a live end-to-end test of real Resend email delivery (verified only via the test-double injection point and the "missing key → warning, no throw" code path, same posture as Cycle 1's Next.js email code). Concurrent-write testing covers the direct-model-`.save()` path deterministically rather than racing two real concurrent HTTP requests (the deterministic version is what actually proves the mechanism; a real race would be flaky by construction and prove the same thing less reliably).

**Quality commands, all confirmed:**
- `npx tsc --noEmit` (root) — clean.
- `npm run lint` (root) — clean.
- `npm run build` (root, Turbopack) — succeeds; all new portal routes (`/portal/queries`, `/portal/queries/new`, `/portal/queries/[interactionId]`, plus the three new `/api/portal/interactions*` routes) appear correctly classified as dynamic (ƒ).
- `npm run db:indexes:dry-run` (root) and `node scripts/createIndexes.js --dry-run` (server) — both list every new index without connecting; collection names match exactly between the two scripts.
- `cd server && npm test` — 190/190.

**Manual smoke tests performed** (GET-only, no mutations, against the real `.env` target — safe since nothing was written):
- Built Next.js app on a spare port (3413): `GET /portal/queries` and `GET /portal/queries/new` unauthenticated → `307` to `/portal/login?next=...`.
- Express admin app on a spare port (4012): `GET /admin/queries` unauthenticated → `302` to `/admin/login`.
- Both servers stopped immediately after (verified via `netstat`).
- Authenticated admin query operations and full client lifecycle (submit → schedule → answer → confirm resolution) were **not** smoke-tested live for the same reason as Cycle 2 (would require writing to the real Atlas database) — verified instead via the 97 new database-backed integration tests across both apps, which exercise the real routes, real rendered EJS output, and real row-level policy functions.

## Environment variables (Cycle 3)

**New:** `APP_TIMEZONE` — organization timezone for the "scheduled today" queue boundary, IANA identifier, defaults to `UTC` if unset or invalid (validated at first use, warning logged on an invalid value). Not required for correctness (falls back safely), but should be set in production to the practice's actual operating timezone for the queue to be meaningful.

**Newly load-bearing:** `RESEND_API_KEY`/`EMAIL_FROM` are now also read by `server/` (previously Next.js-only) for the five client interaction emails — same fail-closed-to-logging behavior as everywhere else; missing key never blocks a lifecycle mutation, just skips the email with a logged warning.

## Deployment blockers carried forward (verified still open, not silently marked resolved)

1. `SITE_URL` must be set in production for CSRF `Origin` verification (Cycle 1) — **still open**.
2. Real Resend activation/reset delivery (Cycle 1) — **still unverified**; Cycle 3 adds more Resend usage (server-side) on the same unverified footing.
3. Root index rollout has not been run against production (Cycle 1/2/3) — **still open**; Cycle 3 adds three more collections to the same deferred rollout.
4. Rate limiting remains process-local (Cycle 1) — **still open**.
5. `/portal/profile`, `/portal/security` (Cycle 1) — **still deferred**.
6. Client-facing case-created email (Cycle 2) — **still deferred** (same `server/` email-infrastructure gap Cycle 3 partially closes for interactions specifically, not cases).
7. Non-transactional-fallback partial-provisioning recovery (Cycle 2) — **still open**, unchanged.
8. Cases notification-failure fault-injection test (Cycle 2) — **still not written**; Cycle 3's interaction email failure path *is* now testable via the injected mailer double, which could be reused to finally close this gap in a future cycle.
9. Additional-client-on-a-case membership UI (Cycle 2) — **still not built**.

## New Cycle 3 open items

- No dedicated admin UI button for `POST /admin/leads/:id/initialize-interaction` (the historical-consultation lazy-init route) — route exists, capability-gated, callable directly; not wired into `leads/detail.ejs` this cycle.
- "Notify triage users on submission" not implemented as a broadcast (deliberate — see "Product/policy decisions" above); no per-queue "watcher" mechanism exists yet for a future cycle to build on.
- Real Resend delivery of the five new client interaction emails is unverified beyond the test-double injection point.

## Known limitations (Cycle 3)

- The admin query detail page's "Start Work" action is exposed as a generic `/status` route currently handling only the `in_progress` transition — intentionally narrow (module doc's other transitions all have their own dedicated routes); documented rather than building a more general status-transition endpoint speculatively.
- `getClientVisibleHistory()`/history's `clientVisibleSummary` strings are currently static, hardcoded per event type in the service layer — not configurable copy. Fine for this cycle's scope; would need externalizing if per-service-type custom messaging is ever required.

## Recommended next module

`05_DOCUMENT_MANAGEMENT.md` — read alongside `00_MASTER_ROADMAP.md` and this status file first, per the plan's own handoff procedure.
