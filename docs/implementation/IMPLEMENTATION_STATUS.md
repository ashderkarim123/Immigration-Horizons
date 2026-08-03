# Implementation Status — Immigration Horizons Client Portal

**Last updated:** 2026-08-04
**Branch:** `main`
**Worktree at time of writing:** clean except this cycle's own changes (see "Commits" below); no unrelated user changes present.

> **Note on git history:** partway through this session, a commit
> (`a28ced0`, authored under the repo's configured git identity) appeared on
> `main` that this session did not create — likely a checkpoint from an
> interrupted prior process sharing this working directory (see the
> "background npm install" task that this session was separately notified
> had been stopped without a completion record). Its contents were verified
> by diff against this session's own in-progress files at the time: every
> difference is a legitimate later refinement (e.g. factoring
> `lookupSessionByToken()` out of `getSessionActor()`, relaxing
> `ClientUser.firstName/lastName` to optional) — not conflicting or foreign
> work, and no data was lost. It is treated as already-landed history; this
> cycle's remaining work is committed on top of it, not squashed or reset.

---

## Repository state

- Branch: `main`
- Commits so far in this cycle: `a28ced0` (see note above) plus this
  session's own commits (listed below).
- Nothing has been pushed. `origin/main` is unchanged.
- No production data was read, written, or migrated.

## Cycle completed: Cycle 1 — Architecture and Client Authentication

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
- [x] Submitters are redirected safely — consultation submission now calls `redirect()` to `/portal/check-email` or `/portal/login?next=...` (see "Product decision" below).
- [x] No automatic login from form submission — confirmed: submission only creates/reuses an invitation or links an existing account; a session is only created on explicit activation or login.
- [x] New clients can activate and set a password — `POST /api/portal/activate`.
- [x] Existing clients can log in — `POST /api/portal/login`.
- [x] Own-consultation access is enforced server-side — `requireClient()` + `Consultation.findOne({ _id, clientUser })`, covered by an integration test asserting a second client's query for the same id returns `null`.
- [x] Integration tests pass against an isolated database — 29/29, see "Testing" below.

### Product decision made mid-cycle (user confirmed)

The plan's literal spec calls for a hard redirect after consultation
submission to `/portal/check-email` or `/portal/login?next=...`, which
replaces the existing inline "Request received" success panel (with its
WhatsApp fallback CTA) on the consultation page. This is a real UX/
conversion tradeoff on the site's primary lead-capture page, so it was
raised explicitly rather than decided unilaterally — the user chose to
follow the plan's redirect behavior as specified.

---

## Architecture decisions

See `docs/architecture/ADR-001-client-portal-foundation.md` for the full
record. Summary:

1. Portal hosted entirely in Next.js under `/portal/*` and `/api/portal/*`; Express admin untouched.
2. State-changing portal operations are Route Handlers (`Request` → `Response`), not Server Actions — directly testable without a running server.
3. Sessions are DB-backed (`ClientSession`), not `express-session` — Next.js has no built-in equivalent. HttpOnly/SameSite=Lax/Secure-in-prod cookie holding an opaque token; only its SHA-256 hash is stored.
4. CSRF: `Origin` header verification on every mutating route, layered on top of `SameSite=Lax`.
5. Uniform `{ error: { code, message } }` response shape; generic auth-failure messages (no account enumeration).
6. `ClientActor`/`EmployeeActor`/`SystemActor` discriminated union typed now; only `ClientActor` is populated by real code this cycle.
7. `getDb()` unchanged as the single connection point, shared with `server/`.
8. Tests run via `node --conditions=react-server --import tsx --test "test/**/*.test.ts"` — see "Testing" below for why both flags are load-bearing, not incidental.

---

## Files created

**Docs**
- `docs/architecture/ADR-001-client-portal-foundation.md`
- `docs/implementation/IMPLEMENTATION_STATUS.md` (this file)

**Models**
- `src/lib/models/ClientUser.ts`
- `src/lib/models/PortalInvitation.ts`
- `src/lib/models/PasswordResetToken.ts`
- `src/lib/models/ClientSession.ts`

**Auth library**
- `src/lib/auth/actors.ts`
- `src/lib/auth/crypto.ts`
- `src/lib/auth/session.ts`
- `src/lib/auth/csrf.ts`
- `src/lib/auth/http.ts`
- `src/lib/auth/validation.ts`
- `src/lib/auth/email.ts`
- `src/lib/auth/invitations.ts`
- `src/lib/auth/current-client.ts`
- `src/lib/auth/portal-fetch.ts` (client-safe fetch wrapper)
- `src/lib/content/portal.ts` (client-facing status labels — copy-as-data convention)

**API routes**
- `src/app/api/portal/activate/route.ts`
- `src/app/api/portal/login/route.ts`
- `src/app/api/portal/logout/route.ts`
- `src/app/api/portal/forgot-password/route.ts`
- `src/app/api/portal/reset-password/route.ts`

**Pages**
- `src/app/portal/page.tsx` (dashboard)
- `src/app/portal/login/page.tsx`
- `src/app/portal/activate/page.tsx`
- `src/app/portal/forgot-password/page.tsx`
- `src/app/portal/reset-password/page.tsx`
- `src/app/portal/check-email/page.tsx`
- `src/app/portal/consultations/page.tsx`
- `src/app/portal/consultations/[id]/page.tsx`

**Components**
- `src/components/portal/login-form.tsx`
- `src/components/portal/activate-form.tsx`
- `src/components/portal/forgot-password-form.tsx`
- `src/components/portal/reset-password-form.tsx`
- `src/components/portal/logout-button.tsx`

**Scripts**
- `scripts/createIndexes.ts`

**Tests**
- `test/helpers/testDb.ts`
- `test/helpers/http.ts`
- `test/portal-invitations.integration.test.ts` (9 tests)
- `test/portal-auth.integration.test.ts` (20 tests)

## Files modified

- `src/lib/models/Consultation.ts` — added optional `clientUser` ref + index.
- `src/lib/db.ts` — added `autoIndex` production gate, matching `server/config/db.js`'s existing pattern.
- `src/lib/leads.ts` — `deliverLead()` now returns `{ delivered, consultationId }` instead of a bare boolean, so the consultation flow can pass the new document's id to the invitation step.
- `src/app/consultation/actions.ts` — after a successful submission, calls `linkOrInviteAfterConsultation()` and redirects to `/portal/check-email` or `/portal/login?next=...`.
- `src/app/contact/actions.ts` — updated for `deliverLead()`'s new return shape (contact flow itself is otherwise unchanged — it never triggers portal onboarding).
- `src/lib/rate-limit.ts` — `isRateLimited()` accepts an optional `Request` so Route Handlers (and their tests) don't depend on `next/headers`'s request-scoped storage.
- `package.json` — added `server-only` (real dependency, previously implicit via Next's internal alias), and devDependencies `tsx`, `dotenv`, `mongodb-memory-server`; added `test`, `db:indexes`, `db:indexes:dry-run` scripts.

---

## Models and indexes

| Model | Collection | Indexes |
|---|---|---|
| `ClientUser` | `clientusers` | `normalizedEmail` (unique), `status`, `lastLoginAt` |
| `PortalInvitation` | `portalinvitations` | `tokenHash` (unique), `expiresAt` (TTL, 7d post-expiry), `normalizedEmail+purpose+usedAt` |
| `PasswordResetToken` | `passwordresettokens` | `tokenHash` (unique), `expiresAt` (TTL, 1d post-expiry), `clientUser+usedAt` |
| `ClientSession` | `clientsessions` | `tokenHash` (unique), `clientUser`, `expiresAt` (TTL, 1d post-expiry) |
| `Consultation` (existing) | `consultations` | + `clientUser+createdAt` (new, additive) |

All additive — no existing field was removed, renamed, or had its type changed. `Consultation.clientUser` is optional/nullable, so the legacy site and `server/`, which don't know about the field, are unaffected.

Verified via `npm run db:indexes:dry-run` (lists all declared indexes without connecting) — confirmed working against this repo's real `.env` (dry-run makes no connection, so nothing was touched).

---

## Routes added

**Pages:** `/portal`, `/portal/login`, `/portal/activate`, `/portal/forgot-password`, `/portal/reset-password`, `/portal/check-email`, `/portal/consultations`, `/portal/consultations/[id]`.

**API:** `POST /api/portal/activate`, `POST /api/portal/login`, `POST /api/portal/logout`, `POST /api/portal/forgot-password`, `POST /api/portal/reset-password`.

**Deferred, not built this cycle:** `/portal/profile`, `/portal/security` — mentioned as "likely routes" in the master prompt's own section 11.6 but absent from module 02's actual "Required routes" list, which is the authoritative acceptance bar for this cycle. Building them now would be scope creep ahead of an explicit requirement.

---

## Authorization behavior

- Every `/api/portal/*` mutating route: `verifyOrigin()` (CSRF) → rate limit → input validation → business logic. Fails closed at each step.
- `requireClient()` (Server Component guard): no session → redirect to login; session valid but client not `active` → redirect to login. Never renders a page with a null client.
- Consultation detail page: query is `Consultation.findOne({ _id, clientUser: <current client's id> })` — a consultation belonging to another client is indistinguishable from a nonexistent one (`notFound()` either way). Same treatment for a syntactically invalid id.
- Login/reset messages are identical regardless of whether the account exists, is locked, disabled, or the password was simply wrong — verified by a test asserting byte-identical error messages for "wrong password" vs. "unknown email".

---

## Testing

**Command:** `npm test` → `node --conditions=react-server --import tsx --test "test/**/*.test.ts"`

Two flags are load-bearing, not incidental:
- `--import tsx`: relative imports throughout this codebase omit file extensions (Next's bundler convention); plain Node's ESM resolver needs `tsx` for that.
- `--conditions=react-server`: every model/lib file imports `"server-only"`, whose package uses a conditional export (`react-server` → no-op, `default` → throws). Next sets this condition internally for server bundles; passing it explicitly makes the same modules resolve correctly under plain Node.

**Results:** 29/29 passing (`test/portal-invitations.integration.test.ts`: 9, `test/portal-auth.integration.test.ts`: 20). Isolated `mongodb-memory-server` database per run; never reads the real `MONGODB_URI`.

**Covered:** invitation issuance/reuse/revoke-and-replace, existing-client linking (incl. never relinking an already-linked consultation, email normalization), activation (success, password mismatch, too-short password, expired/revoked/used/unknown token, CSRF), login (success, wrong-password vs. unknown-email identical error, disabled account, pending account, lockout after 5 failures + still-locked-with-correct-password, CSRF, rate limiting), logout (session invalidated), forgot-password (identical response regardless of account existence, exactly one token issued), reset-password (success + full session invalidation + old password rejected + new password accepted, expired token, reused token), cross-client consultation access denial, invalid-ObjectId handling.

**Not covered this cycle (regression only, unaffected by this change):** `server/` admin test suite — re-run as a regression check, 77/77 passing, unchanged.

**Quality commands run:**
- `npx tsc --noEmit` — clean.
- `npm run lint` — clean.
- `npm run build` (Next.js/Turbopack) — succeeds; all portal routes appear in the route manifest with the expected static/dynamic classification.
- `cd server && npm test` — 77/77 passing (regression, unmodified).
- Manual smoke test: built app started on a spare port, `/portal/login` → 200, `/portal` unauthenticated → 307 to `/portal/login?next=%2Fportal` → 200, `/consultation` → 200, `/portal/check-email` → 200. Mutating endpoints were **not** exercised against this instance since it was pointed at the repo's real `.env` `MONGODB_URI` (an Atlas cluster) — verified only via the isolated integration test suite instead, to avoid writing test data to a real database.

---

## Environment variables introduced

None are new/required beyond what already existed. `MONGODB_URI` (already load-bearing for leads) is now additionally load-bearing for the portal — without it, `getDb()` returns `null` and every portal auth route responds `503`-equivalent (`server_error`) rather than silently succeeding. `SITE_URL` (already referenced elsewhere) is now also read by `verifyOrigin()` for CSRF checks; without it, the check falls back to `http://localhost:${PORT || 3000}`, which is wrong for a real deployment — **this should be set in production** or every portal mutation will 403. Flagged as a deployment blocker below.

## Deployment blockers / open items

- **`SITE_URL` must be set in production** for CSRF `Origin` verification to accept real requests (see above).
- **Email sending is unverified in this session** — `RESEND_API_KEY` presence/correctness for activation/reset emails was not exercised beyond confirming the code path logs a warning and degrades gracefully when absent (matching the existing lead-email behavior).
- Index rollout (`npm run db:indexes`) has not been run against the real database — by design (this is a deliberate, observed, separate step; see `docs/architecture/ADR-001...`). Run it during a low-traffic window, after a backup, following the same procedure as `server/README.md`'s existing "Database indexes" section.

## Security notes

- Timing-safe-ish login: a nonexistent-email login attempt still pays a real bcrypt comparison cost (against a precomputed dummy hash) so response latency doesn't distinguish "no such account" from "wrong password".
- Account lockout: 5 failed attempts → 15-minute lock; a correct password during the lock window is still rejected (tested).
- Password reset invalidates **every** existing session for the account, not just the current one.
- No CSRF token library was added — `Origin` verification + `SameSite=Lax` was judged sufficient and dependency-free for this cycle; revisit if the deployment ever needs to support a cross-origin embed of the portal (not currently planned).
- Known, deliberately out-of-scope for this cycle: rate limiting is in-memory/per-process (existing limitation shared with the rest of the app, documented in `src/lib/rate-limit.ts`) — fine for the current single-instance deployment, would need a shared store (Redis) if scaled horizontally.

## Known limitations

- `/portal/profile` and `/portal/security` pages are not built (see "Routes added" above).
- No automated end-to-end (browser) test — verified via integration tests (real Route Handler + real isolated DB) and a manual production-build smoke test instead, per this repo's existing testing posture (`TESTING.md`: manual QA, no E2E suite yet).
- `ClientUser.firstName`/`lastName` are best-effort (split from the consultation form's single "name" field) and not guaranteed accurate for all name formats — documented in the model file itself.

## Recommended next cycle

**Cycle 2 — Client Cases and Workspaces.** Next file to read:
`.claude/immigration_horizons_implementation_plan/immigration_horizons_implementation_plan/03_CLIENT_CASES_AND_WORKSPACES.md`, plus re-reading `00_MASTER_ROADMAP.md` and this status file first, per the plan's own handoff procedure (`15_IMPLEMENTATION_SEQUENCE_AND_CLAUDE_HANDOFF.md`).
