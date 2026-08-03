# 07 — Notifications and Real-Time Delivery

## Purpose

Provide reliable in-app notifications and optional live updates without making real-time connectivity the source of truth.

## Dependencies

- Client accounts
- Workspaces
- Queries
- Documents
- Messaging
- Deployment architecture

## Notification model evolution

The current admin notification system addresses users by display name. Migrate toward immutable recipient identities while preserving backward compatibility.

Recommended fields:

- `recipientType`: `client` or `employee`
- `recipientClient`
- `recipientAdmin`
- `eventType`
- `title`
- `body`
- `case`
- `workspace`
- `channel`
- `message`
- `document`
- `interaction`
- `readAt`
- `emailState`
- `dedupeKey`
- timestamps

Indexes:

- Recipient identity + unread/read + createdAt
- Unique/selective dedupe key where useful

## Notification events

Immediate in-app events:

- Portal invitation
- Case assignment
- Query submitted, assigned, scheduled, answered
- Document requested, uploaded, reviewed, replacement requested
- Mention
- Important case update
- New client message

Email policy:

- Immediate for invitations
- Immediate for schedule changes
- Immediate for replacement requests
- Optional for mentions
- Digest for routine unread messages

Do not send an email for every message by default.

## Real-time architecture

Preferred after deployment review:

- Socket.IO attached to Express
- Same session authentication as HTTP
- Authorized rooms based on workspace/channel membership
- Durable database write before event emission
- Shared adapter/pub-sub for multiple instances

Alternative managed services may be considered if deployment makes Socket.IO impractical.

## Security rules

- Authenticate every socket connection.
- Re-check membership on every room join.
- Do not trust client-provided room names.
- Removed members must be disconnected or denied subsequent events.
- Event payloads must use the same serializers as HTTP APIs.
- Internal events must never be emitted to client rooms.

## Reliability rules

- Database is the source of truth.
- Reconnect fetches missed history.
- Idempotency prevents duplicate messages/notifications.
- Event delivery failure does not roll back the durable action.
- Retry only safe, idempotent notification operations.

## Presence

Presence is optional. Implement only when it can be accurate enough to avoid misleading users.

## Tests

- Notification deduplication.
- Correct recipient identity.
- Removed member receives no event.
- Client receives no internal event.
- Socket reconnect fetches missed messages.
- Duplicate event does not duplicate durable data.
- Multi-instance requirements are documented.

## Acceptance criteria

- Notifications use immutable recipient IDs.
- Unread counts are correct.
- Real-time events mirror durable records.
- HTTP APIs remain fully functional without sockets.
- Scaling requirements are documented.

## Claude Code handoff

First migrate notifications to immutable recipients and add preferences. Then add Socket.IO only after reviewing reverse proxy, shared sessions, and multi-instance deployment. Keep HTTP/database behavior authoritative.
