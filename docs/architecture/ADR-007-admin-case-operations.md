# ADR-007 — Admin Case Operations

**Status:** Accepted
**Date:** 2026-08-05
**Module:** `08_ADMIN_CASE_OPERATIONS.md` (Cycle 8)

## Context

By the end of Cycle 7 every domain this module needs — cases, workspaces,
memberships, queries, documents, channels, notifications — is built,
policy-guarded, and tested. Most of what module 08 lists as "admin
modules" therefore already exists: case list/detail/convert/stage/assign/
members/archive/activity shipped in Cycle 3, query queues in Cycle 4,
document queues in Cycle 5, collaboration in Cycle 6.

An inspection pass before starting found exactly three real gaps:

1. **Client management does not exist at all** — no `/admin/clients`
   surface, and neither `clients.view` nor `clients.manage` is a defined
   capability. This is the largest piece of genuinely new work.
2. **The dashboard shows no operational counts** — `/admin` still counts
   leads, blog posts, testimonials, and FAQs, exactly as it did before
   Cycle 1. None of the eight operational queues the module asks for
   exist anywhere.
3. **`client_updates.publish` is undefined** and there is no way for
   staff to deliberately publish a client-visible case update.

This ADR covers those three, and nothing else. Rebuilding the surfaces
that already work would be churn, not delivery.

## Decisions

### 1. Read-only server mirrors for `PortalInvitation` and `ClientSession`

Both models were root-app-only (the portal owns activation and sessions).
The admin needs to *read* them for invitation status and the security
summary, and to *revoke* them — but never to create a session. Mirrored
into `server/models/` with the same collection names and field shapes,
following the ADR-002/004/005 mirroring convention.

The admin's write surface on these is deliberately narrow: it may revoke
an invitation, issue a fresh one, and revoke sessions. It never mints a
session, never reads a token (only hashes are stored), and never sets a
password.

### 2. Invitation re-issue duplicates the root's token logic rather than calling it

`sendActivationEmail` and the invitation-issuing path live in the Next.js
app. The admin cannot import them (separate deployables, separate
`package.json`). `server/services/clientAccountService.js` reproduces the
same mechanism — `crypto.randomBytes(32).toString('base64url')` for the
token, SHA-256 for the stored hash, 7-day TTL, revoke-then-issue so at
most one active invitation exists per email — and
`server/services/clientPortalEmail.js` reproduces the activation email
against the same `SITE_URL` `/portal/activate?token=` route.

This is duplication, and it is the same duplication ADR-002 already
accepted for every mirrored model: the alternative is a shared runtime
package, which this repo has deliberately not adopted. The mitigation is
the same one used for models — a schema-contract fixture, extended this
cycle to assert both apps agree on the invitation TTL, purpose value, and
token-hash algorithm, so a change on one side fails the other's tests.

### 3. Disabling a client revokes every live session immediately

`ClientUser.status = 'disabled'` alone would not log anyone out — the
portal's session lookup checks `status !== 'active'` on each request, so
it would be effective, but leaving live session rows behind is the wrong
default for an account-disable action. `disableClient()` sets the status
*and* revokes every unexpired session in the same operation, so "disable"
means what an operator expects it to mean.

Re-activation deliberately does **not** restore sessions — the client
logs in again.

### 4. Operational queues are one aggregation module, not eight scattered queries

`server/services/operationsQueues.js` exposes a single
`getOperationalCounts()` returning all eight counts from a `Promise.all`
of `countDocuments` calls, each backed by an index that already exists
from an earlier cycle. No `$lookup`, no N+1, no per-row queries — the
dashboard renders from eight scalars.

The eight, mapped to what actually exists:

| Queue | Query |
|---|---|
| Cases without a project manager | `ClientCase` where `projectManager` unset, active |
| Unanswered client queries | `ConsultationInteraction` in `ACTIVE_UNANSWERED_STATUSES` |
| Queries awaiting scheduling | `scheduled_consultation` type, no `scheduledFor` |
| Documents awaiting review | `CaseDocument.status = 'uploaded'` |
| Overdue document requests | `DocumentRequest` open, `dueDate` past |
| Unread client messages | `WorkspaceMessage` from a client, newer than every employee read-state |
| Upcoming filing deadlines | `ClientCase.targetFilingDate` within 30 days, active |
| Cases stalled by stage | active cases whose `updatedAt` is older than 21 days |

"Stalled" needed a definition the module doc does not give. 21 days of no
case-document change is a deliberate first-pass heuristic, named as a
constant (`STALLED_CASE_DAYS`) so it is one edit to tune once operators
have an opinion — not a magic number buried in a query.

### 5. "Unread client messages" is counted per-workspace, not per-employee

A true per-employee unread count would require reading every employee's
`ChannelReadState` across every channel they can see — expensive, and
meaningless on a dashboard that is not scoped to one person. The
dashboard count answers the operationally useful question instead: *how
many client-authored messages has nobody on the team read yet* — messages
whose `createdAt` is newer than the newest employee read-state for that
channel. Documented here because the number deliberately does not match
what any single employee sees in their own channel list.

### 6. Client-visible case updates reuse the collaboration layer

`client_updates.publish` does not introduce a new entity. Publishing an
update emits a `case_update` system message with `clientVisible: true`
into the case's `case_updates` channel via the existing
`emitSystemMessage` — so it lands in the client's message centre, respects
channel visibility, and is covered by the message serializers and access
tests already written in Cycle 6. A `CaseActivity` entry is recorded
alongside it.

The alternative — a separate `CaseUpdate` model with its own client
surface — would duplicate a delivery channel the client already reads.

### 7. New capabilities, granted conservatively

| Capability | Roles |
|---|---|
| `clients.view` | `super_admin`, `admin`, `pm` |
| `clients.manage` | `super_admin`, `admin` |
| `client_updates.publish` | `super_admin`, `admin`, `pm` |

`clients.manage` is admin-tier, not PM-tier: disabling an account and
re-issuing credentials-adjacent invitations is a higher-consequence action
than case work, matching how `cases.assign`/`cases.archive` were already
scoped in Cycle 3.

### 8. Client management is deliberately org-wide, not membership-scoped

Every other case-scoped surface in this platform enforces workspace
membership. The client list intentionally does not: a `clients.view`
holder sees all clients. Clients are not case-scoped records — a client
exists before any case does, and may have several across different
workspaces. Membership-scoping the client list would make it incoherent
(a PM would see a client but not their cases, or vice versa).

The record-level check the module doc requires is applied where it
actually belongs: the *cases* shown on a client's detail page are filtered
through the same `cases.view_all`-or-membership rule the case list uses,
so a PM viewing a client sees only the cases they can already see.

### 9. Never name an EJS render local `client`

Found the hard way while building the client detail page, and worth
recording because it will bite anyone who adds a similar view.

Express passes the `res.render()` locals object straight through to the
view engine as its *options* object. EJS reads `options.client` as
"compile this template to a standalone client-side function"
(`ejs.js`: `options.client = opts.client || false`), and in that mode it
does not inject the `include()` helper. So a perfectly ordinary-looking
`res.render('...', { client: someClientDocument })` produces a 500 from
inside the shared layout — `include is not a function` — with a stack
trace pointing at `layout.ejs`, nowhere near the actual cause.

`getClientOverview()` therefore returns the record as `clientUser`, not
`client`. The same trap exists for any other EJS option name
(`filename`, `cache`, `compileDebug`, `delimiter`, `root`, `strict`,
`rmWhitespace`, `async`) — none are currently used as locals anywhere in
this app, and none should be.

## Consequences

- The admin gains a real client-operations surface; support questions
  ("did their invitation arrive?", "why can't they log in?") become
  answerable without a database shell.
- The dashboard becomes the operational front page the module describes.
- Two more collections are now dual-app, with the same mirroring cost and
  the same contract-test mitigation as every prior cycle.
- No existing lead, task, sprint, case, query, document, or collaboration
  workflow changes.
