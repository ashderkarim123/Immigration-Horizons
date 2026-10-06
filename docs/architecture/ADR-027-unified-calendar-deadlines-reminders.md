# ADR-027 — Unified Calendar, Deadlines & Reminder Engine

**Status:** Accepted for Phase 12 implementation  
**Date:** 2026-10-06  
**Branch:** `phase-12/calendar-reminders`  
**Baseline:** `main@46bfe606b0b7dac2f065051b6d642ed2ea42d9df`

## Context

Immigration Horizons now has a working production Staff platform and several authoritative date-bearing domains:

- case target filing dates;
- case-native task due dates;
- document-request due dates;
- consultation/query scheduled times and response due dates;
- USCIS action-required / response due dates;
- future manual case appointments and milestones.

These dates currently appear inside their own modules and queues. The platform does not yet provide one authorized calendar view or one durable reminder engine.

The important architectural constraint is that these source models already own their dates. Creating a second "calendar row" for every task, request or USCIS deadline would create synchronization bugs.

## Decision summary

Phase 12 introduces a **projection-based calendar** and **derived reminder engine**.

1. Existing domain models remain authoritative for their own dates.
2. The calendar service normalizes those dates into one `CalendarItem` DTO at read time.
3. Only genuinely manual case events receive a new persistent model: `CaseCalendarEvent`.
4. Automated reminders are derived from current authoritative source dates and written through the existing Notification system using deterministic dedupe keys.
5. No duplicate `CalendarItem` collection is created.
6. Reminder delivery remains idempotent even if the reminder worker runs twice.
7. Date-only deadlines and timed appointments are treated differently.
8. Staff calendar access remains capability + case/workspace scoped.
9. Client calendar data is a separate safe projection and never reuses the Staff DTO blindly.
10. No external Google/Microsoft calendar synchronization is added in Phase 12.

## Time semantics

### Canonical storage

Exact instants are stored as UTC MongoDB dates.

Examples:

- consultation appointment;
- manual timed meeting;
- interview;
- timed case event.

The originating IANA timezone is stored alongside manually created timed events where the wall-clock interpretation matters.

### Date-only deadlines

Existing fields such as task/document/case/USCIS response due dates are operational/legal dates, not "midnight appointments".

Calendar projection treats date-only sources as:

```text
YYYY-MM-DD
```

and does not shift the displayed calendar day merely because the user is in another timezone.

Where the current source stores a MongoDB Date for a date-only value, its UTC calendar date is the canonical date-only projection.

### User timezone

Add an optional IANA `timeZone` preference to `AdminUser`.

Resolution order:

1. employee's validated IANA timezone;
2. server `PRACTICE_TIME_ZONE`;
3. `UTC`.

Do not guess a timezone from IP address.

A Staff preference endpoint may update the user's timezone. The browser may suggest its current timezone, but the backend validates before saving it.

### Practice timezone

Add:

```text
PRACTICE_TIME_ZONE=
```

to server configuration examples.

If absent, the code must fail safely to UTC and expose the fallback clearly in Staff calendar settings. Do not silently assume America/New_York or any other location.

## Calendar source adapters

One application service aggregates source adapters into a common DTO.

Initial Staff sources:

### Case target filing

Authoritative field:

`ClientCase.targetFilingDate`

Visible only where the actor may view the case.

### Task due date

Authoritative field:

`Task.dueDate`

Completed tasks may be hidden by default but remain queryable when historical/completed filters explicitly request them.

### Document request due date

Authoritative field:

`DocumentRequest.dueDate`

Staff visibility follows document/request capability plus case row authorization.

### Query / consultation appointment

Authoritative field:

`ConsultationInteraction.scheduledFor`

This is a timed event and retains `ConsultationInteraction.timezone`.

### Query response due date

Authoritative field:

`ConsultationInteraction.responseDueAt`

Only real explicitly stored values appear. Phase 12 does not invent an SLA or derive a date automatically.

### USCIS action response date

Authoritative field:

`USCISFiling.responseDueAt`

Only when `actionRequired=true` and a real staff-entered date exists.

Phase 11 remains authoritative. Calendar/reminders do not parse USCIS text to invent a deadline.

### Manual case event

Authoritative model:

`CaseCalendarEvent`

This is the only new source intended specifically for dates that do not already belong to another domain object.

## CalendarItem DTO

A normalized calendar item is a transport/read model, not a Mongo collection.

Representative shape:

```text
id                     stable source key
sourceType
sourceId
sourceField             optional

caseId
caseNumber
caseTitle

kind
title
description             safe Staff summary only

time:
  mode                   date | datetime
  date                   YYYY-MM-DD when mode=date
  startAt                ISO when mode=datetime
  endAt                  ISO | null
  timeZone               IANA | null
  allDay                 boolean

status
priority
actionRequired

assignee / owner summary

href                   safe in-app destination
clientVisible

actions:
  canEdit
  canCancel
```

Stable IDs should look conceptually like:

```text
task:<taskId>:dueDate
document_request:<id>:dueDate
case:<caseId>:targetFilingDate
query:<id>:scheduledFor
query:<id>:responseDueAt
uscis:<filingId>:responseDueAt
manual_event:<eventId>
```

Do not expose raw Mongo documents.

## CaseCalendarEvent

Collection:

`case_calendar_events`

Purpose: case-scoped dates that are not already represented by another domain model.

Recommended fields:

```text
case                  ObjectId ClientCase
workspace             ObjectId CaseWorkspace

eventType             appointment | consultation | interview | biometrics |
                      meeting | deadline | milestone | other

internalTitle         string
internalDescription   string

allDay                boolean

startDate             YYYY-MM-DD | null
endDate               YYYY-MM-DD | null

startAt               Date | null
endAt                 Date | null
timeZone              IANA | null

location              string
meetingUrl            safe https URL | null

employeeAttendees[]   AdminUser ids

clientVisible         boolean
clientTitle           string
clientDescription     string

status                scheduled | completed | cancelled
cancelledAt           Date | null

createdBy
createdByName
updatedBy
updatedByName

timestamps
```

Validation:

- all-day event requires `startDate` and no `startAt`;
- timed event requires `startAt` and valid IANA timezone;
- end cannot precede start;
- employee attendees must be active members of the case workspace unless the actor has an explicit org-wide administrative rule that current case policy already supports;
- `meetingUrl`, if present, must be HTTPS;
- if clientVisible=true, `clientTitle` must be intentional and non-empty.

Do not expose `internalDescription` to clients.

Cancellation is non-destructive. No hard-delete route in ordinary Staff UI.

## Capabilities

Add explicit capabilities:

```text
calendar.view
calendar.manage
```

Suggested grants:

### calendar.view

- super_admin
- admin
- operations_admin
- pm
- petition_writer
- business_plan_specialist
- recommendation_letter_specialist
- uscis_forms_specialist
- evidence_collector
- reviewer

### calendar.manage

- super_admin
- admin
- operations_admin
- pm

Specialists can see authorized case dates but cannot create/change firm-level case events by default.

Every case-scoped item still requires the underlying domain capability where relevant and row authorization.

`calendar.view` never becomes a bypass around `cases.view`, `documents.view`, `queries.view`, or `uscis_tracking.view`.

## Calendar API

Staff:

```text
GET    /api/v1/staff/calendar
GET    /api/v1/staff/calendar/config
PATCH  /api/v1/staff/calendar/preferences

POST   /api/v1/staff/cases/:caseId/calendar-events
GET    /api/v1/staff/calendar-events/:eventId
PATCH  /api/v1/staff/calendar-events/:eventId
POST   /api/v1/staff/calendar-events/:eventId/cancel
```

Calendar query parameters should include:

- `from`;
- `to`;
- `timeZone`;
- source/kind filters;
- scope;
- assignee where authorized;
- case id where authorized;
- includeCompleted;
- bounded maximum range.

Do not allow an unbounded all-history calendar query.

## Staff UX

Add a production-quality Angular route:

```text
/staff/calendar
```

Recommended views:

- Month;
- Week / schedule;
- Agenda.

If a fully accessible week grid is not safely achievable without a large dependency, Month + Agenda is preferred over a visually impressive but inaccessible grid.

Filters:

- My calendar / authorized team scope;
- Cases;
- Tasks;
- Appointments;
- Document deadlines;
- USCIS response dates;
- filing dates;
- manual events.

Calendar items link back to their owning real module.

Example:

```text
Task deadline -> case Tasks tab
Document request -> case Documents tab
USCIS response -> Case Tracking
Appointment/query -> relevant query/case
Case target filing -> case Overview
Manual event -> event detail/edit dialog
```

The Calendar is an operational index, not a replacement editor for every source domain.

## Case workspace UX

Add an `Upcoming` / `Calendar` panel or tab consistent with current case navigation.

Show near-term dates for that case.

Manual events may be created there when authorized.

Do not duplicate task editing or USCIS editing into the calendar; deep-link to the real source UI.

## Client Portal projection

Clients receive a separate read-only safe calendar/upcoming view.

Eligible sources:

- their own document-request due dates;
- their own scheduled consultation/query events when current portal policy permits;
- client-visible USCIS response dates;
- client-visible `CaseCalendarEvent`.

Do **not** expose:

- Staff tasks;
- internal target filing dates by default;
- internal query response deadlines;
- internal manual events;
- employee-only notes;
- hidden USCIS dates.

A Client Portal source adapter must re-check active client workspace membership and the source's own visibility/ownership rules.

## Reminder engine

Do not create a duplicate reminder row for every calendar item.

The reminder service queries authoritative sources and computes the current reminder bucket.

### Default deadline buckets

Code-owned defaults for Phase 12:

- due within 7 days;
- due tomorrow;
- due today;
- overdue.

### Default timed-event buckets

- within 24 hours;
- within 1 hour.

These values may become administrator-configurable later. Do not create an over-general rules DSL now.

## Reminder recipients

Recipients are source-specific.

Examples:

### Task

- task assignee;
- project manager where the product rule explicitly includes them.

### Case target filing

- project manager.

### Document request

- responsible/requesting employee;
- requested client only when the existing client notification policy permits it.

Do not create a second daily overdue email path that conflicts with the existing `document_request_overdue` job. Phase 12 must inspect and either:

1. preserve that pass and exclude the duplicate overdue client notification from the new engine, or
2. deliberately migrate it into the new reminder service with regression tests and remove only the redundant code path.

Never run both duplicate reminder senders.

### Query appointment / response

- assigned employee;
- client only for a client-visible/scheduled client appointment.

### USCIS response deadline

- case PM;
- other Staff only according to deliberate assignment/capability rules;
- client only when the filing/current event is client-visible and the due date is client-visible under Phase 11 rules.

### Manual event

- explicit active employee attendees;
- active client members only when the event is explicitly client-visible.

## Reminder deduplication

Use the existing Notification `dedupeKey` unique index.

A reminder key includes:

- source type;
- source id;
- source field;
- current due/scheduled date value;
- recipient identity;
- reminder bucket.

Conceptual:

```text
calendar:task:<taskId>:dueDate:2026-10-20:<adminId>:due_tomorrow
```

If a due date changes, the key changes. Old notifications remain historical and the new date can generate a new reminder.

Repeated worker runs create no duplicate notification.

## Reminder notification types

Add a minimal set:

```text
calendar_deadline_reminder
calendar_appointment_reminder
```

Keep source-specific legacy types where they already have established behavior.

Reminder notifications are durable in-app first.

Existing digest email can include them according to current notification preference rules.

Phase 12 does not need to invent a second mail subsystem.

## Reminder preferences

Extend `NotificationPreference` additively with simple booleans:

```text
deadlineReminders
appointmentReminders
```

Default true.

Avoid per-event-type matrices and arbitrary user-authored reminder expressions.

Employee/client preferences can opt out of reminder notification categories where product policy permits.

Critical firm workflow visibility in the Calendar itself is unaffected by notification preferences.

## Reminder worker

Create one reusable reminder service plus two entry points:

```text
server/services/calendarReminderService.js
server/scripts/runCalendarReminders.js
server/workers/calendarReminderWorker.js
```

### Script

`runCalendarReminders.js`:

- dry-run by default;
- `--apply` to create notifications;
- no production write without explicit apply;
- prints safe counts, not case/client secrets.

### Worker

A dedicated PM2 process may call the same service periodically.

It must:

- be idempotent;
- tolerate overlap/restart;
- never require an in-memory "last run" to avoid duplicates;
- use Notification dedupe;
- log safe counts;
- back off on DB failure;
- shut down on SIGTERM;
- be disabled through `CALENDAR_REMINDERS_ENABLED=false`.

Recommended server env:

```text
PRACTICE_TIME_ZONE=
CALENDAR_REMINDERS_ENABLED=false
CALENDAR_REMINDER_INTERVAL_MS=300000
```

Implementation may add a dedicated PM2 app only if the deploy/reload behavior is verified. The implementation branch itself must not enable the worker in production.

## Reminder time calculation

Use an established timezone-capable server library rather than handwritten timezone math.

The server computes reminder dates using validated IANA zones.

Do not parse locale strings with string slicing.

For all-day dates, reminder evaluation uses the recipient timezone when known, otherwise the practice timezone, otherwise UTC.

For timed events, the actual UTC instant is authoritative.

## Source state rules

Reminder service ignores irrelevant completed/cancelled sources.

Examples:

- completed task -> no future due reminder;
- fulfilled/cancelled document request -> no reminder;
- cancelled/closed appointment where appropriate -> no appointment reminder;
- USCIS actionRequired=false -> no response-deadline reminder;
- archived case -> excluded by default;
- cancelled manual event -> no reminder.

The service evaluates current source state every run.

## Indexes

Add only indexes that serve implemented queries.

Likely additions:

### case_calendar_events

- `{case, status, startAt}`;
- `{case, status, startDate}`;
- `{startAt, status}`;
- `{startDate, status}`.

### existing models

Review real Phase 12 query plans before adding:

- Task `{case, status, dueDate}`;
- Task `{assignee, status, dueDate}`;
- ClientCase `{archivedAt, targetFilingDate}`;
- case-scoped scheduled/response interaction indexes where needed.

Existing DocumentRequest and USCIS deadline indexes may already be sufficient.

Additive createIndexes only. Never `syncIndexes()`.

## Audit

Manual event lifecycle should generate safe CaseActivity entries:

```text
calendar_event_created
calendar_event_updated
calendar_event_cancelled
```

Do not log internal descriptions or meeting links in generic activity text.

Derived calendar reads and reminder-worker scans are not CaseActivity events.

## Security

Calendar aggregation must never widen row access.

Each source adapter starts from the actor's authorized case/resource scope.

A global calendar query must not:

1. fetch all firm dates;
2. return them;
3. rely on Angular to hide unauthorized rows.

Filtering is server-side.

Reminder workers are system actors, but recipients are derived from current authoritative membership/assignment every run.

Removed members/clients must not receive new case reminders.

## Testing

Required server coverage:

- all calendar source adapters;
- date-only remains on same calendar date across timezones;
- timed appointment renders correct instant;
- invalid IANA zone rejected;
- manual event all-day/timed validation;
- attendee must be active workspace member;
- clientVisible safe projection;
- Staff source capability filtering;
- case row scope;
- removed member denial;
- bounded range query;
- dedupe reminder key;
- due-date change generates a new reminder key;
- completed/cancelled source does not remind;
- reminder preference opt-out;
- document overdue duplicate-path regression;
- USCIS action-required due source;
- internal USCIS due date never leaks to client;
- worker rerun produces no duplicate notification;
- overlapping workers remain idempotent.

Angular:

- Month/Agenda rendering;
- filters;
- timezone setting;
- manual event create/edit/cancel;
- links into real source screens;
- loading/empty/error;
- responsive behavior;
- capabilities.

Client Portal:

- only safe sources;
- removed membership;
- hidden manual event;
- hidden USCIS deadline;
- requested-document due date;
- scheduled client appointment;
- no Staff task leakage.

Browser:

- PM sees unified dates from multiple real source modules;
- PM creates manual event;
- specialist sees only assigned-case calendar;
- client sees only client-safe items;
- reminder service creates exactly one notification for a synthetic due source.

## Deployment and rollout

Phase 12 implementation does not automatically:

- merge to main;
- enable reminder worker in production;
- apply production indexes;
- change nginx;
- apply broad data migrations.

When release is approved:

1. backup database;
2. review/apply additive indexes;
3. set `PRACTICE_TIME_ZONE`;
4. deploy with reminder worker disabled;
5. verify Calendar reads/manual events;
6. dry-run reminders;
7. enable reminder worker deliberately;
8. monitor dedupe/logs/notifications.

## Consequences

The platform gains one coherent calendar without taking ownership away from Tasks, Documents, Queries, Cases or USCIS.

Dates change in their real module and the Calendar reflects the change automatically.

The reminder engine is resilient to worker retries because Notification dedupe is the persistence guard.

A later external calendar integration (Google/Microsoft) can consume the same normalized CalendarItem feed without becoming the source of truth.

## Implementation notes (Phase 12)

Decisions made while implementing, where the text above left a choice.

- **Time.** Task, document request, query response, USCIS response, target filing and all-day event dates are date-only: stored as a Mongo Date (or a `YYYY-MM-DD` string for all-day events), projected as `YYYY-MM-DD`, never converted. Query appointments and timed events are UTC instants plus an IANA zone. Luxon performs all server zone arithmetic; browsers use native Intl.
- **Scope.** `scope=team` is everything the actor is authorized to see (all cases with `cases.view_all`, otherwise member cases). `scope=mine` is assigned work and member cases (tasks assigned to the actor, queries assigned to the actor, events the actor attends). Team-wide task visibility needs `tasks.view_all` (or `cases.manage` on the single case being viewed); everyone else sees their own tasks only.
- **Truncation.** Each source returns at most 500 rows per request; the response carries `truncated` rather than silently dropping rows.
- **Reminders, recipients.** Task: the active assignee. Target filing and USCIS: the case project manager (no other staff). Document request: the requesting employee, and the requested client. Query appointment: the assigned employee and the client of a scheduled case appointment. Query response date: the assigned employee only. Manual event: explicit active employee attendees, and active client members only when the event is client-visible. Project-manager oversight of tasks is deliberately not implemented.
- **Reminders, scope of past dates.** Only the bucket a date is in now is considered (no back-fill of missed buckets). An overdue reminder is sent once per date version and only for dates up to 14 days past (`OVERDUE_LOOKBACK_DAYS`), so enabling the worker never sends a wave of old overdue notices. Manual events never produce an overdue reminder.
- **Document-overdue duplicate path.** The legacy `document_request_overdue` client pass in `scripts/sendNotificationDigests.js` is preserved. The engine never sends a client overdue reminder for a document request; employees still receive the overdue reminder, which the legacy pass never sent. A regression test runs the legacy script and the engine together and asserts exactly one client overdue notice.
- **USCIS and the client.** A client is reminded of a USCIS response date only under the Phase 11 rule: the filing is client-visible and the newest client-visible event requires action with a response date. The Staff snapshot is never used for a client, in reminders or in the portal projection.
- **Notification links.** `Notification.actionPath` is a server-composed in-app path (Staff `/cases/<id>?tab=tasks`, portal `/portal/cases/<id>/documents`). It is never user input; the Staff app resolves it through the router and the portal accepts only a `/portal/...` path.
- **Worker.** `workers/calendarReminderWorker.js` is not registered in `ecosystem.config.js`. It exits immediately unless `CALENDAR_REMINDERS_ENABLED` is exactly `true`. Starting it anywhere is a separate, deliberate step.
- **Views.** Month and Agenda. A week grid was not built: an inaccessible grid would be worse than none. On a narrow screen the Agenda replaces the month grid.
