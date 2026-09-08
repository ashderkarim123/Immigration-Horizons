# Immigration Horizons — Phase 07: Communications & Collaboration

**Execution branch:** `architecture/angular-enterprise-platform`  
**Verified Phase 06 implementation baseline:** `4e344a8513716a57d7f8a97a7fefbc007fa7d024`  
**Verified Phase 06 CI:** GitHub Actions run #57 — success  
**Architecture reference:** `docs/architecture/ADR-020-canonical-staff-communications-and-collaboration.md`

## 1. Purpose

Implement the next genuine enterprise capability after Phase 06: canonical staff communications and collaboration in the Angular case-management application.

This phase must reuse the repository's existing communication domains rather than creating replacements.

The existing authoritative domains are:

```text
ConsultationInteraction + InteractionHistory + InteractionUpdate
WorkspaceChannel + ChannelMember + WorkspaceMessage + MessageRevision + ChannelReadState
```

The goal is to expose these through `/api/v1/staff` and build Angular operational workflows for global Queries and case Communications.

Do not create a second chat, ticket, query, inbox or message collection.

## 2. Hard safety rules

- Work only on `architecture/angular-enterprise-platform`.
- Do not deploy production.
- Do not execute production migrations or production index builds.
- Do not reset, amend, squash, rebase, rewrite, or force-push completed Phase 01–06 history.
- Do not retire EJS query/collaboration routes in this phase.
- Do not migrate the client portal to Angular.
- Do not introduce Socket.IO/WebSocket/SSE as a Phase 07 requirement.
- Do not weaken existing auth, capability, row-level, restricted-channel, CSRF/trusted-origin or optimistic-concurrency controls.
- Do not skip or weaken tests to get CI green.
- Do not use `--force` or `--legacy-peer-deps` as dependency bypasses.

## 3. Mandatory preflight

Run:

```bash
git fetch origin --prune
git switch architecture/angular-enterprise-platform
git pull --ff-only origin architecture/angular-enterprise-platform

git status --short
git branch --show-current
git rev-parse HEAD
git log --graph --decorate --oneline -35

git diff
git diff --cached

node -v
npm -v
```

Use Node 22.

Verify ancestry contains:

```text
4e344a8513716a57d7f8a97a7fefbc007fa7d024
```

Verify Phase 06 GitHub Actions run #57 is green or verify the exact final Phase 06 SHA has a successful CI run.

Preserve legitimate Phase 07 documentation commits rather than resetting to the Phase 06 baseline.

If unrelated local modifications exist, inspect and preserve them.

## 4. Required reading

Read completely before implementation:

```text
CLAUDE.md
AGENTS.md

.claude/DESIGN_SYSTEM.md
.claude/API_ARCHITECTURE.md
.claude/DATABASE.md
.claude/TESTING.md
.claude/SECURITY.md

docs/architecture/ADR-003-consultation-interactions.md
docs/architecture/ADR-005-team-collaboration.md
docs/architecture/ADR-012-security-privacy-and-audit.md
docs/architecture/ADR-014-migrations-and-retention.md
docs/architecture/ADR-015-angular-enterprise-platform.md
docs/architecture/ADR-016-authentication-boundaries.md
docs/architecture/ADR-019-canonical-staff-documents-and-secure-file-operations.md
docs/architecture/ADR-020-canonical-staff-communications-and-collaboration.md

docs/implementation/ANGULAR_ENTERPRISE_PLATFORM_ROADMAP.md
docs/implementation/PHASE_06_STAFF_DOCUMENTS_SECURE_FILE_OPERATIONS_PROMPT.md
```

Inspect current code, especially:

```text
server/models/ConsultationInteraction.js
server/models/InteractionHistory.js
server/models/InteractionUpdate.js
server/models/WorkspaceChannel.js
server/models/ChannelMember.js
server/models/WorkspaceMessage.js
server/models/MessageRevision.js
server/models/ChannelReadState.js
server/models/WorkspaceMember.js

server/utils/interactionConstants.js
server/utils/collaborationConstants.js
server/utils/messageCursor.js
server/utils/permissions.js

server/services/interactionPolicy.js
server/services/interactionService.js
server/services/interactionQueues.js
server/services/interactionEmail.js
server/services/collaborationPolicy.js
server/services/channelService.js
server/services/messageService.js
server/services/readStateService.js
server/services/systemMessageService.js
server/services/collaborationEmail.js
server/services/notificationService.js
server/services/casePolicy.js
server/services/caseManagement.js
server/services/documentPolicy.js
server/services/staffDocumentManagement.js

server/routes/admin/queries.js
server/routes/admin/collaboration.js
server/routes/api/v1/staff/index.js
server/openapi/v1.yaml

enterprise-ui/projects/case-management/src/app/features/cases/
enterprise-ui/projects/case-management/src/app/features/documents/
enterprise-ui/projects/case-management/src/app/core/api/
enterprise-ui/projects/case-management/src/app/shared/
```

Code is authoritative if an old roadmap/document statement disagrees with current implementation.

## 5. Product outcome

At Phase 07 completion, authorized employees can operate real client communications and case collaboration from Angular.

Global staff surface:

```text
Queries
├── Search/filter/queues
├── Assignment
├── Scheduling
├── Acknowledge/start work
├── Answer / clarification
├── Internal notes/history
├── No-show/cancel/close
└── Case/consultation context
```

Case workspace:

```text
Communications
├── Client Queries
└── Channels
    ├── Channel list + unread
    ├── Messages
    ├── Threads/replies
    ├── Mentions
    ├── Secure document attachments
    ├── Edit/delete/restore
    ├── Read state
    └── Restricted members/channel management
```

All permission decisions remain server-side.

## 6. Do not merge the domains

`ConsultationInteraction` is structured operational work.

`WorkspaceMessage` is collaboration conversation.

Do not replace either one with a generic `Communication`, `Ticket`, `Conversation`, or `ChatMessage` model.

Angular can present them under common Communications navigation, but server semantics remain separate.

## 7. Canonical query API

Implement staff query endpoints under `/api/v1/staff`.

Recommended shape:

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

Adapt exact verb/path details if existing v1 conventions clearly justify a cleaner shape.

Do not implement an arbitrary generic status patch that bypasses `interactionService` transition rules.

## 8. Query list and queues

Global query list must support current operational needs.

Inspect existing EJS behavior and services and preserve meaningful filters such as:

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

Reuse `interactionQueues` where it already owns queue meaning.

Do not expose `queries.view_all` data to a normal employee merely because an API filter says `all`.

Case-scoped queries remain row-scoped by workspace/case access.

Consultation-scoped queries follow existing interaction policy.

## 9. Query DTOs

Create intentional DTOs.

Example summary/detail fields may include:

```text
id
interactionNumber
scopeType
subject
description
type
status
priority
client
consultation
case
assignedTo
scheduledFor
timezone
responseDueAt
answeredAt
answeredBy
resolutionSummary
clientVisibleResponse
internalResponse
clientResolutionStatus
createdAt
updatedAt
capabilities/actions
```

Nested actors/context must be bounded DTOs.

Do not serialize raw ClientUser/AdminUser/Consultation/ClientCase models.

Do not leak password/token/session/security metadata.

## 10. Query lifecycle

Reuse `interactionService` for real mutations.

Preserve current service operations and transition rules, including repository-defined equivalents of:

```text
acknowledge
assign
schedule/reschedule
startWork
answer
requestClarification
markNoShow
cancel
close
```

Read actual current code/constants/tests before implementing request validation.

Angular must not own the transition graph.

## 11. Optimistic concurrency

`ConsultationInteraction` uses optimistic concurrency.

Do not replace guarded load-and-save mutations with blind `findOneAndUpdate` calls that weaken conflict protection.

Map version conflicts to controlled API `409` semantics.

Angular must show a clear refresh/retry conflict state and must not claim success on a stale write.

## 12. Query assignment

Reuse current assignment policy and role/capability rules.

The backend resolves the assignee and validates eligibility.

For case-scoped interactions, do not allow assignment to become a way to grant case access.

If current architecture requires workspace membership for assigned case-scoped work, preserve it.

If existing query semantics differ from task assignment semantics, follow actual `interactionPolicy`/service rules rather than assuming they are identical.

## 13. Query schedule/timezone

Preserve existing scheduling semantics.

When status requires schedule data, backend validation remains authoritative.

Keep:

```text
scheduledFor
timezone
```

as distinct intentional fields.

Do not guess the user's timezone on the backend from browser locale when an explicit timezone is required.

Full calendar integration remains a later phase.

## 14. Query answer and clarification

Preserve the distinction:

```text
clientVisibleResponse
internalResponse
resolutionSummary
```

Request clarification must use the existing client-visible clarification/update mechanism rather than converting it into a channel message unless the current domain already does so.

Internal notes/response text must never leak into client-facing serializers, emails, notifications, or portal endpoints.

## 15. Query notes/history

Expose bounded query history and internal updates to staff detail.

Reuse:

```text
InteractionHistory
InteractionUpdate
```

Do not create a duplicate audit collection for Angular.

Internal employee notes remain staff-only.

## 16. Canonical collaboration API

Add staff collaboration routes under `/api/v1/staff`.

Recommended shape:

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

Do not introduce hard message deletion.

## 17. Collaboration authorization

Reuse `collaborationPolicy` and existing capabilities.

Current capability families include equivalents of:

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

Every action must also pass channel/workspace row-level policy.

Restricted channels require restricted membership in addition to base workspace access according to current policy.

A removed case workspace member loses channel/message access immediately.

Never authorize from Angular route visibility alone.

## 18. Channel listing

For an accessible case, list only channels visible to the actor.

Response may include bounded information such as:

```text
id
name
description
channelType
visibility
order
unreadCount
canSend
canManage
canArchive
canManageMembers
```

Do not expose hidden restricted channel names or unread counts.

## 19. Default channel provisioning

Reuse `channelService.provisionDefaultChannels`.

Provisioning must remain idempotent.

Phase 07 may expose an initialize action for existing cases where channels have not been provisioned.

Do not create duplicates on retry.

No production backfill execution during implementation.

## 20. Channel management

Preserve current operations:

```text
create
update
reorder
archive
restricted member add/remove
```

Do not create restore/unarchive behavior unless current service already provides it or ADR-005 explicitly requires it.

Validate workspace/case consistency server-side.

## 21. Message DTOs

Create explicit message DTOs.

A message DTO may expose intentional fields such as:

```text
id
senderType
senderDisplayName
body
bodyFormat
messageType
parentMessageId
threadRootId
replyCount
lastReplyAt
mentions
attachments
editedAt
deletedAt
deletionReason where authorized
clientVisible
createdAt
updatedAt
canEdit
canDelete
canRestore
```

Do not expose:

```text
storageKey
private paths
raw AdminUser
raw ClientUser
session/token fields
internal document storage metadata
```

## 22. Cursor pagination

Reuse existing cursor utilities:

```text
encodeCursor
decodeCursor
cursorFilter
boundedLimit
```

Channel history and thread replies should use cursor pagination, not deep offset pagination.

Preserve deterministic ordering from existing routes/services.

Invalid cursors must fail safely without exposing database internals.

## 23. One-level threads

Preserve current threading rule:

- root message can have replies;
- replying to a reply is normalized to the thread root;
- do not introduce recursive nested UI or schema semantics.

Use existing `messageService` behavior.

Angular should provide a thread panel/page/dialog appropriate to the existing design system.

## 24. Idempotent sends

Employee message/reply sends must use idempotency keys.

Angular should generate one idempotency key per deliberate send and retain it for retry of that exact pending send.

Server remains authoritative for deduplication.

Test double-submit and retry behavior.

## 25. Mentions

Angular mention selection must be based on server-provided eligible workspace members.

Server validates:

- member exists;
- member belongs to same workspace;
- member status is valid;
- member is eligible to view target channel;
- restricted visibility is respected.

Do not accept arbitrary email addresses or arbitrary AdminUser/ClientUser IDs as mention authority.

Persist bounded snapshots only through existing message service.

## 26. Secure document attachments

Message attachments must reuse Phase 06 secure documents.

Do not add direct arbitrary file upload into a message.

Angular attachment chooser should select existing authorized case documents.

Backend must validate:

```text
same case/workspace
document exists
actor can access document
target channel can expose the attachment to its audience
document version belongs to document
client-visible channels do not expose staff-only/internal documents
```

Use the existing message/document services and policies.

Attachment DTOs contain safe display metadata and IDs, never storage keys/URLs.

Downloads route through Phase 06 document endpoints and retain DocumentAccessLog.

## 27. Message editing/revisions

Reuse `messageService.editMessage` and `MessageRevision` semantics.

Preserve optimistic concurrency.

Conflict should map to `409`.

Angular may allow editing only when server capability/action DTO indicates it.

Do not let clients modify sender, channel, createdAt, thread root or deletion metadata through edit.

## 28. Message delete/restore

Preserve existing soft-delete/moderation behavior.

Use service operations rather than raw removal.

Distinguish:

```text
edit/delete own permission
moderator delete/restore permission
```

Deletion reason must follow current service validation.

Deleted messages should render according to existing product semantics rather than disappearing in a way that corrupts thread continuity.

## 29. Read state / unread counts

Reuse `ChannelReadState` and `readStateService`.

Support:

```text
unread channel counts
mark channel read
last read message where current service supports it
```

Unread computation must not count hidden channels.

Do not create Angular-local unread counters as the source of truth.

## 30. System messages

Preserve current `systemMessageService` and `clientVisible` behavior.

System messages are not equivalent to employee-authored text.

Do not let Angular create arbitrary system messages unless an existing authorized application service explicitly provides that operation.

Case update publication remains owned by the case-management service established in Phase 03.

## 31. Notifications/email side effects

Reuse current:

```text
interactionEmail
collaborationEmail
notificationService
```

Do not create duplicate email sends in API routes if services already trigger them.

Do not fail a successfully persisted core message/query mutation merely because a best-effort notification/email side effect fails, unless existing service semantics intentionally require otherwise.

Preserve existing notification preferences/rules.

## 32. Angular global Queries page

Build a production-quality global Queries feature.

Required UX:

```text
search
status filter
type filter
priority filter
scope filter
assignee filter when useful/authorized
queue shortcuts/counts
pagination
loading
empty
error
retry
responsive table/list
```

Useful columns:

```text
Query
Client
Context
Type
Status
Priority
Assignee
Response Due / Scheduled
Updated
```

Overdue/urgent meaning must not rely on color alone.

## 33. Angular Query detail

Implement a real detail screen or case-compatible detail panel with:

```text
subject + description
interaction number
client/context
status/type/priority
assignment
schedule/timezone
response due
client-visible answer
internal response
resolution summary
history
internal notes
```

Capability-aware actions:

```text
acknowledge
assign
schedule/reschedule
start work
answer
request clarification
no-show
cancel
close
add internal note
```

Do not invent controls the server does not support.

## 34. Angular case Communications surface

Add to the case workspace:

```text
Communications
├── Client Queries
└── Channels
```

Case Queries should reuse global query DTOs/components/services with case scoping.

Channels should reuse collaboration services/components.

Avoid duplicated feature implementations.

## 35. Angular channel UI

Required experience:

```text
visible channel list
unread badge/count
open selected channel
load older messages
send message
open thread
reply
edit own
soft delete
restore when moderator
mentions
secure document attachment picker
mark read
channel create/update/reorder/archive when authorized
restricted member management when authorized
```

This is request/response based.

Do not fake realtime behavior.

## 36. Realtime is out of scope

Do not add Socket.IO, WebSocket or SSE infrastructure in Phase 07.

Optional conservative polling for unread counts is allowed only if it is simple, bounded, testable and does not complicate auth/session handling.

Manual refresh/mutation refresh is fully acceptable for Phase 07.

## 37. Accessibility and UI quality

Reuse current enterprise design tokens and shared components.

Do not add Bootstrap, Material, PrimeNG, another CSS framework or new icon library without approval.

Required accessibility:

- form labels;
- keyboard navigation;
- visible focus;
- meaningful buttons/link text;
- status not color-only;
- thread/message semantics understandable to screen readers;
- validation associated with relevant fields;
- responsive layouts.

No fake messages/queries in production feature code.

## 38. OpenAPI and Angular types

Update:

```text
server/openapi/v1.yaml
```

for all new/changed endpoints.

Document cursor pagination clearly.

Create explicit Angular types such as:

```text
QuerySummary
QueryDetail
QueryListResponse
QueryQueueCounts
QueryMutationRequest
ChannelSummary
ChannelDetail
ChannelListResponse
MessageSummary
MessageListResponse
ThreadResponse
MessageSendRequest
MessageEditRequest
MentionableMember
MessageAttachmentRef
ChannelMemberRef
UnreadCounts
```

Do not default new contracts to `any`.

## 39. API error semantics

Preserve established API envelope and status semantics.

Use controlled behavior such as:

```text
400 validation
401 unauthenticated
403 explicit action forbidden only where revealing parent context is already safe
404 malformed/nonexistent/inaccessible concealed resource
409 optimistic concurrency conflict / duplicate operation conflict as appropriate
422 unsupported domain transition where current API conventions use it
500 unexpected failure
```

Do not leak stack traces or object existence.

## 40. Security tests

At minimum test:

```text
client cookie cannot authenticate staff APIs
mustChangePassword blocks protected operational surfaces
trusted-origin/CSRF protects all communications mutations
case membership required where policy says so
removed workspace member loses access
restricted channel non-member cannot discover channel
hidden channel unread counts do not leak
guessed message ID cannot bypass channel visibility
guessed query ID cannot bypass interaction policy
internal query fields not exposed to client serializers
message attachment cannot leak inaccessible/private document
```

## 41. Query automated tests

Cover:

- list filters/pagination;
- queue semantics;
- normal scope vs `queries.view_all`;
- case-scoped access;
- consultation-scoped policy;
- detail DTO;
- acknowledge;
- assign;
- schedule/reschedule;
- start work;
- answer;
- clarification;
- no-show;
- cancel;
- close;
- internal note;
- invalid transition;
- invalid assignee/schedule;
- optimistic concurrency conflict;
- history/update writes;
- DTO sensitive-field recursion.

## 42. Collaboration automated tests

Cover:

- visible channel list;
- restricted-channel concealment;
- default provisioning idempotency;
- create/update/reorder/archive;
- restricted member add/remove;
- message cursor pagination;
- invalid cursor handling;
- message send;
- send idempotency retry;
- reply/thread normalization;
- mentions;
- secure attachment validation;
- cross-case attachment rejection;
- edit;
- edit conflict;
- revision history behavior;
- delete;
- restore/moderation;
- read state;
- unread counts;
- workspace member removal;
- DTO leakage tests.

## 43. Angular automated tests

At minimum test:

- Queries loading/filter/pagination/empty/error;
- Query detail/action success and validation errors;
- conflict handling;
- case Communications navigation;
- channel list/unread state;
- message cursor load-more;
- send idempotency behavior at UI service boundary;
- replies;
- edit/delete/restore controls;
- mentions;
- document attachments;
- restricted member management;
- capability-driven controls;
- accessibility-relevant state behavior.

## 44. Migration and indexes

A major schema migration should not be required.

If existing cases require channel provisioning, use existing idempotent provisioning/backfill tooling and add dry-run support if missing.

Inspect actual indexes before adding any.

Potential query patterns should be evaluated against existing indexes already present on `ConsultationInteraction`, `WorkspaceChannel`, `WorkspaceMessage`, `ChannelReadState` and membership models.

Do not execute production migrations/index builds.

## 45. Legacy/client compatibility

Do not break:

```text
Express/EJS queries UI
Express/EJS collaboration UI
Next.js client queries
Next.js client channels/messages
existing emails
existing notifications
existing system messages
existing document attachment behavior
```

Where helper/serializer logic is shared, client-safe serialization remains separately allowlisted.

Do not expose staff internal response/note fields to the client portal.

## 46. Out of scope

Do not implement:

```text
Socket.IO/WebSockets/SSE
external Slack/Teams integration
WhatsApp/SMS inbox
Gmail/Outlook mailbox sync
video/audio calls
rich HTML editor
nested thread trees
new arbitrary message file uploads
AI-generated legal replies
AI autonomous communications
full notification-center redesign
smart forms
petition workflow
filing packets
USCIS tracking
production deployment
legacy retirement
```

## 47. Documentation deliverable

Create before closure:

```text
docs/implementation/PHASE_07_COMMUNICATIONS_COLLABORATION_REPORT.md
```

Include:

```text
start SHA
end SHA
files/services/routes changed
query API and lifecycle implemented
collaboration API implemented
DTOs and security boundaries
Angular Queries implementation
Angular Communications/channels implementation
read/unread behavior
mentions/attachments behavior
optimistic concurrency/idempotency behavior
OpenAPI changes
tests/builds/manual QA
migration/index impact
legacy/client compatibility
known limitations
production impact
rollback considerations
GitHub Actions run and conclusion
```

## 48. Full local verification

Root:

```bash
npm ci --no-audit --no-fund
npm run lint
npx tsc --noEmit
SITE_URL=https://app.example.invalid \
NEXT_PUBLIC_SITE_URL=https://example.invalid \
npm run build
TEST_MONGODB_URI=mongodb://127.0.0.1:27017/ih-ci-root \
npm test
```

Server:

```bash
cd server
npm ci --no-audit --no-fund
TEST_MONGODB_URI=mongodb://127.0.0.1:27017/ih-ci-server \
LOGIN_RATE_LIMIT=1000 \
npm test
cd ..
```

Angular:

```bash
cd enterprise-ui
npm ci --no-audit --no-fund
npm test
npx ng build case-management
npx ng build admin-console
cd ..
```

Then:

```bash
git diff --check
git status --short
```

If CI commands have legitimately evolved, use current workflow commands while preserving equivalent coverage.

## 49. Manual QA

Validate at minimum:

### Queries

- employee login;
- query directory;
- search/filter/queue;
- open consultation query;
- open case query;
- unauthorized case query concealment;
- acknowledge;
- assignment;
- scheduling/rescheduling;
- start work;
- answer with client/internal separation;
- request clarification;
- internal note;
- close/cancel/no-show according to valid states;
- conflict/retry behavior where practical.

### Collaboration

- case Communications tab;
- visible channel list;
- restricted channel access/concealment;
- create/update/reorder/archive authorized channel;
- manage restricted members;
- send message;
- double-submit/retry does not duplicate;
- load older messages;
- thread/reply;
- mentions;
- attach authorized case document;
- prevent inaccessible/cross-case document attachment;
- edit own;
- delete own/moderate;
- restore;
- unread count;
- mark read;
- removed workspace member loses access;
- responsive layout;
- browser refresh/back/deep link;
- no unexpected console errors.

## 50. Git discipline

Use additive commits only.

Suggested structure:

```text
feat(api): expose canonical staff query operations
feat(api): expose canonical collaboration and message operations
feat(angular): add staff queries and communications workspace
test(communications): cover authorization and message/query lifecycle
docs(phase-07): record implementation and verification
```

Exact commit grouping may follow actual work, but keep changes coherent.

Never force push.

Push only:

```bash
git push origin architecture/angular-enterprise-platform
```

Never push `main`.

## 51. Remote CI completion gate

After final push:

1. get the exact final Phase 07 SHA;
2. inspect the GitHub Actions run for that SHA;
3. verify all required jobs are green:
   - Tests (Next.js app)
   - Tests (admin CMS)
   - Lint · types · build
   - Enterprise UI (Angular)
4. if any job is red, Phase 07 is incomplete;
5. inspect logs;
6. fix the real problem in a new commit;
7. push normally;
8. verify the new final SHA is green.

Do not report completion from local tests alone.

## 52. Completion gate

Phase 07 is complete only when:

- ADR-020 is followed;
- no duplicate query/chat models are created;
- canonical staff query list/detail/lifecycle APIs exist;
- canonical case collaboration/channel/message APIs exist;
- server authorization and restricted visibility are preserved;
- optimistic concurrency works for queries/message edits;
- send/reply idempotency works;
- one-level threads remain correct;
- mentions are valid visible workspace members;
- document attachments reuse Phase 06 secure document policy;
- read/unread state is server-authoritative;
- Angular global Queries is operational;
- Angular case Communications/channels is operational;
- client/EJS compatibility is preserved;
- OpenAPI and Angular types are explicit;
- root/server/Angular tests pass;
- lint/typecheck/builds pass;
- manual QA is complete;
- no production deploy/migration/index execution occurs;
- final remote GitHub Actions run is GREEN.

## 53. Stop condition

When every completion gate is satisfied and final remote CI is green:

**STOP.**

Do not start Phase 08 automatically.

Return a completion report with:

```text
final SHA
commit list
query API/lifecycle summary
collaboration API summary
Angular features
security/visibility guarantees
idempotency/concurrency behavior
test results
build results
manual QA
migration/index impact
known limitations
GitHub Actions run number and conclusion
```

Wait for independent verification before moving to Phase 08.
