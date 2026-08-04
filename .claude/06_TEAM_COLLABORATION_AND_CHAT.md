# 06 — Team Collaboration and Chat

## Purpose

Create a Teams-style case collaboration area where managers, employees, and clients can communicate inside authorized workspaces and channels.

## Product boundary

The first release includes:

- Workspaces
- Channels
- Text messages
- Replies/threads
- Mentions
- Attachments
- Unread state
- System updates
- Client-visible and internal-only communication

It excludes:

- Audio calls
- Video calls
- Screen sharing
- Calendar integration
- Microsoft Teams integration
- Complex presence analytics

## Dependencies

- Cases and memberships
- Secure document layer for attachments
- Notifications
- Client portal and admin UI foundations

## Data models

### WorkspaceChannel

Fields:

- `workspace`
- `name`
- `slug`
- `description`
- `channelType`
- `visibility`
- `createdBy`
- `order`
- `archivedAt`
- timestamps

Channel types:

- `standard`
- `documents`
- `updates`
- `private`
- `internal`

Visibility:

- `all_members`
- `clients_and_team`
- `employees_only`
- `restricted_members`

### ChannelMember

Required only for restricted channels.

Fields:

- `channel`
- `workspaceMember`
- `status`
- `addedBy`
- timestamps

### WorkspaceMessage

Fields:

- `workspace`
- `channel`
- `senderType`
- `senderClient`
- `senderAdmin`
- `body`
- `messageType`
- `parentMessage`
- `mentions`
- `attachments`
- `editedAt`
- `deletedAt`
- timestamps

Message types:

- `text`
- `system_update`
- `document_update`
- `task_update`
- `consultation_update`

### MessageRevision

Optional but recommended for edited-message audit history.

### ChannelReadState

Fields:

- `channel`
- `workspaceMember`
- `lastReadMessage`
- `lastReadAt`

Unique index on `channel + workspaceMember`.

## Default channels

- General
- Case Updates
- Documents
- Petition Strategy
- Recommendation Letters
- USCIS Forms

Default visibility must be explicit. `Petition Strategy` should normally be employee-only.

## Access rules

- Workspace membership is required.
- Channel visibility is checked on every read and write.
- Restricted channels require active channel membership.
- Clients cannot create internal channels.
- Removed workspace members immediately lose access.
- Internal messages must never appear in client search, APIs, notifications, or exports.

## Message behavior

Support:

- Plain text
- Safe limited formatting
- Replies
- Mentions
- Attachments referencing secure documents
- Edit with revision history
- Soft delete
- Cursor pagination
- Stable chronological ordering
- Unread count

Do not accept raw HTML.

## Routes

Client:

- `GET /portal/cases/:caseId/messages`
- `GET /portal/channels/:channelId/messages`
- `POST /portal/channels/:channelId/messages`
- `POST /portal/channels/:channelId/read`
- `POST /portal/messages/:id/edit`
- `POST /portal/messages/:id/delete`

Admin:

- `GET /admin/cases/:caseId/channels`
- `POST /admin/cases/:caseId/channels`
- `POST /admin/channels/:id/members`
- `POST /admin/channels/:id/archive`
- `GET /admin/channels/:id/messages`
- `POST /admin/channels/:id/messages`

## System messages

Generate durable system messages for:

- Member added or removed
- Case stage changed
- Consultation scheduled or answered
- Document requested, uploaded, accepted, or replacement requested
- Deadline changed
- Filing completed

Only publish events appropriate for the channel's audience.

## Tests

- Client sends to allowed channel.
- Client denied from employee-only channel.
- Employee non-member denied.
- Restricted channel requires membership.
- Message text is escaped.
- Internal message never appears in client endpoint.
- Pagination is stable.
- Read state updates unread count.
- Edit creates revision.
- Soft-deleted message follows visibility rules.
- Attachment access is independently authorized.

## Acceptance criteria

- Managers can create and organize channels.
- Clients and employees can message according to membership.
- Internal/client separation is enforced in database queries and serializers.
- Messages are durable before real-time delivery is added.
- Unread state is efficient and testable.

## Claude Code handoff

Implement durable channels, messages, replies, mentions, read state, and system updates. Do not add sockets until all database-backed APIs and access tests pass.
