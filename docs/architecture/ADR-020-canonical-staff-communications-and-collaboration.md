# ADR-020 — Unified Client–Employee Case Chat and Collaboration

**Status:** Accepted for Phase 07 implementation  
**Date:** 2026-09-08  
**Branch:** `architecture/angular-enterprise-platform`  
**Phase:** Execution Phase 07 — Unified Case Chat + Collaboration  
**Phase 06 implementation baseline:** `4e344a8513716a57d7f8a97a7fefbc007fa7d024`  
**Verified Phase 06 CI:** GitHub Actions run #57 — success

---

## 1. Context

Immigration Horizons already has a real collaboration domain used by both employees and clients:

```text
CaseWorkspace
WorkspaceMember
WorkspaceChannel
ChannelMember
WorkspaceMessage
MessageRevision
ChannelReadState
```

`WorkspaceMessage` is already intentionally dual-writer: clients can send/edit/delete their own messages through the portal, while employees can send and moderate through staff tooling. Existing portal routes and pages already expose channel messages, replies/threads and read state.

The product requirement for Phase 07 is therefore not merely “staff communications.” The required outcome is a complete **two-way case chat experience between clients and the Immigration Horizons team**.

The client should be able to open a case, enter Chat, send updates/questions, reply, attach files, edit/delete their own permitted messages, see employee replies and unread state, and securely access message attachments. Employees should operate the same shared conversation from the Angular case-management application while retaining separate staff-only collaboration channels where needed.

Phase 07 must improve and canonicalize the existing domain rather than creating another chat or attachment store.

---

## 2. Decision summary

Phase 07 is primarily a **Unified Case Chat** phase.

The authoritative chat model remains:

```text
WorkspaceChannel
WorkspaceMessage
ChannelReadState
```

The same persisted conversation is rendered by:

```text
Client portal (Next.js)        <-> shared workspace messages <-> Angular staff case management
```

Phase 07 completion depends on both sides working end-to-end.

Structured `ConsultationInteraction` / Queries remain valid and must not be broken, but canonicalizing the entire query-management module is no longer the primary completion requirement of Phase 07. Query migration may be completed opportunistically only if it does not dilute the shared-chat deliverable.

No replacement collections such as these are introduced:

```text
Chat
ChatMessage
Conversation
InboxMessage
ClientMessage
EmployeeMessage
```

---

## 3. Product model

Every active case should be capable of having at least one client-visible shared channel equivalent to:

```text
Client & Team
```

This is the normal conversation between the client workspace members and authorized employees assigned to/accessing the case.

The system may also retain other channel types already supported by ADR-005, including:

- staff-only/internal case channels;
- restricted-member channels;
- system/update channels where already defined.

Clients must never see staff-only channels merely because they know a channel ID.

The implementation should reuse existing default channel provisioning and may evolve the default template so each applicable case has an obvious client-team chat destination.

Provisioning remains idempotent.

---

## 4. Shared conversation semantics

A shared client-team channel is not an email ticket and not a one-way status feed.

Both sides may actively converse.

The normal message workflow is:

```text
client sends message
    -> employee sees it in Angular
    -> employee replies
    -> client sees reply in portal
    -> both sides receive unread/read-state updates
```

The inverse employee-first flow must work too.

Messages are durable and ordered. Refreshing either application must show the same persisted conversation.

---

## 5. Client capabilities

For a client who is an active authorized member of the case workspace and is allowed to view the channel, Phase 07 must support:

- list visible case chat channels;
- open a shared channel;
- load older messages;
- send a new message;
- reply within the existing one-level thread model;
- edit their own eligible message;
- delete their own eligible message using existing soft-delete semantics;
- attach one or more permitted files through the secure document pipeline;
- attach an already-uploaded client-visible case document where allowed;
- open/download permitted message attachments through secure document authorization;
- see edited/deleted state;
- mark the channel read;
- see unread counts;
- see employee/system messages that are explicitly client-visible.

Clients must not gain employee moderation, channel management or staff-only attachment visibility.

---

## 6. Employee capabilities

Authorized employees in Angular must support:

- list visible case channels;
- clearly distinguish shared client channels from internal/staff-only channels;
- open shared or permitted internal channels;
- load older messages;
- send messages and replies;
- mention eligible workspace members where current domain supports mentions;
- attach permitted existing case documents;
- upload a new secure chat attachment from the composer;
- edit their own messages according to policy;
- soft-delete/moderate/restore according to policy;
- see unread counts;
- mark channels read;
- manage channels/restricted members where current capability policy permits.

A staff user removed from the case workspace loses chat access immediately unless an existing explicit organization-wide capability applies.

---

## 7. Message model remains authoritative

`WorkspaceMessage` remains the only durable chat-message model.

Existing semantics stay intact:

- sender type identifies client/employee/system;
- body is plain text unless a future ADR expands formatting;
- root messages and one-level replies are supported;
- mentions are bounded snapshots tied to workspace members;
- attachments reference secure documents and versions;
- edit history uses `MessageRevision`;
- delete is soft/moderated rather than ordinary hard deletion;
- `clientVisible` remains a defense-in-depth field;
- idempotency protects sends/retries;
- optimistic concurrency protects edits.

Do not introduce a rich-text/HTML message format in this phase.

---

## 8. One-level threads

The existing threading model remains:

```text
root message
└── replies
```

A reply to a reply is normalized to the thread root by the service layer.

Do not create arbitrary recursively nested thread trees.

Both client portal and Angular staff UI must present the same thread semantics.

---

## 9. Direct file attachment from the chat composer

Phase 07 explicitly requires a user-facing **Attach file** action in both client and employee chat composers.

However, a message must never become a second file-storage mechanism.

When a client or employee chooses a new local file from chat:

1. authorize the actor for the case/channel;
2. upload the file through the existing secure document-validation/storage pipeline;
3. create the authoritative `CaseDocument` / `DocumentVersion` records;
4. ensure the resulting document is valid for the target channel audience;
5. create the message with an attachment reference to that document/version;
6. if message creation fails after upload, preserve an auditable safe recovery/orphan policy rather than leaking or silently deleting a successfully stored case document without product rules.

Message records store document/version refs and display-name snapshots only.

Never store file bytes, storage keys, private paths or public URLs on `WorkspaceMessage`.

---

## 10. Chat attachment category

If the current document categories do not provide a suitable destination for files attached directly from chat, Phase 07 may introduce an idempotently provisioned case category with a stable template key equivalent to:

```text
chat_attachments
```

Display name may be:

```text
Chat Attachments
```

It should be a normal `DocumentCategory`, not a new model.

Recommended properties:

- not evidence-required;
- client-visible where the file was uploaded into a client-visible chat;
- permitted uploader types include the appropriate client/employee actors;
- active and ordered using existing category rules.

If a file is attached in a staff-only channel, its visibility must remain staff-only or otherwise conform to the existing secure document visibility model.

Do not allow a staff-only attachment to become client-visible merely because a message DTO references it.

---

## 11. Attachment security

For every attachment, the server must verify:

- actor can view/send in the target channel;
- document belongs to the same case/workspace;
- document version belongs to the document;
- channel audience is compatible with document visibility;
- client actors can access the attachment under document policy;
- archived/rejected/unavailable files are handled according to existing document policy;
- storage metadata is never returned.

All downloads continue through secure document download routes and retain `DocumentAccessLog` behavior.

---

## 12. Existing-document attachment

Both sides may optionally attach an already-existing document if policy allows it.

The server, not the UI, determines whether a document is eligible for the channel audience.

A client-visible shared channel must never be used to expose an internal employee document.

Angular and the portal should show only safe document attachment metadata such as:

```text
id
displayName
mimeType/extension
size
version id/number where needed
download action
```

---

## 13. Near-real-time chat behavior

Phase 07 must feel like chat rather than requiring manual page refresh.

A new external realtime infrastructure is not required.

The default implementation should provide **near-real-time incremental synchronization** using a safe transport supported by the current apps. Bounded polling is acceptable and preferred over unnecessary infrastructure if no realtime bus exists.

Recommended behavior:

- fetch new messages every few seconds while a channel is open and the document/tab is visible;
- stop or greatly reduce polling while the page is hidden;
- use incremental message identity/cursor/time boundaries rather than repeatedly downloading the full conversation;
- apply backoff after repeated failures;
- immediately merge the server-confirmed result after a successful send;
- deduplicate by message ID/idempotency key;
- preserve user scroll position while older/newer messages arrive;
- provide manual retry if synchronization fails.

If implementation discovers an already-supported SSE/realtime mechanism that is clearly safer and simpler, it may be used, but Socket.IO/WebSocket infrastructure must not be added merely to satisfy the word “chat.”

Typing indicators and online presence are not required for Phase 07 completion.

---

## 14. Message pagination and incremental sync

Historical conversation loading remains cursor based using existing utilities.

Phase 07 may add a bounded incremental “messages after X” contract if needed for polling, but it must preserve deterministic ordering and authorization.

Do not use deep offset pagination for long chat histories.

Malformed cursors/message boundaries fail safely.

---

## 15. Idempotent sends

Both client and employee sends/replies must use a per-intent idempotency key.

The client should generate one key for one deliberate send and reuse that same key only when retrying that exact send.

Double-clicking Send or retrying a network request must not create duplicate messages.

Attachment upload/message composition must define idempotency carefully so a retry does not create duplicate `CaseDocument` records where avoidable.

---

## 16. Edit and delete

Clients and employees may edit only messages permitted by existing ownership/policy rules.

Edits preserve `MessageRevision` and optimistic concurrency.

A stale edit returns a controlled conflict rather than overwriting newer content.

Deletion remains soft/moderated. Thread continuity must not be corrupted.

Employees with moderation capability may restore or moderate where current policy allows.

Clients cannot restore/moderate other users’ messages.

---

## 17. Read state and unread counts

`ChannelReadState` remains authoritative.

Both client portal and Angular must:

- show unread count per visible channel;
- mark read when appropriate;
- exclude hidden channels from all counts;
- avoid counting the actor’s own sends as unread according to current service semantics.

Phase 07 may expose a simple derived “seen” indication where it can be computed reliably from participant read states, but it must not claim individual-message read receipts that the model cannot actually prove.

---

## 18. Notifications

Existing `notificationService` and `collaborationEmail` remain the notification side-effect layer.

When a client sends a new message, appropriate employees should receive existing in-app/email notification behavior according to current preferences/policy.

When an employee sends a client-visible message, appropriate client workspace members should receive existing notification behavior.

Email delivery failure must not roll back a successfully persisted message unless existing architecture explicitly requires that behavior.

Do not create a second notification engine in Phase 07.

---

## 19. Shared versus internal channels

The UI must make the audience obvious.

Employees should be able to distinguish at a glance:

```text
CLIENT + TEAM
STAFF ONLY
RESTRICTED
```

Do not rely only on color.

Before an employee sends in a client-visible channel, the composer should visibly indicate that the client can read the message and attachments.

Internal channels must never appear in client portal channel lists, unread totals, notification payloads or guessed-ID responses.

---

## 20. Authorization

`collaborationPolicy` remains authoritative.

Existing capability families remain in force, including current equivalents of:

```text
channels.view
channels.create
channels.manage
channels.archive
channel_members.manage
messages.send
messages.edit_own
messages.moderate
```

Employee access combines capability + row-level workspace/channel policy.

Client access combines authenticated active client session + case workspace membership + channel visibility/restricted membership policy.

Knowledge of case/channel/message IDs never grants access.

---

## 21. Existence concealment

Hidden case/chat resources must not become object-existence oracles.

Where appropriate, treat these equivalently:

```text
malformed ID
nonexistent ID
inaccessible case
hidden staff-only channel
restricted channel the actor cannot access
message in an inaccessible channel
attachment in an inaccessible message
```

Never expose hidden channel names, senders, unread counts or attachment names before authorization.

---

## 22. Staff canonical API

Phase 07 exposes the shared chat domain under `/api/v1/staff` for Angular.

Recommended staff endpoints:

```text
GET    /api/v1/staff/cases/:caseId/channels
POST   /api/v1/staff/cases/:caseId/channels/initialize
POST   /api/v1/staff/cases/:caseId/channels
POST   /api/v1/staff/cases/:caseId/channels/reorder

GET    /api/v1/staff/channels/:channelId
PATCH  /api/v1/staff/channels/:channelId
POST   /api/v1/staff/channels/:channelId/archive

GET    /api/v1/staff/channels/:channelId/messages
GET    /api/v1/staff/channels/:channelId/messages/newer
POST   /api/v1/staff/channels/:channelId/messages
POST   /api/v1/staff/channels/:channelId/messages-with-upload   # optional orchestration endpoint

GET    /api/v1/staff/channels/:channelId/threads/:messageId
POST   /api/v1/staff/messages/:messageId/replies
PATCH  /api/v1/staff/messages/:messageId
POST   /api/v1/staff/messages/:messageId/delete
POST   /api/v1/staff/messages/:messageId/restore

GET    /api/v1/staff/channels/:channelId/members
POST   /api/v1/staff/channels/:channelId/members
DELETE /api/v1/staff/channels/:channelId/members/:channelMemberId

POST   /api/v1/staff/channels/:channelId/read
```

The exact multipart orchestration endpoint may differ if composing existing Phase 06 upload + message APIs in two steps is safer. The user experience still must support attaching a new local file directly from the chat composer.

Do not add hard-delete message endpoints.

---

## 23. Client portal API

Existing client portal message APIs remain in service and should be extended rather than replaced.

Inspect current routes under areas equivalent to:

```text
src/app/api/portal/channels/[channelId]/messages
src/app/api/portal/channels/[channelId]/read
src/app/api/portal/messages/[messageId]/replies
src/app/api/portal/messages/[messageId]/edit
src/app/api/portal/messages/[messageId]/delete
```

Phase 07 must ensure the client portal has parity for the required shared-chat actions and direct secure chat attachment upload.

Do not route client chat through employee session APIs.

Authentication boundaries remain separate.

---

## 24. DTO boundary

Staff and client message DTOs may share safe serialization helpers but remain separate contracts.

A safe message DTO may contain:

```text
id
senderType
senderDisplayName
body
messageType
parentMessageId
threadRootId
replyCount
mentions
attachments
editedAt
deletedAt
createdAt
updatedAt
canEdit
canDelete
canRestore   # staff only where permitted
```

Client DTOs must never expose:

- raw AdminUser objects;
- employee internal metadata;
- staff-only channel metadata;
- storage keys/private paths;
- password/token/session fields;
- hidden document details.

---

## 25. Angular staff chat UX

The Angular case workspace should expose an obvious `Chat` or `Communications` surface where Chat is primary.

Recommended desktop layout:

```text
Channels / conversations | Message timeline | Optional thread/details panel
```

Required UX:

- shared/internal audience labels;
- unread badges;
- selected channel;
- message bubbles/rows with sender + timestamp;
- load older history;
- near-real-time new messages;
- text composer;
- Attach file;
- attach existing document;
- send/retry state;
- reply/thread;
- edit/delete/moderation controls;
- attachment download;
- clear loading/empty/error/reconnect states;
- responsive mobile layout;
- keyboard-accessible composer/actions.

Do not introduce a new UI framework.

---

## 26. Client portal chat UX

The existing client portal Messages pages must become a polished client chat experience.

Required UX:

- case-level Chat navigation with unread badge;
- visible client channels only;
- conversation timeline;
- employee/client/system sender distinction without exposing internal roles unnecessarily;
- near-real-time incoming employee replies;
- text composer;
- direct Attach file action;
- selected-file preview/name/size before send;
- upload/send progress or clear pending state;
- reply/thread interaction;
- edit/delete own controls when allowed;
- secure attachment download;
- mobile-first responsive layout;
- empty/loading/error/retry states;
- no staff-only content leakage.

The client should not need to navigate to the separate Documents page merely to attach a new file to a conversation.

---

## 27. Queries are secondary in Phase 07

`ConsultationInteraction` remains a valid structured workflow for formal questions, consultation requests, scheduling and tracked resolution.

Phase 07 must preserve it and its existing portal/admin behavior.

However, the phase must not spend its main implementation budget rebuilding Queries while the two-way chat remains incomplete.

If time/scope forces a choice, complete shared case chat first and defer Angular Queries canonicalization to a later execution phase.

---

## 28. Testing requirements

Phase 07 requires automated coverage across both writers.

### Client ↔ employee end-to-end

- client sends; employee staff API sees same message;
- employee sends; client portal API sees same message;
- replies appear on both sides;
- deterministic ordering;
- retry/double-submit does not duplicate messages.

### Authorization

- client only sees active authorized case channels;
- client cannot see staff-only channel;
- restricted membership enforced;
- removed client/member loses access;
- removed employee member loses access;
- guessed IDs do not bypass access;
- employee capabilities enforced per mutation.

### Attachments

- client direct chat upload succeeds through secure document pipeline;
- employee direct chat upload succeeds;
- invalid extension/type/magic-byte mismatch rejected;
- oversized upload rejected;
- temp cleanup on failure;
- same-case relation enforced;
- staff-only document cannot be attached into client-visible channel;
- attachment download re-authorizes actor;
- no storage key/private path leakage;
- retry does not create duplicate messages/documents where idempotency design prevents it.

### Message lifecycle

- edit own works;
- stale edit produces controlled conflict;
- revision recorded;
- delete own soft-deletes;
- unauthorized delete denied;
- staff moderation/restore works where allowed;
- deleted thread continuity preserved.

### Read/unread

- unread increments for opposite-party message;
- own message does not create own unread count;
- mark-read updates count;
- hidden channel never contributes leaked count.

### Synchronization

- incremental fetch returns only accessible newer messages;
- polling merge deduplicates messages;
- reconnect/retry preserves conversation;
- historical cursor pagination still works.

### UI

Test Angular staff chat and portal chat for send, receive-refresh, attachments, reply, edit/delete, unread, loading, error and responsive states.

---

## 29. Security controls preserved

Phase 07 preserves:

```text
EmployeeSession authentication
ClientSession authentication
mustChangePassword handling for employees
trusted-origin / CSRF controls
case/workspace row policy
channel visibility/restricted membership
optimistic concurrency
idempotency
secure document storage and validation
DocumentAccessLog
explicit DTO mapping
SecurityEvent conventions
```

No broad CORS.

No localStorage bearer tokens.

No public chat attachment URLs.

No staff-only message sent to clients by client-side filtering mistakes.

---

## 30. Out of scope

Phase 07 does not require:

- WhatsApp/SMS integration;
- Outlook/Gmail inbox synchronization;
- video/voice calls;
- typing indicators;
- online presence;
- emoji reactions;
- rich text/HTML chat messages;
- end-to-end encryption beyond current authenticated private application transport/storage controls;
- external realtime SaaS/pub-sub infrastructure;
- AI chatbot replies;
- client portal migration to Angular;
- legacy EJS retirement;
- production deployment;
- production migration/index execution.

---

## 31. Completion criteria

Phase 07 is complete only when:

- one authoritative shared workspace chat domain is used by client and employee surfaces;
- client can send and receive employee messages from the portal;
- employee can send and receive client messages from Angular;
- messages update near-real-time without manual full-page refresh;
- both sides can reply using the existing thread model;
- client can edit/delete own eligible messages;
- employee edit/moderation rules are operational;
- client and employee can attach a new local file directly from the chat composer through secure document storage;
- existing authorized documents can be attached where allowed;
- secure downloads and visibility rules are preserved;
- unread/read state works on both sides;
- internal/staff-only channels remain invisible to clients;
- notification/email side effects remain compatible;
- client and staff DTOs do not leak sensitive/internal data;
- OpenAPI documents the staff chat contract and multipart/binary relationships appropriately;
- existing portal tests plus new cross-writer tests pass;
- root/server/Angular tests pass;
- lint/typecheck/build gates pass;
- no production deployment/migration/index operation occurs;
- the final Phase 07 SHA has green GitHub Actions.

After this gate is green, stop and report Phase 07 before beginning Phase 08.
