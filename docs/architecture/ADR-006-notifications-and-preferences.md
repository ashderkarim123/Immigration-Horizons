# ADR-006 — Notifications, Preferences, and Deferred Real-Time

**Status:** Accepted
**Date:** 2026-08-05
**Module:** `07_NOTIFICATIONS_AND_REALTIME.md` (Cycle 7)

## Context

The existing `Notification` model (shipped pre-Cycle-1, extended in
Cycles 2/3/5/6) addresses recipients by **display name** (`recipientName`)
— a string, not an identity. It has no concept of a client recipient at
all: every notification is implicitly employee-facing, queried by
`recipientName` against the admin topbar bell. Clients today receive
**zero** in-app notifications; they only ever get transactional email
(Cycles 2/3/5/6's `*Email.js` adapters).

The module doc's own handoff is explicit about sequencing: "First migrate
notifications to immutable recipients and add preferences. Then add
Socket.IO only after reviewing reverse proxy, shared sessions, and
multi-instance deployment. Keep HTTP/database behavior authoritative."
`00_MASTER_ROADMAP.md` reinforces this — Phase 7 (this cycle) is "durable
notifications + unread indicators + preferences"; Socket.IO is Release 5
("real-time and production hardening"), not Release 4. This repo's actual
deployment (`DEPLOYMENT.md` Part 1: single VPS, PM2, nginx, no staging
environment, no established shared-session store) has not had that review.
Building Socket.IO now would repeat the exact mistake Cycle 6 avoided with
its own scope boundary — see ADR-005's context note. **This cycle
deliberately stops at the durable layer.**

## Decisions

### 1. Migrate in place, don't replace

`recipientId`/`recipientName` stay on the schema (the admin bell's hot
query — `Notification.js:60-69`'s own comment — depends on
`recipientName` today, and rewriting every EJS view in the same cycle as
the data-model migration is unnecessary risk). Add `recipientType`
(`'employee' | 'client'`), `recipientAdmin` (ref `AdminUser`, replaces the
never-actually-populated `recipientId` going forward), and
`recipientClient` (ref `ClientUser`, brand new). Every notification
created from this cycle forward populates both the legacy display fields
*and* the new identity fields — old rows stay exactly as they were
(`recipientAdmin`/`recipientType` simply absent on them, which every new
query treats as "not addressable by identity," never as an error).

### 2. `type`, not `eventType`

The module doc's "Recommended fields" list suggests `eventType`. The
existing field is `type`, already indexed, already has 20 enum values
across 4 prior cycles, and is read throughout the admin views. Renaming it
mid-migration is a purely cosmetic breaking change for zero behavioral
gain — kept as `type`, documented here as a deliberate, named deviation
from the doc's suggested (not mandated) field name.

### 3. No `relatedWorkspace` field

Every `CaseWorkspace` today is 1:1 with its `ClientCase`
(`workspaceType: 'primary'`, enforced by a unique index since Cycle 2) —
`relatedCase` already resolves the workspace via one lookup everywhere a
notification is rendered. Adding a second, always-derivable reference
field would be dead weight the day it's written. Skipped; revisit only if
a case ever legitimately has more than one workspace.

### 4. `dedupeKey` — a real mechanism, applied where duplication is real

A unique, sparse (`partialFilterExpression: { dedupeKey: { $type: 'string' } }`)
index on `dedupeKey`. Most trigger points in this codebase are already
naturally idempotent one level up (e.g., Cycle 6's `createMessage`
short-circuits entirely on a repeated `idempotencyKey` before mention
resolution ever runs notify again) — `dedupeKey` isn't needed there and
isn't forced onto call sites that don't need it. It's applied to the two
places a genuine double-fire is realistic: the digest email job (§9,
re-run protection: `digest:<recipientType>:<recipientId>:<yyyy-mm-dd>`)
and `document_request_overdue` (a reminder that could plausibly be
triggered more than once for the same request on the same day by a
future scheduled job).

### 5. `emailState` — tracked, not gated, for the "immediate" tiers

`'not_applicable' | 'pending' | 'sent' | 'skipped_no_key' | 'skipped_preference' | 'failed'`.
Every notification row records what happened to its email side-effect (or
that it never had one), matching the existing `documentEmail.js`/
`interactionEmail.js` "log and continue, never throw" pattern — this is
observability, not a new failure mode.

### 6. Client-facing notification events — a bounded, real-trigger-point list

Every new client-facing `type` added this cycle parallels an **email path
that already exists** from a prior cycle (Cycles 2/3/5/6) — this is
"give the client an in-app view of something we already tell them by
email," not new business logic:

| New type | Existing email (already shipped) | Trigger |
|---|---|---|
| `query_scheduled` | `sendScheduledEmail` (Cycle 3) | `interactionService.scheduleInteraction` |
| `query_answered` | `sendAnsweredEmail` (Cycle 3) | `interactionService.answerInteraction` |
| `query_clarification_requested` | `sendClarificationEmail` (Cycle 3) | `interactionService.requestClarification` |
| `query_cancelled` | `sendCancelledEmail` (Cycle 3) | `interactionService.cancelInteraction` |
| `document_requested` | `sendDocumentRequestCreatedEmail` (Cycle 5) | `documentRequestService.createRequest` |
| `document_request_updated` | `sendDocumentRequestDueDateChangedEmail` (Cycle 5) | `documentRequestService.changeDueDate` |
| `document_request_cancelled` | `sendDocumentRequestCancelledEmail` (Cycle 5) | `documentRequestService.cancelRequest` |
| `document_accepted` | `sendDocumentAcceptedEmail` (Cycle 5) | `documentReviewService.reviewDocument` |
| `document_replacement_requested` | `sendReplacementRequestedEmail`/`sendDocumentRejectedEmail` (Cycle 5) | `documentReviewService.reviewDocument` |

Two existing message types gain a **client-eligible recipient path**
rather than new enum values: `message_mention` (a client mentioned by an
employee already gets an email via `collaborationEmail.js` — Cycle 6 just
never wrote the in-app row) and `message_reply` (an employee replying to
a client's own message currently notifies **nobody** — ADR-005 §22 scoped
replies to "employee-only, in-app," which silently meant a client never
found out their own message got a reply at all; closed this cycle, in-app
only, no new email — see §7).

**Deliberately not added:** a generic "new message" notification for
every top-level message (ADR-005 §18's scope boundary stands — mention
and reply-to-your-message remain the only message-derived notification
triggers; this cycle extends *who* those two reach, not *when* they
fire). Portal invitation and case-assignment events stay employee/
pre-activation-only exactly as today — a client who hasn't activated a
portal account yet has no recipient identity to notify in-app.

### 7. Email policy: immediate stays immediate, nothing new goes to digest

Per the module doc's own policy table, invitations, schedule changes, and
replacement requests are "immediate," not preference-gated — those four
`*Email.js` adapters are untouched this cycle, they already fire
immediately and unconditionally. The only *new* preference surface is
`mentionEmails` (opt out of the existing immediate mention email — both
directions) and `digestEmails` (§9). Reply-to-your-message intentionally
gets **no email**, matching the module's "do not send an email for every
message by default" instruction — it's surfaced only via the new in-app
notification and the digest.

### 8. `NotificationPreference` — minimal, not a full per-event matrix

One document per recipient (`recipientType` + `recipientAdmin`/
`recipientClient`, unique together), three fields:
`mentionEmails: boolean` (default `true`), `digestEmails: boolean`
(default `true`), `digestFrequency: 'daily' | 'weekly' | 'off'` (default
`'daily'`). A row is created lazily on first read (`findOrDefault`
pattern) rather than backfilled for every existing user — nobody has
opted out of anything that didn't exist before this cycle.

A full per-event-type preference matrix (as the module doc's phrasing
could be read to imply) is deliberately not built: only two things are
ever conditionally sent by policy (§7) — a matrix controlling toggles
that don't gate anything would be dead configuration. Extend this model,
don't replace it, if a future cycle adds more conditional email tiers.

### 9. Digest — a real, idempotent, dry-run-capable script; not a cron job

`server/scripts/sendNotificationDigests.js`, following the exact shape of
`provisionChannels.js`/`reconcileDocumentStorage.js`: dry-run by default,
`--apply` to actually send, two independent passes:

- **Digest pass** — for every recipient (admin or client) with
  `digestEmails !== false` and at least one unread notification with
  `emailState: 'not_applicable'` older than 1 hour (avoids double-covering
  something the immediate-email tiers just sent), sends one summary email
  and flips those specific notifications' `emailState` to `'sent'`. This
  is the actual idempotency mechanism for the digest — not `dedupeKey`,
  which can't be reused across many sibling documents under a unique
  index. Re-running the same day naturally covers zero already-flipped
  rows (`emailState` no longer matches the selection filter), so it's a
  no-op without any extra bookkeeping.
- **Overdue-reminder pass** — every open `DocumentRequest` past its
  `dueDate` gets exactly one `document_request_overdue` notification per
  calendar day, guarded by the genuine per-document `dedupeKey` (unique
  index) described in §4 — `overdue:<requestId>:<yyyy-mm-dd>` — since this
  *is* a one-notification-per-trigger case, unlike the digest's many-
  notifications-per-run case above. This is also this cycle's first real
  caller of the `document_request_overdue` enum value, which existed
  since Cycle 5 but was never wired to anything.

No OS-level scheduler is installed or assumed; wiring either pass to
cron/PM2 is a deployment decision, called out as an open item in
`IMPLEMENTATION_STATUS.md` exactly like every previous cycle's deferred
production-automation step (e.g. the Cycle 5 index rollout).

**Client-authored mention-of-employee email stays deferred.** Only
`collaborationEmail.js` (server, employee-authored → client) sends a
mention email today; the symmetric client-authored → employee path
(`src/lib/collaboration/message-service.ts`) would need a second Resend
adapter living in the Next.js app for purely-internal recipients — real,
separable work, not a one-line addition. The new in-app notification
(§6) plus the digest partially close this gap without it; the remaining
asymmetry is recorded as a known limitation, not silently left
inconsistent.

### 10. Portal notification bell — new UI, same shape as the admin one

Admin's topbar bell (`routes/admin/index.js:168-183`) is the reference
pattern: unread count + latest 8, computed on every page load via
`res.locals`. The portal gets the equivalent: a server component reads
unread count + recent notifications once per request from
`notificationService.ts`, rendered in the portal shell. No polling, no
client-side fetch loop — this is exactly the kind of always-fresh,
server-rendered data Cycle 7 should ship, and precisely what a future
Socket.IO layer would make *live* rather than *per-navigation* without
changing the underlying read path (§11).

### 11. Real-time architecture — documented as Target, not built

Recorded here so a future cycle has a concrete starting point instead of
a blank page, per the module doc's own "Real-time architecture" section:

- Socket.IO attached to the existing Express `server/app.js`, authenticated
  from the same session cookie HTTP already uses (no parallel auth system).
- Rooms keyed by `channel:<channelId>` and `recipient:<type>:<id>`, joined
  only after the same `collaborationPolicy`/`collaboration-policy.ts`
  checks this cycle's HTTP routes already run — never trusting a
  client-supplied room name.
- Every emission happens **after** the durable write (message insert,
  notification insert) commits — never before. A dropped socket event is
  recoverable by the client simply re-fetching the HTTP endpoint it
  already polls/loads from; the socket is a push hint, not a source of
  truth.
- Multi-instance requirement: a shared adapter (Redis pub/sub is the
  standard Socket.IO choice) is **required** the moment this app runs on
  more than one Node process/PM2 instance behind nginx — the current
  single-VPS/single-instance PM2 topology (`DEPLOYMENT.md` Part 1) doesn't
  need it yet, but the adapter must be chosen *before* any horizontal
  scaling, not retrofitted after a bug report about missed events on
  instance B.
- None of the above is implemented this cycle. `HTTP` and the database
  remain fully authoritative; every acceptance criterion in the module
  doc that depends on this ("real-time events mirror durable records")
  is trivially true today because there are no real-time events yet.

## Consequences

- Every one of the 15 existing `notify()`/`notifyMany()` call sites is
  migrated to pass a real `recipientAdmin` id (all 15 already had one in
  scope — `AdminUser`/`Task.assignee`/`Consultation.owner`/
  `Consultation.assignees[].user` documents, never only a display string)
  alongside the unchanged `recipientName`, so the admin bell's existing
  query keeps working unmodified while every new notification is also
  addressable by identity.
- Clients get real in-app notifications for the first time — a genuinely
  new capability, not a refactor.
- No behavior change to email delivery for the four "immediate" tiers.
- No sockets, no presence, no live push — same explicit boundary Cycle 6
  drew for chat, now drawn for notifications, for the same underlying
  deployment-readiness reason.
