# ADR-002 — Case, Workspace, and Membership Domain Ownership

**Status:** Accepted
**Date:** 2026-08-04
**Module:** `03_CLIENT_CASES_AND_WORKSPACES.md` (Cycle 2)

## Context

Cycle 2 introduces `ClientCase`, `CaseWorkspace`, and `WorkspaceMember` —
collections both applications need to read, but only one needs to write in
this cycle. ADR-001 already established that this repo does not force
shared runtime code between the Next.js and Express apps. This ADR decides
whether Case/Workspace/Membership follow that same rule or need something
stronger.

## Precedent already in the repository

`Consultation` is already defined **twice** — `server/models/Consultation.js`
and `src/lib/models/Consultation.ts` — as two independently-maintained
Mongoose schemas that share a collection name and a compatible field
subset, not an identical schema. The server's copy has six-plus lead-ops
fields (`owner`, `assignees`, `priority`, `deliveryStatus`, `leadSource`,
`campaign`) the Next.js copy has never had, added across Phase 9 without
either app's schema changing to match. This has worked because each app
only ever *writes* the fields it owns and *reads* only what it declares in
its own schema — Mongoose has no cross-document schema enforcement at the
database level, so two divergent schemas over the same collection are safe
as long as each app's own reads/writes stay internally consistent.

## Decision

**Follow the same pattern: mirrored models, not a shared package — with one
addition, schema-contract tests, made mandatory this cycle rather than
optional.**

### 1. Schema ownership — which application owns which writes

Express (`server/`) is the **primary writer** of `ClientCase`,
`CaseWorkspace`, and `WorkspaceMember` in this cycle — every mutating route
(`/admin/leads/:id/convert-to-case`, `/admin/cases/:id/*`) lives there.
Next.js (`src/`) is **read-only** against `ClientCase` and `CaseWorkspace` —
its routes are `/portal/cases*`, all `GET` — with exactly **one** documented
exception on `WorkspaceMember`: `src/app/api/portal/activate/route.ts`
flips a client's own `invited` membership(s) to `active` immediately after
their `ClientUser` account activates, because module 03 requires that
transition happen "when account activation succeeds" and activation is
owned entirely by Next.js (see §"Client linkage cases" →
"Consultation linked to pending ClientUser"). This is the narrowest
possible write — one `updateMany` scoped to the acting client's own id,
never touching any other client's or employee's membership — not a general
license for Next.js to manage memberships. Every other membership mutation
(add, remove, reactivate, role change) still lives exclusively in Express.
This is still a much stronger guarantee than `Consultation` has (which both
apps write broadly), so schema drift risk stays low.

`Consultation` itself gains two more optional fields (`convertedCase`,
`convertedAt`) on **both** schemas, following the same additive pattern as
`clientUser` in Cycle 1 — Express writes them (during conversion); Next.js
only reads them (to render "already linked to a case" state, deferred past
this cycle's actual UI scope but the field is there for it).

### 2. Access — how both applications reach the same collections

Same as `Consultation`: same `MONGODB_URI`, same MongoDB deployment, two
independent Mongoose connections (one per Node process — `src/lib/db.ts`'s
`getDb()` for Next.js, `server/config/db.js`'s `connectDB()` for Express).
No new connection-sharing mechanism.

### 3. Collection names — fixed explicitly, not left to pluralization

Mongoose's default pluralization for `mongoose.model('ClientCase', ...)`
would be `clientcases`, for `CaseWorkspace` → `caseworkspaces`, for
`WorkspaceMember` → `workspacemembers` — both apps run the same Mongoose
major version (`^9.8.0`) today, so today these would already agree. That
agreement is incidental, not guaranteed (a future independent dependency
bump in one app could change its pluralization behavior). Every new model
in both apps passes the collection name as the explicit third argument to
`mongoose.model(name, schema, collectionName)`:

```text
ClientCase       -> "client_cases"
CaseWorkspace    -> "case_workspaces"
WorkspaceMember  -> "workspace_members"
CaseActivity     -> "case_activities"
```

(Snake_case chosen over the Mongoose-default runoff purely so the name is
never ambiguous with a hypothetical future default-pluralized collection —
not a functional requirement, just removes a whole class of "did Mongoose
guess the same string in both apps" doubt.)

### 4. Enums and field definitions — kept compatible by a single source of truth per app, cross-checked by tests

Each app gets one constants module that centralizes case types, case
statuses/stages, workspace statuses, member types, workspace roles, and
membership statuses:

- `server/utils/caseConstants.js`
- `src/lib/content/case-constants.ts`

These are **not** the same file (no shared package, per ADR-001's existing
decision). Their *values* are asserted equal via a third, JSON fixture —
`docs/architecture/case-schema-contract.json` — that both
`server/test/case-schema-contract.test.js` (CommonJS, `require()`) and
`test/case-schema-contract.test.ts` (ESM/TS, native JSON import, enabled by
`resolveJsonModule` already in `tsconfig.json`) load independently and
assert their own app's constants/schemas match exactly: identical enum
arrays, identical collection names, identical required-field sets. JSON was
chosen specifically because it's the one format both a CJS Express app and
an ESM/TS Next.js app can load natively with zero extra tooling — the two
apps still don't share any runtime module, only a test-time data fixture
neither production codepath ever imports. This is the "carefully mirrored
models with schema-contract tests" strategy the module document names as
acceptable — adopted here, upgraded from optional precedent to a required,
checked guarantee for this domain specifically, because unlike
`Consultation` (where drift is visually obvious in the admin's own UI
within a day), `ClientCase` schema drift would surface as a silent
client-portal rendering bug days or weeks later.

### 5. Index compatibility

Both apps declare their own `schema.index()` calls (Mongoose doesn't
enforce indexes across schemas either — an index only exists once
`createIndexes()` runs against the real collection). The **write-owning**
app's indexes are authoritative for uniqueness/concurrency guarantees
(`server/`'s unique `caseNumber`, unique-partial `consultation`, unique
primary-workspace, partial-unique membership indexes) since only it writes.
The read-only Next.js schema declares the indexes it actually queries by
(e.g. `workspace_members` by `clientUser+status`) — these can differ in
which indexes exist without correctness risk, only performance, since
Next.js never writes here and thus can never violate a uniqueness
constraint it didn't declare.

### 6. Avoiding model recompilation in Next.js dev

Unchanged from every existing model in this app: `mongoose.models.X ||
mongoose.model(...)` guards every new Next.js model file, exactly like
`ClientUser.ts` etc. from Cycle 1.

### 7. CommonJS vs. ESM

Unchanged: `server/` stays CommonJS (`require`/`module.exports`), Next.js
stays ESM (TypeScript `import`/`export`). No new bridging is introduced —
the two "mirrored" model files are independent source files in independent
module systems, exactly like `Consultation`'s two copies already are.

### 8. Detecting schema drift

The schema-contract test (§4) is the detection mechanism, run as part of
each app's normal test suite (`server/test/case-schema-contract.test.js`
runs under `cd server && npm test`; the root equivalent runs under `npm
test`). A future field/enum change in one app's model without a matching
change in the other's constants module fails this test immediately, in CI,
rather than silently drifting until a client-portal bug report.

### 9. Why this fits the existing architecture

It is a strict continuation of a decision already made and already
load-bearing in production (`Consultation`'s two schemas have coexisted
since Phase 9). Introducing a shared schema package now would mean: (a)
retrofitting `Consultation` to use it too, for consistency, which is out of
scope and risky for a cycle focused on cases; or (b) having two different
sharing strategies for two conceptually similar problems, which is worse
for a future maintainer than one consistent (if more manual) strategy.
ADR-001 already rejected forcing shared runtime code between the two apps'
frameworks — nothing about Cases changes that calculus, since (per §1) only
one app writes these collections this cycle.

### 10. How later query, document, and chat models will follow

Same pattern, same checklist: an explicit collection name, a per-app
constants module, and a schema-contract test entry — added to as each of
Cycles 3–6 introduces `ConsultationInteraction`, `CaseDocument`,
`WorkspaceChannel`, `WorkspaceMessage`, etc. This ADR's §4 test file is
designed to be extended (one contract-assertion block per model), not
replaced, as that happens.

## Consequences

- Two new small constants files (one per app) plus one new test file (per
  app) — a deliberate, bounded amount of duplication in exchange for zero
  cross-app runtime coupling.
- Next.js already makes one narrow write against `WorkspaceMember` (§1's
  activation exception). If Cycle 3+ adds more Next.js writes against
  `ClientCase`/`CaseWorkspace`/`WorkspaceMember` (e.g. a client-initiated
  action), this ADR's "primary writer" framing needs a fuller revisit —
  concurrent-write safety (unique indexes, transactions) would then need to
  account for both apps writing more broadly, not just Express plus one
  narrow, well-scoped exception. Flagged here so that revisit isn't a
  surprise.
