# Phase 02 Verification Audit

**Date:** 2026-09-06  
**Branch reviewed:** `architecture/angular-enterprise-platform`  
**Implementation HEAD reviewed:** `5e9ec0c0cb2ff5b13d235071a7bd223e63b9b2b1`  
**Phase 02 prompt baseline:** `22adcc4a954691132c4c77758302dbeeb31c2013`

## Verdict

Phase 02 delivered a substantial working-core implementation, but it is **NOT ACCEPTED as complete yet**. The implementation has several security/contract defects and the latest CI run is red. Phase 03 must begin with a mandatory Phase 02 closure gate before new case mutations are added.

The useful Phase 02 work should be preserved and corrected rather than rewritten.

## What was implemented successfully

- Express `/api/v1` router mounted before the legacy EJS CSRF middleware, preserving a separate JSON API security boundary.
- Request IDs and centralized JSON API errors.
- Express mirror for the existing `EmployeeSession` collection.
- Staff session middleware that re-reads the live `AdminUser`, checks absolute/idle expiry, revokes sessions for inactive users, and refreshes idle expiry.
- Staff API endpoints for session, current employee, dashboard, cases, clients, tasks, and initial password change.
- `AdminUser` additive credential-lifecycle fields mirrored in Express and Next.js models.
- Angular HttpClient/API infrastructure, credential interceptor, session bootstrap, route guards, sign-in, initial-password setup, dashboard, case/client/task routes.
- Immigration Horizons brand assets copied into the Angular case-management app and navy/gold direction introduced.
- Server-side case-policy support extended so Express API calls can resolve `req.staff`.
- OpenAPI file started for implemented endpoints.
- Root Next.js, Express admin tests, and root lint/type/build jobs still passed on the Phase 02 implementation commit.

## Blocking findings

### P0 — CI is red

GitHub Actions run `34008905036` for implementation HEAD `5e9ec0c...` failed.

The failing job is **Enterprise UI (Angular)** at `npm ci`.

Cause:

- Angular resolves `@angular/common` 22.1.x.
- `lucide-angular@1.0.0` declares peer support only through Angular 21.
- npm exits with `ERESOLVE`.

Do not fix this with `--legacy-peer-deps` or `--force`. Use a genuinely Angular-22-compatible Lucide integration/package if available, or a small reviewed icon abstraction that does not violate peer requirements.

Phase 02 cannot be accepted while CI is red.

### P0 — client detail API can expose credential/security fields

`server/routes/api/v1/staff/clients.js` loads a full `ClientUser` with `.lean()` and returns:

```js
{
  ...client,
  cases
}
```

The `ClientUser` model includes `passwordHash`, lockout state, normalized email, terms/password timestamps, and other backend-owned fields.

No raw Mongoose/lean document may be returned from a staff API DTO. `passwordHash` must never cross the API boundary.

Replace this with an explicit serializer/projection and add a negative contract test that fails if credential fields appear.

### P0 — PM client detail can leak cases outside row-level authorization

`GET /api/v1/staff/clients/:id` currently loads all `ClientCase` records where `primaryClient = clientId`.

`clients.view` is available to PMs, but PMs do not hold `cases.view_all`. A PM must not learn case numbers/titles/identifiers for cases where they lack active workspace membership.

Reuse the existing employee-client/case visibility policy and intersect client case panels with the actor's authorized case IDs.

### P0 — staff API account lockout counters are not persisted

`server/utils/lockout.js` exposes pure patch builders:

- `failedLoginUpdate(account)` returns `{ patch, justLocked }`;
- `successfulLoginUpdate()` returns a patch object.

The new staff login route currently does:

```js
await failedLoginUpdate(user)
await successfulLoginUpdate(user)
```

Those calls do not mutate/save anything. As a result, the new API login path does not increment/clear lockout counters or update `lastLoginAt` as intended.

Apply the returned patches with `AdminUser.updateOne({ _id }, { $set: patch })`, preserving the existing reason for avoiding `user.save()` on login.

### P0 — staff API security events are silently rejected

The new routes record `surface: 'staff_api'`, but `SecurityEvent` allows the surface value `staff`, not `staff_api`.

The successful login also records `type: 'login'`, while the contract requires `login_succeeded`.

`recordSecurityEvent()` deliberately swallows validation failures, so these mistakes make the API appear to work while audit entries silently fail and only stderr records the validation error.

Use the existing security-event contract exactly. Add cross-runtime/contract tests for every event emitted by the API.

### P0 — first-login password requirement is only enforced by Angular navigation

`requirePasswordSetupComplete` exists in the Express API middleware but the dashboard/case/client/task read routes do not apply it.

An employee with a temporary password can therefore obtain a staff session and call normal API endpoints directly before changing the password.

Server-side enforcement is mandatory. A `mustChangePassword` account should be limited to the minimum endpoints needed for `/me`, logout, and initial password change until setup completes.

### P1 — employee provisioning flow is incomplete

ADR-016 requires administrator-provisioned employee accounts with a strong temporary password, `mustChangePassword=true`, one-time credential display, and reset/revocation lifecycle.

The existing `/admin/users` creation path was not changed in the Phase 02 implementation. It still accepts a password typed by the administrator and creates `AdminUser` directly. Therefore newly created accounts do not automatically enter the intended first-login lifecycle.

Phase 03 must complete the admin provisioning/reset flow before relying on the new employee login architecture in production.

### P1 — login responses disclose account state

The staff login API gives distinct anonymous messages for locked and deactivated accounts.

Use the same generic external authentication failure message for unknown email, bad password, locked account, inactive account, and invalid role. Preserve the specific reason only in the security audit event.

### P1 — trusted-origin hostname test is too broad

`host.endsWith('immigrationhorizons.com')` accepts a hostname such as `evilimmigrationhorizons.com`.

Require either the exact apex or a dot-delimited subdomain:

```text
host === 'immigrationhorizons.com'
OR
host.endsWith('.immigrationhorizons.com')
```

Continue to support explicit localhost development origins.

### P1 — case detail uses the wrong audit model

`server/routes/api/v1/staff/cases.js` queries `ActivityLog` and even comments that the relationship may not exist.

The repository explicitly defines `CaseActivity` as the append-only case-scoped history and explicitly says not to overload lead `ActivityLog`.

Use `CaseActivity`.

### P1 — case detail breaks the case-concealment rule

An existing but inaccessible case currently returns `403` from the case-detail API.

For case-scoped resources, preserve the existing concealment policy: malformed, nonexistent, archived where appropriate, and inaccessible case IDs should produce the same external not-found behavior unless a specific route has a documented reason otherwise.

### P1 — case/client serializers use fields that do not exist

`ClientUser` uses `firstName` + `lastName`, not `name`, and has no `portalStatus` field.

Current API/UI code uses/populates `name` and displays `portalStatus`, so real client names/status presentation can be blank/incorrect.

Normalize client presentation through a serializer such as `displayName` derived from first/last name with email fallback. Do not add duplicate database fields merely to satisfy the UI.

### P1 — recent document DTO uses a non-existent title field

`CaseDocument` uses `displayName`/`originalName`; the Phase 02 case-detail API selects `title`.

Use the existing document field names and explicit DTOs.

### P1 — Phase 02 required tests were not added

The implementation commit changes no server integration-test file and no Angular feature test for the new API/auth/case/client/task behavior.

The previous Phase 02 completion gate explicitly required security matrix, DTO-contract, auth, Angular behavior, row-level authorization, and negative tests.

Existing green legacy tests are valuable but do not verify the new endpoints.

### P1 — case list UI is not yet the promised operational directory

The backend exposes pagination/filter parameters, but the Angular case list currently performs a single default request and renders a basic table. It does not provide working search, stage/type/priority/scope filters, pagination, URL-state, or polished loading/error behavior.

Client list has the same limitation.

Phase 03 should finish these read surfaces while adding write operations, rather than layering mutations on incomplete tables.

### P2 — Firebase was added to the employee Angular app without an employee use case

ADR-016 says employees/admins use Immigration Horizons-managed credentials; Firebase is intended for future client authentication.

The Phase 02 commit adds Firebase and an analytics service to `case-management`. No employee feature should depend on Firebase.

Remove the unused Firebase dependency/service/config from the employee Angular app unless a concrete approved staff requirement exists. Client Firebase work belongs to the client-portal migration phase. Do not introduce Firestore.

### P2 — Phase 02 report is incomplete

`PHASE_02_WORKING_CORE_REPORT.md` does not record the required test counts/results, data/index/migration impact, complete endpoint inventory, known limitations, or the red CI state. It also proposes "Next.js Phase-Out & Client Transition" as the next step, which conflicts with the accepted migration roadmap.

After closure, replace/amend the report with an honest final verification section.

## Phase 02 acceptance status by goal

| Goal | Status |
|---|---|
| Canonical Express API boundary | Partial / useful foundation |
| Real employee login | Implemented but security defects must be fixed |
| Session survives refresh | Implemented by design; needs integration test |
| Forced first-login password change | UI implemented; server enforcement/provisioning incomplete |
| Real dashboard | Implemented; needs contract/security tests |
| Real case list/detail | Partial; serialization/activity/concealment/UI gaps |
| Real client list/detail | Not acceptable until DTO leak/scope defects fixed |
| Real assigned tasks | Basic read implemented; needs tests/UI hardening |
| Branded Angular UI | Partial; direction improved, still needs reusable product primitives |
| OpenAPI | Initial skeleton only |
| Required Phase 02 tests | Missing |
| CI green | **No** |
| Production deployment | Correctly unchanged |

## Next phase decision

Do **not** start Next.js phase-out or client transition.

The next implementation cycle is:

**Phase 03 — Core Hardening + Canonical Case Operations**

It has two ordered gates:

1. **Gate A:** close every P0/P1 Phase 02 blocker and make all CI green.
2. **Gate B:** expose existing case mutation services through the canonical API and build the real Angular case-operation UX for stage, project manager, team membership, archive, and client-visible case updates.

Gate B may not begin until Gate A's security and test acceptance criteria are green.