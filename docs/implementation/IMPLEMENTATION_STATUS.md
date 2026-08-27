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
>
> **Between Cycle 3 and Cycle 5:** an ad-hoc manual-QA session against the
> real `.env`-configured database (user-directed portal/admin testing, not a
> numbered cycle) found and fixed a real bug — the env-credential fallback
> admin login could reach "answer query"/"request clarification" and
> silently fail model validation instead of being cleanly rejected (see
> commit `6d13cfc`). All QA-created test data was deleted and re-verified
> clean; 190/190 server tests still passed with the fix. Recorded here for
> continuity since it landed as a real commit between Cycle 3 and Cycle 5.
>
> **Cycle 5 anomaly check:** re-verified again at the start of Cycle 5 —
> same ancestry/reflog checks, HEAD confirmed at `6d13cfc` (Cycle 3's ending
> commit plus the one interim bugfix above), no new git anomaly. The
> `server/public/css/admin.css` anomaly was re-captured via `git diff` at
> the start of Cycle 5 and re-diffed at the end — still byte-identical,
> still deliberately untouched.
>
> **Cycle 6 anomaly check:** re-verified again at the start of Cycle 6 —
> same ancestry/reflog checks, HEAD confirmed at Cycle 5's reported ending
> commit (`2041950`), no new git anomaly, no concurrent repository
> mutation. The `server/public/css/admin.css` anomaly was re-captured via
> `git diff` at the start of Cycle 6 and re-diffed at the end — still
> byte-identical, still deliberately untouched.

---

## Repository state

- Branch: `main`
- Cycle 1 starting HEAD: `9de340c`. Cycle 1 ending HEAD: `12ae4a4`.
- Cycle 2 starting HEAD: `12ae4a4`. Cycle 2 ending HEAD: `a423a47`.
- Cycle 3 starting HEAD: `a423a47`. Cycle 3 ending HEAD: `befacbc`.
- Interim bugfix commit (between Cycle 3 and Cycle 5): `6d13cfc`.
- Cycle 5 starting HEAD: `6d13cfc`. Cycle 5 ending HEAD: `2041950`.
- Cycle 6 starting HEAD: `2041950`. Cycle 6 ending HEAD: see final report / `git log`.
- Nothing has been pushed at any point. `origin/main` is unchanged (still `7ef56da`).
- No production data or indexes were read, written, or modified at any point.
- Worktree at the end of Cycle 6 is **not** fully clean: `server/public/css/admin.css` remains modified (pre-existing, unrelated, deliberately left as-is — see anomaly note above). This is expected and correct, not an oversight.

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

---

# Cycle 5 — Secure Document Management

Module implemented: `05_DOCUMENT_MANAGEMENT.md`.

## Pre-implementation verification

Re-ran the full git-anomaly check (ancestry, reflog, HEAD match) and captured the pre-existing `admin.css` diff before any edits (see the note at the top of this file). Confirmed Cycles 1–3's artifacts were all present and their test suites passing before starting. Surveyed existing upload infrastructure (`server/models/admin/Media.js`, `server/middleware/upload.js`, `server/models/admin/DeliveryRecord.js`) and confirmed none of it is reusable for private case documents — `Media` is flat/unversioned/images-only and, critically, `server/app.js`'s `express.static(path.join(__dirname, 'public'))` serves its storage directory (`server/public/uploads/`) with no authentication at all, which is exactly the anti-pattern this module forbids.

## Architecture decision: ADR-004

`docs/architecture/ADR-004-secure-document-storage.md`. Summary:

1. **Storage abstraction — mirrored, not shared, with a real filesystem contract on top of the usual schema contract:** each app gets its own `LocalPrivateStorageProvider` (`server/services/storage/localPrivateStorageProvider.js`, `src/lib/documents/local-private-storage-provider.ts`) implementing the same six-plus-method interface. Unlike every prior cycle's mirrored models, these two must also agree on a physical on-disk layout (storage-key format, `temp/active/quarantine` sharding) — asserted by `document-schema-contract.json`'s `storageKeyPattern`, not just enum/collection-name equality.
2. **Dev storage root — `os.tmpdir()`-based, not repo-relative:** `PRIVATE_DOCUMENT_ROOT` defaults (dev only) to `path.join(os.tmpdir(), 'immigration-horizons-private-documents')` — a host-wide, `cwd`-independent path both apps compute identically despite running from different working directories. Production requires the env var explicitly and rejects a path inside either app's publicly-served directory.
3. **Model ownership — dual writer, same shape as ADR-003:** clients upload from the portal, employees upload/review/version/archive from the admin, never the same fields. `documentUploadService.js`/`document-upload-service.ts` are independently-written mirrors of the same pipeline.
4. **Concurrency:** `optimisticConcurrency: true` on `CaseDocumentSchema` in both apps (the real mechanism established in ADR-003 §2, not the non-functional default `__v`) — protects two concurrent reviews or replacements of the same document.
5. **Signature detection — a real dependency, deliberately:** `file-type` v22 added to both apps (first signature-detection library in either). `server/`'s CommonJS code consumes it via dynamic `import()` (standard Node interop for a pure-ESM package); Next.js imports it natively.
6. **Scanner — stubbed, explicitly not "clean":** `not_configured` is the honest status this cycle ships with; it does not block a document from proceeding to `uploaded`/`pending_review` (the allowlist/signature check is this cycle's actual defense layer) but is never reported as `clean`.
7. **Audit — `CaseActivity` extended for lifecycle events, a new `DocumentAccessLog` for downloads:** downloads are high-volume/mechanical and would flood `CaseActivity`'s case-timeline query pattern — same reasoning `CaseActivity.js`'s own file comment already gives for why it was split out of the lead-scoped `ActivityLog`.
8. **Category provisioning — transactional for new cases, idempotent backfill for existing ones:** hooked into `caseConversion.js` immediately after `CaseWorkspace` creation, inside the same transaction; existing cases get an idempotent admin action plus a dry-run-by-default script.

## Product/policy decisions made without stopping for confirmation

- **Rejection reason must be client-visible**, same requirement as `needs_replacement` — module doc explicitly left this open ("decide and document"); chose transparency over the alternative (an internal-only rejection reason a client never sees).
- **Duplicate detection is `case + checksum + category`**, not case-wide — uploading the same bytes into a *different* category or against a different request is deliberate reuse, not an accidental double-submit, and is allowed to create a new record.
- **No `under_review` intermediate request status this cycle** — a request goes `open → uploaded → fulfilled/replacement_required`, skipping the module's optional `under_review` state; an employee starting to review is not a separately tracked event this cycle. Documented as a scope reduction.
- **Employee-initiated uploads never notify an employee** (`auditAndNotifyUpload` only reaches an employee's inbox when `uploadedByType === 'client'`) — an employee uploading a document for a case they're already on doesn't need to be told about their own action.
- **Client document-detail page shows only the current version**, not a full version history — the module doc doesn't require a client-facing version-history UI, and building one wasn't justified by an actual product requirement this cycle (YAGNI).
- **A real bug found and fixed mid-cycle:** the storage-provider singleton in `document-upload-service.ts` was originally constructed eagerly at module-evaluation time (`export const provider = new LocalPrivateStorageProvider()`), which made `npm run build` fail outright — Next.js's build step statically evaluates every route module to collect page data, including with `NODE_ENV=production` implicitly set, which tripped the "must be set explicitly in production" guard before the app ever served a request. Fixed by converting to a lazy singleton (`getStorageProvider()`), constructed on first real use rather than at import time. Caught by `npm run build`, not by the test suite (tests always set `PRIVATE_DOCUMENT_ROOT` before importing) — a real gap in what the test suite alone would have caught, worth remembering for future cycles: **always run the actual build**, not just `tsc --noEmit`.

## Files created (Cycle 5)

**Docs:**
- `docs/architecture/ADR-004-secure-document-storage.md`
- `docs/architecture/document-schema-contract.json`

**Server — storage:**
- `server/services/storage/{localPrivateStorageProvider,scanner,storageErrors}.js`

**Server — models:**
- `server/models/{DocumentCategory,CaseDocument,DocumentVersion,DocumentRequest,DocumentAccessLog}.js`

**Server — utils/services:**
- `server/utils/documentConstants.js`
- `server/services/{documentValidation,documentUploadService,documentReviewService,documentCategoryService,documentRequestService,documentDownloadService,documentPolicy,documentEmail}.js`

**Server — routes/views:**
- `server/routes/admin/documents.js`
- `server/views/admin/documents/{index,detail}.ejs`

**Server — scripts:**
- `server/scripts/{provisionDocumentCategories,reconcileDocumentStorage}.js`

**Server — tests:**
- `server/test/{document-storage-provider,document-validation,document-models,document-policy,document-schema-contract}.test.js`
- `server/test/integration/document-lifecycle.integration.test.js`

**Root — storage:**
- `src/lib/documents/{local-private-storage-provider,scanner,storage-errors,document-validation,document-upload-service,document-download-service}.ts`

**Root — lib:**
- `src/lib/content/document-constants.ts`
- `src/lib/auth/document-policy.ts`
- `src/lib/transaction.ts` (new — root's first Mongoose transaction wrapper, ported from `server/utils/transaction.js`, needed because document upload/replacement genuinely requires multi-document atomicity)

**Root — API routes:**
- `src/app/api/portal/cases/[caseId]/documents/route.ts`
- `src/app/api/portal/document-requests/[requestId]/upload/route.ts`

**Root — portal pages/components:**
- `src/app/portal/documents/[documentId]/download/route.ts`
- `src/app/portal/cases/[caseId]/documents/{page.tsx,[documentId]/page.tsx}`
- `src/components/portal/document-upload-form.tsx`

**Root — tests:**
- `test/document-schema-contract.test.ts`
- `test/document-authorization.integration.test.ts`
- `test/document-routes.integration.test.ts`

## Files modified (Cycle 5)

- `server/services/caseConversion.js` — provisions default document categories inside the existing case-creation transaction, right after `CaseWorkspace` creation; logs `category_provisioned` alongside the existing `case_created`/`workspace_created` activity entries.
- `server/models/CaseActivity.js` — `ACTIVITY_TYPES` gains nine document-lifecycle event types.
- `server/models/admin/Notification.js` — gains `relatedDocument`/`relatedDocumentRequest` (optional) and three new types (`document_uploaded`, `document_replacement_uploaded`, `document_request_overdue`).
- `server/utils/notify.js` — `notify()` accepts optional `relatedDocument`/`relatedDocumentRequest`.
- `server/utils/permissions.js` — added `documents.view`, `documents.view_all`, `documents.upload`, `documents.review`, `documents.archive`, `document_categories.manage`, `document_requests.manage`, `document_versions.view`.
- `server/routes/admin/index.js` — mounts `attachDocuments(router)`.
- `server/views/admin/cases/detail.ejs` — the "Documents" placeholder card ("not implemented yet") now links to the real document center; the "Client Queries"/"Channels" placeholders are untouched (out of this cycle's scope).
- `server/scripts/createIndexes.js`, `scripts/createIndexes.ts` — added the five new document models (both apps).
- `server/package.json`, `package.json` — added `file-type` as a real dependency (both apps); server also gained three new npm scripts (`documents:provision-categories[:apply]`, `documents:reconcile-storage`).
- `src/app/portal/cases/[caseId]/page.tsx` — the "Coming soon" card's document-related copy replaced with a real link to `/portal/cases/[caseId]/documents`; messages/scheduled-consultations copy is unchanged (still future work).
- `test/helpers/http.ts` — added `formDataRequest()`, a multipart-upload sibling to the existing `jsonRequest()`.

## Models and fields (Cycle 5)

**`DocumentCategory`** (`document_categories`): `case`, `workspace`, `templateKey`, `name`, `slug`, `description`, `order`, `visibility`, `allowedUploaderTypes`, `required`, `active`, `createdBy`, timestamps.

**`CaseDocument`** (`case_documents`): `case`, `workspace`, `category`, `uploadedByType`/`uploadedByClient`/`uploadedByAdmin`, `originalName`, `displayName`, `storageKey`, `mimeType`/`detectedMimeType`/`extension`/`size`/`checksum`, `status`, `visibility`, `scanStatus`/`scanProvider`/`scanCompletedAt`/`scanMessage`, `currentVersion`/`versionCount`, `reviewedBy`/`reviewedAt`/`clientVisibleReviewComment`/`internalReviewComment`, `documentRequest`, `uploadedAt`/`archivedAt`, timestamps. `optimisticConcurrency: true`.

**`DocumentVersion`** (`document_versions`): `document`, `versionNumber`, `storageKey`, `originalName`/`displayName`/`mimeType`/`detectedMimeType`/`extension`/`size`/`checksum`, `uploadedByType`/`uploadedByClient`/`uploadedByAdmin`, `changeNote`, `scanStatus`, `createdAt` only (immutable, no `updatedAt`).

**`DocumentRequest`** (`document_requests`): `case`, `workspace`, `category`, `title`, `instructions`, `requestedFrom` (a `WorkspaceMember`, never a bare `ClientUser`), `requestedBy`, `dueDate`, `status`, `fulfilledByDocument`/`fulfilledAt`, `clientVisibleComment`/`internalComment`, `cancelledAt`, timestamps.

**`DocumentAccessLog`** (`document_access_logs`, new — not in either prior cycle): `document`, `version`, `case`, `actorType`/`actorClient`/`actorAdmin`/`actorName`, `result`, `createdAt` only.

## Indexes (Cycle 5)

| Model | Indexes |
|---|---|
| `DocumentCategory` | `case+slug` (unique); `case+order` (unique, partial on `active:true`); `case+templateKey`; `case+active+order`; `workspace+active+order` |
| `CaseDocument` | `case+category+status+createdAt`; `workspace+status+createdAt`; `category+status+createdAt`; `case+checksum`; `documentRequest`; `uploadedByClient+createdAt`; `uploadedByAdmin+createdAt`; `status+reviewedAt`; `archivedAt` |
| `DocumentVersion` | `document+versionNumber` (unique); `document+createdAt`; `checksum` (deliberately not unique) |
| `DocumentRequest` | `case+status+dueDate`; `workspace+status+dueDate`; `requestedFrom+status+dueDate`; `category+status`; `fulfilledByDocument` |
| `DocumentAccessLog` | `document+createdAt`; `case+createdAt`; `actorAdmin+createdAt`; `actorClient+createdAt` |

Verified via both apps' `--dry-run` index scripts — collection names match exactly between the two independent declarations (confirmed by `document-schema-contract.test.{js,ts}` too).

## Statuses, visibility, and the default category template (Cycle 5)

Document statuses: `uploaded`, `quarantined`, `pending_review`, `accepted`, `needs_replacement`, `rejected`, `superseded`, `archived`. Scan statuses: `clean`, `infected`, `error`, `not_configured`, `pending`. Request statuses: `open`, `uploaded`, `under_review` (reserved, unused this cycle), `fulfilled`, `replacement_required`, `cancelled`. Visibility (category and document): `client_visible`, `employees_only`. Uploader types: `client`, `employee`, `both` (category-level "who may upload").

The 19-entry default category template (`identity_civil_documents` through `other`) lives in `server/utils/documentConstants.js`/`src/lib/content/document-constants.ts`, ordered 1–19, with visibility/uploader defaults chosen per ADR-004's own guidance (internal strategy/drafting categories — `proposed_endeavor_case_strategy`, `petition_letter`, `filing_package` — are `employees_only`; everything the client would naturally supply, review, or receive is `client_visible`).

## Capability matrix (Cycle 5)

| Capability | Roles |
|---|---|
| `documents.view` | `super_admin`, `admin`, `pm` |
| `documents.view_all` | `super_admin`, `admin` |
| `documents.upload` | `super_admin`, `admin`, `pm` |
| `documents.review` | `super_admin`, `admin`, `pm` |
| `documents.archive` | `super_admin`, `admin`, `pm` |
| `document_categories.manage` | `super_admin`, `admin`, `pm` |
| `document_requests.manage` | `super_admin`, `admin`, `pm` |
| `document_versions.view` | `super_admin`, `admin`, `pm` |

Same conservative-matrix philosophy as `cases.*`/`queries.*` — specialists/reviewer/editor/viewer hold none of these; no product rule yet justifies it.

## Row-level policy (Cycle 5)

**Employee side** (`server/services/documentPolicy.js`): capability **and** active employee `WorkspaceMember` on the document's workspace, with `documents.view_all` as the membership bypass — identical shape to `casePolicy.js`/`interactionPolicy.js`, and reuses `casePolicy.js`'s `hasActiveEmployeeMembership()` directly rather than duplicating it.

**Client side** (`src/lib/auth/document-policy.ts`): active client `WorkspaceMember`, re-checked on every read, **plus** the document/category must be `client_visible` **and** not `quarantined`. A different client's document, a nonexistent one, and an `employees_only` document all return the identical `null`.

## Upload validation pipeline (Cycle 5)

Auth → CSRF → rate-limit → resolve case/workspace/category/request → membership+capability → category active and uploader-type-allowed → file-count/size limits (hard-capped at 100MB/20 files regardless of env config) → filename sanitized for display only (never used as a storage key) → stream to `temp/<storageKey>` while computing SHA-256 → read the (already size-bounded) temp file into memory for signature detection (`file-type` needs more than a byte prefix to reliably distinguish zip-based Office formats) → cross-check extension/declared-MIME/detected-MIME → reject on any mismatch or unrecognized signature → duplicate check (`case+checksum+category`) → scan (stub, `not_configured`) → move to `active/` or `quarantine/` → create `CaseDocument`+`DocumentVersion`(+update `DocumentRequest`) in one transaction → audit + best-effort notify → clean up temp on any rejection, clean up the committed storage object on a post-storage-write DB failure.

Allowed types: PDF, DOCX, XLSX, JPEG, PNG, TIFF. HTML/SVG/script-capable/renamed-executable content is rejected by signature mismatch regardless of claimed extension/MIME — verified by tests including a real `<script>`-bearing HTML file and a `MZ`-header (PE/DOS executable) file renamed `.pdf`.

## Review, replacement, and versioning behavior (Cycle 5)

Accept/needs-replacement/reject all go through `reviewDocument()`, idempotent for an identical repeat (no duplicate audit/email/timestamp churn). Rejection and needs-replacement both require a client-visible reason (product decision, above). Replacement (`replaceDocumentVersion()`) always creates a new `DocumentVersion` — never mutates an existing one — resets review metadata to force re-review, and is protected by `optimisticConcurrency` against two concurrent replacement attempts. Category moves re-evaluate `visibility` from the destination category, so a document can never silently retain client-visibility after being moved into an `employees_only` category (or vice versa).

## Download behavior (Cycle 5)

Every download (`GET /admin/documents/:id/download`, `GET /admin/documents/:id/versions/:versionId/download`, `GET /portal/documents/:id/download`) re-derives authorization from scratch — no caching, no ID-alone shortcuts. Headers: `Content-Disposition: attachment`, `Content-Type` from the *detected* (verified) MIME type, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`, `Content-Security-Policy: sandbox`. No inline rendering, no range requests (both deliberately out of scope per the module doc). Quarantined documents are never downloadable through the normal route, by anyone, in either app.

## Audit and notification behavior (Cycle 5)

`CaseActivity` gains category/document/request lifecycle events (provisioned, created, renamed, reordered, disabled, reactivated, requested, request updated/cancelled, uploaded, reviewed, replacement uploaded, category changed, version created, archived). `DocumentAccessLog` (new, separate collection) records every download attempt (success/denied/not_found) with actor identity — never file content or filesystem paths. Employee in-app notifications (`notify()`/`Notification`) fire only for client-initiated uploads, addressed to the case's project manager. Client emails (`server/services/documentEmail.js`, mirroring `interactionEmail.js`'s Resend/test-double pattern exactly) fire for request created/due-date-changed/cancelled and document accepted/needs-replacement/rejected — logs and degrades gracefully when `RESEND_API_KEY` is unset, never rolls back the mutation that triggered it.

## Admin routes/pages (Cycle 5)

`GET /admin/cases/:caseId/documents`, `GET /admin/documents/:id`, `POST /admin/cases/:caseId/{categories,categories/reorder,document-requests,documents,initialize-document-categories}`, `POST /admin/categories/:id/{update,disable,reactivate}`, `POST /admin/document-requests/:id/{update,cancel}`, `POST /admin/documents/:id/{review,category,version,archive}`, `GET /admin/documents/:id/download`, `GET /admin/documents/:id/versions/:versionId/download`. Document center groups documents by category with inline upload forms; document detail shows version history, review form, category-move form, and replacement upload.

## Portal routes/pages (Cycle 5)

`GET /portal/cases/:caseId/documents`, `GET /portal/cases/:caseId/documents/:documentId`, `GET /portal/documents/:documentId/download`, `POST /api/portal/cases/:caseId/documents` (handles both new uploads and replacements via an optional `replaceDocumentId` field — kept as one endpoint since it's the same underlying storage/versioning operation with a different target), `POST /api/portal/document-requests/:requestId/upload`. Document center shows only `client_visible` categories/documents, open requests with inline fulfillment forms and overdue indicators, never internal categories/comments/storage keys.

## Testing (Cycle 5)

**Results (confirmed, full suite run at the final commit):**
- Server: **249/249 passing** (Cycle 5 added 59: 11 in `document-storage-provider.test.js`, 13 in `document-validation.test.js`, 13 in `document-models.test.js`, 6 in `document-schema-contract.test.js`, 7 in `document-policy.test.js`, 9 in `document-lifecycle.integration.test.js`; plus the existing 190 from Cycles 1–3).
- Root: **100/100 passing** (Cycle 5 added 24: 6 in `document-schema-contract.test.ts`, 8 in `document-authorization.integration.test.ts`, 10 in `document-routes.integration.test.ts`; plus the existing 76 from Cycles 1–3).

**A real bug was caught by `npm run build`, not by the test suite** (see "Product/policy decisions" above) — the eager storage-provider singleton broke Next.js's build-time page-data collection. Fixed by converting to a lazy singleton; re-verified with both a full test re-run (100/100, unchanged) and a successful `npm run build`.

**Explicitly not covered** (honest gaps, in the same spirit as prior cycles' testing sections):
- DOCX/XLSX signature detection is not tested directly — `file-type` needs a materially more complex, correctly-structured zip fixture (internal `[Content_Types].xml`) to distinguish a real Office file from a generic zip, which wasn't worth constructing by hand this cycle; PDF/JPEG/PNG detection (magic-byte-based, simpler to fixture) *are* tested, including the negative cases (mismatch, renamed executable, HTML/script content, empty buffer).
- SVG rejection specifically isn't tested (would follow the identical "no detected signature → reject" path already proven by the HTML test).
- Macro-enabled Office document rejection isn't tested (same zip-fixture-complexity reason as DOCX/XLSX above).
- Too-many-files and document-specific rate-limiting aren't tested in isolation — the underlying mechanisms (existing rate limiter, `maxFilesPerRequest()`) are exercised/proven elsewhere but not with a document-route-specific test.
- Real Resend delivery of the six new document emails is unverified beyond the existing test-double injection pattern (same posture as every prior cycle's email testing).
- The orphan-storage reconciliation script (`reconcileDocumentStorage.js`) has no automated test — it's a manual/operational tool, verified by code review and by manually reasoning through its logic, not by an integration test against a real filesystem-vs-DB mismatch scenario.

**Quality commands, all confirmed:**
- `npx tsc --noEmit` (root) — clean.
- `npm run lint` (root) — clean.
- `npm run build` (root, Turbopack) — succeeds after the lazy-singleton fix; all new routes (`/api/portal/cases/[caseId]/documents`, `/api/portal/document-requests/[requestId]/upload`, `/portal/cases/[caseId]/documents`, `/portal/cases/[caseId]/documents/[documentId]`, `/portal/documents/[documentId]/download`) appear correctly classified as dynamic (ƒ). One benign Turbopack warning remains ("Encountered unexpected file in NFT list", pointing at `local-private-storage-provider.ts`'s filesystem-path construction) — cosmetic, does not fail the build, left as a known, documented, non-blocking warning rather than risking a rushed `turbopackIgnore` fix under time pressure.
- `npm run db:indexes:dry-run` (root) and `node scripts/createIndexes.js --dry-run` (server) — both list every new index without connecting; collection names match exactly between the two scripts.
- `cd server && npm test` — 249/249.

**Manual smoke tests performed** (GET-only, no mutations, against the real running dev servers on the real `.env` target):
- `GET /portal/cases/507f.../documents` unauthenticated → `307` redirect to login.
- `GET /portal/documents/507f.../download` unauthenticated → `401`.
- `GET /admin/cases/507f.../documents` unauthenticated → `302` redirect to login.
- `GET /admin/documents/507f.../download` unauthenticated → `302` redirect to login.
- No documents, categories, or requests were created against the real database — authenticated upload/review/download flows were verified instead via the 83 new database-backed integration tests across both apps (real routes, real temp storage roots, real Mongo, real rendered EJS output).

## Environment variables (Cycle 5)

**New:** `PRIVATE_DOCUMENT_ROOT` — absolute path to the private document storage root. Optional in development (defaults to a path under `os.tmpdir()`); **required** in production, and production startup rejects a value that resolves inside either app's publicly-served directory. `DOCUMENT_MAX_FILE_SIZE_BYTES`/`DOCUMENT_MAX_FILES_PER_REQUEST` — optional, fall back to sane defaults (25MB/5 files), hard-capped at 100MB/20 files regardless of what's configured.

**Not introduced this cycle:** `DOCUMENT_ALLOWED_MIME_TYPES`, `DOCUMENT_STORAGE_PROVIDER`, `DOCUMENT_SCANNER_MODE` — the allowlist and scanner are code-level (not env-configurable) this cycle since there's only one provider/scanner implementation each; introducing env-driven selection now would be speculative ahead of an actual second provider/scanner existing (YAGNI).

## Deployment blockers carried forward (verified still open, not silently marked resolved)

1. `SITE_URL` must be set in production for CSRF `Origin` verification (Cycle 1) — **still open**.
2. Real Resend activation/reset delivery (Cycle 1) — **still unverified**; Cycle 5 adds six more Resend usages (client document emails) on the same unverified footing.
3. Root index rollout has not been run against production (Cycle 1/2/3/5) — **still open**; Cycle 5 adds five more collections to the same deferred rollout.
4. Rate limiting remains process-local (Cycle 1) — **still open**.
5. `/portal/profile`, `/portal/security` (Cycle 1) — **still deferred**.
6. Client-facing case-created email (Cycle 2) — **still deferred**.
7. Non-transactional-fallback partial-provisioning recovery (Cycle 2) — **still open**, unchanged; Cycle 5's category provisioning has the identical non-transactional-fallback exposure on a non-replica-set deployment (mitigated the same way — idempotent re-run, not atomicity).
8. Cases notification-failure fault-injection test (Cycle 2) — **still not written**.
9. Additional-client-on-a-case membership UI (Cycle 2) — **still not built**.
10. No dedicated admin UI button for `initialize-interaction` (Cycle 3) — **still open**.
11. "Notify triage users on submission" not implemented as a broadcast (Cycle 3) — **still deliberate, unchanged**.

## New Cycle 5 open items

- **Production object storage is not selected or built** (ADR-004 §21/§25) — deliberately deferred pending real deployment requirements (volume, retention, budget) from the practice owner. `PRIVATE_DOCUMENT_ROOT`/`LocalPrivateStorageProvider` works for a single-VPS deployment (the current documented topology) but breaks silently under any future multi-instance deployment — flagged explicitly, not a surprise for a future cycle.
- **No real malware scanner integrated** — `scanStatus: 'not_configured'` ships to production as-is; the conservative extension/MIME/signature allowlist is the actual defense this cycle, documented as an accepted risk, not silently presented as "files are scanned."
- **The orphan-storage reconciliation script is report-only** — no deletion capability exists yet (module doc's own instruction: deletion is explicitly future work, requiring human review of the report first).
- **`PRIVATE_DOCUMENT_ROOT` is not yet part of any backup strategy** — a second thing (beyond the database) that needs backing up in production; not resolved this cycle since no production storage root exists yet.
- **No dedicated admin UI button for `initialize-document-categories`** on the case detail page — the route exists, capability-gated, callable directly; not wired into `cases/detail.ejs`'s Documents card this cycle (same shape as the still-open Cycle 3 `initialize-interaction` gap).
- **Real Resend delivery of the six new document emails is unverified** beyond the test-double injection point (same posture as every prior cycle).

## Known limitations (Cycle 5)

- Client document-detail page shows only the current version, not a full version history (product decision, above) — the data (`DocumentVersion` rows) is fully there for a future cycle to expose if ever required.
- `under_review` is a declared, valid `DocumentRequest` status but no code path sets it this cycle (requests go straight from `open`/`uploaded` to `fulfilled`/`replacement_required`) — reserved for a future cycle that wants a distinct "an employee is actively reviewing this" signal.
- DOCX/XLSX uploads are supported by the allowlist and validated by `file-type`'s real zip-aware detection in production code, but that specific detection path has no automated test fixture this cycle (see Testing, above) — a real risk if `file-type`'s docx/xlsx detection ever regresses silently between dependency upgrades, worth adding a proper fixture in a future cycle.

## Recommended next module

`06_TEAM_COLLABORATION_AND_CHAT.md` — read alongside `00_MASTER_ROADMAP.md` and this status file first, per the plan's own handoff procedure. `CaseDocument`'s shape is already compatible with being referenced as a future chat-message attachment without modification (ADR-004 §24) — that integration decision is explicitly deferred to Cycle 6's own ADR.

---

# Cycle 6 — Team Collaboration and Chat

Module implemented: `06_TEAM_COLLABORATION_AND_CHAT.md`.

## Pre-implementation verification

Re-ran the full git-anomaly check (ancestry, reflog, HEAD match) and captured the pre-existing `admin.css` diff before any edits (see the note at the top of this file). Confirmed HEAD matched Cycle 5's reported ending commit (`2041950`) exactly. Re-ran both apps' full test suites before starting any edits: server 249/249 (one file hit the project's known `mongodb-memory-server` cold-start flakiness on the first run — 10/10 clean on an isolated retry, confirmed transient, not a regression), root 100/100 clean.

## Architecture decision: ADR-005

`docs/architecture/ADR-005-team-collaboration.md`. Summary:

1. **Model ownership — dual writer, same shape as ADR-003/ADR-004:** clients send/edit/delete their own messages and mark channels read from the portal; employees do the same plus create/manage/archive channels, manage restricted membership, and moderate from the admin.
2. **Channel visibility — two composed authorization layers:** active `WorkspaceMember` is required for every channel regardless of type; an active `ChannelMember` is *additionally* required only for `restricted_members` channels. `all_members`/`clients_and_team` are functionally identical this cycle but kept as distinct enum values for a future workspace-member-type split.
3. **Mentions — explicit selection, not free-text `@name` parsing:** the composer submits resolved `workspaceMember` IDs; the server independently re-validates every one against current active membership/channel-access. Chosen specifically so "a client cannot discover a hidden employee's name by guessing it in `@` syntax" is true by construction, not by a parser getting every edge case right.
4. **Message body — plain text only this release:** normalized line endings, length-capped, escaped by each framework's existing default render behavior (JSX/EJS auto-escaping) — no markdown, no autolinking, no sanitizer dependency added, since there's no formatting layer to sanitize. Documented as a deliberate first-release scope choice, not an oversight.
5. **Threading — one level only:** a reply-to-a-reply is normalized to the original thread root before persisting (the service layer rewrites `parentMessage`, not the client).
6. **Attachments — zero new storage code:** a message attachment snapshots a document's *current version at send time* (`{document, documentVersion, displayNameSnapshot}`); downloads reuse Cycle 5's already-authorized routes unchanged, which independently re-check live authorization on every request.
7. **Read state — `lastReadAt` stores the read message's own `createdAt`**, not "now," so unread-count queries are a single indexed range scan. A two-step upsert-then-conditionally-advance update makes the "never move backward" guarantee atomic under concurrent requests, without risking a duplicate-key race on the unique `(channel, workspaceMember)` index a single conditional-filter upsert would have.
8. **Idempotency/concurrency — the same proven mechanisms as Cycles 3–5, not new ones:** client-generated `idempotencyKey` (unique partial index per channel), `optimisticConcurrency: true` for edit conflicts, atomic `$inc` for thread reply counters, the two-phase negative-then-positive order update for channel reorder (same technique ADR-004 established for `DocumentCategory`).
9. **System messages — a small, explicit set of real integration points, not a generic event bus:** member added, document uploaded/accepted/replacement-requested, case stage changed. The module doc's other listed examples (consultation scheduled/answered, deadline changed, filing completed, etc.) are deliberately not wired this cycle.
10. **Recommendation Letters channel is `employees_only`**, not `clients_and_team` — the module doc left this open. Internal drafting discussion stays internal; the finished letters themselves are already client-visible through Cycle 5's `recommendation_letters` document category, so no client-facing capability is lost.
11. **Notifications reuse the existing `Notification` model exactly** — new types `message_mention`/`message_reply`, new `relatedChannel`/`relatedMessage` fields. No migration to immutable recipient identities (explicitly Cycle 7's job).

## Product/policy decisions made without stopping for confirmation

- **A genuinely new root-app write path:** `Notification` is mirrored into this app for the first time (`src/lib/models/Notification.ts`, same implicit collection-name pluralization as the existing server model — not a new naming convention) — required because a client-authored message that mentions or replies to an employee must be able to notify that employee in-app, and only the server-side `Notification` collection exists for that. Documented explicitly as a deliberate architectural extension, not an accidental scope creep.
- **Reply notifications stay in-app/employee-only** — mentions get the (optional, Resend-gated) email treatment per the module's own conservative policy ("Do not send routine channel-message emails"); a reply is judged more routine than a direct `@mention` and is not emailed to a client-authored recipient either way this cycle.
- **`CLIENT_STAGE_LABELS` added to `server/utils/caseConstants.js`** — previously portal-only (TS side), now needed server-side too since `systemMessageService.js` composes client-facing system-message text before it ever reaches the client's read path. Mirrors the existing TS mapping exactly; not added to `case-schema-contract.json` (a label-mapping is not a security/authorization-relevant enum, and expanding a Cycle 2 contract test was judged out of this cycle's scope).
- **A real bug found and fixed in the SAME session, carried forward from before Cycle 6 started:** the interim `6d13cfc` fix (env-fallback admin rejected from answering interactions) is unrelated to this cycle but recorded here for continuity since it's the commit Cycle 6 actually started from.
- **A genuine test-design flaw found and fixed during this cycle's own test-writing (not a code bug):** an initial concurrency test for `editMessage()` asserted a version conflict using a sequential "save copy A, then edit via the service" pattern — but `editMessage()` always performs its own fresh `findById`, so by the time it runs, copy A's save has already committed and the service's own read is never actually stale. Fixed by rewriting the test to use `Promise.allSettled` with two genuinely concurrent `editMessage()` calls, which correctly exercises the real race the service needs to survive. The underlying `optimisticConcurrency` mechanism itself was already correctly proven at the model layer (`collaboration-models.test.js`).

## Files created (Cycle 6)

**Docs:**
- `docs/architecture/ADR-005-team-collaboration.md`
- `docs/architecture/collaboration-schema-contract.json`

**Server — models:**
- `server/models/{WorkspaceChannel,ChannelMember,WorkspaceMessage,MessageRevision,ChannelReadState}.js`

**Server — utils/services:**
- `server/utils/{collaborationConstants,messageCursor}.js`
- `server/services/{collaborationPolicy,channelService,messageService,readStateService,systemMessageService,collaborationEmail}.js`

**Server — routes/views:**
- `server/routes/admin/collaboration.js`
- `server/views/admin/collaboration/{index,channel,thread}.ejs`

**Server — scripts:**
- `server/scripts/provisionChannels.js`

**Server — tests:**
- `server/test/{collaboration-schema-contract,collaboration-models,collaboration-policy}.test.js`
- `server/test/integration/collaboration-lifecycle.integration.test.js`

**Root — lib:**
- `src/lib/content/{collaboration-constants,message-cursor}.ts`
- `src/lib/models/{WorkspaceChannel,ChannelMember,WorkspaceMessage,MessageRevision,ChannelReadState,Notification}.ts`
- `src/lib/auth/collaboration-policy.ts`
- `src/lib/collaboration/{message-service,read-state-service}.ts`

**Root — API routes:**
- `src/app/api/portal/channels/[channelId]/messages/route.ts`
- `src/app/api/portal/channels/[channelId]/read/route.ts`
- `src/app/api/portal/messages/[messageId]/{replies,edit,delete}/route.ts`

**Root — portal pages/components:**
- `src/app/portal/cases/[caseId]/messages/page.tsx`
- `src/app/portal/cases/[caseId]/messages/[channelId]/page.tsx`
- `src/app/portal/cases/[caseId]/messages/[channelId]/threads/[messageId]/page.tsx`
- `src/components/portal/{message-composer,message-actions}.tsx`

**Root — tests:**
- `test/collaboration-schema-contract.test.ts`
- `test/collaboration-authorization.integration.test.ts`
- `test/collaboration-routes.integration.test.ts`

## Files modified (Cycle 6)

- `server/services/caseConversion.js` — provisions default channels inside the existing case-creation transaction, right after document-category provisioning; logs `channel_provisioned` alongside the existing activity entries.
- `server/services/caseManagement.js` — `updateStage`/`addEmployeeMember`/`addClientMember` now emit the corresponding system messages (case stage changed / member added).
- `server/services/documentUploadService.js`, `server/services/documentReviewService.js` — emit `document_uploaded`/`document_reviewed` system messages; fixed a bug found while wiring this in (see below).
- `server/models/CaseActivity.js` — `ACTIVITY_TYPES` gains channel-provisioning/lifecycle event types (message create/edit/reply are deliberately NOT here — see Audit behavior, below).
- `server/models/admin/Notification.js`, `server/utils/notify.js` — gain `message_mention`/`message_reply` types and `relatedChannel`/`relatedMessage` fields.
- `server/utils/caseConstants.js` — gains `CLIENT_STAGE_LABELS` (see Product/policy decisions, above).
- `server/utils/permissions.js` — added `channels.view`, `channels.view_all`, `channels.create`, `channels.manage`, `channels.archive`, `channel_members.manage`, `messages.send`, `messages.edit_own`, `messages.moderate`, `messages.view_revisions`.
- `server/routes/admin/index.js` — mounts `attachCollaboration(router)`.
- `server/views/admin/cases/detail.ejs` — the "Channels" placeholder card ("not implemented yet") now links to the real collaboration center. The still-separate "Client Queries" placeholder is untouched (a pre-existing Cycle 3 gap, out of this cycle's scope).
- `server/scripts/createIndexes.js`, `scripts/createIndexes.ts` — added the five new collaboration models (both apps).
- `server/package.json` — added `collaboration:provision-channels[:apply]` npm scripts.
- `src/app/portal/cases/[caseId]/page.tsx` — the "Coming soon" card's messages-related copy replaced with a real link to `/portal/cases/[caseId]/messages`; scheduled-consultations copy is unchanged (still future work).

**A real bug was found and fixed while wiring `document_uploaded` system-message emission into `documentUploadService.js`:** `auditAndNotifyUpload()` had an early `return` (skip employee notification for a client's own upload) positioned *before* the system-message emission would have run for employee-uploaded documents — meaning an employee's own document upload would never generate a `documents` channel system message at all. Fixed by moving the system-message emission ahead of that early return, so it fires regardless of uploader type (only the *employee in-app notification* is correctly uploader-type-conditional, matching its original intent).

## Models and fields (Cycle 6)

**`WorkspaceChannel`** (`workspace_channels`): `workspace`, `case`, `templateKey`, `name`, `slug`, `description`, `channelType`, `visibility`, `order`, `createdByType`/`createdByAdmin`, `archivedAt`, timestamps.

**`ChannelMember`** (`channel_members`): `channel`, `workspaceMember`, `status`, `addedBy`/`addedByType`, `joinedAt`/`removedAt`, timestamps.

**`WorkspaceMessage`** (`workspace_messages`): `workspace`, `case`, `channel`, `senderType`/`senderClient`/`senderAdmin`/`senderDisplayName`, `body`/`bodyFormat`/`messageType`, `parentMessage`/`threadRoot`/`replyCount`/`lastReplyAt`, `mentions[]`/`attachments[]`, `editedAt`, `deletedAt`/`deletedByType`/`deletedByClient`/`deletedByAdmin`/`deletionReason`, `clientVisible`, `idempotencyKey`, timestamps. `optimisticConcurrency: true`.

**`MessageRevision`** (`message_revisions`): `message`, `revisionNumber`, `action`, `previousBody`/`newBody`, `previousAttachments`/`newAttachments`, `previousMentions`/`newMentions`, `actorType`/`actorClient`/`actorAdmin`, `reason`, `createdAt` only (immutable, no `updatedAt`).

**`ChannelReadState`** (`channel_read_states`): `workspace`, `channel`, `workspaceMember`, `lastReadMessage`, `lastReadAt`, timestamps.

## Indexes (Cycle 6)

| Model | Indexes |
|---|---|
| `WorkspaceChannel` | `workspace+slug` (unique, active-only); `workspace+order` (unique, active-only); `workspace+archivedAt+order`; `case+archivedAt`; `workspace+templateKey` |
| `ChannelMember` | `channel+workspaceMember` (unique); `workspaceMember+status`; `channel+status` |
| `WorkspaceMessage` | `channel+createdAt+_id`; `channel+parentMessage+createdAt+_id`; `threadRoot+createdAt+_id`; `workspace+createdAt`; `senderClient+createdAt`; `senderAdmin+createdAt`; `deletedAt`; `channel+idempotencyKey` (unique, wherever set) |
| `MessageRevision` | `message+revisionNumber` (unique); `message+createdAt` |
| `ChannelReadState` | `channel+workspaceMember` (unique); `workspaceMember+updatedAt` |

Verified via both apps' `--dry-run` index scripts — collection names match exactly between the two independent declarations (confirmed by `collaboration-schema-contract.test.{js,ts}` too).

## Channel types, visibility, and default channels (Cycle 6)

Channel types: `standard`, `documents`, `updates`, `private`, `internal`. Visibility: `all_members`, `clients_and_team`, `employees_only`, `restricted_members`. Sender types: `client`, `employee`, `system`. Message types: `text`, `system_update`, `document_update`, `task_update`, `consultation_update`, `case_update` (clients may only ever create `text`).

The 6-entry default channel template (General, Case Updates, Documents, Petition Strategy, Recommendation Letters, USCIS Forms) lives in `server/utils/collaborationConstants.js`/`src/lib/content/collaboration-constants.ts`. Visibility defaults: General/Case Updates/Documents/USCIS Forms are `clients_and_team`; Petition Strategy/Recommendation Letters are `employees_only` (see ADR-005 §20 for the Recommendation Letters reasoning).

## Message, thread, and mention behavior (Cycle 6)

Plain-text only, length-capped at 8000 characters, normalized line endings, escaped at render time by each framework's default. Threading is one level: a reply's `parentMessage`/`threadRoot` are always the true top-level message, even if the user clicked "reply" on another reply (normalized server-side). Mentions are explicit `workspaceMember` selections re-validated server-side against current active membership (and, for restricted channels, current `ChannelMember` status) — never parsed from `@name` text. Editing recalculates mentions and only notifies newly-added ones; a removed mention never generates a notification.

## Attachment behavior (Cycle 6)

A message attachment references `{document, documentVersion, displayNameSnapshot}` — the document's current version *at send time*, snapshotted, not re-resolved later. `canAttachDocument()` (server) enforces: same case as the channel, not quarantined, and — for a client-accessible channel — the document itself must be `client_visible`. No new upload pipeline, no new download route: attachments are downloaded through Cycle 5's existing, independently-re-authorized-per-request routes.

## Edit, deletion, and revision behavior (Cycle 6)

Edits are protected by `optimisticConcurrency` — two genuinely concurrent edits on the same message result in exactly one success and one controlled `409`-equivalent conflict, never a silent overwrite (verified with real concurrent `Promise.allSettled` requests, not a sequential simulation). An edit that changes nothing creates no `MessageRevision`. Deletion is soft-only: the original body remains in storage (and in the revision it creates) but every render path substitutes a fixed placeholder — clients editing/deleting are restricted to their own messages via `messages.edit_own`; moderating someone else's message requires `messages.moderate`.

## Read-state and unread-count behavior (Cycle 6)

`lastReadAt` is the read message's own `createdAt`, not "now." Marking read is a two-step upsert-then-conditionally-advance operation, atomic against concurrent requests, and provably monotonic (tested: marking read with an older message after a newer one is a no-op). Unread counts exclude the reader's own messages by default, exclude soft-deleted messages, and are computed only over the caller's already-visibility-filtered channel list — an `employees_only` or unauthorized `restricted_members` channel can never contribute to a client's unread total because it's never in that list to begin with.

## Capability matrix (Cycle 6)

| Capability | Roles |
|---|---|
| `channels.view` | `super_admin`, `admin`, `pm`, case specialists, `reviewer` |
| `channels.view_all` | `super_admin`, `admin` |
| `channels.create` | `super_admin`, `admin`, `pm` |
| `channels.manage` | `super_admin`, `admin`, `pm` |
| `channels.archive` | `super_admin`, `admin`, `pm` |
| `channel_members.manage` | `super_admin`, `admin`, `pm` |
| `messages.send` | `super_admin`, `admin`, `pm`, case specialists, `reviewer` |
| `messages.edit_own` | `super_admin`, `admin`, `pm`, case specialists, `reviewer` |
| `messages.moderate` | `super_admin`, `admin`, `pm` |
| `messages.view_revisions` | `super_admin`, `admin`, `pm` |

Case specialists/reviewer get view+send+edit_own only (the module's own suggested narrower grant for that tier) — moderation and channel management stay manager-tier. CMS editor/viewer hold none of these capabilities.

## Row-level policy (Cycle 6)

**Employee side** (`server/services/collaborationPolicy.js`): a shared `hasChannelAccess()` composes both authorization layers — active `WorkspaceMember` (or the `channels.view_all` org-wide bypass) plus, for `restricted_members` channels only, an active `ChannelMember`. Every specific action (`canViewChannel`, `canSendMessage`, `canEditMessage`, etc.) layers its own capability check on top of this shared base — reused directly from `casePolicy.js`'s `hasActiveEmployeeMembership()` rather than duplicated.

**Client side** (`src/lib/auth/collaboration-policy.ts`): identical two-layer shape. A different client's channel, an `employees_only` channel, and a nonexistent channel all return the identical `null`. A removed `WorkspaceMember` or a removed `ChannelMember` (on an otherwise-still-active membership) both immediately deny access on the next request — no caching.

## Admin routes/pages (Cycle 6)

`GET /admin/cases/:caseId/collaboration`, `GET /admin/channels/:id`, `GET /admin/channels/:id/thread/:messageId`, `POST /admin/cases/:caseId/{channels,channels/reorder,initialize-channels}`, `POST /admin/channels/:id/{update,archive,members,members/:memberId/remove}`, `POST /admin/channels/:id/messages`, `POST /admin/messages/:id/{replies,edit,delete,restore}`, `POST /admin/channels/:id/read`. Collaboration center lists visible channels with unread counts; channel view shows paginated messages (cursor-based, "load older"), send/moderate controls; thread view shows a root message and its replies.

## Portal routes/pages (Cycle 6)

`GET /portal/cases/:caseId/messages`, `GET /portal/cases/:caseId/messages/:channelId`, `GET /portal/cases/:caseId/messages/:channelId/threads/:messageId`, `POST /api/portal/channels/:channelId/{messages,read}`, `POST /api/portal/messages/:messageId/{replies,edit,delete}`. Message center shows only accessible channels with unread badges; channel view auto-marks-read on load and shows a composer; thread view shows the root message, replies, and a reply composer. Never renders employees_only channels, internal role codes, revision history, or storage keys.

## System-message integration (Cycle 6)

Four real integration points wired this cycle (not the module's full example list — see Product/policy decisions): workspace member added, case stage changed, document uploaded, document reviewed (accepted/needs-replacement). Each call site decides `clientVisible` explicitly and passes an idempotency key derived from real event identity (e.g. `member_added:<workspaceMemberId>`, `document_uploaded:<documentId>:v<versionNumber>`) so a retried mutation never double-posts the same system message.

## Notification behavior (Cycle 6)

Employee recipients get an in-app `Notification` (mention or reply) via the existing `notify()`/`Notification` model — this is also the **first write the Next.js app has ever made against that collection** (a new, deliberate architectural extension — see Product/policy decisions). Client recipients of a direct mention get an email via the new `server/services/collaborationEmail.js` (mirroring `documentEmail.js`'s Resend/test-double pattern exactly); replies are not emailed to anyone this cycle (conservative default). Notification/email failures never roll back the already-durable message.

## Testing (Cycle 6)

**Results (confirmed, full suite run at the final commit):**
- Server: **300/300 passing** (Cycle 6 added 51: 5 in `collaboration-schema-contract.test.js`, 16 in `collaboration-models.test.js`, 13 in `collaboration-policy.test.js`, 17 in `collaboration-lifecycle.integration.test.js`; plus the existing 249 from Cycles 1–5).
- Root: **122/122 passing** (Cycle 6 added 22: 5 in `collaboration-schema-contract.test.ts`, 7 in `collaboration-authorization.integration.test.ts`, 10 in `collaboration-routes.integration.test.ts`; plus the existing 100 from Cycles 1–5).

**A real test-design flaw was caught and fixed while writing these tests** (see Product/policy decisions, above) — not a code bug, but worth noting since it's the same category of lesson as Cycle 3's concurrency finding: a sequential "load, save, then call the service" test cannot observe a service function's own internal fresh-read as stale. Fixed with genuine `Promise.allSettled`-based concurrent calls, which correctly exercises the real race.

**Explicitly not covered** (honest gaps, same spirit as every prior cycle):
- No dedicated test for the *admin-side* message/reply/edit/delete/moderate routes as real HTTP requests (server-side collaboration is covered thoroughly at the service+policy layer via `collaboration-lifecycle.integration.test.js` and `collaboration-policy.test.js`, but not via `supertest`-driven route requests the way `server/test/integration/*.js` covers other domains) — a real gap, not silently claimed as covered.
- No automated test for the admin EJS views actually rendering (`collaboration/{index,channel,thread}.ejs`) — verified by code review and the live GET-only smoke test only.
- Pagination cursor correctness (`messageCursor.js`/`message-cursor.ts`) is exercised indirectly through the channel/thread view routes but has no dedicated unit test of its own encode/decode/filter logic.
- Real Resend delivery of the mention email is unverified beyond the existing test-double injection pattern (same posture as every prior cycle's email testing).
- Rate-limit behavior for message send/edit/channel-creation specifically is not tested in isolation (the underlying mechanism is exercised/proven elsewhere).

**Quality commands, all confirmed:**
- `npx tsc --noEmit` (root) — clean.
- `npm run lint` (root) — clean.
- `npm run build` (root, Turbopack) — succeeds; all new routes (`/api/portal/channels/[channelId]/{messages,read}`, `/api/portal/messages/[messageId]/{replies,edit,delete}`, `/portal/cases/[caseId]/messages*`) appear correctly classified as dynamic (ƒ). No new build-time issues (the Cycle 5 lazy-singleton lesson was checked for and not repeated — no eager `new X()` construction was introduced at module scope in any Cycle 6 file).
- `npm run db:indexes:dry-run` (root) and `node scripts/createIndexes.js --dry-run` (server) — both list every new index without connecting; collection names match exactly between the two scripts.
- `cd server && npm test` — 300/300.

**Manual smoke tests performed** (GET-only, no mutations, against the real running dev servers on the real `.env` target):
- `GET /portal/cases/507f.../messages` unauthenticated → `307` redirect to login.
- `GET /portal/cases/507f.../messages/507f...` unauthenticated → `307` redirect to login.
- `GET /admin/cases/507f.../collaboration` unauthenticated → `302` redirect to login.
- `GET /admin/channels/507f...` unauthenticated → `302` redirect to login.
- No channels, messages, or memberships were created against the real database — authenticated send/reply/edit/delete/read flows were verified instead via the 73 new database-backed integration tests across both apps (real routes, real Mongo, real rendered EJS/JSON output).

## Environment variables (Cycle 6)

No new environment variables this cycle. `RESEND_API_KEY`/`EMAIL_FROM`/`SITE_URL` (already load-bearing from prior cycles) are now also used for the new mention email.

## Deployment blockers carried forward (verified still open, not silently marked resolved)

1. `SITE_URL` must be set in production for CSRF `Origin` verification (Cycle 1) — **still open**.
2. Real Resend activation/reset delivery (Cycle 1) — **still unverified**; Cycle 6 adds one more Resend usage (mention email) on the same unverified footing.
3. Root index rollout has not been run against production (Cycle 1/2/3/5/6) — **still open**; Cycle 6 adds five more collections to the same deferred rollout.
4. Rate limiting remains process-local (Cycle 1) — **still open**.
5. `/portal/profile`, `/portal/security` (Cycle 1) — **still deferred**.
6. Client-facing case-created email (Cycle 2) — **still deferred**.
7. Non-transactional-fallback partial-provisioning recovery (Cycle 2) — **still open**; Cycle 6's channel provisioning has the identical exposure on a non-replica-set deployment (same mitigation: idempotent re-run, not atomicity).
8. Cases notification-failure fault-injection test (Cycle 2) — **still not written**.
9. Additional-client-on-a-case membership UI (Cycle 2) — **still not built**.
10. No dedicated admin UI button for `initialize-interaction` (Cycle 3) — **still open**.
11. No real malware scanner (Cycle 5) — **still open**, unaffected by this cycle (attachments reuse Cycle 5's existing scan-status handling as-is).
12. No production object-storage provider selected (Cycle 5) — **still open**, unaffected by this cycle.
13. DOCX/XLSX signature detection not fully tested (Cycle 5) — **still open**, unaffected by this cycle.
14. No admin UI button for historical document-category backfill (Cycle 5) — **still open**, unaffected by this cycle.

## New Cycle 6 open items

- **No dedicated admin UI button for `initialize-channels`** on the case detail page — the route exists, capability-gated, callable directly; not wired into `cases/detail.ejs`'s Channels card this cycle (same shape as the still-open Cycle 3/5 backfill-button gaps).
- **System-message coverage is intentionally partial** (4 of the module's ~12 listed example events) — documented in ADR-005 §18 as a deliberate scope reduction; extending it is real, scoped work for a future cycle, reusing the same `emitSystemMessage()`/`systemMessageService.js` entry point.
- **No admin-side HTTP-level route tests** for collaboration (see Testing, above) — service+policy layer is thoroughly covered; a future cycle could add `supertest`-driven route tests to close this specific gap.
- **Real Resend delivery of the mention email is unverified** beyond the test-double injection point (same posture as every prior cycle).
- **The "Client Queries" placeholder on the admin case detail page still says "not implemented yet"** even though Cycle 3 built it — a pre-existing gap from before this cycle, noticed but deliberately left untouched (out of Cycle 6's scope; only the "Channels" placeholder was this cycle's job to fix).

## Known limitations (Cycle 6)

- `all_members` and `clients_and_team` visibility are functionally identical this cycle (both apps' policy code treats them the same) — kept as distinct values per the module's own instruction, for a future workspace-member-type split that doesn't exist yet.
- No rich text/markdown formatting — plain text only, by deliberate design (ADR-005 §7/§8), not a missing feature.
- No `@everyone`/mass mentions (explicitly out of scope per the module doc).
- Message pinning was not implemented (module doc: "unless explicitly required" — no such requirement surfaced this cycle).
- The portal's message composer does not support inline attachment selection or edit-in-place UI this cycle — sending/replying/deleting are fully wired; editing is available via the API (`editMessage()`/`POST /api/portal/messages/:id/edit`) but has no dedicated UI form yet, matching the same "API complete, UI intentionally minimal for a first release" pattern as other recent cycles' composer components.

## Recommended next module

`07_NOTIFICATIONS_AND_REALTIME.md` — read alongside `00_MASTER_ROADMAP.md` and this status file first, per the plan's own handoff procedure. Every message this cycle is already durable in MongoDB before any notification fires (ADR-005 §22), so a future Socket.IO layer can emit purely from what's already persisted, re-deriving room authorization from the same `collaborationPolicy.js`/`collaboration-policy.ts` checks this cycle's HTTP routes already use — no redesign of the access model should be needed, only a transport layer on top of it.

---

# Cycle 7 — Notifications and Preferences (Real-Time Deferred)

Module implemented: `07_NOTIFICATIONS_AND_REALTIME.md` (durable-notification half only — see Real-time section below for why Socket.IO is explicitly out of scope this cycle, matching the module's own handoff sequencing).

## Pre-cycle anomaly finding — an external commit landed between Cycle 6 and Cycle 7

Before writing any Cycle 7 code, the routine git-anomaly check found something genuinely new (not a repeat of a previously-known item): commit `301ac03` — authored by the repo's own git user (`ashderkarim123`), **not** by me — sits directly on top of Cycle 6's ending commit (`e065725`), with clean linear ancestry (`git merge-base --is-ancestor e065725 HEAD` confirms it). It touches exactly the three files that had been carried across Cycles 5/6 as "pre-existing, uncommitted, never-stage" anomalies:

- `src/components/seo/json-ld.tsx` — the "Not a law firm." sentence removal I flagged in the Cycle 6 report.
- `server/public/css/admin.css` — the two color-value edits.
- `docs/architecture/ADR-003-consultation-interactions.md` — a header-formatting correction.

This resolves the open flag from the Cycle 6 report: the repo owner reviewed it and committed the change themselves, through their own tooling (the commit message is three unrelated one-liners concatenated with no separating blank lines — consistent with a multi-file IDE commit, not a CLI `git commit -m`). Since it's now real, intentional, committed history — not a stray working-tree modification — there is nothing left to "protect" going forward: this cycle's commits needed no anomaly-file exclusions at all (confirmed: `git status` at the start of Cycle 7 showed a clean tree aside from this one already-landed commit). Recorded here rather than silently dropped, since the Current/Target split in `.claude/CLAUDE.md`'s business-positioning rule (`site.disclaimer` must never be softened) is still worth the repo owner's own awareness — `disambiguatingDescription`/`site.disclaimer` itself is untouched, only the separate `description` field's trailing sentence was removed, so the disclaimer still ships in the JSON-LD.

## Architecture decision: ADR-006

`docs/architecture/ADR-006-notifications-and-preferences.md`. Summary:

1. **Migrate in place, don't replace.** `recipientId`/`recipientName` (the pre-Cycle-7 display-name targeting the admin bell's hot query already depends on) stay exactly as they were; `recipientType`/`recipientAdmin`/`recipientClient` are added alongside. Every notification created from this cycle forward populates both; rows from before this cycle simply have no identity fields, which every new query treats as "not addressable by identity," never as an error.
2. **`type`, not `eventType`** — the module doc's suggested field name is a purely cosmetic rename with zero behavioral gain over the existing, already-indexed, 20-value-strong `type` field; kept as-is, documented as a deliberate deviation.
3. **No `relatedWorkspace` field** — every `CaseWorkspace` is 1:1 with its case (unique index since Cycle 2), so `relatedCase` already resolves the workspace in one lookup everywhere it's needed.
4. **`dedupeKey`** — a real, unique, sparse-indexed mechanism, applied only where a genuine double-fire is realistic (the digest job's per-recipient-per-day guard was reconsidered mid-implementation — see decision 9 below — and the overdue-reminder job's per-request-per-day guard).
5. **`emailState`** tracks what happened to a notification's email side-effect (observability, not a gate) — `not_applicable | pending | sent | skipped_no_key | skipped_preference | failed`.
6. **Nine new client-facing notification types**, every one paralleling an email that already existed from an earlier cycle (Cycles 2/3/5/6) — this is "give the client an in-app view of something we already tell them by email," not new business logic. Full trigger table in the ADR. Two existing message types (`message_mention`, `message_reply`) gained a client-eligible recipient path rather than new enum values — closing a real Cycle 6 gap where a client whose message got replied to was notified of nothing at all.
7. **Email policy unchanged for the four "immediate" tiers** (invitations, schedule changes, replacement requests) — those adapters are untouched. The only new preference surface is `mentionEmails` and `digestEmails`; reply-to-your-message gets no email either direction, matching "do not send an email for every message by default."
8. **`NotificationPreference` is minimal** — three fields (`mentionEmails`, `digestEmails`, `digestFrequency`), not a full per-event-type matrix, since only two things are ever conditionally sent by policy. Lazily created on first read.
9. **Digest and overdue-reminder — two independent passes in one dry-run-by-default script**, `server/scripts/sendNotificationDigests.js`. Mid-implementation, the ADR's first draft ("stamp the same dedupeKey on every covered notification") turned out to violate the dedupeKey's own unique index (many sibling documents can't share one unique value) — corrected to use each notification's own `emailState` transition (`not_applicable` → `sent`) as the digest pass's real idempotency mechanism, reserving `dedupeKey` for the overdue-reminder pass's genuine one-notification-per-request-per-day case. No OS-level scheduler is installed or assumed.
10. **Portal notification bell/list is new UI**, not a global nav addition — the portal has no shared shell/layout the way the admin's EJS layout gives every page a topbar bell for free (confirmed by inspection: no `layout.tsx`, no shared header component exists under `src/app/portal/` today). Scoped instead to a dedicated `/portal/notifications` page plus an unread-count link on the dashboard (`/portal`) — the "same shape as admin" framing in the ADR's original draft was corrected to reflect this real constraint rather than overclaim; a persistent nav bell is real work for whenever Cycle 9 (Client Portal Experience) builds an actual portal shell.
11. **Real-time architecture is documented, not built** — Socket.IO rooms/auth/adapter/reconnect strategy recorded in the ADR as Target, matching `00_MASTER_ROADMAP.md`'s own phase split (Phase 7 = durable notifications; Release 5 = real-time, after "full security and deployment review"). The current single-VPS/single-PM2-instance topology (`DEPLOYMENT.md` Part 1) has not had that review — building sockets now would repeat exactly the premature-scope mistake Cycle 6 avoided for chat.

## Product/policy decisions made without stopping for confirmation

- **A genuine symmetric gap found and closed while implementing, not initially planned:** `src/lib/collaboration/message-service.ts` (client-authored messages) only ever notified an *employee* mentioned or replied to — a client mentioning or replying to a *different* client (a real, if rare, multi-client-workspace case) notified nobody. Closed via the new shared `src/lib/notifications/notification-service.ts` (`notifyOtherClient`), reusing the exact same active-workspace-membership guard as every other client notification this cycle.
- **A second genuine gap found and closed:** the portal's own client-initiated interaction actions (`addClientFollowUp`, `confirmClientResolution` in `src/lib/auth/interactions.ts`) never notified the assigned employee at all — the server-side equivalents (`interactionService.js`) already did this from Cycle 3, but the Cycle 3 dual-writer build never added the TS-side counterpart since `Notification` didn't exist in this app until Cycle 6. Closed by wiring the same `notifyEmployee` call into both root functions.
- **`document_request_overdue`'s first real caller.** The enum value existed since Cycle 5 but nothing ever created one. The overdue-reminder pass of `sendNotificationDigests.js` is its first real trigger.
- **The env-credential fallback admin (`admin`/break-glass login) cannot send channel messages** (established Cycle 6 rule: `WorkspaceMessage` requires a real `senderAdmin`) — this was re-confirmed, not re-litigated, while building the admin notification-preferences page, which is gated the same way (`req.session.adminUser?.id` must be a real AdminUser id) for the identical reason: preferences need a stable identity to key off of, and the fallback login has none.

## Files created (Cycle 7)

**Docs:**
- `docs/architecture/ADR-006-notifications-and-preferences.md`
- `docs/architecture/notification-schema-contract.json`

**Server:**
- `server/models/admin/NotificationPreference.js`
- `server/services/notificationService.js`
- `server/services/notificationDigestEmail.js`
- `server/scripts/sendNotificationDigests.js`
- `server/views/admin/notifications/preferences.ejs`
- `server/test/{notification-schema-contract,notification-models,notification-service}.test.js`
- `server/test/integration/notification-triggers.integration.test.js`

**Root:**
- `src/lib/models/NotificationPreference.ts`
- `src/lib/notifications/notification-service.ts`
- `src/app/api/portal/notifications/[id]/read/route.ts`
- `src/app/api/portal/notifications/read-all/route.ts`
- `src/app/api/portal/notifications/preferences/route.ts`
- `src/app/portal/notifications/page.tsx`
- `src/app/portal/notifications/preferences/page.tsx`
- `src/components/portal/notification-actions.tsx`
- `src/components/portal/notification-preferences-form.tsx`
- `test/notification-schema-contract.test.ts`
- `test/notification-service.integration.test.ts`
- `test/notification-routes.integration.test.ts`

## Files modified (Cycle 7)

- `server/models/admin/Notification.js` / `src/lib/models/Notification.ts` — identity fields, `emailState`, `dedupeKey`, new indexes, 9 new client-facing types.
- `server/utils/notify.js` — thin backward-compatible wrapper over `notificationService.notifyEmployee`; `notifyMany` now accepts `{ name, adminId }` pairs alongside plain strings.
- `server/routes/admin/leadOps.js` — all `notify()`/`notifyMany()` call sites (task assignment, lead assignment, package delivery) now pass a real `recipientAdminId`; new `/admin/notifications/preferences` GET+POST routes.
- `server/routes/admin/index.js` — the lead-status-change `notifyMany()` call site now resolves and passes real admin ids (select projection extended to include `owner`).
- `server/views/admin/notifications/index.ejs` — added a "Preferences" link.
- `server/services/{caseManagement,caseConversion,documentUploadService}.js` — existing `notify()` calls now pass `recipientAdminId`.
- `server/services/interactionService.js` — 3 existing employee `notify()` calls gained `recipientAdminId`; 4 new client in-app notification hooks added alongside the pre-existing client emails (`scheduleInteraction`, `answerInteraction`, `requestClarification`, `cancelInteraction`).
- `server/services/documentRequestService.js` — 3 new client in-app notification hooks alongside the pre-existing emails (create/due-date-change/cancel).
- `server/services/documentReviewService.js` — 2 new client in-app notification hooks alongside the pre-existing emails (accepted/needs-replacement-or-rejected).
- `server/services/messageService.js` — mention/reply notify calls gained `recipientAdminId`; client-mentioned and reply-to-client-message now create a real in-app `Notification` row (previously email-only or nothing at all).
- `src/lib/collaboration/message-service.ts` — refactored to use the shared `notification-service.ts` instead of an inline duplicate; added the client-mentions-client and client-replies-to-client paths.
- `src/lib/auth/interactions.ts` — `addClientFollowUp`/`confirmClientResolution` now notify the assigned employee.
- `src/app/portal/page.tsx` — unread-notification-count link added next to the logout button.
- `scripts/createIndexes.ts` / `server/scripts/createIndexes.js` — registered `NotificationPreference` (both apps) and `Notification`'s new indexes (root — server already had `Notification` registered).
- `server/package.json` — added `notifications:send-digests[:apply]` scripts.

## Models and fields (Cycle 7)

**`Notification`** (`notifications`, pre-existing collection) — new fields: `recipientType` (`employee`/`client`), `recipientAdmin`, `recipientClient`, `readAt`, `emailState`, `dedupeKey`. `recipientId`/`recipientName`/`read` unchanged. 9 new `type` enum values (see ADR-006 §6 table).

**`NotificationPreference`** (`notification_preferences`, new): `recipientType`, `recipientAdmin`/`recipientClient` (exactly one set, enforced by a pre-validate hook mirroring `WorkspaceMessage`'s sender-identity pattern), `mentionEmails` (default `true`), `digestEmails` (default `true`), `digestFrequency` (`daily`/`weekly`/`off`, default `daily`).

## Indexes (Cycle 7)

| Model | Indexes |
|---|---|
| `Notification` | `recipientName+read+createdAt` (unchanged, still the admin bell's hot path); `recipientType+recipientAdmin+read+createdAt` (new); `recipientType+recipientClient+read+createdAt` (new); `dedupeKey` (unique, sparse — new) |
| `NotificationPreference` | `recipientAdmin` (unique, sparse); `recipientClient` (unique, sparse) |

Verified via both apps' `--dry-run` index scripts — collection names (`notifications`, `notification_preferences`) and index counts match exactly between the two independent declarations.

## Client-facing notification events (Cycle 7)

9 new types, each with a real, pre-existing email trigger point (full table in ADR-006 §6): `query_scheduled`, `query_answered`, `query_clarification_requested`, `query_cancelled`, `document_requested`, `document_request_updated`, `document_request_cancelled`, `document_accepted`, `document_replacement_requested`. Plus 2 existing types (`message_mention`, `message_reply`) gaining a client-eligible recipient path. Every client notification that's case-scoped is guarded by `notifyClient({ requireActiveWorkspace })` — a client removed from a case's workspace receives no further notifications about it, verified by dedicated tests in both apps.

## Email policy (Cycle 7)

Unchanged for the four "immediate" tiers (invitations, schedule changes, replacement requests — untouched adapters from Cycles 2/3/5). New preference-gated tiers: mention emails (`mentionEmails`, both directions, pre-existing Cycle 6 behavior now preference-gated for the first time) and the digest (`digestEmails`/`digestFrequency`). Reply-to-your-message is in-app only, no email, either direction — a deliberate policy choice (ADR-006 §7), not a gap.

## Digest and overdue-reminder script (Cycle 7)

`server/scripts/sendNotificationDigests.js` — dry-run by default (`--apply` to actually send/write), two independent passes (`--digest-only`/`--overdue-only` to run just one):

- **Digest**: batches every unread, not-yet-emailed notification per recipient (employee or client) with `digestEmails !== false`, sends one summary email, flips those specific notifications' `emailState` to `sent`. Only notifications older than 1 hour are eligible, avoiding double-covering something an immediate-tier email just sent.
- **Overdue reminder**: every open `DocumentRequest` past its `dueDate` gets exactly one `document_request_overdue` notification + email per calendar day, guarded by a real, unique `dedupeKey`. First real trigger for an enum value that existed since Cycle 5.

No scheduler is installed or assumed — wiring this to cron/PM2 is a deployment decision (see Deployment blockers, below).

## Capability/access notes (Cycle 7)

No new admin capabilities were needed — `/admin/notifications/preferences` reuses the existing "must be a real, logged-in DB AdminUser" gate (the env-fallback admin is excluded, same posture as every identity-scoped feature since Cycle 3). Portal notification routes reuse the existing `getSessionActor`/`ClientUser` active-status check every other `/api/portal/*` route already applies — no new authorization primitive was introduced.

## Testing (Cycle 7)

**Results (confirmed, full suite run at the final commit):**
- Server: **333/333 passing** (Cycle 7 added 33: 5 schema-contract, 9 models, 9 service, 10 integration; plus the existing 300 from Cycles 1–6).
- Root: **137/137 passing** (Cycle 7 added 15: 4 schema-contract, 5 service, 6 routes; plus the existing 122 from Cycles 1–6).

**Explicitly not covered** (honest gaps):
- No automated test for the digest/overdue-reminder script itself (`sendNotificationDigests.js`) — verified by code review and the same dry-run-by-default posture as every other provisioning script this project has shipped, but not exercised by `node --test`. A real gap; the underlying `notifyClient`/dedupeKey/`emailState`-transition mechanisms it relies on are each independently tested.
- No test for the admin `/admin/notifications/preferences` route as a real HTTP request (server-side collaboration/notification routes generally lack this — see Cycle 6's identical honest gap).
- No test for the portal notification pages rendering (`/portal/notifications`, `/portal/notifications/preferences`) as real page requests — the underlying `listForClient`/`getOrCreatePreferences` functions they call are tested directly instead.
- Real Resend delivery of the new digest/overdue-reminder emails is unverified beyond the test-double injection pattern (same posture as every prior cycle's email testing).

**Quality commands, all confirmed:**
- `npx tsc --noEmit` (root) — clean.
- `npm run lint` (root) — clean.
- `npm run build` (root, Turbopack) — succeeds; all new routes (`/api/portal/notifications/*`, `/portal/notifications*`) correctly classified as dynamic (ƒ).
- `npm run db:indexes:dry-run` (root) and `node scripts/createIndexes.js --dry-run` (server) — both list every new index without connecting; collection names match exactly between the two scripts.
- `cd server && npm test` — 333/333.

## Environment variables (Cycle 7)

No new environment variables. `RESEND_API_KEY`/`EMAIL_FROM`/`SITE_URL` (already load-bearing) are now also used by `notificationDigestEmail.js`.

## Deployment blockers carried forward (verified still open, not silently marked resolved)

Every item from the Cycle 6 list remains open and unaffected by this cycle's work, plus:

15. **No scheduler wired for `sendNotificationDigests.js`** — the script is real, tested indirectly (its underlying service functions are directly tested), dry-run-by-default, and safe to run repeatedly (idempotent both passes) — but nothing invokes it automatically. Needs a cron entry or PM2 cron restart config as part of a future deployment cycle.
16. **Real-time delivery (Socket.IO) is entirely undone** — durable notifications exist, but there is no live push; the portal/admin only see new notifications on their next page load. Documented as Target in ADR-006 §11, matching the module's and master roadmap's own Phase 7 vs Release 5 split.

## New Cycle 7 open items

- **No global portal nav/bell** — see ADR-006 §10. `/portal/notifications` and the dashboard's unread-count link exist; a persistent bell visible from every portal page needs an actual portal shell, which doesn't exist yet (real work for Cycle 9, Client Portal Experience).
- **Client-authored mention-of-employee email remains one-directional** — `collaborationEmail.js` (server) sends a mention email for employee → client; the symmetric client → employee path only gets the new in-app notification, no email. A second Resend adapter living in the Next.js app for purely-internal recipients is real, separable work, deliberately deferred (ADR-006 §9).
- **`document_request_overdue`'s in-app notification only reaches the client**, not the case's project manager — the module doc's own event list doesn't specify a PM-facing overdue signal distinct from the client-facing one, and adding one wasn't a clearly-real gap the way the other 9 new types were (each paralleling a pre-existing email). Worth a product decision in a future cycle, not invented here.
- **`git log`/commit-hygiene note**: commit `301ac03` (see the Pre-cycle anomaly finding, above) has a malformed multi-message commit body (three one-liners concatenated with no blank-line separation) — cosmetic, not a data-integrity issue, but worth a heads-up for whoever authored it about `git commit -m` vs a real multi-line message the next time three unrelated fixes get committed together.

## Known limitations (Cycle 7)

- `NotificationPreference` is a 3-field model, not a full per-event-type matrix — by design (ADR-006 §8), since only two things are ever conditionally sent by policy.
- The digest's "older than 1 hour" cutoff is a fixed constant, not configurable — reasonable for a first release, would need to become a real setting if operational experience shows it's wrong.
- The portal notification list has no filtering/pagination UI (unlike the admin's type/lead/unread filter bar) — it lists the 50 most recent, matching the "API complete, UI intentionally minimal for a first release" pattern from Cycle 6's message composer.
- No notification ever gets deleted or archived — matches the project's "prefer archive over delete" business rule by construction (there's no delete path at all, not even an admin one), but also means the collection only grows; a future retention cycle (Phase 10 in the master roadmap) should address this deliberately rather than leaving it as an accident.

## Recommended next module (superseded — Cycle 8 shipped, see below)

`08_ADMIN_CASE_OPERATIONS.md` — read alongside `00_MASTER_ROADMAP.md` and this status file first. Every notification this cycle is keyed by real recipient identity and every client-facing trigger point already respects active workspace membership, so Cycle 8's case-queue/assignment/review workflows can call straight into `notificationService.js`/`notification-service.ts` without any further plumbing — the identity migration this cycle's title promised is actually finished, not just started.

---

# Cycle 8 — Admin Case Operations

Module implemented: `08_ADMIN_CASE_OPERATIONS.md`.

## Scope finding before implementing

An inspection pass found most of what module 08 describes had already shipped: case list/detail/convert/stage/assign/members/archive/activity in Cycle 3, query queues in Cycle 4, document queues in Cycle 5, collaboration in Cycle 6. Three real gaps remained, and those are exactly what this cycle built:

1. **Client management did not exist at all** — no `/admin/clients` surface, and neither `clients.view` nor `clients.manage` was a defined capability.
2. **The dashboard had no operational counts** — `/admin` still counted leads, blog posts, testimonials, and FAQs exactly as it did before Cycle 1.
3. **`client_updates.publish` was undefined**, with no way for staff to deliberately publish a client-visible case update.

Rebuilding the surfaces that already worked would have been churn. See ADR-007 for the full reasoning.

## Architecture decision: ADR-007

`docs/architecture/ADR-007-admin-case-operations.md`. Key decisions:

1. **Read-only server mirrors** for `PortalInvitation` and `ClientSession` (previously portal-only). The admin's write surface on them is narrow: revoke/re-issue an invitation, revoke sessions. It never mints a session, never reads a raw token, never sets a password.
2. **Invitation re-issue duplicates the root's token logic** rather than importing it (separate deployables) — same 32-byte base64url token, SHA-256 hash, 7-day TTL, revoke-then-issue. Mitigated by a new cross-app contract fixture asserted from *both* sides.
3. **Disabling a client revokes every live session immediately**, so "disable" means what an operator expects. Re-activation deliberately does not restore sessions.
4. **Eight operational queues in one aggregation module** — `Promise.all` of `countDocuments` calls, each on an index that already existed. No `$lookup`, no N+1.
5. **"Unread client messages" is counted per-workspace, not per-employee** — the dashboard answers "how many client messages has nobody picked up", which deliberately does not match any single employee's own unread view.
6. **Client-visible updates reuse the collaboration layer** — a `case_update` system message into the case's `case_updates` channel, so it lands in the client's existing message centre and is covered by Cycle 6's serializers and access tests.
7. **New capabilities granted conservatively** — `clients.view` to PM-tier, `clients.manage` to admin-tier only (disabling accounts is higher-consequence than case work), `client_updates.publish` to PM-tier.
8. **Client management is deliberately org-wide, not membership-scoped** — a client exists before any case and may have several. The record-level check lives where it belongs: the *cases* on a client's page are filtered by the same `cases.view_all`-or-membership rule the case list uses.
9. **Never name an EJS render local `client`** — see below.

## A real bug found while building (ADR-007 §9)

The client detail page returned a 500 from inside `layout.ejs` with `include is not a function`. Cause: Express passes `res.render()` locals straight through to the view engine as its *options* object, and EJS reads `options.client` as "compile to a standalone client-side function" (`ejs.js`: `options.client = opts.client || false`) — a mode in which the `include()` helper is not injected. A perfectly ordinary `res.render('...', { client: someDocument })` therefore breaks the shared layout, with a stack trace pointing nowhere near the cause.

`getClientOverview()` now returns the record as `clientUser`. The same trap exists for `filename`, `cache`, `compileDebug`, `delimiter`, `root`, `strict`, `rmWhitespace`, and `async` — none are used as locals anywhere in this app, and none should be.

## A stale placeholder corrected

`server/views/admin/cases/detail.ejs` still said "Consultation/query tracking is not implemented yet — planned for a later cycle" on its Client Queries card. Query tracking shipped in Cycle 4 (13 admin routes, `/admin/queries`). Flagged in the Cycle 6 report as out of scope then; in scope now, and replaced with a real link to the query queues.

## Files created (Cycle 8)

**Docs:** `docs/architecture/ADR-007-admin-case-operations.md`, `docs/architecture/client-account-contract.json`

**Server:** `models/PortalInvitation.js`, `models/ClientSession.js`, `utils/clientAccountConstants.js`, `services/clientAccountService.js`, `services/clientPortalEmail.js`, `services/operationsQueues.js`, `routes/admin/clients.js`, `views/admin/clients/{index,detail}.ejs`, `test/client-account-contract.test.js`, `test/integration/{client-operations,operations-queues}.integration.test.js`

**Root:** `test/client-account-contract.test.ts`

## Files modified (Cycle 8)

- `server/utils/permissions.js` — `clients.view`, `clients.manage`, `client_updates.publish`.
- `server/models/CaseActivity.js` — `client_update_published` type.
- `server/services/systemMessageService.js` — `emitClientUpdateMessage`.
- `server/routes/admin/cases.js` — `POST /admin/cases/:id/client-update`, plus flash and `canPublishUpdate` on the detail render.
- `server/routes/admin/index.js` — mounts `attachClients`, computes operational counts for the dashboard.
- `server/views/admin/dashboard.ejs` — Operations tile grid.
- `server/views/admin/cases/detail.ejs` — publish-update card, flash banner, corrected Client Queries placeholder.
- `server/views/admin/partials/sidebar.ejs` — Clients nav entry.
- `server/scripts/createIndexes.js` — registers the two new models.
- `src/lib/auth/invitations.ts` — exports `INVITATION_TTL_MS` so the contract test can assert cross-app agreement.

## Routes added (Cycle 8)

`GET /admin/clients`, `GET /admin/clients/:id`, `POST /admin/clients/:id/{resend-invitation,revoke-invitation,disable,reactivate}`, `POST /admin/cases/:id/client-update`.

## Operational queues (Cycle 8)

Cases without a PM · unanswered queries · queries awaiting scheduling · documents awaiting review · overdue document requests · unread client messages · filings within 30 days · stalled cases · quarantined files.

`STALLED_CASE_DAYS = 21` and `UPCOMING_DEADLINE_DAYS = 30` are named constants — the module doc defines neither, so these are deliberate first-pass heuristics that are one edit to tune.

## Testing (Cycle 8)

- Server: **368/368 passing** (Cycle 8 added 35: 7 contract, 17 client operations, 11 operations queues).
- Root: **142/142 passing** (Cycle 8 added 5 contract tests).
- `tsc --noEmit` clean · `npm run lint` clean · `npm run build` succeeds · both index dry-runs agree (`portalinvitations`, `clientsessions`, 3 indexes each).

Covered: capability enforcement per role, PM-can-view-but-not-manage, regex-injection in the client search box, password hashes and token hashes never reaching a rendered page, per-membership case visibility on the client page, invitation revoke-then-issue invariants, disable revoking sessions, reactivation not restoring them, every queue boundary condition, and publish-update authorization plus its no-channel failure path.

**Not covered (honest gaps):** no test that the *portal* accepts an admin-issued invitation end to end (the contract fixture asserts the mechanism matches on both sides, but no test drives an admin-issued token through `/portal/activate`); real Resend delivery of the re-issued activation email is unverified beyond the test double.

## Known limitations (Cycle 8)

- The client list is org-wide by design (ADR-007 §8); there is no "my clients" filter.
- Unread-client-message counting is per-workspace, not per-employee (ADR-007 §5) — deliberately not what any one employee sees.
- No bulk actions on the client list (disable/invite are per-client).
- "Stalled" keys off `updatedAt` on the case document, so a case whose only recent activity was a message or document — neither of which touches `ClientCase` — can read as stalled. Worth revisiting with a real last-activity timestamp if operators find it noisy.

## Recommended next module

`09_CLIENT_PORTAL_EXPERIENCE.md` — the two missing screens (`/portal/profile`, `/portal/security`) and, more importantly, the shared portal shell that would give the portal persistent navigation and a notification bell. Cycle 7 deferred the bell for exactly that reason (ADR-006 §10), and the security screen now has a natural counterpart in the admin's client security summary built this cycle.
