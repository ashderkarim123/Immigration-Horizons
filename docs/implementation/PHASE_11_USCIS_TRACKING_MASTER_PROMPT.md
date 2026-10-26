# Phase 11 — USCIS Tracking Master Implementation Prompt

**Branch:** phase-11/uscis-tracking  
**Baseline SHA:** 5cb3163499652e63f55c91d72d1e17d900dd9828  
**Architecture:** docs/architecture/ADR-026-uscis-filing-status-tracking.md

---

You are implementing **Phase 11 — USCIS Filing & Status Tracking** for Immigration Horizons.

## Mission

Build production-quality, case-native USCIS filing/receipt tracking for Staff and a safe read-only USCIS status experience for Clients.

Do not start Phase 12 Calendar/Reminders, Phase 13 Search/Reporting, Angular CMS replacement, database migration, AI, official USCIS PDF autofill, or unsupported scraping in this phase.

Use the existing stabilized architecture:

- Public: Next.js
- Client Portal: Next.js
- Staff: Angular
- Staff API: Express /api/v1/staff
- Admin CMS: legacy Express/EJS until later phase
- Database: MongoDB
- Documents: private storage

Read ADR-026 completely before editing.

## First steps

1. Confirm branch is phase-11/uscis-tracking.
2. Record git status, branch, HEAD and recent log.
3. Read:
   - docs/architecture/ADR-026-uscis-filing-status-tracking.md
   - docs/implementation/STABILIZATION_PHASE_01_REPORT.md
   - docs/implementation/STABILIZATION_PHASE_01_FEATURE_AUDIT_AND_MASTER_PROMPT.md
   - current case, notification, activity and authorization services
   - current Angular case-detail navigation
   - current Client Portal case page/navigation
4. Inspect package.json/workflows before choosing commands.
5. Re-audit whether any USCIS tracking model or route has appeared since the baseline.

Do not blindly implement from this prompt if current code differs.

## Domain requirements

### USCISFiling

Create an additive Mongoose model representing one USCIS filing/receipt attached to one case/workspace.

Required concepts:

- case
- workspace
- formType
- filingLabel/title
- receiptNumber
- filedAt
- receiptDate
- serviceCenter
- currentStatusCode
- currentStatusTitle
- currentStatusDate
- lastCheckedAt
- source
- actionRequired
- responseDueAt
- clientVisible
- archivedAt
- createdBy
- createdByName
- timestamps

A case may have multiple filings.

Normalize receipt numbers consistently before persistence.

If receiptNumber is present, enforce database-level uniqueness through an additive partial unique index.

Do not store only one USCIS status on ClientCase.

### USCISStatusEvent

Create an append-only Mongoose model.

Required concepts:

- filing
- case
- workspace
- statusCode
- statusTitle
- description
- occurredAt
- observedAt
- source
- providerEventId optional
- actionRequired
- responseDueAt optional
- clientVisible
- createdBy
- createdByName
- createdAt

Events must not have update/delete workflows.

Use model/service protections consistent with existing append-only audit models.

## Status model

Use normalized status categories while preserving display text.

Initial normalized categories should support at least:

- filed
- received
- actively_reviewed
- notice_issued
- rfe_issued
- noid_issued
- response_received
- interview_scheduled
- approved
- denied
- transferred
- closed
- other

Do not infer legal meaning beyond the explicit recorded status.

## Current status snapshot

USCISFiling stores a denormalized current-status snapshot for efficient list/queue reads.

The service updates this snapshot when a new event becomes the current event.

An older historical event added later must not incorrectly replace a newer current status.

Define deterministic ordering using occurredAt and an appropriate stable tiebreaker.

## Authorization

Add explicit capabilities:

- uscis_tracking.view
- uscis_tracking.manage

Integrate them into the canonical capability registry and employee capability contract.

Do not make Angular authorization decisions from hard-coded role names.

Suggested grant intent:

View:
- super_admin
- admin
- operations_admin
- pm
- petition_writer
- uscis_forms_specialist
- reviewer

Manage:
- super_admin
- admin
- operations_admin
- pm
- uscis_forms_specialist

Use current repository role names as authoritative if they differ.

Every case-scoped action also requires case/workspace row authorization unless cases.view_all provides the existing org-wide bypass.

Removed workspace members lose access immediately.

## Case/service layer

Build a dedicated USCIS tracking service.

Responsibilities:

- load case/workspace safely
- normalize receipt numbers
- validate create/update payloads
- create filing
- update allowed filing metadata
- append status event
- compute current snapshot
- list case filings
- list authorized cross-case filings
- client-visible projection
- future provider normalization/idempotency boundary

Do not place business logic directly in Angular or route handlers.

## Staff API

Add canonical routes under /api/v1/staff.

Required endpoints:

GET /api/v1/staff/cases/:caseId/uscis

POST /api/v1/staff/cases/:caseId/uscis

GET /api/v1/staff/uscis/:filingId

PATCH /api/v1/staff/uscis/:filingId

POST /api/v1/staff/uscis/:filingId/status-events

GET /api/v1/staff/uscis

Use explicit DTOs.

Do not return raw Mongoose documents.

All mutations require trusted-origin protection.

Return the same not-found/concealment semantics as other case-scoped staff modules.

## Cross-case query

GET /api/v1/staff/uscis should support authorized server-side filters useful to Staff:

- search
- status
- actionRequired
- response due from/to
- case scope / my cases according to current policy
- archived
- page/pageSize
- sort

Search may include:

- receipt number
- case number
- client display name if safely supported by existing query architecture
- form type

Do not widen row-level access through search.

## Staff Angular UI

### Case workspace

Add a clear case section labeled:

USCIS Tracking

or, if the stabilized UX standard chooses it:

Case Tracking

It must be discoverable from the Case workspace.

Show filing cards/table with:

- form type / label
- receipt number
- current status
- filed date
- receipt date
- service center
- last updated/checked
- action required badge
- response due date
- client-visible state

Selecting a filing shows chronological status history.

Authorized actions:

- Add Filing
- Edit Filing Metadata
- Add Status Update
- Mark client visibility according to API support

Use capabilities/action flags from the API/AuthService.

Implement:

- loading
- loaded
- empty
- validation error
- retryable error
- unauthorized/not-found states
- responsive behavior
- accessible labels/status text

### Cross-case tracking screen

Add an authorized staff view for tracking across cases.

Useful queues/tabs:

- Action Required
- Recently Updated
- All Tracking
- Approved / Closed
- Upcoming Response Dates

Do not overfill the primary sidebar. Place the route according to the stabilized navigation model, for example under Cases or an explicit Tracking item if UX tests support it.

## Client Portal

Add a simplified read-only USCIS status surface to an accessible case.

Client may see only filings/events where clientVisible is true.

Show:

- form/filing label
- receipt number
- filed date
- receipt date
- current client-visible status
- last status date
- response/action deadline only when explicitly client-visible
- client-visible status timeline

Never expose:

- internal-only events
- provider payloads
- employee IDs
- internal notes
- raw audit metadata
- hidden filings

If no client-visible tracking exists, show a helpful empty state rather than an error.

## Notifications

Extend the existing Notification type registry deliberately.

Add the minimum useful types, for example:

- uscis_filing_added
- uscis_status_changed
- uscis_action_required

Use existing notification services rather than creating a new notification collection.

Rules:

- notify relevant staff on action-required updates
- notify client only when filing/event is clientVisible
- use dedupe keys where replay/import can cause duplicates
- email side effects remain secondary to durable in-app notifications

Do not build the full reminder engine in Phase 11.

## Deadlines bridge to Phase 12

Allow Phase 11 to record responseDueAt on a filing/status event.

Do not create the full calendar/reminder engine here.

Document exactly how Phase 12 can consume:

- actionRequired
- responseDueAt
- filing/status IDs
- case/workspace IDs

## Manual-first / provider-ready

Phase 11 must work completely with manual staff updates.

Create a provider adapter/service boundary, but do not add unsupported scraping.

A future provider observation should be able to enter the same service through a normalized object and optional providerEventId.

Test idempotency even if no real provider is connected.

## Activity/audit

Record safe operational activity such as:

- filing added
- filing metadata changed
- status update recorded
- client visibility changed

Do not copy sensitive descriptions/provider payloads into generic CaseActivity text.

## Indexes

Use additive createIndexes only.

Define indexes based on the actual queries built.

At minimum review:

USCISFiling:
- unique partial receiptNumber
- case + archivedAt + updatedAt
- workspace + archivedAt + updatedAt
- currentStatusCode + updatedAt
- actionRequired + responseDueAt

USCISStatusEvent:
- filing + occurredAt + createdAt
- case + createdAt
- optional providerEventId unique partial

Do not run production indexes.

Provide dry-run/check instructions in the report.

## Tests

Add server integration tests covering at least:

1. create filing on authorized case
2. multiple filings per case
3. receipt normalization
4. duplicate receipt rejected safely
5. malformed receipt rejected according to chosen validation
6. inaccessible case concealed
7. removed member denied
8. view-only role cannot mutate
9. manage role can create/update
10. add status event
11. status history chronological
12. older backfilled event does not replace newer current status
13. actionRequired / responseDueAt
14. clientVisible filtering
15. internal event never leaks to client
16. cross-case list obeys row scope
17. search does not widen access
18. notification creation
19. notification dedupe
20. providerEventId idempotency
21. append-only event cannot be mutated/deleted

Add Angular tests with fixtures matching exact Express DTOs.

Add Next Client Portal tests for client-safe projections.

If browser CI infrastructure from stabilization is available, add Phase 11 browser workflows.

## Browser QA

Required workflow:

PM / Operations Admin:
- open case
- add filing
- add receipt number
- add status
- add action-required RFE-like update with response date
- see timeline
- see cross-case tracking queue

Client:
- open same case
- see only client-visible filing/status
- internal event remains invisible
- action-required client-visible update appears clearly

Specialist/reviewer:
- view according to capability
- mutation denied where not granted

Removed member:
- loses access immediately

## Migration/backfill

Prefer no backfill unless repository data contains an existing authoritative USCIS receipt/status source.

Do not invent status history from case stage.

If legacy receipt/status data exists, write an explicit dry-run migration and document unresolved cases.

Do not apply it to production.

## Report

Create:

docs/implementation/PHASE_11_USCIS_TRACKING_REPORT.md

It must include:

- starting SHA
- ending SHA
- commits
- models/collections
- indexes
- capabilities
- routes
- Staff UI routes
- Client Portal routes
- notification changes
- tests and exact counts
- browser QA
- migration/index requirements
- production actions not performed
- known limitations
- rollback notes
- whether Phase 12 is unblocked

## Git safety

Do not:

- merge to main
- deploy production
- modify production DB
- run production indexes
- change nginx
- force push
- rebase shared history
- reset --hard
- clean -fd

Use additive commits.

Suggested commit boundaries:

1. feat(uscis): add filing and status tracking domain
2. feat(uscis-api): expose authorized staff tracking endpoints
3. feat(staff-ui): add USCIS tracking case and queue views
4. feat(portal): add client-safe USCIS status view
5. test(uscis): add tracking regression and browser coverage
6. docs(phase11): add implementation report

## Validation

Inspect repository scripts before running commands.

At minimum, final validation should include the same quality gate as stabilization:

- root tests
- server tests
- Angular tests
- lint
- typecheck
- Next build
- Angular case-management build
- Staff routing/build verification
- browser workflows where configured

Exact final SHA must have all required CI jobs green before asking for merge/release approval.

## Stop condition

When Phase 11 is complete and exact-SHA CI is green:

STOP.

Do not merge or deploy.

Report:

- branch
- final SHA
- commits
- tests
- CI run
- migrations/indexes needed
- human QA still needed
- production rollout steps
- whether Phase 12 can start
