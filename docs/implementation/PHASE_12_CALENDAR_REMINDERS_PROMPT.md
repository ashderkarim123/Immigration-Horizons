# Phase 12 — Unified Calendar, Deadlines & Reminders Implementation Prompt

**Working branch:** phase-12/calendar-reminders
**Production baseline:** main@46bfe606b0b7dac2f065051b6d642ed2ea42d9df
**Architecture:** docs/architecture/ADR-027-unified-calendar-deadlines-reminders.md
**Prepared:** 2026-10-06

> This is a production feature phase. Do not build placeholder calendar screens, mock events, fake reminders, or a second deadline database. Every visible date must come from a real domain source or a real persisted manual case event.

## 1. Mission

Implement a complete Staff Calendar + Deadlines + Reminder Engine for Immigration Horizons.

The finished phase must deliver:

1. one authorized unified Staff calendar;
2. real aggregation of existing domain dates;
3. real case-level Calendar/Upcoming experience;
4. real manual case events/appointments;
5. Staff timezone preference;
6. safe read-only client upcoming/calendar data;
7. durable in-app reminder notifications;
8. an idempotent reminder worker;
9. zero duplicate source-of-truth deadline records;
10. full security, regression, Angular, portal and browser coverage.

Do not stop at route/model scaffolding.

## 2. Current verified baseline

Phase 11 is already merged into main.

Baseline:

    46bfe606b0b7dac2f065051b6d642ed2ea42d9df
    Merge phase-11/uscis-tracking-main: case-native USCIS filing and status tracking

Phase 11 exact-SHA CI was green and main CI/deployment also completed successfully.

Do not branch from the old Angular architecture branch.

## 3. Git preflight

Before editing:

    git fetch origin --prune
    git branch --show-current
    git status --short
    git rev-parse HEAD
    git rev-parse origin/phase-12/calendar-reminders
    git rev-parse origin/main
    git log --graph --decorate --oneline -30
    git diff
    git diff --cached
    git rev-list --left-right --count origin/main...HEAD

Required branch: phase-12/calendar-reminders

At prompt creation this branch started from 46bfe606b0b7dac2f065051b6d642ed2ea42d9df.

If main has advanced, inspect the new commits before implementing.

Never use reset --hard, clean -fd, shared-history rebase, commit --amend on shared commits, force-push, or work directly on main. Do not deploy.

## 4. Required reading

Read completely:

- CLAUDE.md
- AGENTS.md
- .claude/SECURITY.md
- .claude/API_ARCHITECTURE.md
- .claude/DATABASE.md
- .claude/TESTING.md
- .claude/DEPLOYMENT.MD
- docs/architecture/ADR-006-notifications-and-preferences.md
- docs/architecture/ADR-012-security-privacy-and-audit.md
- docs/architecture/ADR-014-migrations-and-retention.md
- docs/architecture/ADR-015-angular-enterprise-platform.md
- docs/architecture/ADR-017-case-native-tasks-and-deadlines.md
- docs/architecture/ADR-024-angular-staff-production-cutover.md
- docs/architecture/ADR-025-stabilization-staff-cms-and-guided-work.md
- docs/architecture/ADR-026-uscis-filing-status-tracking.md
- docs/architecture/ADR-027-unified-calendar-deadlines-reminders.md
- docs/implementation/STABILIZATION_PHASE_01_REPORT.md
- docs/implementation/PHASE_04_CASE_TASKS_DEADLINES_PROMPT.md
- docs/implementation/PHASE_11_USCIS_TRACKING_REPORT.md
- docs/implementation/ANGULAR_ENTERPRISE_PLATFORM_ROADMAP.md
- docs/deployment/ANGULAR_STAFF_CUTOVER_RUNBOOK.md

Inspect actual code at minimum in the relevant models/services/routes/UI/tests. Re-audit whether any Calendar model/route/work has appeared since this prompt.

## 5. Core architecture rule — Calendar is a projection

Do NOT create a generic Mongo collection that copies task due dates, document-request due dates, USCIS response due dates, case target filing dates, or query appointment dates.

Those domains already own the dates.

Target:

    ClientCase.targetFilingDate ─┐
    Task.dueDate ────────────────┤
    DocumentRequest.dueDate ─────┤
    ConsultationInteraction ─────┤
    USCISFiling.responseDueAt ───┤
    CaseCalendarEvent ────────────┤
                                 ▼
                         CalendarService
                                 ▼
                        CalendarItem DTO[]
                                 ▼
                        Angular / Portal

A source date changes in its own domain and automatically changes in Calendar.

## 6. Time/date semantics

Treat ClientCase.targetFilingDate, Task.dueDate, DocumentRequest.dueDate and USCISFiling.responseDueAt as date-only calendar values unless the current code proves otherwise. Project them as YYYY-MM-DD, deriving the UTC calendar date from stored Mongo Dates.

Do not let a user in another timezone see a legal/operational date shift to the previous or next calendar day solely because of timezone conversion.

ConsultationInteraction.scheduledFor and timed CaseCalendarEvent records are exact UTC instants and render in the selected employee timezone.

Use validated IANA timezone values such as America/New_York, Asia/Karachi, Europe/London and UTC. Do not infer timezone from IP.

## 7. Server timezone library

Use a maintained timezone-capable server library such as Luxon after verifying current Node compatibility. Do not hand-roll DST/IANA conversion.

The dependency belongs in server/package.json unless another runtime genuinely needs it.

## 8. Employee timezone preference

Extend AdminUser additively with timeZone.

Resolution order:

    AdminUser.timeZone
      -> PRACTICE_TIME_ZONE
      -> UTC

Do not bulk-migrate existing AdminUser rows.

Expose resolved timezone through GET /api/v1/staff/me and add PATCH /api/v1/staff/calendar/preferences for the employee to update only their own timezone.

Angular should offer a Use browser timezone convenience but persist the validated IANA value through the API.

## 9. Server environment

Document names only:

    PRACTICE_TIME_ZONE=
    CALENDAR_REMINDERS_ENABLED=false
    CALENDAR_REMINDER_INTERVAL_MS=300000

Do not use NEXT_PUBLIC_ variables for these.

## 10. CalendarItem contract

Create a server-owned explicit CalendarItem serializer/read model with:

- stable id;
- sourceType/sourceId/sourceField;
- case id/number/title;
- kind/title/safe description;
- time mode date|datetime;
- date or startAt/endAt/timeZone/allDay;
- status/priority/actionRequired;
- owner/assignee summary where safe;
- clientVisible;
- safe in-app href;
- actions.canEdit/canCancel.

No raw Mongoose documents.

Stable source keys should conceptually be:

    case:<caseId>:targetFilingDate
    task:<taskId>:dueDate
    document_request:<requestId>:dueDate
    query:<interactionId>:scheduledFor
    query:<interactionId>:responseDueAt
    uscis:<filingId>:responseDueAt
    manual_event:<eventId>

## 11. Staff calendar source adapters

Implement server-side source adapters for:

### Case target filing
Source ClientCase.targetFilingDate. Active cases by default. Authorized case scope. Deep-link to case Overview.

### Task due date
Source Task.dueDate. Completed excluded by default. Respect task/case authorization. Deep-link to case Tasks.

### Document request due date
Source DocumentRequest.dueDate. Active request states by default. Require relevant document/request capability and case access. Never leak request internal notes.

### Scheduled interaction
Source ConsultationInteraction.scheduledFor and timezone. Timed. Reuse interaction authorization. For consultation-scoped records reuse existing lead/interaction policy rather than inventing case membership.

### Query response due
Source ConsultationInteraction.responseDueAt only when explicitly present. Do not invent an SLA.

### USCIS response deadline
Source USCISFiling where actionRequired=true and responseDueAt exists. Require uscis_tracking.view plus case row access. Never infer from USCIS text.

### Manual CaseCalendarEvent
Persisted model described below.

## 12. CaseCalendarEvent

Create server/models/CaseCalendarEvent.js using collection case_calendar_events.

Required concepts:

- case and workspace;
- eventType: appointment|consultation|interview|biometrics|meeting|deadline|milestone|other;
- internalTitle/internalDescription;
- allDay;
- startDate/endDate for all-day;
- startAt/endAt/timeZone for timed;
- location;
- HTTPS meetingUrl;
- employeeAttendees[];
- clientVisible;
- clientTitle/clientDescription;
- status: scheduled|completed|cancelled;
- cancelledAt;
- createdBy/createdByName/updatedBy/updatedByName;
- timestamps.

Validation:

- all-day requires startDate and no startAt;
- timed requires startAt and valid IANA timeZone;
- end cannot precede start;
- attendee must be active AdminUser and active member of the case workspace;
- do not auto-create case membership to add an attendee;
- meeting URL must be HTTPS;
- clientVisible=true requires intentional non-empty clientTitle;
- no hard delete route; cancel instead.

## 13. Manual event service

Create a canonical service such as server/services/calendarEvents.js.

It owns authorization context, date/time validation, attendee validation, create/update/cancel, Staff/client serialization and safe CaseActivity.

Routes must not contain business rules.

## 14. Capabilities

Add calendar.view and calendar.manage to the canonical capability registry and all mirrors/contracts.

Suggested view grants: super_admin, admin, operations_admin, pm, petition_writer, business_plan_specialist, recommendation_letter_specialist, uscis_forms_specialist, evidence_collector, reviewer.

Suggested manage grants: super_admin, admin, operations_admin, pm.

Critical rule: calendar.view is never a bypass around cases.view, documents.view, queries.view or uscis_tracking.view. Every source adapter enforces its underlying source capability plus row scope.

## 15. Staff Calendar API

Required:

    GET   /api/v1/staff/calendar
    GET   /api/v1/staff/calendar/config
    PATCH /api/v1/staff/calendar/preferences

Manual events:

    POST  /api/v1/staff/cases/:caseId/calendar-events
    GET   /api/v1/staff/calendar-events/:eventId
    PATCH /api/v1/staff/calendar-events/:eventId
    POST  /api/v1/staff/calendar-events/:eventId/cancel

All writes use trusted-origin protection.

GET /calendar must require bounded from/to range, timezone, and support source/kind/scope/case/assignee/includeCompleted filters as appropriate.

Maximum normal range should be about 93 days. Never return all calendar history with no bound.

## 16. Authorization implementation

Do not query the entire firm and rely on Angular to hide unauthorized rows.

Every source query must begin with authorized source/case scope. Reuse accessible-case helpers, casePolicy, interaction policy, document capability and USCIS policy.

Removed membership must disappear on the next request.

## 17. Calendar config

Return only safe data such as resolved user timezone, source of timezone, practice fallback, supported source filters and canManage.

Do not expose env values unrelated to the Calendar.

## 18. Angular Staff Calendar

Add /staff/calendar and a calendar.view-gated navigation entry.

Required views:

- Month;
- Agenda.

A Week/Schedule view is optional only if accessible and maintainable.

Required controls:

- Previous / Today / Next;
- Month / Agenda;
- timezone;
- source filters;
- authorized scope;
- Create Event when calendar.manage.

Use URL-backed state where practical.

Do not use Angular date formatting blindly for date-only sources. YYYY-MM-DD items must stay on that exact day. Timed events render in the selected IANA timezone.

Use existing Immigration Horizons navy/gold enterprise UI. Do not introduce a separate calendar theme.

## 19. Case workspace

Add a real Calendar or Upcoming destination/panel consistent with the current case workspace.

Show next deadline, next appointment and bounded upcoming items.

Manual event creation is allowed when authorized.

Do not create second editors for Tasks/Documents/USCIS. Deep-link to the real owner module.

## 20. Client Portal API

Add read-only GET /api/portal/cases/:caseId/calendar or the equivalent current portal route style.

Active client case membership required.

Client-safe sources only:

- document requests addressed to that client;
- client-owned/visible scheduled consultation/query events;
- client-visible USCIS action due dates under Phase 11 visibility;
- clientVisible CaseCalendarEvent.

Never expose Staff task deadlines in Phase 12.

Do not expose internal target filing dates by default unless current client product policy already explicitly permits it.

Manual events expose clientTitle/clientDescription, never internalTitle/internalDescription.

## 21. Client Portal UX

Add an Upcoming/Calendar card/page on an accessible case.

Examples include document due date, client appointment, shared USCIS response date, client-visible manual event.

When nothing is visible say: No upcoming dates have been shared for this case.

## 22. Reminder preferences

Extend NotificationPreference additively with:

    deadlineReminders: boolean default true
    appointmentReminders: boolean default true

Update mirrors/contracts/tests and existing Staff/Client notification preference UI where cleanly supported.

Do not create a huge per-event preference matrix.

## 23. Reminder notification types

Add:

    calendar_deadline_reminder
    calendar_appointment_reminder

Use the existing Notification collection/service and dedupeKey unique index.

## 24. Reminder source rules

Task: open case task with due date; notify active assignee and only add PM oversight if deliberately implemented/tested.

Case target filing: notify active project manager.

Document request: notify responsible Staff and requested active client as product policy permits.

IMPORTANT: server/scripts/sendNotificationDigests.js already has a document_request_overdue pass. Do not create a second duplicate overdue sender. Either preserve it and skip duplicate Calendar overdue behavior, or deliberately migrate it into the new reminder service with parity tests. Document the decision.

Query appointment: assigned employee; client only for a genuine client-facing scheduled appointment.

Query response due: assigned employee and deliberate PM oversight only if tested.

USCIS response deadline: PM and only deliberate authorized recipients; client only when Phase 11 visibility permits.

Manual event: explicit active employee attendees; client only when event is clientVisible.

## 25. Reminder buckets

Date-only deadlines:

- due_within_7_days;
- due_tomorrow;
- due_today;
- overdue.

Timed appointments:

- within_24_hours;
- within_1_hour.

One notification per source + current source date + recipient + bucket.

Do not notify every worker run.

## 26. Reminder evaluation and dedupe

Every run queries current source state, computes current bucket, resolves current recipients, checks preferences, then calls the Notification service with a deterministic dedupe key.

Key concept:

    calendar:<sourceType>:<sourceId>:<sourceField>:<dateVersion>:<recipientType>:<recipientId>:<bucket>

Do not put PII in the key.

If a due date changes, the dateVersion changes so the new deadline can produce new reminders.

Completed/cancelled/fulfilled/inactive source state must stop future reminders.

## 27. Reminder service and dry-run

Create server/services/calendarReminderService.js.

Create server/scripts/runCalendarReminders.js.

Package scripts should provide a dry-run command and an explicit apply command.

Dry run must write zero notifications and print only safe counts, never names/receipt numbers/task descriptions/secrets.

## 28. Production worker

Create server/workers/calendarReminderWorker.js.

Behavior:

- reads server env;
- respects CALENDAR_REMINDERS_ENABLED;
- connects Mongo;
- invokes the same reminder service;
- repeats at configured interval;
- idempotent on overlap/restart;
- safe error handling/backoff;
- clean SIGTERM/SIGINT shutdown.

If adding ih-reminders to ecosystem.config.js, use one fork instance, read server .env, do not inject secrets into PM2 config, and verify deploy/startOrReload behavior.

The implementation phase must NOT enable the worker in production.

## 29. CaseActivity

Add safe activity types:

- calendar_event_created;
- calendar_event_updated;
- calendar_event_cancelled.

Do not write internal descriptions or meeting URLs into CaseActivity messages.

## 30. Indexes

Register only indexes serving real Phase 12 queries.

Likely CaseCalendarEvent indexes:

- { case, status, startAt };
- { case, status, startDate };
- { startAt, status };
- { startDate, status }.

Review Task indexes for case/status/dueDate and assignee/status/dueDate, ClientCase archivedAt/targetFilingDate, and case-scoped interaction indexes only if real query plans require them.

Reuse existing DocumentRequest and USCIS due-date indexes.

Additive createIndexes only. Never syncIndexes. Do not apply production indexes.

## 31. OpenAPI and types

Update server/openapi/v1.yaml for implemented Staff Calendar/manual-event endpoints only.

Create strong Angular types: CalendarItem, CalendarTime, CalendarConfig, CalendarFilters, CaseCalendarEvent, CreateCalendarEventInput and UpdateCalendarEventInput.

No generic any-shaped calendar payload.

## 32. Security tests

At minimum test:

1. unauthenticated denied;
2. client cookie cannot authenticate as Staff;
3. no calendar.view denied;
4. specialist sees assigned case only;
5. other-team dates absent;
6. cases.view_all firm scope;
7. document source hidden without document capability;
8. USCIS source hidden without uscis_tracking.view;
9. query source hidden without query access;
10. removed member dates disappear immediately;
11. manual event create requires calendar.manage + case access;
12. outsider attendee rejected;
13. internal manual event absent from client;
14. internal USCIS due absent from client;
15. Staff task never in client calendar;
16. malformed event concealed;
17. unsafe meeting URL rejected;
18. invalid timezone rejected.

## 33. Timezone tests

Required:

- a date-only deadline 2026-10-31 remains Oct 31 in UTC/New York/Karachi/Tokyo;
- a timed UTC instant renders correct selected wall-clock time;
- DST boundary correctness for America/New_York;
- invalid IANA rejected;
- user zone missing -> practice zone;
- both missing -> UTC;
- all-day manual event never shifts day.

## 34. Reminder tests

Required:

1. 7-day task reminder;
2. tomorrow reminder;
3. due today;
4. overdue once;
5. appointment 24h;
6. appointment 1h;
7. rerun no duplicate;
8. concurrent runs no duplicate;
9. changed date can remind for new date;
10. completed task ignored;
11. fulfilled/cancelled document request ignored;
12. USCIS actionRequired=false ignored;
13. cancelled manual event ignored;
14. employee opt-out;
15. client opt-out;
16. removed employee not notified;
17. removed client not notified;
18. no duplicate old document-overdue path;
19. reminder deep link correct;
20. dry-run writes nothing.

## 35. Angular tests

Test actual user behavior: Month/Agenda, navigation, filters, URL state, timezone, no-shift date-only rendering, timed conversion, create/edit/cancel event, source deep links, capabilities, validation, loading/error/empty and mobile Agenda.

## 36. Client Portal tests

Test requested document due visibility, client appointment, client-visible manual event, hidden event, client-visible USCIS due, hidden USCIS due, Staff task omission, removed membership, safe DTO and stable date-only output.

## 37. Browser/E2E

Extend the existing synthetic browser suite.

PM flow: create case task due tomorrow, verify Calendar, create timed manual appointment, verify Month/Agenda, change timezone, confirm timed conversion while date-only task remains same day.

Specialist: assigned case visible, other case absent, cannot create manual event.

Client: sees shared appointment and own document deadline; does not see Staff task/internal event.

Reminder service: execute twice against synthetic fixture and verify one notification.

## 38. No external calendar sync

Do not implement Google Calendar OAuth, Microsoft Calendar, two-way ICS sync or public ICS feeds in Phase 12.

CalendarItem is designed to enable that later without making an external calendar authoritative.

## 39. No AI deadline calculation

Do not use AI to calculate legal deadlines, infer USCIS response dates, predict filing dates or schedule appointments.

All dates are explicit source values.

## 40. Migration/data rules

Prefer no bulk migration.

New additive data is expected to be AdminUser.timeZone, NotificationPreference reminder booleans and the new CaseCalendarEvent collection.

Do not rewrite all existing users to fill defaults. Do not infer historic calendar events.

## 41. Implementation report

Create docs/implementation/PHASE_12_CALENDAR_REMINDERS_REPORT.md.

Record starting/ending SHA, commits, source adapters, collection/model changes, indexes, capabilities, APIs, Staff and Client UI, timezone rules, reminder buckets, notification types, the document-overdue duplicate-path decision, worker design, env variable names only, exact tests/counts, browser results, CI run, data/index effects, worker enablement state, production actions, known limitations, rollback and next-phase recommendation.

## 42. Validation

Use actual package scripts as authoritative. At minimum run:

    npm ci --no-audit --no-fund
    npm run lint
    npx tsc --noEmit
    npm test
    npm run build

    cd server
    npm ci --no-audit --no-fund
    npm test
    npm run db:indexes:dry-run
    npm run calendar:reminders
    cd ..

    cd enterprise-ui
    npm ci --no-audit --no-fund
    npm test
    npx ng build case-management
    npx ng build admin-console
    cd ..

    node scripts/deploy/verify-staff-build.js enterprise-ui/dist/case-management/browser
    npm run test:e2e
    git diff --check
    git status --short

If actual scripts differ, use the real package.json commands and document them.

Dry-run reminder command must write nothing.

## 43. CI and production safety

Push only after local validation. Exact final SHA must have all required CI jobs green.

At completion there must be no automatic main merge, production index apply, production migration, or production reminder-worker enablement.

For later approved rollout:

1. database backup;
2. apply reviewed additive indexes;
3. configure valid PRACTICE_TIME_ZONE;
4. deploy with CALENDAR_REMINDERS_ENABLED=false;
5. human QA calendar/manual events;
6. run production reminder dry-run;
7. review counts;
8. enable worker deliberately;
9. monitor logs and Notification dedupe.

## 44. Completion gate

Phase 12 is complete only when:

- unified real-source Calendar works;
- date-only and timed semantics are correct;
- Month/Agenda polished;
- case Calendar works;
- manual events work;
- safe Client upcoming dates work;
- reminder notifications/dedupe/preferences/worker work;
- old document overdue logic does not duplicate reminders;
- user/practice/UTC timezone fallback works;
- OpenAPI and index dry-run are updated;
- root/server/Angular/portal/browser tests and builds pass;
- exact-SHA CI is green.

Then STOP.

Do not begin Search/Reporting, external calendar sync, Angular CMS/admin migration or AI automatically.

The likely next product phase after Phase 12 is Authorized Global Search + Operational Reporting.