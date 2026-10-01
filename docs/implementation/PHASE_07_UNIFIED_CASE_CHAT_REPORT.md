# Phase 07 — Unified Client–Employee Case Chat: Completion Report

**Branch:** `architecture/angular-enterprise-platform`
**Authority:** `ADR-020-canonical-staff-communications-and-collaboration.md`, `PHASE_07_COMMUNICATIONS_COLLABORATION_PROMPT.md`

## Commits

- **Starting SHA:** `9de7b51cc6ddd410d714d66809e37824ede5415b` (documentation only — no Phase 07 code existed locally or on any branch; the work was implemented from scratch in this session)
- **Implementation commits:**
  - `0cf408c` feat(api): expose unified case chat on the canonical staff API
  - `75c7435` feat(portal): complete the client case chat experience
  - `6fda552` feat(angular): add employee case chat workspace
- **Ending SHA / CI:** see [Final status](#final-status) at the bottom (filled in after the push, from the real run).

## Shared chat architecture

One conversation domain, two writers, no new collections:

```text
Client portal (Next.js)  ──►  WorkspaceChannel / WorkspaceMessage / ChannelReadState  ◄──  Angular staff (via /api/v1/staff)
```

Both sides reuse the existing `messageService` / `channelService` / `readStateService` (Express) and their TS mirror (`src/lib/collaboration/message-service.ts`). `collaborationPolicy` stays the authority for employees; `getAccessibleChannel` for clients. Sessions stay separate (`ClientSession` vs `EmployeeSession`).

Shared behaviour added to the existing services (both mirrors):

- **Incremental sync cursor** — `changedFilter` in `messageCursor.js` / `message-cursor.ts`, ascending on `(updatedAt, _id)`. New index `{ channel, updatedAt, _id }` on both model copies.
- **Optimistic concurrency across requests** — `editMessage({ expectedUpdatedAt })`; a stale edit returns `conflict` (409) instead of overwriting.
- **Attachment audience rule** — `canAttachDocument(channel, document, { clientAudience })` and `channelHasClientAudience()`. A `restricted_members` channel is client-readable when a client holds an active `ChannelMember` row, so internal documents are refused there too. Archived and rejected documents are refused as well as quarantined.
- `editRule` / `deleteRule` exported from the policy as synchronous rules, so a message list computes per-message flags with one channel-access query instead of one per row. `canEditMessage` / `canDeleteMessage` are now those rules plus channel access.

## Staff API (`/api/v1/staff`, `server/routes/api/v1/staff/chat.js`)

```text
GET    /cases/:caseId/channels                 channels + audience + unread + canSend
POST   /cases/:caseId/channels/initialize      idempotent default provisioning
POST   /cases/:caseId/channels                 create
POST   /cases/:caseId/channels/reorder
GET    /channels/:channelId                    + canManage / canManageMembers
PATCH  /channels/:channelId
POST   /channels/:channelId/archive
GET    /channels/:channelId/members            mention / restricted roster
POST   /channels/:channelId/members
DELETE /channels/:channelId/members/:channelMemberId
GET    /channels/:channelId/messages           newest page, cursor paginated
GET    /channels/:channelId/messages/newer     incremental sync (?since=)
POST   /channels/:channelId/messages           idempotencyKey required
GET    /channels/:channelId/threads/:messageId
POST   /messages/:messageId/replies            idempotencyKey required
PATCH  /messages/:messageId                    expectedUpdatedAt → 409 when stale
POST   /messages/:messageId/delete             soft delete; there is no hard-delete route
POST   /messages/:messageId/restore            messages.moderate
POST   /channels/:channelId/read
GET    /channels/:channelId/attachable-documents
POST   /channels/:channelId/attachments        multipart `file`
```

Documented in `server/openapi/v1.yaml` (multipart upload included). Mutations pass `trustedOriginMiddleware`; capability + row policy are checked per route; every "not yours" outcome is one identical `404`.

Two supporting changes: the multipart parser moved from `documents.js` into `middleware/api/documentUpload.js` (shared by both uploads), and `hasActiveRestrictedChannelMembership` / `isOwnEmployeeMessage` now also resolve identity from `req.staff` — previously restricted-channel membership could never be true for a staff-API caller.

## Client portal

- `GET /api/portal/channels/:id/messages` — history (`?before=`) and incremental sync (`?since=`), session-gated.
- `POST /api/portal/channels/:id/attachments` — direct multipart attach.
- `POST …/messages` and `…/replies` — higher rate ceiling for chat (30/min), replies now accept `attachments`.
- `POST …/edit` accepts `expectedUpdatedAt`.
- `src/lib/collaboration/chat-queries.ts` — client read model / DTO (`ClientChatMessage`).
- `src/components/portal/chat-panel.tsx` — one client component for channel and thread: polling, load-earlier, send, retry, attach, existing-document picker, edit, delete, unread/read, download links, error/retry banner. Case page shows an unread badge on the Chat card.
- The old `message-composer` / `message-actions` components were removed (replaced by `ChatPanel`).

**Pre-existing leak closed:** client channel/thread pages queried messages without `clientVisible: { $ne: false }`, so a staff-only system message (e.g. "Strategy.docx was uploaded") posted into the client-visible Documents channel reached clients. All client chat queries now exclude it, and `getAccessibleMessage` refuses such a row (so it cannot be replied to by guessed id).

**Pre-existing hole closed:** the portal's `resolveAttachments` only enforced client-visible documents in `all_members` / `clients_and_team` channels; a client inside a restricted channel could attach an internal document by id. The sender is always a client there, so it now always requires `client_visible`.

## Angular staff chat

`enterprise-ui/.../case-detail/chat-tab/` — a **Chat** tab on the case workspace: channel list with text audience labels (`CLIENT + TEAM`, `STAFF ONLY`, `RESTRICTED`) and unread badges, timeline, load earlier, thread side-panel, composer with a visible "client can read this" notice on client-visible channels, Attach file, existing-document picker, send/retry, edit/delete/restore by capability flags from the server, secure download via the Phase 06 route, loading/empty/error/reconnect states, responsive single-column layout below 900px. `chat-state.ts` holds the pure merge / ordering / backoff helpers.

## Near-real-time synchronization

Bounded polling — no new infrastructure.

- Every 4 s while the tab is visible (hidden tab: the loop idles; returning to the tab triggers an immediate pull).
- `…/messages/newer?since=<cursor>` returns only messages created **or changed** (edits, soft deletes, reply-count bumps) after the cursor, ascending `(updatedAt, id)`, drained while `hasMore` (bounded to 5 passes).
- Exponential backoff per consecutive failure (4 s → 60 s cap); after 3 failures a banner with a manual **Retry**.
- Merge is by message id and an older copy never overwrites a newer one, so a send echo plus the next poll never duplicates a message.
- The staff channel list also refreshes every 20 s for other channels' unread badges.
- A malformed cursor behaves as "from the start", never a 500.

## Direct chat upload architecture

Chosen pattern: **upload first, then send by reference** (not a combined multipart endpoint).

```text
composer → POST …/attachments (authz → size/ext/magic-byte validation → private storage → CaseDocument + DocumentVersion)
        → returns { documentId, displayName, mimeType, extension, size }   (never storageKey / path)
        → POST …/messages { attachments:[documentId], idempotencyKey }     (server re-checks same case, state, audience)
```

- **Chat Attachments category decision:** a normal per-case `DocumentCategory` with `templateKey: chat_attachments`, `client_visible`, uploaders `both`, not required evidence. It is **provisioned lazily on first chat upload** (`ensureChatAttachmentsCategory`, idempotent, race-safe via the unique index) rather than added to `DEFAULT_CATEGORY_TEMPLATE`, so existing cases need no backfill and the template contract fixtures are unchanged.
- **Staff-only channels:** `uploadDocument` accepts an optional `visibility` that can only *narrow* to `employees_only`, so a staff-only upload is a staff-only document inside the shared category. A document's visibility is never changed by a message referencing it.
- **Failure design:** if the message send fails after the upload, the UI keeps the stored document chip and the draft; **Send** retries with the same idempotency key. Retrying the upload of identical bytes returns the actor's already-stored document (`reused: true`) instead of a duplicate; a duplicate owned by someone else gets a generic 409 so it cannot confirm another party's file. Quarantined results are refused (422). Temp files are removed on every failure path (asserted in tests).
- The portal and staff code are mirrors, as for every other cross-app service in this repo.

## Idempotency

Sends and replies require `idempotencyKey` on the staff API (400 without). One deliberate send = one key (`crypto.randomUUID()` per compose intent), kept across failures, rotated on success. The existing unique `(channel, idempotencyKey)` index plus the service's duplicate-key recovery handles concurrent retries. Replays return `200` with the original message.

## Threads / edit / delete / moderation / read state

- One-level threads (reply to a reply normalised to the root), unchanged service behaviour; both UIs show the same model.
- Edit own within the existing 24 h window; moderators may edit any. Every edit records a `MessageRevision`; no-op edits record nothing.
- Delete is soft; thread continuity preserved; deleted rows show a fixed placeholder and drop attachments/mentions. Restore needs `messages.moderate`. No hard-delete endpoint.
- Read state: `ChannelReadState` stays authoritative; own sends never count as unread; marking read is monotonic; hidden channels never contribute names or counts.

## Notification / email behaviour

Unchanged by design (ADR-020 §18: no second engine). Existing behaviour stays: mention notifications (in-app, plus email for clients) and reply notifications to the parent's author, all best-effort and never rolling back a persisted message. **There is no routine "new message" notification in either direction** — that was already the case and adding one needs a new notification type, which touches the mirrored notification contract; deferred (see limitations). Unread badges are the notification surface for new messages.

## Authorization and DTO boundaries

- Employee: capability **and** row policy (active workspace membership, plus `ChannelMember` for restricted channels; `channels.view_all` bypass only for super_admin/admin). A removed member loses access on the next request.
- Client: active client session + active workspace membership + visibility / restricted membership, re-derived on every call.
- Missing, malformed, hidden, restricted-without-membership, other-case and other-client targets all return the same 404 (asserted for read, send and upload).
- Staff DTO fields: id, sender type/name, `isOwn`, body, thread ids, reply count, mentions, attachments (id, name, mime, extension, size, downloadable), edited/deleted/created/updated, `canEdit` / `canDelete` / `canRestore`. Client DTO is a separate contract with no employee ids or role data. Neither carries `storageKey`, checksum, idempotency key, deletion reason, `senderAdmin` or `senderClient` (asserted by serialising responses).
- Attachment downloads stay on the secure routes and keep `DocumentAccessLog`; the client route re-authorizes per request.
- CSRF/Origin, session handling and capability checks are unchanged. One deliberate change: the staff **login** limiter now reads `LOGIN_RATE_LIMIT` (default still 10), the same knob the admin login already used — needed so tests that sign in several staff users are not throttled.

## Automated test coverage

- `server/test/integration/staff-chat.integration.test.js` — **23 tests**: client↔staff round trip, thread normalisation, idempotent retry, missing key, concealment (hidden / unknown / malformed / no-membership), removed member, restricted membership, audience labels + unread semantics, per-capability denial, untrusted origin, DTO leak scan, edit + revision + stale 409, soft-delete/restore thread continuity, incremental sync (new + edit + delete, dedupe, malformed cursor), cursor paging, direct upload + category + retry reuse, staff-only upload isolation, internal doc refused in client-visible and restricted-with-client channels, cross-case refusal, magic-byte rejection with no leftovers, upload into hidden channel, idempotent initialize, read state.
- `test/portal-chat.integration.test.ts` — **18 tests** driving the real portal route handlers with employee-side rows written the way Express writes them: round trip, DTO leak scan, sync, paging, concealment for read/send/upload, restricted membership, removed member, staff-only system message hidden (list, sync, reply probe), auth + cross-origin, double-send, edit/stale 409/soft delete, cannot edit/delete employee message, unread + mark-read, direct upload end to end including secure download (member 200, stranger 404), validation failures with temp cleanup, internal document refused (shared + restricted), existing-document attach and cross-case refusal, attachment on a reply.
- `enterprise-ui` `chat-tab.component.spec.ts` — **10 tests** (state merge/order/backoff, audience text labels, mark-read, send + retry with the same key, dedupe on echo, incremental edit, sync-failure banner, composer hidden without `canSend`).
- Pre-existing suites updated by the shared changes all still pass.

Cross-writer note: the two apps are separate runtimes with separate Mongoose instances, so "client writes / employee reads" is proven by each suite exercising its own writer against rows shaped by the other, not by one process driving both HTTP stacks.

## Manual two-session QA

**Not performed in this session.** The environment had no browser session, and the local Next.js build is blocked on this Windows machine (Application Control denies the native SWC binary, so `next build` cannot load `next.config.ts` here; unrelated to this change). The scenarios to run before relying on this are: client sends → staff sees within ~4 s; staff replies → client sees; attach from each composer; edit/delete from each side; unread badge both sides; hide the tab and confirm polling idles; staff-only channel invisible to the client; mobile width on both.

## Migration / index impact — production impact: NONE

- One additive index: `workspace_messages { channel:1, updatedAt:1, _id:1 }` (both model copies). No data migration; the lazy category and all behaviour changes need none.
- **Do not run index builds against production as part of this phase.** The existing dry-run tooling lists the new index; applying it remains the separate deployment step (blocker 1).
- No deployment, no production migration, no production index operation occurred.

## Known limitations

- No routine "new message" notification (in-app or email) in either direction — only mentions and replies, as before.
- Polling, not push: up to ~4 s latency; backoff can reach 60 s after repeated failures.
- Message edits send body and mentions only; attachments cannot be edited after sending.
- The portal's chat rate ceilings are per-IP in-memory (30 messages/min, 15 uploads/min) — unchanged architecture; a multi-instance deployment needs the shared store the limiter already notes.
- Channel create / rename / archive / reorder / member management are exposed on the API but have no Angular UI yet (the `Chat` tab only offers "Set up chat channels" when a case has none).
- Mention picking has no UI in either composer; the API supports it.
- Staff chat has no message-revision viewer (`messages.view_revisions` is enforced nowhere new).
- Manual QA and a local Next production build were not possible here (see above); both depend on CI / a second machine.
- `package-lock.json` at the repo root had an unrelated uncommitted change (drops `firebase`) before this work started; it is deliberately not part of these commits.

## Rollback

All changes are additive or behavioural-narrowing and live on this branch only. Reverting the implementation commits restores the previous chat (the old composer/actions components return with the revert). The new index can be left in place or dropped (`db.workspace_messages.dropIndex('channel_1_updatedAt_1__id_1')`); nothing depends on it except the sync query, which degrades to a slower scan. Chat Attachments categories and documents created by users are normal case data and are retained.

## Final status

_Filled in after the push — see below._
