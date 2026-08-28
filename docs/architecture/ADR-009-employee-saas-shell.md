# ADR-009 — Employee SaaS Shell and Role-Aware Dashboards

**Status:** Accepted
**Date:** 2026-08-05
**Cycle:** 8B — employee SaaS shell

## Context

Cycle 8A separated the applications by host: `immigrationhorizons.com`
(marketing), `app.immigrationhorizons.com` (SaaS), and
`admin.immigrationhorizons.com` (CMS). That cycle's report flagged the
remaining gap plainly: `app.*` served **clients only**. Every employee
case-working surface still lived in the Express admin CMS, and the Next.js
app had no concept of an employee at all.

The audit for this cycle found three concrete blockers:

1. **No employee authentication.** `EmployeeActor` was typed in ADR-001 as
   a deliberate placeholder ("not populated by any code in this cycle")
   and never constructed. Sessions existed only for `ClientUser`.
2. **No capability system.** The 54-capability map lived solely in
   `server/utils/permissions.js`.
3. **`AdminUser` was a two-field mirror** (`name`, `isActive`) that
   *deliberately* excluded `role`, on the grounds that the client portal
   must never expose internal role codes.

A fourth blocker was a product question, not a technical one, and was put
to the owner rather than decided here: **Petition Writer and USCIS Forms
Specialist held six capabilities each — neither `cases.view` nor
`documents.view`.** They could not open a case or a document in either
application. ADR-002 had withheld those grants pending "a product rule
that justifies it". The owner approved granting view-only,
membership-scoped access (option 1 of three offered).

## Decisions

### 1. Mirror the capability map; do not invent a second one

`server/utils/permissions.js` remains the owner. `src/lib/auth/capabilities.ts`
mirrors it, and both assert against
`docs/architecture/employee-capability-contract.json` — which is
**generated from the live server map**, not hand-transcribed.

This earned its keep immediately: the first hand-written mirror drifted on
four capabilities (`deliveries.manage`, `documents.view`,
`documents.upload`, `document_versions.view`) and the contract test caught
every one before any of it ran.

### 2. Employee sessions mirror the client design; they do not share the CMS's

A separate `EmployeeSession` collection and a separate cookie
(`ih_staff_session`), same opaque-token + SHA-256-at-rest design as
`ClientSession`.

Sharing the Express `express-session` store was considered and rejected:
it would require widening that cookie to `.immigrationhorizons.com` and
coupling the two apps to one session format. Mirroring is consistent with
every prior cycle and keeps the blast radius of either app's session logic
contained.

The two session types are deliberately **not** generalised behind one
"session" abstraction with a `type` discriminator. That shape is exactly
how one bug becomes a privilege escalation. Tests assert a client cookie
cannot authenticate a staff request and vice versa.

Employee sessions are shorter-lived than client ones (12h absolute / 2h
idle vs the client's longer window) because staff sessions sit on shared
office machines.

### 3. Authorization always re-reads the live user

`EmployeeSession.roleSnapshot` exists for display only. Every request
re-reads `AdminUser.role` and `isActive`, so deactivating an employee or
changing their role in the admin CMS takes effect on their **next
request**, not their next sign-in. A deactivated account has its session
row deleted rather than merely denied, so it cannot be reused if the
account is later re-enabled.

The proxy's `/` routing on `app.*` reads only the *presence* of the staff
cookie to choose a dashboard. That is a routing hint, not a login — a
forged cookie simply lands on `/staff`, which redirects to `/staff/login`
like any other unauthenticated request.

### 4. Specialist access is view-only and membership-scoped

`cases.view`, `documents.view`, and `document_versions.view` now include
the five specialist roles and `reviewer`. Nothing else changed:
create/manage/assign/archive/review/upload remain manager-tier.

**This is safe because none of those roles hold `*.view_all`.** The
row-level rule in `employee-case-policy.ts` (mirroring
`server/services/casePolicy.js`) therefore limits them to workspaces they
are an *active* member of. A specialist sees assigned cases and nothing
else — asserted by tests, including that removing their membership revokes
access immediately.

Because the map is shared, this also lets those roles open their own cases
in the Express CMS. That consequence was stated when the decision was put
to the owner and accepted.

### 5. One dashboard query module, capability-gated — not three

The three role dashboards the brief describes differ in **which widgets
appear and in what order**, not in what "a document awaiting review"
means. So `employee-dashboard.ts` computes every widget once, each gated
by the capability that governs it, and `dashboard-presets.ts` holds
per-role ordering.

Presets are presentation only. Reordering that file cannot change what
anyone can see, because the values it orders were already gated upstream.
A role with no preset falls back to a sensible default, so adding a role
to the capability map does not require a code change here.

A widget the role cannot hold returns `null`, not `0` — the UI renders
"Not your remit" rather than a misleading zero. This distinction is
tested.

Every case-scoped count runs through the same `accessibleCaseIdFilter`
used for reads, so a specialist's "documents awaiting review" counts their
own cases, not the practice's.

**On reuse:** the admin CMS's `operationsQueues.js` cannot be imported
here (separate deployables), so the queue *definitions* are mirrored, not
shared — same cross-app pattern as every model since ADR-002. The
underlying collections and indexes are the same; nothing new was indexed
for the dashboard.

### 6. One shell, two navigation sets

`AppShell` is a single component serving both actor types. The layout
resolves whichever session exists — employee first, so a staff member with
a client account on a shared browser gets the staff shell — and passes in
the matching navigation. The shell itself never reads a session or a
capability, so it cannot become an authorization surface.

**Navigation is presentation.** Items are capability-filtered so the UI
does not offer dead ends, but every page calls `requireEmployee` or
`requireCapability`, and every case-scoped resource additionally runs its
row-level check. A hand-typed URL to a hidden page is denied by the
server, not by the absence of a link.

`requireCapability` returns **404, not 403**, for a signed-in employee
lacking the capability — the existence of a resource is itself
information, matching how the client portal already treats inaccessible
cases.

The client shell receives `roleLabel={null}` explicitly, so internal role
codes stay out of the client-facing UI by construction rather than by
remembering.

## Consequences

- `app.*` now serves both halves of the SaaS product, as the 8A host
  topology always intended.
- Employees sign in separately at `app.*` and `admin.*`. These are
  different applications with different session stores; single sign-on
  across them is future work, not an oversight.
- Two capability maps now exist and must stay in step. The generated
  contract plus tests on both sides is the mitigation.
- `AdminUser` in this app now carries `role`, `email`, and `password`.
  Client-facing queries must keep using explicit projections
  (`.select("name")`); a test asserts the client-visible team serializer
  carries no role code.

## Not built this cycle

Deliberately, and worth stating so the gap is not mistaken for done:

- **The staff area is read-only.** Document review, message sending, query
  answering, and case mutation still happen in the admin CMS. This cycle
  delivered the shell, authentication, navigation, dashboards, and scoped
  reads.
- `/staff/queries` and `/staff/clients` appear in navigation for roles
  holding those capabilities but are not yet built — the nav is honest
  about the destination existing as a route, and those pages are the
  natural next increment.
- Tasks remain **lead-scoped**, not case-scoped: `Task.lead` references a
  `Consultation`. The dashboard surfaces them as assigned work rather than
  pretending otherwise. Migrating tasks onto cases is its own cycle.
