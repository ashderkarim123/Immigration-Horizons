# ADR-020 — Canonical Staff Communications and Collaboration

**Status:** Accepted for Phase 07 implementation  
**Date:** 2026-09-08  
**Branch:** `architecture/angular-enterprise-platform`  
**Phase:** Execution Phase 07 — Communications + Collaboration  
**Phase 06 implementation baseline:** `4e344a8513716a57d7f8a97a7fefbc007fa7d024`  
**Verified Phase 06 CI:** GitHub Actions run #57 — success

---

## 1. Context

Immigration Horizons already has two mature communication domains that predate the Angular enterprise UI:

1. **Consultation/case interactions (queries)** — structured client questions and consultation requests with assignment, priority, scheduling, clarification, answer, close/cancel/no-show lifecycle, internal notes, client-visible responses, optimistic concurrency, history and email/notification side effects.
2. **Case workspace collaboration** — ordered channels with visibility policy, restricted membership, durable messages, one-level threads, mentions, secure document attachments, edit/delete/restore behavior, message revisions, read state, unread counts, system messages and email/notification side effects.

The authoritative models already include:

```text
ConsultationInteraction
InteractionHistory
InteractionUpdate
WorkspaceChannel
ChannelMember
WorkspaceMessage
MessageRevision
ChannelReadState
WorkspaceMember
```

The authoritative services already include:

```text
interactionPolicy
interactionService
interactionQueues
interactionEmail
collaborationPolicy
channelService
messageService
readStateService
systemMessageService
collaborationEmail
notificationService
```

Legacy staff workflows live mainly in Express/EJS. Client-facing counterparts already exist in the Next.js client portal.

Phase 07 therefore migrates these existing communication capabilities into the canonical `/api/v1/staff` contract and Angular case-management UI. It does **not** create a second chat system, second query model, or new realtime infrastructure.

---

## 2. Decision summary

Phase 07 will expose the existing interaction and collaboration domains through explicit staff APIs and Angular workflows.

The following remain authoritative:

```text
ConsultationInteraction   -> structured client query / consultation-request lifecycle
WorkspaceChannel          -> case workspace conversation container
WorkspaceMessage          -> durable channel message/thread item
ChannelReadState          -> per-member read state
```

No new generic `Communication`, `Conversation`, `ChatMessage`, `Ticket`, or `InboxMessage` collection is introduced merely for Angular.

The Angular application will provide:

- a global **Queries** operational queue/directory;
- query detail and lifecycle actions;
- a case **Communications** workspace containing case-scoped queries and collaboration channels;
- channel/thread message operations;
- unread/read-state behavior;
- safe mentions and document attachments;
- channel administration where authorized.

---

## 3. Domain separation remains intentional

`ConsultationInteraction` and `WorkspaceMessage` solve different problems and must not be merged.

A query is structured operational work with fields such as:

```text
interactionNumber
scopeType
subject
description
type
status
priority
assignedTo
scheduledFor
responseDueAt
clientVisibleResponse
internalResponse
clientResolutionStatus
```

A workspace message is conversational collaboration with fields such as:

```text
channel
sender
body
thread root
mentions
attachments
edited/deleted state
clientVisible
idempotencyKey
```

A query can require assignment, SLA/deadline handling, scheduling and closure. A message is not a ticket. A message thread does not replace query history.

Angular may present both under a common Communications navigation area, but the server/domain objects remain separate.

---

## 4. Query scope model

Existing query scope remains authoritative:

```text
scopeType = consultation
scopeType = case
```

For consultation-scoped interactions, existing lead/consultation access policy remains intact.

For case-scoped interactions, case/workspace row-level authorization applies.

Angular must not convert a consultation-scoped interaction to case scope simply because the lead later becomes a case unless an existing explicit service/migration rule already does so.

No destructive scope migration is part of Phase 07.

---

## 5. Query lifecycle

Phase 07 preserves the existing interaction enums and service-owned lifecycle.

Do not invent transitions in Angular.

The current service operations include concepts such as:

```text
acknowledge
assign
schedule/reschedule
start work
answer
request clarification
mark no-show
cancel
close
add internal note
```

The exact permitted transition graph must be read from `interactionService.js`, `interactionConstants.js`, model validation, and existing tests.

Optimistic concurrency remains mandatory. Concurrent writes must return a controlled conflict rather than silently overwrite newer work.

---

## 6. Query response visibility

The existing separation is mandatory:

```text
clientVisibleResponse
internalResponse
resolutionSummary
```

Internal response/notes must never appear in client-facing serialization.

Angular staff DTOs may expose internal fields only to authorized staff endpoints.

Client-facing email/portal behavior continues to use existing safe serializers and services.

Phase 07 must add recursive DTO leakage tests around client-facing and staff-facing response boundaries where touched.

---

## 7. Query operational queues

The existing queue semantics in `interactionQueues` remain the source of truth where practical.

Phase 07 should expose useful staff filters such as:

```text
search
status
type
priority
scope
assignee
queue
page
pageSize
```

Existing queue concepts may include unanswered, awaiting scheduling, overdue response, assigned work or similar repository-defined queues.

Do not invent metrics that disagree with current service logic.

Normal employees must not gain `queries.view_all` behavior through a broad API filter.

---

## 8. Collaboration channels

`WorkspaceChannel` remains the channel model.

Existing channel concepts remain authoritative:

```text
channelType
visibility
order
templateKey
archivedAt
```

Default channel provisioning remains idempotent through `channelService`.

Phase 07 may expose:

- list visible channels;
- initialize defaults;
- create channel;
- update channel;
- reorder channels;
- archive channel;
- manage restricted channel membership.

Do not create another category/channel hierarchy in Angular.

---

## 9. Channel visibility

Visibility is server policy, never a naming convention.

`collaborationPolicy` remains authoritative for whether an actor can view/send/manage a channel.

Restricted channel membership is an additional constraint, not a substitute for workspace membership.

An employee removed from the case workspace loses access to all case channels immediately, including channels where an old `ChannelMember` row remains, unless existing explicit organization-wide policy says otherwise.

A restricted channel must not leak its existence, name, unread count, member list or message count to an unauthorized actor.

---

## 10. Messages and threads

`WorkspaceMessage` remains the message model.

Phase 07 preserves current one-level threading semantics:

- root message;
- replies normalized to one thread root;
- no arbitrary recursive nesting.

The API must support cursor-based message pagination using existing cursor utilities rather than offset pagination for deep channel history.

Message ordering must remain deterministic using current createdAt/_id conventions.

No websocket is required for Phase 07.

---

## 11. Message idempotency

Existing `idempotencyKey` behavior remains mandatory for employee sends/replies.

Angular should generate one key per intentional send and reuse it only for a retry of that same send.

The server remains authoritative and must safely deduplicate retry submissions.

Do not create duplicate messages because a user double-clicks or a network retry occurs.

---

## 12. Message edit/delete/restore

Existing edit, delete and moderation semantics remain authoritative.

Message edits must preserve optimistic concurrency and revision history where the current service does so.

Delete is a soft/moderated domain action, not a normal hard database deletion.

Angular must distinguish:

- edit own;
- delete own where permitted;
- moderator delete/restore where permitted.

The UI cannot infer permission from sender identity alone; server policy decides.

---

## 13. Mentions

Mentions remain based on `WorkspaceMember`, not arbitrary email/user IDs.

When an employee mentions a person, the backend must verify:

- the workspace member exists;
- membership is valid for the case/workspace;
- the mentioned member is eligible to see the target channel;
- restricted-channel visibility is respected.

The persisted mention snapshot remains bounded and intentional.

Mention notification/email side effects reuse existing infrastructure and must not determine core message persistence success.

---

## 14. Message attachments

Message attachments remain references to existing secure documents/versions:

```text
CaseDocument
DocumentVersion
```

Phase 07 must not upload arbitrary files directly into messages.

Attachment selection in Angular must choose an existing authorized case document (and server-resolved valid version) through Phase 06's secure document domain.

The backend must verify:

- same case/workspace;
- document access;
- document/client visibility compatibility with the target channel;
- version belongs to the document;
- archived/rejected/private/internal documents are not exposed to clients contrary to document/channel policy.

Messages store bounded attachment snapshots/refs, never storage keys or private URLs.

Downloads still go through the Phase 06 secure document API and access log.

---

## 15. Read state and unread counts

`ChannelReadState` remains the source of truth.

Read state is per workspace member/channel.

Phase 07 should support:

- unread counts in channel lists;
- marking a channel read;
- optionally marking through a specific last-read message if current service supports it;
- excluding the actor's own messages from unread calculation according to existing service semantics.

Unread count endpoints must not reveal hidden channels.

Do not create a second unread-counter table for Angular.

---

## 16. Client-visible system messages and case updates

Earlier phases already support publishing client-visible case updates.

Phase 07 must not create a second case-update mutation path.

If `systemMessageService` already mirrors approved case events into collaboration channels, preserve and render those system messages according to existing `clientVisible` rules.

If no such mapping exists for a given case update, Phase 07 should not invent one merely for visual completeness.

The case-management service remains authoritative for case update mutations.

---

## 17. Notifications and email

Existing services such as:

```text
notificationService
interactionEmail
collaborationEmail
```

remain side-effect providers.

Core query/message persistence must not depend on email delivery succeeding unless the existing service explicitly defines a transactional requirement.

Phase 07 should preserve existing notification generation and may expose unread notification indicators if a current staff notification contract can be safely reused.

A brand-new notification center, websocket push bus, email inbox integration or external messaging provider is not required to complete Phase 07.

---

## 18. Authorization — queries

Existing capabilities/policies remain authoritative, including current equivalents of:

```text
queries.view
queries.view_all
queries.triage
queries.assign
queries.schedule
queries.manage
queries.answer
queries.close
```

Case-scoped interactions require case/workspace access unless an explicit `view_all` capability applies.

Consultation-scoped visibility follows existing consultation interaction policy.

No query endpoint may authorize solely from a guessed interaction ID.

---

## 19. Authorization — collaboration

Existing capabilities/policies remain authoritative, including current equivalents of:

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

Every channel/message action also passes row-level channel/workspace visibility policy.

Restricted membership is checked where applicable.

Angular navigation/control visibility is UX only.

---

## 20. Existence concealment

Phase 07 preserves safe not-found behavior for inaccessible case-scoped resources.

Where appropriate, these should not be distinguishable externally:

```text
malformed ID
nonexistent ID
inaccessible case
inaccessible restricted channel
message in inaccessible channel
interaction in inaccessible case
```

Do not expose channel names, message authors, query subjects or unread counts before authorization.

---

## 21. Canonical API — queries

Recommended staff endpoints, adapted to current API conventions:

```text
GET    /api/v1/staff/queries
GET    /api/v1/staff/queries/:interactionId
GET    /api/v1/staff/cases/:caseId/queries

POST   /api/v1/staff/queries/:interactionId/acknowledge
PATCH  /api/v1/staff/queries/:interactionId/assignee
POST   /api/v1/staff/queries/:interactionId/schedule
POST   /api/v1/staff/queries/:interactionId/start
POST   /api/v1/staff/queries/:interactionId/answer
POST   /api/v1/staff/queries/:interactionId/request-clarification
POST   /api/v1/staff/queries/:interactionId/no-show
POST   /api/v1/staff/queries/:interactionId/cancel
POST   /api/v1/staff/queries/:interactionId/close
POST   /api/v1/staff/queries/:interactionId/notes
```

The exact verb shape may be consolidated where a validated action endpoint is cleaner. Do not build a generic arbitrary status patch that bypasses service transition rules.

---

## 22. Canonical API — collaboration

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
POST   /api/v1/staff/channels/:channelId/messages
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

Do not add hard message deletion.

---

## 23. DTO policy

Raw Mongoose documents must never become the Angular contract.

Define explicit DTOs for:

```text
QuerySummary
QueryDetail
QueryHistoryItem
QueryUpdate
QueryQueueCounts
ChannelSummary
ChannelDetail
ChannelMemberRef
MessageSummary
MessageDetail
MessageAttachmentRef
MessageMentionRef
ThreadResponse
UnreadCounts
```

Staff DTOs may intentionally expose staff-only fields when authorized.

Client DTOs remain separate and must never gain staff-only fields as a side effect of shared serializer refactoring.

Sensitive credentials/tokens/session data and document storage metadata remain prohibited.

---

## 24. Angular Queries workspace

Phase 07 adds a real global Queries page.

Required UX:

- search;
- status/type/priority/scope/assignee filters;
- operational queue shortcuts/counts where authorized;
- pagination;
- loading/empty/error/retry states;
- clear overdue/awaiting response/scheduling indicators where current data supports them;
- direct navigation to client/case/consultation context without widening access.

The normal employee view must respect server-side row scope.

---

## 25. Angular Query detail

Query detail should expose safe operational information and capability-aware actions:

- client/context;
- subject/description/type/status/priority;
- assignment;
- schedule/timezone;
- response due;
- client-visible response;
- internal response;
- resolution summary;
- history;
- updates/internal notes;
- acknowledge/assign/schedule/start/answer/request clarification/no-show/cancel/close as permitted.

Conflict responses must be visible and recoverable rather than silently lost.

---

## 26. Angular case Communications workspace

Add a `Communications` surface to the case workspace.

Recommended structure:

```text
Communications
├── Client Queries
└── Channels
```

Case queries load only case-scoped interactions the actor may access.

Channels load only visible channels.

The surface may use tabs/subnavigation but should reuse global query/channel components rather than duplicate business logic.

---

## 27. Angular channel experience

The first Angular channel UI should be operational and deterministic, not a fake realtime chat.

Required behavior:

- channel list with unread counts;
- selected channel detail;
- cursor pagination / load older messages;
- send message;
- one-level thread view;
- reply;
- edit own where allowed;
- delete own/moderate where allowed;
- restore where allowed;
- mentions;
- attach existing authorized case documents;
- mark read;
- restricted-members display/management where allowed;
- create/update/reorder/archive channels where allowed.

No websocket dependency is required.

---

## 28. Realtime decision

Phase 07 deliberately does **not** introduce Socket.IO/WebSocket/SSE infrastructure.

Reasons:

- the existing domain is durable and request/response based;
- migration risk should focus on authorization/DTO parity first;
- realtime transport would add deployment, scaling, session and security complexity unrelated to canonicalization.

Angular may refresh on navigation, manual refresh, mutation success, and optionally use a conservative polling interval for unread counts if justified and tested.

A future ADR may add realtime delivery after the deterministic API is stable.

---

## 29. OpenAPI and Angular typing

Every new endpoint must be documented in `server/openapi/v1.yaml`.

Define explicit request/response/action schemas and cursor pagination fields.

Angular uses typed interfaces/services and avoids `any` for new communication contracts.

Message attachments reference safe document DTOs/IDs, never storage metadata.

---

## 30. Audit and activity

Preserve existing `InteractionHistory`, `InteractionUpdate`, `MessageRevision`, case activity and notification/audit semantics.

Do not duplicate history into a generic audit table simply because Angular needs a timeline.

Mutation metadata must stay bounded and must not persist credentials, storage keys or whole model snapshots unnecessarily.

---

## 31. Testing requirements

Phase 07 must include automated coverage for:

### Queries

- row-scoped list/detail;
- `view_all` behavior;
- case member removal revokes case-query access;
- filters/queues/pagination;
- acknowledge/assign/schedule/start/answer/clarification/no-show/cancel/close service transitions;
- invalid transitions rejected;
- optimistic concurrency conflict;
- internal vs client-visible response separation;
- history/update creation;
- DTO sensitive-field rejection.

### Channels/messages

- visible channel list;
- restricted channel concealment;
- workspace removal revokes channel access;
- default provisioning idempotency;
- create/update/reorder/archive;
- restricted-member add/remove validation;
- cursor pagination;
- idempotent send/reply;
- one-level thread normalization;
- mention validation;
- secure same-case document attachment validation;
- edit conflict/revision behavior;
- delete/restore authorization;
- read state/unread counts;
- DTO sensitive-field rejection.

### Angular

- query list/detail states and actions;
- filters/pagination;
- conflict handling;
- case Communications navigation;
- channel unread counts;
- load older messages;
- send/reply/edit/delete/restore;
- mentions/attachments;
- restricted channel/member controls;
- loading/empty/error/retry/accessibility/responsive states.

No skipped/weakened tests to force CI green.

---

## 32. Security boundaries preserved

Phase 07 must preserve:

```text
EmployeeSession authentication
mustChangePassword enforcement
trusted-origin / CSRF mutation protection
capability checks
case/workspace row-level policy
restricted channel membership
existence concealment
optimistic concurrency
explicit DTO mapping
secure document attachment/download policy
SecurityEvent conventions
```

No broad CORS.

No localStorage bearer tokens.

No hidden-channel metadata leaks.

No raw document URLs/storage keys in message attachments.

---

## 33. Migration/index impact

Phase 07 primarily exposes existing domain models; a major destructive data migration should not be required.

If existing cases need default channel provisioning, any backfill must remain idempotent and dry-run capable through existing channel provisioning/tooling.

If new query patterns justify indexes, inspect existing indexes first and update repository index tooling only when necessary.

Do not execute production migrations or index builds during Phase 07 implementation.

---

## 34. Legacy/client compatibility

The following remain operational during Phase 07:

- Express/EJS queries UI;
- Express/EJS collaboration UI;
- Next.js client query flows;
- Next.js client collaboration flows;
- existing email and notification side effects.

Do not retire legacy presentation routes in this phase.

Do not migrate the client portal to Angular.

Where shared helpers are extracted, legacy and canonical API paths must converge on the same service semantics.

---

## 35. Out of scope

Phase 07 does not include:

- Slack/Teams integration;
- external SMS/WhatsApp inbox;
- Gmail/Outlook mailbox sync;
- websocket/SSE realtime infrastructure;
- video calling;
- voice calling;
- arbitrary file uploads inside messages;
- rich-text/HTML message authoring;
- nested multi-level threads;
- AI reply generation;
- AI legal advice;
- full standalone notification-center redesign;
- smart forms;
- petition drafting;
- filing packets;
- production deployment;
- legacy route retirement.

---

## 36. Implementation gate

Before substantive Phase 07 code changes:

1. verify branch is `architecture/angular-enterprise-platform` and clean;
2. verify Phase 06 implementation commit `4e344a8513716a57d7f8a97a7fefbc007fa7d024` is in ancestry;
3. verify GitHub Actions run #57 (or the final Phase 06 run for that SHA) is green;
4. preserve Phase 07 documentation commits;
5. do not reset/rebase/amend/force-push completed history.

---

## 37. Completion criteria

Phase 07 is complete only when:

- this ADR is implemented consistently;
- existing query and collaboration domains are reused, not duplicated;
- canonical `/api/v1/staff` query APIs exist;
- canonical `/api/v1/staff` collaboration/message/read-state APIs exist;
- authorization and restricted visibility are enforced server-side;
- query lifecycle and optimistic concurrency remain correct;
- message idempotency/thread/edit/delete/restore semantics remain correct;
- mentions resolve valid visible workspace members;
- document attachments reuse Phase 06 secure documents and do not leak storage metadata;
- Angular global Queries and query detail are operational;
- Angular case Communications/channels/thread UI is operational;
- unread/read state works;
- client portal/EJS compatibility is preserved;
- OpenAPI and Angular types are updated;
- root/server/Angular tests and builds pass;
- no production deploy/migration/index execution occurs;
- remote GitHub Actions for the final Phase 07 implementation SHA are green.

After completion, stop and report before beginning Phase 08.
