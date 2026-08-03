# 08 — Admin Case Operations

## Purpose

Extend the existing Express/EJS admin system into an operational console for cases, clients, queries, documents, team membership, and client communications.

## Dependencies

- Existing capability system
- Cases/workspaces
- Query tracking
- Documents
- Collaboration
- Notifications

## Admin modules

### Client management

- Client list
- Account status
- Linked consultations
- Linked cases
- Invitation status
- Resend/revoke invitation
- Disable/reactivate account
- Security event summary

### Case management

- Cases list
- Filters and pagination
- Case detail
- Convert lead to case
- Change stage
- Assign project manager
- Manage members
- Archive/close
- View activity

### Query operations

Queues:

- New/unacknowledged
- Unassigned
- Scheduling required
- Scheduled today
- Awaiting answer
- Awaiting client
- Overdue
- Closed recently

### Document operations

Queues:

- Awaiting review
- Replacement requested
- Overdue request
- Quarantined
- Recently accepted

### Collaboration operations

- Channels
- Membership
- Unread client messages
- Mentions
- Publish client-visible updates
- Internal discussions

## Suggested capabilities

- `clients.view`
- `clients.manage`
- `cases.view`
- `cases.create`
- `cases.manage`
- `cases.assign`
- `workspace.members.manage`
- `queries.view`
- `queries.assign`
- `queries.answer`
- `documents.view`
- `documents.review`
- `document_requests.manage`
- `channels.manage`
- `messages.send`
- `messages.moderate`
- `client_updates.publish`

Every route must also perform record-level membership or elevated-access checks.

## Dashboard requirements

Show operational counts:

- Cases without project managers
- Unanswered client queries
- Queries awaiting scheduling
- Documents awaiting review
- Replacement documents overdue
- Unread client messages
- Upcoming filing deadlines
- Cases stalled by stage

Use efficient aggregations and indexes. Avoid N+1 database queries.

## UI requirements

- Reuse existing admin layout and EJS conventions.
- Hide unauthorized actions for usability, but always enforce server-side.
- Keep user-controlled values escaped.
- Use consistent empty states and status badges.
- Preserve filters through pagination.
- Use explicit sort allowlists.
- Bound history, tasks, messages, and document results.

## Activity logging

Log:

- Case conversion
- Manager assignment
- Member add/remove
- Stage changes
- Query actions
- Document review actions
- Channel creation/archive
- Client-visible update publication

Use structured metadata and avoid secrets or full document contents.

## Tests

- Capability and row-level enforcement.
- Manager can convert lead.
- Specialist sees only permitted case.
- Unauthorized user cannot review document.
- Internal-only data absent from client serializers.
- Queues return correct counts.
- Filters and pagination are stable.

## Acceptance criteria

- Admin staff can manage the complete case lifecycle.
- Operational queues are accurate.
- Capabilities and membership checks are consistently applied.
- Existing lead/task/sprint workflows remain functional.
- No new admin page introduces raw HTML rendering.

## Claude Code handoff

Implement admin pages and queues incrementally after each underlying domain module exists. Do not create placeholder UI for models that have not been implemented and tested.
