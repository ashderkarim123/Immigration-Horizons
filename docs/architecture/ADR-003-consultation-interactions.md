# ADR-003 — Consultation Interaction Domain

**Status:** Accepted
**Date:** 2026-08-04
**Module:** `04_CONSULTATION_AND_QUERY_TRACKING.md` (Cycle 3)

## Context

Cycle 3 introduces `ConsultationInteraction`, `InteractionHistory`, and
`InteractionUpdate` — an operational lifecycle for client questions and
scheduled consultations, spanning both pre-case (`Consultation`) and
in-case (`ClientCase`/`CaseWorkspace`) context.

Unlike Cycle 2's `ClientCase`/`CaseWorkspace`/`WorkspaceMember` (Express is
the sole writer; see ADR-002 §1), this domain has **two real writers**:
clients create interactions and follow-ups from the Next.js portal;
employees acknowledge, assign, schedule, answer, and close them from the
Express admin. ADR-002's "primary writer" simplification does not fit
here, and its own Consequences section flagged this exact situation as one
that would need a fuller revisit. This ADR is that revisit, scoped to this
domain only — Cases/Workspaces/Membership are unaffected and keep ADR-002's
original single-writer model.

## Decisions

### 1. Model ownership — dual writer, field-ownership boundary

Both apps write `ConsultationInteraction`, `InteractionHistory`, and
`InteractionUpdate`, but never the same *fields*:

- **Client-writable** (via Next.js Route Handlers): interaction creation
  (`subject`, `description`, `type`, `scopeType` + scope refs, initial
  `status: "submitted"`, `priority` server-defaulted — never
  client-supplied, see §11), `InteractionUpdate` rows with
  `authorType: "client"` / `visibility: "client_visible"`,
  `clientResolutionStatus`/`clientResolvedAt`/`clientResolutionNote`.
- **Employee-writable** (via Express routes): every status transition
  beyond the initial `submitted`, `assignedTo`, `scheduledFor`/`timezone`,
  `answeredBy`/`answeredAt`/`clientVisibleResponse`/`internalResponse`,
  `cancelledAt`/`closedAt`, `InteractionHistory` rows (always — see §8),
  `InteractionUpdate` rows with `authorType: "admin"`.

Both apps' Mongoose schemas declare every field (so each can read
everything it needs to render), but each app's *route/service layer* only
ever sets the fields it owns — enforced by code review and the
schema-contract test's required-field list, not a database-level ACL
(Mongoose has no cross-schema field permissions; this is the same
non-enforced-but-tested convention `Consultation`'s two schemas already
rely on).

### 2. Concurrency — Mongoose's `optimisticConcurrency` schema option, not a new mechanism

Every Mongoose document carries a `__v` version key by default, but a
default schema's plain `.save()` does **not** actually check it —
verified empirically during this cycle (a second concurrent `.save()`
silently overwrote the first, no error, `__v` never even incremented). The
default `__v`/`VersionError` machinery only guards array-subdocument
positional-operator modifications, not general field changes — a narrower
guarantee than assumed when this decision was first drafted.

The actual mechanism is the `optimisticConcurrency: true` schema option
(set on both apps' `ConsultationInteractionSchema`), which makes every
`.save()` include `__v` in its update filter unconditionally. With that
option, a concurrent save from a stale loaded copy fails with
`VersionError` instead of silently clobbering the other write. Every
interaction mutation (assign, schedule, answer, status change) in both
apps loads the document, mutates it, and calls `.save()` — never a blind
`findOneAndUpdate` for these paths — so with the option enabled, the
protection is automatic. A caught `VersionError` is translated to a
controlled `409 Conflict` ("this was updated by someone else — reload and
try again") rather than a generic 500. No custom version field, no manual
compare-and-swap logic was built — but the schema option itself is
required and was not optional/incidental as first assumed.

### 3. Interaction number

`IQ-<year>-<6 random chars>` — same algorithm and rationale as
`caseNumber` (ADR-002 §6: collision-resistant, no counted sequence, no
predictable structure), different prefix so the two are never confused at
a glance. Generated wherever the interaction is created — by either app,
since either app can be the creator — so both apps carry their own copy of
the generator function (`server/utils/interactionNumber.js`,
`src/lib/auth/interaction-number.ts`), same pattern as ADR-002's mirrored
constants.

### 4. Explicit collection names

`ConsultationInteraction` → `consultation_interactions`,
`InteractionHistory` → `interaction_history`, `InteractionUpdate` →
`interaction_updates` — continuing ADR-002 §3's explicit-naming decision.

### 5. Cross-app schema-contract

`docs/architecture/interaction-schema-contract.json`, loaded by both
`server/test/interaction-schema-contract.test.js` and
`test/interaction-schema-contract.test.ts` — same JSON-fixture mechanism as
ADR-002 §4, extended with this domain's enums (type, status, priority,
scope, history event type, update type, update visibility) and collection
names.

### 6. Interaction scope — explicit discriminator, not inferred

`scopeType: "consultation" | "case"` is a real, required field — never
inferred from whether `case`/`workspace` happen to be set (module doc's
explicit instruction). Every service-layer write validates the scope's
required refs match (`consultation` scope requires `consultation` and
forbids `case`/`workspace`; `case` scope requires `case`+`workspace` and
validates they actually reference each other) before persisting.

### 7. Pre-case vs. case-scoped authorization

- **Consultation scope:** a client may act only when the linked
  `Consultation.clientUser` matches their own id (same pattern as the
  existing `/portal/consultations/[id]` page). An employee needs an
  organization-wide query capability, OR assignment to the interaction, OR
  the same "no row-level lead restriction" convention `leads.view` already
  uses (module doc: "or existing authorized lead access" — this repo's
  leads have no per-lead ownership restriction today, so "authorized lead
  access" reduces to holding `queries.view`).
- **Case scope:** identical to ADR-002's case policy — active
  `WorkspaceMember` (client or employee) required, `queries.view_all`
  bypasses membership for employees, exactly mirroring `casePolicy.js`.

### 8. Append-only history, always employee-attributable-or-system

`InteractionHistory` is written by the *service layer only*, never
directly by a route — every mutating service function that changes
persisted state writes exactly one history row (or zero, if the mutation
was a genuine no-op per §"unchanged updates" in the module doc) as part of
the same operation. Client-caused transitions (submission, follow-up,
resolution confirmation) still produce history rows, attributed
`actorType: "client"` — "append-only" and "employee workflow" are
independent constraints; clients cause real lifecycle events too.

### 9. Follow-ups are not chat

`InteractionUpdate` has exactly two visibility values and no threading,
reactions, mentions, or read receipts — deliberately minimal, per the
module doc's explicit instruction not to let this become the future chat
module. When Cycle 5 (`06_TEAM_COLLABORATION_AND_CHAT.md`) is built, this
model's shape (`body`, `authorType`, `visibility`, timestamps) is
compatible with becoming one channel-independent "system event" style
message type in that system, or can be left standing alongside it — that
decision is explicitly deferred to Cycle 5's own ADR, not made here.

### 10. Timezone

`scheduledFor` is stored as an absolute UTC `Date`; `timezone` is a
validated IANA identifier (`Intl.DateTimeFormat(undefined, { timeZone })`
constructor throws on an invalid identifier — used as the validation,
rather than a hardcoded allowlist that would need maintenance). A new
`APP_TIMEZONE` environment variable (default `"UTC"`) is the organization
timezone source for "scheduled today" queue boundaries — no existing
setting or env var covered this (grepped for
`timezone|scheduledFor|appointment` across both apps, zero hits before
this cycle).

### 11. Priority is server-controlled

The module doc lists `priority` as an interaction field but does not make
it a client input in the client workflow section. Client-created
interactions always get `priority: "normal"` server-side; only employees
can change it (via the same status/assign-style mutation path). Prevents a
client from self-escalating to `urgent`.

### 12. Compatibility with the future generalized notification module

`07_NOTIFICATIONS_AND_REALTIME.md`'s target `Notification` shape already
lists an `interaction` field — this cycle's employee notifications reuse
the *current* `Notification` model (`recipientName`-addressed, per
ADR/Cycle 2 precedent) with a new optional `relatedInteraction` field,
mirroring how Cycle 2 added `relatedCase`. No migration to immutable
recipient IDs happens now — that stays Cycle 6/7 scope, exactly as the
Cycle 3 prompt requires.

### 13. Route naming — resolving the `/portal/consultations` conflict

Kept exactly as the existing Cycle 1 routes (`/portal/consultations`,
`/portal/consultations/[id]` — unchanged, still `Consultation` lead
records). New interaction routes live at `/portal/queries`,
`/portal/queries/new`, `/portal/queries/[interactionId]` — the prompt's
own suggested naming, adopted as-is since it cleanly avoids ambiguity
between a `Consultation` id and a `ConsultationInteraction` id in the same
URL segment.

## Consequences

- Two new small per-app constant/generator files each, one new shared JSON
  test fixture — consistent with, not a departure from, ADR-002's
  established cost/benefit tradeoff.
- Unlike Cases, this domain's dual-write reality means a future audit of
  "which app actually wrote this field" is worth periodically re-checking
  against the field-ownership list in §1, since nothing prevents a future
  route from accidentally writing an unowned field except code review and
  the schema-contract test's field assertions.
- `server/` gains a real `resend` dependency this cycle (client interaction
  emails — see the implementation status doc for the specific, narrow
  justification) — its first actual email-sending capability.
