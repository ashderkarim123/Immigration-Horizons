# Immigration Horizons — Phase 07: Unified Client–Employee Case Chat

**Execution branch:** `architecture/angular-enterprise-platform`  
**Verified Phase 06 implementation baseline:** `4e344a8513716a57d7f8a97a7fefbc007fa7d024`  
**Verified Phase 06 CI:** GitHub Actions run #57 — success  
**Architecture reference:** `docs/architecture/ADR-020-canonical-staff-communications-and-collaboration.md`

## 1. Purpose

Implement a complete **two-way case chat module between Immigration Horizons clients and employees**.

The client portal and Angular staff application must operate on the same authoritative workspace chat domain:

```text
WorkspaceChannel
WorkspaceMessage
MessageRevision
ChannelReadState
WorkspaceMember
ChannelMember
```

This phase is not complete merely because employees can read/send messages in Angular.

It is complete only when the full client ↔ employee conversation works end-to-end, including direct chat file attachment, replies, edits/deletes where permitted, unread/read state, near-real-time synchronization, secure downloads and strict separation of client-visible versus internal staff channels.

Do not create a second chat/message/file-storage system.

Structured Queries/`ConsultationInteraction` must remain compatible but are secondary to the shared case chat deliverable in this execution phase.

---

## 2. Mandatory preflight

Run:

```bash
git fetch origin --prune
git switch architecture/angular-enterprise-platform
git pull --ff-only origin architecture/angular-enterprise-platform

git status --short
git branch --show-current
git rev-parse HEAD
git log --graph --decorate --oneline -40

git diff
git diff --cached

node -v
npm -v
```

Use Node 22.

Verify Phase 06 ancestry includes:

```text
4e344a8513716a57d7f8a97a7fefbc007fa7d024
```

Preserve all legitimate Phase 07 documentation commits already present.

Do not reset/rebase/amend/squash/force-push completed history.

---

## 3. Hard safety rules

- Work only on `architecture/angular-enterprise-platform`.
- Do not deploy production.
- Do not execute production DB migrations or index builds.
- Do not retire existing EJS collaboration routes.
- Do not migrate the client portal to Angular.
- Do not weaken EmployeeSession or ClientSession boundaries.
- Do not weaken trusted-origin/CSRF checks.
- Do not weaken workspace/channel row-level authorization.
- Do not weaken restricted-channel policy.
- Do not expose private document storage identifiers or URLs.
- Do not store chat file bytes directly on `WorkspaceMessage`.
- Do not create new generic Chat/Conversation/ChatMessage collections.
- Do not bypass tests or dependencies with `--force` / `--legacy-peer-deps`.
- Do not introduce a new websocket stack merely for this phase unless the repository already contains one and using it is clearly safer/simpler than polling.

---

## 4. Required reading

Read completely before coding:

```text
CLAUDE.md
AGENTS.md

.claude/DESIGN_SYSTEM.md
.claude/API_ARCHITECTURE.md
.claude/DATABASE.md
.claude/TESTING.md
.claude/SECURITY.md
.claude/06_TEAM_COLLABORATION_AND_CHAT.md

docs/architecture/ADR-001-client-portal-foundation.md
docs/architecture/ADR-004-secure-document-storage.md
docs/architecture/ADR-005-team-collaboration.md
docs/architecture/ADR-006-notifications-and-preferences.md
docs/architecture/ADR-011-client-portal-experience.md
docs/architecture/ADR-012-security-privacy-and-audit.md
docs/architecture/ADR-015-angular-enterprise-platform.md
docs/architecture/ADR-016-authentication-boundaries.md
docs/architecture/ADR-019-canonical-staff-documents-and-secure-file-operations.md
docs/architecture/ADR-020-canonical-staff-communications-and-collaboration.md

docs/implementation/ANGULAR_ENTERPRISE_PLATFORM_ROADMAP.md
docs/implementation/PHASE_06_STAFF_DOCUMENTS_SECURE_FILE_OPERATIONS_PROMPT.md
```

Inspect actual implementation, especially:

```text
server/models/WorkspaceChannel.js
server/models/WorkspaceMessage.js
server/models/MessageRevision.js
server/models/ChannelReadState.js
server/models/ChannelMember.js
server/models/WorkspaceMember.js
server/models/CaseDocument.js
server/models/DocumentVersion.js
server/models/DocumentCategory.js

server/utils/collaborationConstants.js
server/utils/messageCursor.js
server/utils/permissions.js

server/services/collaborationPolicy.js
server/services/channelService.js
server/services/messageService.js
server/services/readStateService.js
server/services/systemMessageService.js
server/services/collaborationEmail.js
server/services/notificationService.js
server/services/documentPolicy.js
server/services/documentUploadService.js
server/services/documentDownloadService.js
server/services/documentValidation.js
server/services/staffDocumentManagement.js

server/routes/admin/collaboration.js
server/routes/api/v1/staff/index.js
server/openapi/v1.yaml

src/app/(app)/portal/cases/[caseId]/messages/
src/app/api/portal/channels/
src/app/api/portal/messages/
src/lib/auth/collaboration-policy.ts
src/lib/models/WorkspaceChannel.ts
src/lib/models/WorkspaceMessage.ts
src/lib/models/MessageRevision.ts
src/lib/models/ChannelReadState.ts
src/lib/content/message-cursor.ts

enterprise-ui/projects/case-management/src/app/features/cases/
enterprise-ui/projects/case-management/src/app/features/documents/
enterprise-ui/projects/case-management/src/app/core/api/
enterprise-ui/projects/case-management/src/app/shared/

test/collaboration-routes.integration.test.ts
server/test/*collaboration*
```

Current code is authoritative when older docs disagree.

---

## 5. Product outcome

At completion, the product behaves like this:

```text
CLIENT PORTAL
Case
└── Chat
    ├── Client & Team conversation
    ├── Messages
    ├── Replies / threads
    ├── Attach file
    ├── Attach existing document
    ├── Edit/delete own permitted message
    ├── Unread state
    └── Secure attachment download

ANGULAR STAFF
Case
└── Chat / Communications
    ├── Client & Team shared conversation
    ├── Internal staff channels
    ├── Restricted channels
    ├── Messages
    ├── Replies / threads
    ├── Mentions
    ├── Attach file
    ├── Attach existing secure document
    ├── Edit/moderate/restore
    ├── Unread state
    └── Channel management where authorized
```

The client and employee must be looking at the same `WorkspaceMessage` records in shared channels.

---

## 6. Shared client-team channel

Ensure every applicable case can have an obvious client-visible shared channel equivalent to:

```text
Client & Team
```

Prefer to evolve/reuse the current default channel template and `channelService.provisionDefaultChannels()`.

Provisioning must be idempotent.

Do not create duplicates when Phase 07 runs on existing cases.

If existing default client-visible channel semantics already satisfy this requirement, reuse them rather than adding another channel.

Employees must also retain staff-only/internal channel capability where already supported.

Client-visible and staff-only channels must be visibly distinguished in staff UI and strictly separated by server policy.

---

## 7. Client portal chat requirements

The client portal must support all of the following for an active authorized workspace member:

```text
list visible chat channels
open shared channel
load message history
load older messages
see employee replies without manual full page refresh
send message
reply to message/thread
edit own eligible message
delete own eligible message
attach new local file directly from composer
attach permitted existing case document
securely download permitted attachment
mark read
see unread badges/counts
see edited/deleted state
```

Clients cannot:

```text
see staff-only channels
see hidden restricted channels
see internal/staff-only documents
moderate employee messages
restore messages
manage channels/members
send as another actor
```

Do not rely on client-side filtering for any of these restrictions.

---

## 8. Angular employee chat requirements

Build a production-quality Angular Chat/Communications case surface.

Required behavior:

```text
visible channel list
shared/internal/restricted audience labels
unread counts
message timeline
load older history
near-real-time incoming client messages
send
reply/thread
mention eligible workspace members
attach new local file
attach existing secure document
edit own when allowed
moderate/delete/restore when allowed
mark read
secure attachment download
channel management where capability permits
restricted member management where capability permits
```

The employee must be able to answer the client directly from the same shared conversation the client sees.

---

## 9. Direct chat file upload — required

This is a hard Phase 07 requirement.

The client should not have to leave Chat and navigate to Documents just to send a file with a message.

The employee should also be able to select a local file directly from the Angular composer.

But the file must still go through the existing secure document system.

Required logical flow:

```text
user chooses local file
    ↓
authorize case/channel
    ↓
secure multipart upload
    ↓
validate extension / size / actual MIME / magic bytes
    ↓
store through private document storage provider
    ↓
create CaseDocument + DocumentVersion
    ↓
validate document visibility against channel audience
    ↓
create WorkspaceMessage attachment reference
```

Do not put raw file/blob data in MongoDB message fields.

Do not store public file URLs.

Do not expose `storageKey` or paths.

---

## 10. Chat Attachments document category

Inspect existing default document categories first.

If no appropriate category exists for direct chat uploads, add an idempotently provisioned normal `DocumentCategory` with stable template key such as:

```text
chat_attachments
```

Suggested display name:

```text
Chat Attachments
```

This is NOT a new storage model.

Rules:

- normal CaseDocument category;
- not an EvidenceRequirement;
- not automatically “required evidence”;
- client-visible when uploaded into a client-visible shared conversation;
- internal when uploaded into a staff-only context;
- appropriate uploader types configured through current category semantics;
- safe for existing-category backfill/provisioning tooling.

Never change a document’s visibility merely because its message reference is client-visible.

---

## 11. Existing-document attachment

Both client and employee composers should also be able to select already-uploaded documents where authorization permits.

The backend must verify:

```text
same case
same workspace
actor can access document
document can be shown to target channel audience
version belongs to document
file state is downloadable under existing policy
```

For a client-visible channel, do not offer or accept staff-only documents.

Downloads remain through the Phase 06 secure download routes and `DocumentAccessLog`.

---

## 12. File upload idempotency / failure design

Do not create duplicate CaseDocument records because the user retries the same pending send.

Design a deliberate transaction/orchestration strategy.

Possible safe patterns include:

1. upload document first using its own idempotency token, then send message referencing returned document/version;
2. a backend orchestrated multipart “message with upload” endpoint with one operation id and explicit cleanup/recovery behavior.

Choose the pattern that best fits current architecture.

Document the decision in the Phase 07 report.

If durable document storage succeeds but message creation fails, do not silently lose the document. Return a recoverable state and allow the user to retry attaching the stored document.

Temp files must always be cleaned after failed validation/auth/persistence.

---

## 13. Near-real-time synchronization — required

The chat must update without requiring the user to manually refresh the full page.

Do not add infrastructure for its own sake.

If no realtime bus exists, implement bounded polling/incremental synchronization.

Recommended behavior:

```text
open visible channel -> poll every ~3–5 seconds while page/tab is visible
hidden tab -> pause or significantly slow polling
request only messages newer than known boundary when possible
merge by message id
never duplicate optimistic/server results
back off on repeated errors
retry manually when disconnected
```

Historical loading continues using cursor pagination.

Do not repeatedly download the full entire channel every few seconds.

Do not introduce Socket.IO/WebSocket unless current architecture already contains a suitable implementation.

Typing indicators / online presence are out of scope.

---

## 14. Staff canonical chat API

Implement canonical staff collaboration routes under `/api/v1/staff`.

Expected family:

```text
GET    /api/v1/staff/cases/:caseId/channels
POST   /api/v1/staff/cases/:caseId/channels/initialize
POST   /api/v1/staff/cases/:caseId/channels
POST   /api/v1/staff/cases/:caseId/channels/reorder

GET    /api/v1/staff/channels/:channelId
PATCH  /api/v1/staff/channels/:channelId
POST   /api/v1/staff/channels/:channelId/archive

GET    /api/v1/staff/channels/:channelId/messages
GET    /api/v1/staff/channels/:channelId/messages/newer   # if needed for polling
POST   /api/v1/staff/channels/:channelId/messages
POST   /api/v1/staff/channels/:channelId/message-upload  # only if orchestration approach chosen

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

Adapt route details to existing API style when materially cleaner.

Do not add hard message delete.

---

## 15. Portal chat APIs

Extend/reuse the existing portal routes, including current equivalents of:

```text
src/app/api/portal/channels/[channelId]/messages
src/app/api/portal/channels/[channelId]/read
src/app/api/portal/messages/[messageId]/replies
src/app/api/portal/messages/[messageId]/edit
src/app/api/portal/messages/[messageId]/delete
```

Add the minimum additional portal route(s) required for:

```text
incremental/new-message sync
direct secure chat attachment upload
attachment eligibility/listing if needed
```

Do not make clients call `/api/v1/staff` endpoints.

Client authentication remains ClientSession-based and separate from EmployeeSession.

---

## 16. Authorization — employee

Reuse `collaborationPolicy` and current capabilities:

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

Every action also checks workspace/channel row access.

Restricted channels require current restricted-member rules.

Removed employee workspace members lose access immediately.

Do not infer permission from Angular buttons.

---

## 17. Authorization — client

Reuse current portal collaboration policy.

Required server checks:

```text
authenticated active ClientSession
active/eligible WorkspaceMember for case
channel belongs to workspace/case
channel is client-visible or restricted in a way that includes actor
message belongs to visible channel
attachment is safe for actor/channel
```

Client cannot choose arbitrary sender IDs, workspace IDs, case IDs or clientVisible flags.

---

## 18. Existence concealment

For inaccessible resources, preserve safe not-found behavior where current app architecture uses it.

Do not leak:

```text
staff-only channel names
restricted channel existence
message sender names
unread counts
attachment display names
```

before authorization.

Guessing IDs must never widen access.

---

## 19. Message DTOs

Do not return raw Mongoose documents.

Create/reuse explicit serializers for safe staff and client DTOs.

Possible safe message fields:

```text
id
senderType
senderDisplayName
body
messageType
parentMessageId
threadRootId
replyCount
lastReplyAt
mentions
attachments
editedAt
deletedAt
createdAt
updatedAt
canEdit
canDelete
canRestore  # staff when permitted
```

Attachment DTOs can expose:

```text
documentId
versionId
displayName
mimeType/extension
size
download capability/action
```

Never expose:

```text
storageKey
privatePath
storageRoot
tempPath
password/token/session secrets
raw AdminUser
raw ClientUser
staff-only document metadata to client
```

Add recursive DTO leakage tests.

---

## 20. Message sending

Reuse `messageService.createMessage`.

Both client and employee sends use idempotency keys.

Server controls:

```text
sender identity
workspace
case
channel
sender display snapshot
clientVisible semantics
validated mentions
validated attachments
thread root
created timestamps
```

The UI does not submit authoritative sender fields.

Empty-body messages are allowed only when at least one valid attachment exists, matching current model semantics.

---

## 21. Replies and threads

Preserve the current one-level thread model.

Root message + replies.

Reply-to-reply normalizes to root.

Both portal and Angular show the same thread.

Use cursor pagination for large threads/history where current utilities support it.

---

## 22. Editing and revision history

Reuse current edit service and `MessageRevision`.

Preserve optimistic concurrency.

A stale edit returns `409` or repository-standard conflict semantics.

Do not silently overwrite newer message content.

Only eligible own messages can be edited according to policy.

---

## 23. Delete / moderation / restore

Use existing soft-delete semantics.

Client:

```text
may delete own permitted messages only
cannot restore
cannot moderate employee/client messages from others
```

Employee:

```text
own delete/edit per policy
moderation/restore only with correct capability
```

Deleted messages must preserve thread continuity and render a deleted-state placeholder according to existing product rules.

No physical hard delete.

---

## 24. Mentions

Employees may mention eligible workspace members when current service supports it.

Client mention behavior should remain exactly as current policy/service permits; do not widen it automatically.

Every mentioned member must be authorized to see the target channel.

No arbitrary email/user IDs.

Mention side-effect notification failures do not roll back successfully stored message unless current service explicitly does so.

---

## 25. Read / unread state

Reuse `ChannelReadState` and `readStateService`.

Both surfaces need:

```text
unread count per visible channel
mark channel read
correct self-message exclusion
no hidden channel leakage
```

If a global Chat navigation badge is easy to derive from visible channels, add it.

Do not create another unread collection.

Do not fake per-message read receipts if the model only supports channel-level read state.

---

## 26. Notifications and emails

Preserve existing:

```text
notificationService
collaborationEmail
notification preferences
```

Client sends should notify appropriate employees according to current rules/preferences.

Employee client-visible sends should notify appropriate client workspace members.

Avoid notification storms caused by polling.

Polling only reads; it must not create notifications.

Do not create a second notification engine.

---

## 27. Staff UI design

Use the existing Angular enterprise design system.

No Material/PrimeNG/Bootstrap/new CSS framework.

Recommended desktop layout:

```text
┌──────────────────┬──────────────────────────────┬──────────────────┐
│ Conversations    │ Message timeline             │ Thread / details │
│                  │                              │ optional         │
└──────────────────┴──────────────────────────────┴──────────────────┘
```

On smaller screens, collapse to conversation list -> conversation -> thread navigation.

Required UX details:

- obvious audience badge: CLIENT + TEAM / STAFF ONLY / RESTRICTED;
- sender name + timestamp;
- edited indicator;
- attachment cards;
- load older;
- unread divider/count;
- composer with multiline input;
- Attach file;
- attach existing document;
- send disabled while identical operation active;
- send/upload progress or pending state;
- retry after failure;
- thread/reply action;
- edit/delete menus;
- reconnect/sync error state;
- no automatic scroll jump while user is reading old history.

---

## 28. Client portal UI design

Refine existing portal Messages pages into a modern case chat UX.

Required:

- `Chat` or `Messages` visible in case navigation;
- unread badge;
- channel list if more than one client-visible channel;
- client-team conversation clearly named;
- responsive message timeline;
- sender distinction;
- new employee messages arrive without manual page refresh;
- composer;
- Attach file button;
- selected file display before sending;
- upload/send pending state;
- reply/thread;
- edit/delete own eligible message;
- attachment download;
- loading/empty/error/retry states;
- mobile-first layout;
- accessibility labels and keyboard focus.

Do not expose employee internal role metadata unnecessarily.

---

## 29. Structured Queries scope

Do not break existing `ConsultationInteraction` / Query functionality.

However, do not let rebuilding the entire Queries module block or dilute the shared chat implementation.

For Phase 07 priority order:

```text
1. Shared client ↔ employee case chat
2. Secure direct attachments
3. Read/unread + near-real-time sync
4. Staff internal/restricted channel parity
5. Preserve existing Query functionality
6. Optional canonical Angular Query migration only if capacity remains
```

If Queries are deferred, document the deferral clearly in the Phase 07 completion report and future roadmap.

---

## 30. OpenAPI

Update `server/openapi/v1.yaml` for staff chat endpoints.

Document:

```text
channel list/detail
message list/cursor/newer sync
send/reply/edit/delete/restore
read state
member management
multipart chat upload if used
normal secure document attachment references
error/conflict semantics
```

Portal APIs are not necessarily part of the staff OpenAPI file if existing architecture keeps them separate, but tests and route documentation must remain accurate.

---

## 31. Required automated testing

### Shared round trip

```text
client sends -> employee canonical staff API reads it
employee sends -> client portal reads it
client reply -> employee thread sees it
employee reply -> client thread sees it
```

### Idempotency

```text
double client send -> one message
double employee send -> one message
retry same intent -> same message result
```

### Client authorization

```text
active member access
inactive/removed member denied
other case denied
staff-only channel hidden
restricted channel hidden when not a member
guessed message denied
```

### Employee authorization

```text
case member + capability allowed
removed member denied
restricted membership enforced
message mutation capabilities enforced
moderation capability enforced
```

### Direct attachments

```text
client valid file upload + message succeeds
employee valid file upload + message succeeds
invalid extension rejected
magic-byte mismatch rejected
oversized rejected
cross-case attachment rejected
staff-only document into client-visible channel rejected
client cannot download internal attachment
temp file cleanup after failure
storage metadata never leaks
```

### Existing attachments

```text
existing valid client-visible document attach succeeds
wrong-case document rejected
wrong version/document relation rejected
secure download reauthorizes
```

### Message lifecycle

```text
client edit own
client cannot edit employee
employee edit own
stale edit conflict
revision created
client delete own soft-delete
employee moderation delete/restore
thread continuity remains
```

### Read state

```text
employee message increments client unread
client message increments employee unread
own send not own unread
mark read clears/updates
hidden channel never leaks count
```

### Sync

```text
newer/incremental endpoint returns only newer authorized messages
merge is deterministic
no duplicate on repeated poll
malformed boundary fails safely
```

### UI tests

Cover Angular and portal for:

```text
loading
empty
send
reply
edit/delete
attachment select/upload
attachment failure
unread
incoming refresh/poll
sync error/retry
audience labels
responsive behavior
```

Preserve all existing collaboration tests.

---

## 32. Required local verification

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

If CI commands have legitimately evolved, use the repository’s real workflow commands while preserving equivalent coverage.

---

## 33. Manual QA

Perform an actual two-browser/session round trip.

Minimum manual QA:

1. Sign in as client A.
2. Open an authorized case Chat.
3. Confirm staff-only channels are absent.
4. Send text message.
5. Open employee Angular app as assigned/authorized employee.
6. Confirm client message appears without full-page refresh.
7. Reply as employee.
8. Confirm employee reply appears in client chat without full-page refresh.
9. Client replies in a thread.
10. Employee sees same thread and replies.
11. Client edits own message.
12. Confirm employee sees edited state/content.
13. Client soft-deletes own message.
14. Confirm thread continuity remains.
15. Client selects a new file directly in chat and sends it.
16. Employee can see/download the authorized attachment.
17. Employee attaches a new file in the shared chat.
18. Client can see/download it only when its visibility is valid.
19. Employee attaches/selects an internal document in staff-only channel and verify client cannot discover/access it.
20. Validate unread counts in both directions.
21. Validate mark-read behavior.
22. Remove employee workspace access and confirm chat access disappears.
23. Remove/disable client workspace access and confirm portal chat access disappears.
24. Test responsive/mobile client chat.
25. Test Angular responsive layout.
26. Verify browser consoles have no unexpected errors.
27. Inspect network responses for storage/private metadata leakage.

---

## 34. Completion report

Create:

```text
docs/implementation/PHASE_07_UNIFIED_CASE_CHAT_REPORT.md
```

Report must include:

```text
starting SHA
ending SHA
final commits
shared-channel design
client portal changes
staff Angular changes
staff API changes
portal API changes
near-real-time sync strategy
chat attachment upload architecture
chat attachment category decision
idempotency design
security/authorization decisions
DTO contracts
read/unread behavior
notification behavior
Queries scope completed/deferred
tests/builds/manual QA
migration/index impact
production impact
known limitations
rollback considerations
final GitHub Actions run and conclusion
```

---

## 35. Git strategy

Use normal additive commits.

Suggested sequence:

```text
feat(chat): add canonical staff workspace chat api
feat(chat): add secure direct chat attachments
feat(angular): add client-team case chat workspace
feat(portal): refine two-way case chat experience
test(chat): cover cross-writer messaging and attachment security
docs(phase-07): record unified case chat verification
```

Do not amend old Phase 01–06 commits.

Push only:

```bash
git push origin architecture/angular-enterprise-platform
```

Never deploy production.

---

## 36. Remote CI completion gate

After final push:

1. verify CI for the exact final SHA;
2. all required jobs must be green;
3. if red, Phase 07 is incomplete;
4. inspect/fix the real failure;
5. commit fix as a new commit;
6. push normally;
7. verify new CI run;
8. never force-push completed history.

---

## 37. Stop condition

Phase 07 is complete only when the client and employee can genuinely chat with each other on the same case conversation, including secure direct attachments and unread/sync behavior, and the final remote CI is green.

Then STOP.

Do not begin Phase 08 automatically.

Return:

```text
final SHA
commit list
client chat features
staff chat features
chat attachment architecture
API routes added/changed
security controls preserved
sync strategy
read/unread behavior
test results
build results
manual QA result
migration/index impact
known limitations
GitHub Actions run number + conclusion
```
