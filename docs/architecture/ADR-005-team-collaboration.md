# ADR-005 — Team Collaboration and Chat

**Status:** Accepted
**Date:** 2026-08-04
**Module:** `06_TEAM_COLLABORATION_AND_CHAT.md` (Cycle 6)

## Context

Cycle 6 introduces a durable, case-scoped messaging system —
`WorkspaceChannel`, `ChannelMember`, `WorkspaceMessage`, `MessageRevision`,
`ChannelReadState` — layered on top of Cycle 2's workspace/membership
domain and Cycle 5's document layer for attachments. This is explicitly
**not** real-time: `07_NOTIFICATIONS_AND_REALTIME.md` owns Socket.IO,
presence, and the notification-recipient-identity migration. Every
decision here optimizes for "durable and correct first," matching the
module's own handoff instruction: "Do not add sockets until all
database-backed APIs and access tests pass."

## Decisions

### 1. Model ownership across Express and Next.js

Dual writer, same shape as ADR-003 (interactions) and ADR-004 (documents):
clients send/edit/delete their own messages and mark channels read from
the portal; employees do the same plus create/manage/archive channels,
manage restricted membership, and moderate from the admin. Field-ownership
boundary, not a proxy — each app only ever writes the fields it owns.

### 2. Explicit collection names

```text
WorkspaceChannel -> workspace_channels
ChannelMember    -> channel_members
WorkspaceMessage -> workspace_messages
MessageRevision  -> message_revisions
ChannelReadState -> channel_read_states
```

Continuing ADR-002 §3's explicit-third-argument convention.

### 3. Cross-application schema-contract strategy

`docs/architecture/collaboration-schema-contract.json`, loaded by
`server/test/collaboration-schema-contract.test.js` and
`test/collaboration-schema-contract.test.ts` — same JSON-fixture mechanism
as every prior cycle.

### 4. Channel visibility semantics

Four values, checked server-side on every read and write, never inferred
from channel name or type: `all_members`, `clients_and_team`,
`employees_only`, `restricted_members`. `all_members` and
`clients_and_team` are functionally identical this cycle (both apps'
policy code treats them as "any active workspace member, client or
employee, may view") — kept as two distinct enum values per the module's
own instruction ("keep the semantic distinction for future workspace
member types") rather than collapsing them, since a future member type
(e.g. a referring attorney, a co-client) could split that equivalence
later without a schema migration.

### 5. Workspace versus restricted-channel membership

Two authorization layers, not one: active `WorkspaceMember` is required
for every channel regardless of type (the case-level boundary, per §6 of
the module doc — "a case workspace remains the primary row-level
authorization boundary"); an active `ChannelMember` is **additionally**
required only for `restricted_members` channels. A workspace member who
is not a `ChannelMember` of a restricted channel sees the channel does
not exist for them — same "identical response for denied and
nonexistent" rule as every prior cycle's policy.

### 6. Client-visible and internal-only separation

Enforced at the query layer, not the serializer layer: every client-facing
list/read query filters `visibility: { $in: ['all_members', 'clients_and_team'] }`
(plus an explicit `ChannelMember` check for any `restricted_members`
channel a client happens to belong to) **before** any document reaches
application code — an `employees_only` channel's documents are never
fetched for a client request in the first place, so there is no
serializer that could accidentally leak one field of one.

### 7. Message storage format

Plain text only this release. `body` is stored verbatim (trimmed,
line-endings normalized to `\n`, length-capped), never as
browser-rendered HTML, and is escaped at render time by each framework's
existing default (JSX auto-escapes; EJS's `<%= %>` auto-escapes) — the
same mechanism that already protects lead names/notes elsewhere in this
codebase, not a new one. No markdown, no rich formatting, no autolinking.
This is a deliberate scope reduction: the module doc allows "optional
minimal safe formatting only when backed by a maintained sanitizer," and
no sanitizer library is installed or justified by an actual product
requirement yet (YAGNI) — introducing one now would be speculative ahead
of a real need, and plain text with escaping is already a complete,
secure answer to "do not accept raw HTML."

### 8. Safe formatting strategy

Covered by §7 — there is no formatting layer to secure because there is
no formatting. If rich text is ever required, it is a new cycle's
decision (a sanitizer choice, a storage-format change, and a
render-layer change in both apps), not a retrofit onto this ADR.

### 9. Thread representation

One level only, exactly as the module specifies: a top-level message has
`parentMessage: null, threadRoot: null`; a reply has `parentMessage` set
to the message it replies to and `threadRoot` set to the top-level
message that thread belongs to. A reply that targets another reply is
**normalized to the thread root** — the service layer rewrites
`parentMessage` to `threadRoot`'s value before persisting, so `threadRoot`
is always a genuine top-level message and no reply is ever more than one
level deep. This is simpler and more predictable for clients to render
than rejecting the request outright, and matches how Slack/Teams-style
"reply in thread" UIs actually behave (every reply lands in the same flat
thread under the original message, regardless of which reply the user
visually clicked "reply" on).

### 10. Mention representation — explicit selection, not free-text parsing

A mention is `{ memberType, clientUser | adminUser, workspaceMember,
displayNameSnapshot }` — an immutable reference plus a point-in-time name
snapshot, per the module's own field list. Critically, **the client
composer submits an explicit array of `workspaceMember` IDs it wants to
mention** (selected from a server-provided, already-authorized-and-
filtered autocomplete list), rather than the server parsing `@name` text
out of the message body. Chosen over free-text parsing because: (a) name
matching is inherently ambiguous (two members can share a first name;
display names can contain characters that collide with message
punctuation); (b) parsing user-supplied text to determine authorization
targets is exactly the kind of "trust the input, derive a decision from
it" pattern this codebase's own conventions avoid (actors are always
derived from a verified session, never from a string in the request); (c)
it makes "a client cannot discover a hidden employee's name by guessing
it in `@` syntax" trivially true by construction, rather than something a
parser has to get right. The server independently re-validates every
submitted `workspaceMember` ID against current active
membership/channel-access before accepting it as a real mention — the
client's selection is a request, never an authorization.

### 11. Attachment integration with Cycle 05 documents

A message attachment is `{ document, documentVersion, displayNameSnapshot }`
— `documentVersion` is the version that was **current at the moment the
message was sent**, snapshotted rather than re-resolved later, so a
message's attachment always shows what the sender actually shared even if
the document is replaced afterward. No new upload pipeline, no new
storage code, no new download route: the message API returns only
`{ documentId, versionId, displayName }` (never a storage key), and the
client hits the exact same authorized download routes Cycle 5 already
built (`GET /portal/documents/:id/download`,
`GET /admin/documents/:id/versions/:versionId/download`), which
independently re-check live authorization on every request — satisfying
the module's explicit requirement that "attachment authorization is
re-evaluated at download time" for free, by reuse rather than
duplication.

### 12. Read-state strategy

`ChannelReadState` stores `lastReadMessage` (the message ID) **and**
`lastReadAt`, where `lastReadAt` is set to that message's own `createdAt`
— not "now." This makes the unread-count query a single indexed range
scan (`createdAt: { $gt: lastReadAt }`) without a second lookup to
resolve `lastReadMessage` into a timestamp first. A monotonic-update guard
(`lastReadAt: { $lt: newLastReadAt }` in the update filter) prevents an
out-of-order request from ever moving the read marker backward — module
doc §20's explicit requirement.

### 13. Unread-count calculation

`count = messages in this channel with createdAt > lastReadAt (or all, if
no read state exists) AND deletedAt = null AND senderClient/senderAdmin
!= the requesting member's own identity`. Own messages are excluded from
your own unread count by default (module doc's suggested default,
explicitly chosen and documented rather than left ambiguous) — sending a
message should not make the channel look unread to yourself. Deleted
messages never count (a soft-deleted message becomes a placeholder, not
new unread content). Employee-only and unauthorized-restricted channels
are excluded from a client's total by construction, since the same
visibility-filtered channel list (§6) is what unread totals are computed
over — there is no separate code path that could leak a channel into the
count without also leaking it into the list.

### 14. Editing and deletion behavior

`optimisticConcurrency: true` on `WorkspaceMessageSchema` (the real
mechanism established in ADR-003 §2, not the non-functional default
`__v`) — an edit against a stale copy fails with a controlled `409`
rather than silently overwriting a concurrent edit or a concurrent
moderation action. Soft deletion only: `deletedAt`/`deletedByType`/
`deletedByClient`/`deletedByAdmin`/`deletionReason` are set, `body` is
left in place in the database but every render path (both apps' message
serializers) substitutes a fixed placeholder string for any message with
`deletedAt` set — the original body is never returned to a normal read,
only preserved for the append-only `MessageRevision` trail (visible to
authorized employees only, per the module's own restriction).

### 15. Audit-history strategy

`MessageRevision` is genuinely append-only — no route in either app
updates or deletes a revision row. Every edit and every
deletion/restoration creates exactly one revision capturing
before/after `body`/`attachments`/`mentions`. A no-op edit (resubmitting
identical content) creates no revision — matches the module's explicit
"do not create a revision when nothing changed."

### 16. Message pagination strategy

Cursor-based on `(createdAt, _id)`, descending, bounded page size (50 max,
matching the conservative cap used elsewhere in this codebase, e.g.
`server/routes/admin/cases.js`'s `MAX_PAGE_LIMIT`). Cursor is a
base64-encoded `{createdAt, _id}` pair, validated and rejected (not
silently ignored) if malformed. No offset pagination for message
history, ever — module doc's explicit instruction, and offset pagination
against a live-growing collection is well-known to skip/duplicate rows
under concurrent writes, which a chat feed cannot tolerate. Replies
paginate with the identical mechanism, scoped by `threadRoot` instead of
`channel`.

### 17. Notification behavior

Reuses the existing `Notification` model/`notify()` utility and
`RESEND_API_KEY`-gated email pattern exactly as Cycles 2/3/5 did — no new
notification subsystem, no migration to immutable recipient identities
(that is explicitly Cycle 7's job per `07_NOTIFICATIONS_AND_REALTIME.md`
§"Notification model evolution"). New in-app notification types:
`message_mention`, `message_reply`. Notifies only: the mentioned member
(once per message, deduplicated), and the parent message's author when
someone replies to their message (unless they are the replier). Never
notifies: the sender of their own message, every channel member for a
routine message, a removed member, or a client about anything in an
employee-only channel. No routine-message email; mentions may email
through the existing infrastructure when `RESEND_API_KEY` is configured
(same fail-open-to-logging behavior as every other email in this
codebase).

### 18. System-message behavior

`senderType: 'system'` messages are generated by a small, explicit set of
existing service-layer call sites — **not** a generic "listen to
everything" event bus, and **not** a backfill of every historical event
(module doc: "Do not rebuild previous modules merely to emit all
historical events. Integrate only new events going forward"). This cycle
wires exactly four real integration points, chosen for genuine
case-timeline value: workspace member added (`caseManagement.js`),
document uploaded/accepted/replacement-requested (`documentUploadService.js`/
`documentReviewService.js`), and case stage changed (`caseManagement.js`).
Every system message carries an explicit `clientVisible` boolean decided
at creation time by the emitting code, never inferred from the target
channel later — an internal event can never accidentally land
client-visible just because it happened to be posted to a
`clients_and_team` channel. The remaining events the module doc lists as
examples (consultation scheduled/answered, deadline changed, filing
completed, etc.) are deliberately **not** wired this cycle — documented
as an open item, not silently dropped.

### 19. Idempotency and optimistic concurrency

Message creation: client-generated `idempotencyKey` (a `crypto.randomUUID()`
minted once per compose action, resent unchanged on any client-side
retry), enforced by a unique partial index scoped to
`(channel, senderClient/senderAdmin, idempotencyKey)` — a duplicate
request returns the original message, never creates a second one.
Replies: same mechanism (a reply is a `WorkspaceMessage` too). Editing:
`optimisticConcurrency` (§14). Read state: monotonic update guard (§12).
Thread reply counters: atomic `$inc`/`$set` via a single
`findOneAndUpdate` on the thread root, never read-modify-save — the exact
race the module doc warns about. Channel reorder: the same two-phase
negative-then-positive order-update technique ADR-004 §"Category
provisioning" already established for `DocumentCategory`, reused verbatim
for `WorkspaceChannel`.

### 20. Default-channel provisioning

Six default channels (General, Case Updates, Documents, Petition Strategy,
Recommendation Letters, USCIS Forms), stable `templateKey`-driven,
idempotent — identical shape to ADR-004 §18's document-category
provisioning, reusing the same "find existing template keys, insert only
what's missing" pattern. Hooked into `caseConversion.js` immediately after
document-category provisioning, inside the same transaction. Visibility
defaults (documented per the module's own table):

| Channel | Type | Visibility |
|---|---|---|
| General | `standard` | `clients_and_team` |
| Case Updates | `updates` | `clients_and_team` |
| Documents | `documents` | `clients_and_team` |
| Petition Strategy | `internal` | `employees_only` |
| Recommendation Letters | `standard` | `employees_only` |
| USCIS Forms | `standard` | `clients_and_team` |

**Recommendation Letters is `employees_only`**, not `clients_and_team` —
the module doc left this open ("based on documented product policy").
Chosen because recommendation-letter *drafting* discussion (who to ask,
draft language, timing) is exactly the kind of internal strategy
conversation the module doc elsewhere says must not automatically reach
clients; the finished letters themselves are already client-visible
through Cycle 5's `recommendation_letters` document category (also
`client_visible`, per ADR-004's default template), so no client-facing
capability is lost — only the internal drafting chatter is kept internal.

### 21. Existing-case provisioning

Same shape as ADR-004 §19: an idempotent admin action plus a
dry-run-by-default script (`server/scripts/provisionChannels.js`),
reporting what would be created before anything is written, never run
against production this cycle.

### 22. Future real-time compatibility

Every message is durable in MongoDB before any notification fires — the
database is the source of truth, exactly as `07_NOTIFICATIONS_AND_REALTIME.md`
requires of whatever eventually consumes these writes over a socket. No
field or index in this cycle assumes an in-memory broadcast layer exists;
a future Socket.IO layer can emit "a message was created" purely by
re-reading what this cycle already persists, with room authorization
re-derived from the same `canViewChannel`/`ChannelMember` checks this
cycle's HTTP routes already use — recorded here so that future cycle
doesn't need to redesign the access model, only add a transport on top of
it.

### 23. Multi-instance considerations

Rate limiting for message/reply/edit/channel-creation stays
process-local (the same, already-carried-forward deployment blocker from
every prior cycle) — not resolved here, not silently forgotten either.
Nothing else in this cycle assumes single-instance affinity: all state is
in MongoDB, no in-memory channel/message cache exists.

### 24. Retention and moderation considerations

No automatic message retention/expiry this cycle — messages and their
`MessageRevision` history persist indefinitely, matching this codebase's
existing "prefer archive over delete" business rule (CLAUDE.md's
Business Rules section). Moderation (`messages.moderate`) is a
capability, not a role — granted per the conservative matrix (§22 of the
module doc), letting a manager remove inappropriate content without
being able to silently rewrite history (the revision it creates is still
permanent and visible to authorized employees).

### 25. Why real-time transport remains deferred to Cycle 07

`07_NOTIFICATIONS_AND_REALTIME.md` explicitly owns Socket.IO, and its own
handoff instruction is to migrate notifications to immutable recipient
identities *first*, then add sockets only after reviewing "reverse proxy,
shared sessions, and multi-instance deployment" — none of which have been
evaluated for this deployment yet (`DEPLOYMENT.md`'s own topology is
still single-VPS/PM2/nginx with no documented WebSocket-proxying
configuration). Building a transport layer ahead of that review would be
exactly the kind of "solve a problem that hasn't been scoped yet" this
project's engineering philosophy rejects. This cycle's job — per its own
module doc's Claude Code handoff — is to make every database-backed API
and access-control test pass first; that is what "before real-time
delivery is added" in the module's acceptance criteria means.

## Consequences

- Five new mirrored models across both apps, one new shared JSON contract
  fixture — consistent with, not a departure from, every prior cycle's
  cost/benefit tradeoff.
- This is the first domain with genuine two-level access control on a
  single resource type (workspace membership *and*, conditionally,
  channel membership) — `collaborationPolicy.js`/`collaboration-policy.ts`
  must be the single place both checks are composed; a future route that
  checks workspace membership alone without going through it would
  silently reopen restricted channels to every workspace member.
- Attachments create a real, permanent cross-domain dependency: Cycle 6
  cannot ship without Cycle 5's document models/policy already being
  correct, and a future change to document visibility/quarantine
  semantics must be re-checked against message-attachment rendering, not
  just the document center.
- System-message integration is intentionally partial (§18) — a future
  cycle wiring the remaining event types should extend the same
  `emitSystemMessage()` entry point rather than inventing a second one.
