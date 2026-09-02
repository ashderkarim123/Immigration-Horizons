# ADR-010 — Staff Case and Client Operations in the SaaS App

**Status:** Accepted
**Date:** 2026-08-29
**Cycle:** 8C — staff operational console

## Context

ADR-009 delivered the employee shell, authentication, navigation, and
role-aware dashboards on `app.immigrationhorizons.com`, and stated its own
limit plainly: *"the staff area is read-only. Document review, message
sending, query answering, and case mutation still happen in the admin
CMS."* Two navigation items — `/staff/queries` and `/staff/clients` —
pointed at routes that did not exist.

Cycle 8C's brief closes that gap, and is explicit that it must be closed
**in the SaaS app**, not by adding more to the Express CMS.

An audit before starting found:

1. **The capability registry already covers this work.** `clients.view`,
   `clients.manage`, and `client_updates.publish` — the three the old
   module plan named as missing — were added in Cycle 8 (ADR-007 §7) and
   are present in both maps. The registry holds **54** capabilities, not
   the 49 the brief cites. **No new capability was needed or added.**
2. **No duplicate client model is needed.** `ClientUser` +
   `ClientCase` + `CaseWorkspace` + `WorkspaceMember` already express
   every relationship the brief lists. Nothing new was modelled.
3. **The queue definitions already exist twice** — `operationsQueues.js`
   and `interactionQueues.js` in the CMS. They are aggregated here, not
   reinvented.
4. **One real blocker:** the SaaS app had no write path into the case
   domain at all. ADR-002 §1 made Express the sole writer for cases,
   workspaces, and memberships, and this app carried read-only mirrors.

## Decisions

### 1. The SaaS app becomes a second writer to the case domain

This reverses the ADR-002 §1 rule that Express is the sole writer for
`client_cases`, `workspace_members`, and `case_activities`.

It is not a preference. The brief requires assignment, stage, and
membership changes in the staff console, and requires that they *not* be
built primarily in the CMS. A console that can only read is a report.

The alternative — the SaaS app calling the CMS over HTTP — was rejected:
it would make `app.*` depend on `admin.*` being reachable for ordinary case
work, invent a private API surface with its own auth story, and put a
second network hop inside a request the operator is waiting on.

The three collections this app now writes are exactly the three the
mutations touch. Documents, channels, and queries stay read-only from the
staff surfaces this cycle.

### 2. Semantics are mirrored, not merely schemas

Two writers must agree on what an action *means*, not only on field
shapes. `src/lib/staff/case-operations.ts` reproduces
`server/services/caseManagement.js` decision for decision:

- a no-op change records no duplicate audit entry
- a new project manager gets an active `project_manager` membership
- the outgoing manager is **demoted to `contributor`, not removed** — a
  former PM keeps case access, because removal is a separate explicit act
- exactly one active `project_manager` membership exists at any moment
- the primary client and the sitting project manager cannot be removed
- every change appends to `CaseActivity` and notifies the affected employee
- a stage change emits the same client-visible system message

`/api/staff/cases/:id/members` additionally **refuses** to hand out the
`project_manager` workspace role. That role is owned by the assignment
action, which also writes `ClientCase.projectManager`; granting it through
the membership route would leave the case record and its workspace
disagreeing about who runs the case.

### 3. `CaseActivity` is now a mirrored, dual-written model

`src/lib/models/CaseActivity.ts` mirrors `server/models/CaseActivity.js`,
and its type enum plus actor-type enum are asserted from **both** sides
against `docs/architecture/case-schema-contract.json` — the same
mitigation every mirror pair has carried since ADR-002. Add a type on one
side only and both suites fail.

One deliberate difference: the SaaS app's `recordCaseActivity` hard-codes
`actorType: "admin_user"` rather than accepting it. The CMS needs
`env_fallback` for its break-glass login; the SaaS app has no such login
(ADR-009 §3), so making it a parameter would only create a way to record a
false actor type.

### 4. Client operations are org-wide; their case panels are not

Following ADR-007 §8: the client **directory** is not membership-scoped. A
client exists before any case does and may hold several across different
workspaces, so scoping the directory would make it incoherent — a PM would
see a client but not their cases, or the reverse. `clients.view` is
manager-tier, which is what keeps that safe.

The record-level check applies where it belongs: every case-scoped panel on
a client's detail page — cases, documents, case-scoped queries,
communication — runs through the same `accessibleCaseIdFilter` the case
list uses.

The membership panel needed a decision the CMS never faced. A client may be
a member of a workspace the viewing employee cannot open. Hiding the row
would misrepresent the client's access; naming the case would leak it. The
row renders, labelled **"Restricted"**, with the case identity withheld —
asserted by test.

### 5. Panels distinguish "nothing here" from "not your remit"

Every case-detail and client-detail panel returns `null` when the role
holds no governing capability, and `[]` when there is genuinely nothing.
The UI renders different states for each. Collapsing them would tell a
specialist that a case has no documents when it may have many they simply
cannot see — the same reasoning ADR-009 §5 applied to dashboard widgets,
extended to every panel.

### 6. Filters can only ever narrow

`listCasesForEmployee` applies its row-level restriction **last**,
intersecting id sets. No query parameter — stage, type, priority, scope,
`includeArchived`, or search — can widen the accessible set. Search input
is escaped into a literal regex, so `.*` matches the two characters `.*`
rather than every case. Both properties are asserted by test, including
searching for another team's case number by hand.

### 7. The operations board aggregates existing queues; it does not invent them

`src/lib/staff/operations.ts` reuses the filters already defined in
`operationsQueues.js` and `interactionQueues.js`. No `$lookup`, no N+1,
nothing newly indexed except the one index in §10 below.

Three properties distinguish it from the CMS dashboard, which is org-wide
and unscoped:

1. every queue is capability-gated, and what a role cannot hold is **named
   at the bottom of the page** rather than silently absent;
2. every case-scoped queue is row-level scoped through
   `accessibleCaseIdFilter`;
3. each queue carries its rows, not just a count — a console you cannot act
   from is a report.

The "overdue queries" queue is labelled honestly: nothing sets
`responseDueAt` automatically, because no SLA rule is configured, so it
stays empty until one is. That is stated in the UI rather than left to be
discovered.

`/staff/operations` carries **no page-level capability**. Every queue
inside is gated individually, so even a `viewer` gets a useful page —
their own overdue tasks, plus an honest list of what their role cannot
hold — instead of a 404.

### 8. Query queues gained the row-level scope the dashboard was missing

`queries.view` includes `pm`; `queries.view_all` does not. The Cycle 8B
dashboard counted queries org-wide for any `queries.view` holder, which
ignored that distinction.

`queryScopeFilter` now narrows case-scoped queries to cases the employee
can open, while consultation-scoped queries — which belong to no workspace
— stay visible to any `queries.view` holder. **The Cycle 8B dashboard
counts were changed to use the same filter**, so a tile and the queue it
links to can never disagree about how much work is waiting.

This is a deliberate behaviour change to shipped code, not a new feature:
a PM's "unanswered queries" number will drop to their own cases.

### 9. One guard for every staff mutation

`guardStaffRequest` performs Origin verification, rate limiting,
authentication, and the capability check in a fixed order, and
`requireCaseAccess` performs the row-level check separately (not every
staff mutation is case-scoped). The case-access guard returns the exact
case **and workspace** the check ran against, so a mutation cannot write to
a workspace re-derived later from unvalidated input.

A signed-in employee lacking the capability gets **404, not 403** —
matching `requireCapability` on the page side.

### 10. One new index, declared on both mirrors

`ClientCase { archivedAt: 1, updatedAt: -1 }`. The staff case list sorts
every query by `updatedAt`, and the "needing attention" queue filters on
it. Declared identically in `src/lib/models/ClientCase.ts` and
`server/models/ClientCase.js`, and registered in this app's
`createIndexes` script along with `CaseActivity`.

## Consequences

- The staff console is no longer read-only. Assignment, stage, and
  membership changes are first-class in `app.*`.
- **Two applications now write the case domain.** The mitigation is
  behavioural parity (§2), the extended schema contract (§3), and tests on
  both sides — not an assumption that both will be edited together.
- Query counts on the Cycle 8B dashboard changed meaning for PMs (§8).
- `/staff/queries` and `/staff/clients` now exist, so ADR-009's honest-but-
  broken navigation links resolve.
- No new capability, no new model, no duplicate client entity.

## Not built this cycle

Stated so the gap is not mistaken for done:

- **Document review, query answering, and message sending remain in the
  CMS.** The staff console reads them and routes you to the case; it does
  not yet act on them. `documents.review`, `queries.answer`, and
  `messages.send` are unused in this app.
- **`client_updates.publish` has no SaaS surface.** The capability exists
  and the CMS implements it (ADR-007 §6); a staff-side composer is the
  natural next increment.
- **`clients.manage` has no SaaS surface** — disabling an account and
  re-issuing an invitation stay in the CMS, where the session-revocation
  behaviour of ADR-007 §3 already lives.
- **Case archiving** is not exposed here. `cases.archive` remains
  CMS-only.
- Tasks are still lead-scoped (`Task.lead` → `Consultation`). The case page
  shows the originating lead's tasks and says so, rather than pretending
  they are case-scoped.
