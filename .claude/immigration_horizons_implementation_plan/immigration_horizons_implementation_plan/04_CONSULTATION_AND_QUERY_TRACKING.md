# 04 — Consultation, Query, and Scheduling Tracking

## Purpose

Track every client question or scheduled consultation through an explicit operational lifecycle, including whether it has been acknowledged, scheduled, answered, or closed.

## Dependencies

- Client authentication
- Cases and workspaces
- Admin users
- Notifications
- Activity/audit logging

## Data models

### ConsultationInteraction

Fields:

- `clientUser`
- `consultation`
- `case`
- `workspace`
- `subject`
- `description`
- `type`
- `status`
- `priority`
- `scheduledFor`
- `timezone`
- `assignedTo`
- `answeredBy`
- `answeredAt`
- `resolutionSummary`
- `clientVisibleResponse`
- `internalResponse`
- `cancelledAt`
- `closedAt`
- `createdByType`
- `createdByClient`
- `createdByAdmin`
- timestamps

Types:

- `initial_consultation`
- `follow_up_query`
- `scheduled_consultation`
- `client_question`
- `document_question`
- `case_update_request`

Statuses:

- `submitted`
- `acknowledged`
- `scheduled`
- `in_progress`
- `answered`
- `awaiting_client`
- `rescheduled`
- `cancelled`
- `no_show`
- `closed`

### InteractionHistory

Fields:

- `interaction`
- `eventType`
- `previousStatus`
- `newStatus`
- `previousScheduledFor`
- `newScheduledFor`
- `previousAssignee`
- `newAssignee`
- `actorType`
- `actorClient`
- `actorAdmin`
- `reason`
- timestamps

History should be append-only.

## Client workflow

Client can:

- Submit a query
- Request a consultation
- View status
- View scheduled time and timezone
- Add follow-up information
- View client-visible answer
- Confirm whether the answer resolved the issue

## Employee workflow

Authorized employee can:

- Acknowledge
- Assign
- Schedule
- Reschedule
- Start work
- Answer
- Request clarification
- Mark no-show
- Cancel
- Close

## Business rules

- `answered` requires `answeredAt` and an answering employee.
- `scheduled` requires `scheduledFor` and `timezone`.
- Client-visible answer is separate from internal response.
- A message alone does not make the interaction answered.
- Every state change creates history.
- Status changes must validate the destination enum.
- Do not enforce a restrictive transition map unless approved; log and validate first.

## Routes

Client:

- `GET /portal/consultations`
- `POST /portal/consultations`
- `GET /portal/consultations/:id`
- `POST /portal/consultations/:id/follow-up`
- `POST /portal/consultations/:id/resolution-confirmation`

Admin:

- `GET /admin/queries`
- `GET /admin/queries/:id`
- `POST /admin/queries/:id/assign`
- `POST /admin/queries/:id/schedule`
- `POST /admin/queries/:id/status`
- `POST /admin/queries/:id/answer`
- `POST /admin/queries/:id/request-clarification`

## Operational queues

Admin dashboard queues:

- Unanswered
- Unassigned
- Awaiting scheduling
- Scheduled today
- Overdue response
- Awaiting client
- No-show follow-up
- Recently answered

Use indexed queries and bounded pagination.

## Notifications

Notify relevant users on:

- Submission
- Assignment
- Scheduling
- Rescheduling
- Clarification request
- Answer
- Client follow-up

Avoid duplicate notifications when values are unchanged.

## Tests

- Client submits query.
- Non-member cannot submit against another case.
- Manager assigns query.
- Scheduled state requires time and timezone.
- Answered state stores answer metadata.
- Internal response is hidden from client.
- History preserves every change.
- Unanswered queue is accurate.
- Rejected transition leaves database unchanged.

## Acceptance criteria

- Answered/unanswered is explicit and queryable.
- Scheduling is timezone-aware.
- Clients see a simplified timeline.
- Employees see full operational history.
- Queues are indexed and paginated.
- Notification failures do not corrupt interaction updates.

## Claude Code handoff

Implement consultation interactions, scheduling, answer tracking, history, queues, and notifications. Do not build chat in this module; follow-up entries may be simple interaction updates until the messaging module is complete.
