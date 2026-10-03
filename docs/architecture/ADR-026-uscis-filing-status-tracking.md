# ADR-026 — USCIS Filing & Status Tracking

**Status:** Proposed for Phase 11  
**Date:** 2026-10-04  
**Baseline:** stabilization/angular-feature-parity-audit @ 5cb3163499652e63f55c91d72d1e17d900dd9828

## Context

Immigration Horizons now has case management, tasks/deadlines, evidence, documents, communications, Smart Forms, Petition Work and Filing Packets. The next product capability is post-filing USCIS tracking.

A single immigration case can have multiple USCIS filings and receipt numbers. Therefore USCIS tracking must not be stored as one string on ClientCase.

The first implementation must be reliable without depending on unsupported scraping or a third-party status provider. Manual staff updates are required; provider/API automation can be added behind the same service contract later.

## Decision

Introduce two additive domain concepts:

### USCISFiling

One case-scoped filing/receipt record.

Core fields:

- case
- workspace
- formType
- receiptNumber
- filingLabel/title
- filedAt
- receiptDate
- serviceCenter (optional)
- currentStatusCode
- currentStatusTitle
- currentStatusDate
- lastCheckedAt
- source: manual | provider
- actionRequired
- responseDueAt (optional; consumed by Phase 12 later)
- clientVisible
- archivedAt
- createdBy / createdByName
- timestamps

A case may own multiple USCISFiling records.

Receipt numbers are normalized before storage. If present, uniqueness must be enforced at the database level with an additive unique partial index.

### USCISStatusEvent

Append-only status history for one USCISFiling.

Core fields:

- filing
- case
- workspace
- statusCode
- statusTitle
- description
- occurredAt
- observedAt
- source: manual | provider
- providerEventId (optional idempotency key)
- actionRequired
- responseDueAt (optional)
- clientVisible
- createdBy / createdByName
- createdAt

Events are append-only. They are never silently edited or deleted.

The filing's current-status snapshot is updated only through the USCIS tracking service when a new event becomes current.

## Authorization

Add explicit capabilities, subject to case/workspace row authorization:

- uscis_tracking.view
- uscis_tracking.manage

Suggested initial grants:

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

Do not authorize by role checks in Angular. Angular consumes canonical capabilities/action flags; Express remains authoritative.

Organization-wide bypass follows the existing cases.view_all rule. Otherwise the actor must be an active employee member of the case workspace.

Client access is read-only and limited to USCIS filings/events that are explicitly clientVisible and belong to the client's accessible case.

## Staff API

Canonical endpoints should include:

- GET /api/v1/staff/cases/:caseId/uscis
- POST /api/v1/staff/cases/:caseId/uscis
- GET /api/v1/staff/uscis/:filingId
- PATCH /api/v1/staff/uscis/:filingId
- POST /api/v1/staff/uscis/:filingId/status-events
- GET /api/v1/staff/uscis with authorized filters for cross-case queues

Mutations require trusted-origin protection.

Every DTO must intentionally expose fields. Do not return raw Mongoose documents.

## Client Portal

Client Portal receives a simplified read-only view:

- form/filing label
- receipt number
- filed date
- receipt date
- current client-visible status
- last status date
- client-visible status history
- action-required message/deadline only when explicitly client-visible

Do not expose:
- internal notes
- provider payloads
- employee identifiers
- internal-only events
- raw audit metadata

## Status semantics

Do not hard-code business logic around one provider's exact status wording.

Store a normalized status code/category plus display title/description.

Phase 11 should support general categories such as:

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

The original observed title/description can be preserved separately.

No automatic legal conclusion should be inferred from status text.

## Notifications

A new current event may produce durable notifications through the existing Notification service.

Minimum rules:

- notify relevant staff when a filing is added or an action-required status is recorded;
- notify the client only when the filing/event is clientVisible;
- dedupe provider/imported notifications;
- email failure must not erase the in-app notification.

Add explicit notification types rather than overloading unrelated types.

## Deadlines

Phase 11 may capture responseDueAt for RFE/NOID/other action-required events.

Phase 11 must not build the full calendar/reminder engine. Phase 12 consumes this date as a deadline source.

## Provider integration

Phase 11 is manual-first and provider-ready.

Introduce a service boundary so a future official API/provider can supply observations without changing the core domain.

Do not implement unsupported scraping.

Provider input must be normalized and idempotent before creating status events.

## UI

### Case workspace

Add a clear "USCIS Tracking" / "Case Tracking" section.

Show:

- filings/receipt cards
- current status
- receipt number
- form type
- filed/receipt dates
- service center
- last checked/updated
- action required
- response due date
- chronological status timeline
- Add Filing
- Add Status Update
- Edit Filing Metadata when authorized

### Cross-case staff view

Provide an authorized queue/list for:

- all tracked filings visible to the actor
- action required
- upcoming response due dates
- recently changed
- approved/denied/closed
- search by case number, client and receipt number

Keep global navigation understandable; this may live under Cases/Tracking or as a dedicated top-level item if UX testing supports it.

## Audit

Use CaseActivity and/or a dedicated safe event record for actions such as:

- filing added
- receipt number changed
- filing metadata changed
- status event added
- client visibility changed

Do not duplicate sensitive free-text/provider payloads in generic activity logs.

## Indexes

Additive indexes only. Never syncIndexes in production.

Likely indexes:

- USCISFiling: unique partial receiptNumber
- case + archivedAt + updatedAt
- workspace + archivedAt + updatedAt
- currentStatusCode + updatedAt
- actionRequired + responseDueAt
- USCISStatusEvent: filing + occurredAt + createdAt
- case + createdAt
- optional providerEventId unique partial when provider source exists

Exact indexes must follow query plans actually used by Phase 11.

## Testing

Required integration coverage:

- multiple filings on one case
- receipt normalization and uniqueness
- invalid/malformed IDs
- case/workspace authorization
- removed member denied immediately
- view vs manage capability
- filing creation
- metadata update
- append-only status event
- current snapshot update
- older event does not incorrectly replace newer current status
- client-visible filtering
- action-required and responseDueAt
- notification dedupe
- cross-case queue scope
- provider idempotency contract even if provider implementation is only a test adapter

Required Angular tests use real API-shaped fixtures.

Required Client Portal tests prove internal events never leak.

## Deployment

Phase 11 implementation must not itself:

- merge to main
- deploy production
- apply production indexes
- apply production migrations/backfills
- change nginx

Implementation report must document exact production index/migration requirements and dry-run procedure.

## Consequences

This model supports:

- multiple USCIS forms/receipts per case
- manual tracking now
- provider automation later
- Phase 12 deadline integration
- client-safe status visibility
- cross-case operations queues
- immutable status history

It avoids tying ClientCase to one receipt/status string or one external provider.
