# Phase 12 — Unified Calendar, Deadlines & Reminders: Implementation Report

Branch `phase-12/calendar-reminders`. Specification: [ADR-027](../architecture/ADR-027-unified-calendar-deadlines-reminders.md) and the [Phase 12 prompt](PHASE_12_CALENDAR_REMINDERS_PROMPT.md). Implementation decisions are appended to the ADR.

## Revisions

- Starting SHA: `46bfe60` (main, Phase 11 merge). Docs commits `4ea5d4c`, `8e9ab4d` precede the implementation.
- Implementation commits, in order:
  - `577f7ad` foundation: model, time rules, capability and schema registrations
  - `dad09f7` calendar API (projection, manual events, preferences, OpenAPI)
  - `565fd6a` reminder engine, dry-run script, worker loop
  - `8a0abb1` client portal projection and reminder preferences
  - `8f5f2f9` Staff Calendar page, case Calendar tab, dialog, settings
  - `fc36c23` browser journey and harness
  - `ceeb6c4` ADR implementation notes
  - `78bfc28` fix: restating the current all-day/timed mode in an edit no longer wipes its dates
- Ending SHA and CI run: see "CI" below (the report commit follows the last code commit; its SHA is the one CI was verified on).

## What was built

### Architecture
The Calendar is a **read-time projection**. There is no calendar collection for tasks, document requests, USCIS dates, target filing dates or appointments. `server/services/calendarService.js` queries the module that owns each date and maps rows to one `CalendarItem` DTO. The only new persistent calendar model is `CaseCalendarEvent` (`case_calendar_events`).

### Source adapters (Staff)

| Kind | Authoritative field | Gate (in addition to `calendar.view`) |
|---|---|---|
| `target_filing` | `ClientCase.targetFilingDate` (active cases) | `cases.view` + case scope |
| `task_due` | `Task.dueDate` (completed hidden by default) | own tasks; team-wide needs `tasks.view_all` (or `cases.manage` on the viewed case); case tasks need `cases.view` + membership |
| `document_due` | `DocumentRequest.dueDate` (active states) | `documents.view` + case scope |
| `appointment` | `ConsultationInteraction.scheduledFor` + `timezone` (timed) | `queries.view` via `accessibleInteractionFilter` |
| `query_due` | `ConsultationInteraction.responseDueAt` (only real stored values) | `queries.view` via `accessibleInteractionFilter` |
| `uscis_response` | `USCISFiling.responseDueAt`, only with `actionRequired` | `uscis_tracking.view` + case scope |
| `manual_event` | `CaseCalendarEvent` | `cases.view` + case scope |

Every adapter starts from the actor's authorized scope inside the database query. Nothing is fetched and then hidden in Angular. `calendar.view` is never a bypass. At most 500 rows per source; the response reports `truncated`.

### Models and registrations
- New: `CaseCalendarEvent` (server model, Next mirror, `calendar-schema-contract.json`, root and server contract tests, Angular drift guard).
- Additive fields: `AdminUser.timeZone`, `NotificationPreference.deadlineReminders` / `appointmentReminders` (default true), `Notification.actionPath`, notification types `calendar_deadline_reminder` / `calendar_appointment_reminder`, CaseActivity types `calendar_event_created/updated/cancelled`.
- Capabilities `calendar.view` (super_admin, admin, operations_admin, pm, petition_writer, business_plan_specialist, recommendation_letter_specialist, uscis_forms_specialist, evidence_collector, reviewer) and `calendar.manage` (super_admin, admin, operations_admin, pm), in server map, Next mirror and regenerated contract.
- No bulk migration. No existing user, task or event is rewritten.

### Indexes (declared in `server/scripts/createIndexes.js`; additive; NOT applied anywhere)
- `case_calendar_events`: `{case,status,startAt}`, `{case,status,startDate}`, `{startAt,status}`, `{startDate,status}`
- `tasks`: `{assignee,status,dueDate}`, `{case,status,dueDate}`
- `client_cases`: `{archivedAt,targetFilingDate}`
- Reused as is: DocumentRequest due-date indexes, USCISFiling `{actionRequired,responseDueAt}`, ConsultationInteraction scheduled/response indexes.

`npm run db:indexes:dry-run` lists all of these and states "no connection made, nothing created". It was run with no connection to any database.

### API (all under `/api/v1/staff`, documented in `server/openapi/v1.yaml`)
`GET /calendar`, `GET /calendar/config`, `PATCH /calendar/preferences`, `POST /cases/:caseId/calendar-events`, `GET|PATCH /calendar-events/:eventId`, `POST /calendar-events/:eventId/cancel`. All writes use trusted-origin protection. The range is required and capped at 93 days. A missing, malformed or inaccessible case/event is one identical 404. There is no delete route. `/staff/me` returns the resolved time zone; the case detail `availableTabs` gains `calendar`.

### Staff UI
- `/staff/calendar`: Month and Agenda views, My calendar / Everything I can see, kind filters (only those the server allows), include completed, URL is the page state, per-item links to the owning module, manual events open an edit dialog. On a narrow screen the Agenda replaces the month grid. No week grid was built (see limitations).
- Case Calendar tab (under Case work): the case's dates for 14 days back to 78 days ahead, "Add event" only when the server says so, deep link `?tab=calendar&event=:id`.
- Event dialog: create, edit, cancel (confirmation), attendees from active case members, client visibility with its own client title and description.
- Time zone and reminders panel: shows the resolved zone and why, a "use my browser's time zone" suggestion (validated and persisted by the API), reminder switches. Notifications page: reminder switches and reminder links that open the exact tab.
- Navigation entry gated on `calendar.view`.

### Client Portal
`GET /api/portal/cases/:caseId/calendar`, `/portal/cases/:caseId/calendar` and an "Upcoming dates" card on the case page (replaces the "Coming soon" placeholder). Sources: the client's own document requests that still need action, their own scheduled case appointments, USCIS response dates under the Phase 11 rule (client-visible filing, newest client-visible event needs action), and client-visible manual events (client title and description only). Never: Staff tasks, the internal target filing date, internal query deadlines, internal events or their text, locations, meeting links, hidden USCIS dates. Empty state: "No upcoming dates have been shared for this case." Reminder switches added to client notification preferences; reminder notifications link to their portal destination.

## Time rules
- Date-only values (task, document request, query response, USCIS response, target filing, all-day events) are projected as `YYYY-MM-DD` from their UTC calendar date and never converted. An Oct 31 deadline is Oct 31 in UTC, New York, Karachi, Tokyo and Kiritimati.
- Appointments and timed events are UTC instants plus an IANA zone, rendered in the selected zone with the zone named. Manual wall-clock input is converted on the server with Luxon, DST-correct (gap and repeated hours covered by tests).
- Resolution: employee zone, then `PRACTICE_TIME_ZONE`, then UTC; an invalid value at either level is ignored; never inferred from an IP address. The settings panel states which applies and warns when the practice zone is unset or invalid.

## Reminders
- Buckets: date-only `due_within_7_days`, `due_tomorrow`, `due_today`, `overdue`; timed `within_24_hours`, `within_1_hour`. Only the bucket a date is in now is considered. Overdue is sent once per date version, up to 14 days past. Manual events never produce "overdue".
- Types: `calendar_deadline_reminder`, `calendar_appointment_reminder`.
- Recipients (current, re-derived every run): task assignee; case PM for target filing and USCIS; requesting employee and requested client for a document request; assigned employee and the client for a scheduled case appointment; assigned employee for a query response date; explicit attendees (and client members only for client-visible events) for manual events. Inactive employees, removed members and removed clients receive nothing. Archived cases are excluded.
- Idempotency: `calendar:<sourceType>:<sourceId>:<field>:<dateVersion>:<recipientType>:<recipientId>:<bucket>` through the Notification `dedupeKey` unique index (no PII in the key). A changed date changes the key and reminds again. Concurrent runs create each reminder once.
- Preferences: `deadlineReminders`, `appointmentReminders` (employee and client). Calendar visibility is unaffected by preferences.
- **Document-overdue decision:** the legacy `document_request_overdue` client pass in `server/scripts/sendNotificationDigests.js` is preserved. The new engine never sends a client overdue for a document request; employees get the overdue reminder (the legacy pass never sent one). A regression test runs the legacy script and the engine together and asserts exactly one client overdue notice.
- **Tooling:** `npm run calendar:reminders` is a dry run (default; writes nothing, not even a default preference row; prints counts only, no names, titles, receipts or case numbers). `npm run calendar:reminders:apply` creates notifications.
- **Worker:** `server/workers/calendarReminderWorker.js` runs the same service on `CALENDAR_REMINDER_INTERVAL_MS` (floor 60 s). It exits immediately unless `CALENDAR_REMINDERS_ENABLED` is exactly `true`, keeps no last-run state, never overlaps itself, backs off (doubling to 15 min) on failure, and finishes the pass in flight on SIGTERM/SIGINT. **It is not registered in `ecosystem.config.js`; no PM2 entry was added.**

## Environment variable names
`PRACTICE_TIME_ZONE`, `CALENDAR_REMINDERS_ENABLED` (default `false`), `CALENDAR_REMINDER_INTERVAL_MS` (default `300000`). Documented in `server/.env.example`. No `NEXT_PUBLIC_` variables.

## Tests (local, final code)

| Suite | Result |
|---|---|
| Root `npm test` | 457 / 457 pass |
| Server `npm test` | 761 / 761 pass (full run before the last small fix); the two calendar integration files re-run after it: 39 / 39 pass |
| Angular `npm test` | 236 / 236 (case-management, 26 files) + 1 / 1 (admin-console) |
| Browser `npm run test:e2e` | 10 / 10 pass (2 calendar, 7 stabilization, 1 USCIS) |
| `npm run lint`, `npx tsc --noEmit`, `git diff --check` | clean |

New tests in this phase:
- Server unit: calendar time rules (7), schema contract (3), reminder buckets and worker loop (8).
- Server integration `calendar.integration.test.js` (21): projection of every real source, no calendar row created, zone and DST semantics, bounded range, unauthenticated / client cookie / no `calendar.view`, specialist scope, other team absent, source capability hidden, `view_all`, case filter concealment, removed member loses dates at once, completed/archived hidden, manual event create/edit/cancel, safe activity text, unsafe URL, invalid zone, outsider attendee, malformed id, no delete route, preferences, config, case tab.
- Server integration `calendar-reminders.integration.test.js` (18): every item of the prompt's reminder list (7-day, tomorrow, today, overdue once, 24 h, 1 h, rerun, concurrent runs, changed date, completed, fulfilled/cancelled, no-action USCIS, cancelled event, employee and client opt-out, removed employee and client, no duplicate document-overdue path including the legacy script, deep links, dry run writes nothing), plus recipient-zone day judgement, USCIS client visibility and client-text-only events.
- Root `portal-calendar.integration.test.ts` (13): document due, appointment, shared event, hidden event, client-visible and hidden USCIS dates, Staff task omission, internal fields never present, removed membership, safe DTO keys, stable date-only output, reminder preferences.
- Angular specs: calendar model, Calendar page, event dialog, case Calendar tab, navigation capability gating, notifications page, case-detail wiring.
- Browser: PM creates a case task due tomorrow and two timed events through the UI, sees them in Month and Agenda, changes time zone (the timed event moves to Tokyo's next day, the date-only task does not), edits an event read back in its own zone; a specialist sees only their case and cannot add events (UI and API); a role without `calendar.view` gets a clear message; the reminder service runs twice with one notification and the link opens the exact tab; the client sees the shared appointment and own document deadline and not the Staff task or internal event; a phone viewport shows the Agenda with no horizontal scroll.

## Angular

`ng build case-management` and `ng build admin-console` succeed; `node scripts/deploy/verify-staff-build.js` reports the staff build releasable (base href `/staff/`, relative `/api/v1` only).

## Dry runs (disposable database only)
`db:indexes:dry-run` and `calendar:reminders` were run with `MONGODB_URI` pointed at an in-memory MongoDB, never the `.env` database. The reminder dry run on that empty database printed zero candidates and wrote nothing.

## Data and production effects
- Indexes applied: none. Migrations run: none. Production database touched: no. Deployed: no. Merged to main: no.
- Worker enabled in production: no. No PM2 entry exists for it.
- New data in a future environment appears only as documents written by the new endpoints, `AdminUser.timeZone` when a person saves one, preference fields when a person changes them, and reminder notifications once the worker or `--apply` runs.

## CI
Recorded below after the final push.

## Known limitations
- No week grid: an inaccessible grid would be worse than none. Month plus Agenda.
- The calendar page does not create events (a case must be chosen); events are added from the case Calendar tab.
- Per source, 500 rows maximum per request (flagged with `truncated`); the range is at most 93 days.
- Overdue reminders look back 14 days only.
- Query response dates are projected as date-only; nothing in the product sets them yet.
- Project-manager oversight of other people's tasks is not implemented.
- Reminders are in-app notifications; the existing digest email may include them according to existing preferences. No new mail path.
- Client appointments for pre-case consultations are not on the portal case calendar (no case).
- A GET of `/calendar/config` lazily creates the employee's preference row, as the existing notifications read already does.

## Rollback
No data migration, so code rollback is a revert of the branch. Orphaned `case_calendar_events` and the extra optional fields are inert. Indexes are additive and can be dropped by name if ever applied. If the worker were ever enabled, set `CALENDAR_REMINDERS_ENABLED=false` and stop it; existing reminder notifications are ordinary notifications and can stay.

## Rollout (when approved, not part of this phase)
1. database backup; 2. review and apply additive indexes; 3. set a valid `PRACTICE_TIME_ZONE`; 4. deploy with `CALENDAR_REMINDERS_ENABLED=false`; 5. human QA of the Calendar and manual events; 6. production reminder dry run and review of counts; 7. enable the worker deliberately (add a single-instance PM2 process after verifying reload behaviour); 8. monitor logs and Notification dedupe.

## Next phase recommendation
Authorized Global Search plus Operational Reporting, as the ADR suggests. External calendar sync, AI date calculation and Angular CMS migration were deliberately not started.
