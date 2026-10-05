# ADR-026 — Case-Native USCIS Filing & Status Tracking

**Status:** Accepted for Phase 11 implementation  
**Date:** 2026-10-05  
**Branch:** `phase-11/uscis-tracking-main`  
**Baseline:** `main@1408784255ca0aff8f1a2d6cc7086998bc11fe80`  
**Supersedes:** the planning copy of ADR-026 on the older diverged `phase-11/uscis-tracking` branch.

## Context

Immigration Horizons now has a real case-management operating system: case-native tasks/deadlines, evidence requirements, secure documents, communications, Smart Forms, petition work, filing packets, Staff operations, Client Portal workflows and production cutover/stabilization work.

The next product capability is **post-filing USCIS tracking**.

A single Immigration Horizons `ClientCase` can have more than one USCIS filing and more than one receipt number. An employment-based matter may have an I-140 plus later dependent/adjustment filings; an RFE/NOID response may itself need separate operational treatment. Therefore receipt/status data must not be flattened into one `ClientCase.receiptNumber` or one status string.

The system must also distinguish:

- the Immigration Horizons **case**;
- an individual **USCIS filing / receipt** within that case;
- immutable **status observations/events** for that filing;
- a denormalized **current status snapshot** used for fast operational reads.

The current product specification already reserves **Case Tracking / USCIS Status** as the post-filing workspace experience.

## Official USCIS API reality as of this ADR

USCIS now exposes an official **Case Status API** through the USCIS Torch Developer Portal.

Official documentation:
- https://developer.uscis.gov/api/case-status
- https://developer.uscis.gov/
- https://developer.uscis.gov/article/how-get-access-tokens-client-credentials

Current documented characteristics:

- OAuth 2.0 Client Credentials;
- server-to-server use;
- Sandbox Case Status endpoint under `https://api-int.uscis.gov/case-status`;
- Sandbox OAuth endpoint under `https://api-int.uscis.gov/oauth/accesstoken`;
- production can query live receipt numbers after USCIS production approval;
- production documentation currently states a 400,000 request/day quota and 10 TPS limit;
- sandbox documentation currently states 1,000 requests/day and 5 TPS;
- production access requires USCIS Developer onboarding, sandbox implementation/testing and USCIS review/demo requirements.

USCIS specifically expects credentials/tokens to remain behind a backend mediator. The Angular Staff application and Client Portal must never call USCIS directly and must never receive USCIS OAuth credentials.

These limits/processes are external facts and may change. Runtime rate/concurrency settings must therefore be configurable and conservative rather than hard-coded as permanent product rules.

## Decision summary

Phase 11 will implement **manual-first, official-API-ready tracking**.

1. Add a `USCISFiling` case-scoped aggregate for each receipt/filing.
2. Add an append-only `USCISStatusEvent` history.
3. Keep the filing's current status as a denormalized snapshot referencing the current event.
4. Add canonical Staff API endpoints and Angular Case Tracking UX.
5. Add a safe read-only Client Portal USCIS status view.
6. Add an official USCIS Case Status provider adapter behind the Express backend.
7. The system must be fully usable without USCIS API credentials through manual staff tracking.
8. When sandbox credentials are configured, Staff may explicitly synchronize an eligible receipt through the official API.
9. Production provider synchronization remains disabled until Immigration Horizons receives USCIS production credentials/approval.
10. Do not scrape USCIS web pages.
11. Do not infer filing deadlines from status text.
12. Do not store raw OAuth tokens or secrets in MongoDB.
13. Do not create a second case database or Firestore representation.

## Domain model

### USCISFiling

Collection:

`uscis_filings`

One document represents one tracked USCIS filing/receipt attached to one `ClientCase` / primary `CaseWorkspace`.

Recommended fields:

```text
case                  ObjectId -> ClientCase
workspace             ObjectId -> CaseWorkspace

title                 string
formType              string
formSubType           string | null

receiptNumber         normalized string | null
receiptNumberLast4    derived/display helper if useful

filedAt               Date | null
receiptDate            Date | null
serviceCenter          string | null

trackingProvider      none | uscis_case_status
trackingEnabled       boolean

currentEvent          ObjectId -> USCISStatusEvent | null
currentStatusCategory normalized category | null
currentStatusTitle    string
currentStatusDescription string
currentStatusAt       Date | null
currentStatusSource   manual | uscis_api | null

actionRequired        boolean
responseDueAt         Date | null

clientVisible         boolean

lastCheckedAt         Date | null
lastSyncSucceededAt   Date | null
lastSyncErrorAt       Date | null
lastSyncErrorCode     safe machine code | null

archivedAt            Date | null

createdBy             ObjectId -> AdminUser | null
createdByName         string
updatedBy             ObjectId -> AdminUser | null
updatedByName         string

createdAt
updatedAt
```

A case may own many filings.

### Receipt normalization

For Case Status API-compatible receipt numbers:

1. trim;
2. uppercase;
3. remove spaces and hyphens;
4. validate the currently documented normal receipt pattern of three letters + ten digits.

Do not invent or auto-correct digits.

If future USCIS documentation supports additional production identifiers, change the server-owned validator deliberately with tests. Never let Angular define receipt validity independently.

Receipt number uniqueness is global when present because a USCIS receipt identifies one filing. Use an additive **partial unique index** so manual draft filings without a receipt remain possible.

Do not put the receipt number in application URLs; route by internal filing ObjectId.

### USCISStatusEvent

Collection:

`uscis_status_events`

One immutable observation/status event.

Recommended fields:

```text
filing                ObjectId -> USCISFiling
case                  ObjectId -> ClientCase
workspace             ObjectId -> CaseWorkspace

statusCategory        normalized category
statusTitle           string
statusDescription     string

occurredAt            Date
observedAt            Date

source                manual | uscis_api

providerEventKey      string | null
providerModifiedAt    Date | null
providerPayloadHash   string | null

actionRequired        boolean
responseDueAt         Date | null

clientVisible         boolean

relatedDocument       ObjectId -> CaseDocument | null   # optional Staff provenance

createdBy             ObjectId -> AdminUser | null
createdByName         string

createdAt
```

Events are append-only:

- no update route;
- no delete route;
- model middleware rejects application updates/deletes;
- corrections are represented by a new event.

Provider replay must be idempotent. A provider-derived event receives a deterministic `providerEventKey`/fingerprint and a partial unique index.

## Status categories

Store the authoritative observed status title/description and a separate normalized operational category.

Initial categories:

```text
filed
received
actively_reviewed
notice_issued
rfe_issued
noid_issued
response_received
interview_scheduled
approved
denied
transferred
closed
other
```

The provider adapter may use a **server-owned, conservative mapping catalog** for known official status titles. Unknown/ambiguous titles become `other`.

The UI must show the observed official/manual title as the primary status. The normalized category is for filtering/operations and must never be presented as a legal interpretation.

Never infer:
- approval probability;
- legal strategy;
- deadline length;
- whether a response is legally sufficient;
- eligibility;
from USCIS status text.

## Current-status snapshot

`USCISFiling` carries a current snapshot for efficient case and firm queues.

The canonical tracking service is the only writer of the snapshot.

Event ordering:

1. `occurredAt`;
2. stable creation/provider-event tiebreaker.

Adding an older historical event after a newer event must not move the current filing status backward.

A repair/rebuild helper must be able to recompute the snapshot from immutable events. This makes the event history authoritative if a process fails after event creation but before snapshot update.

## Action-required dates

Phase 11 may record:

- `actionRequired`;
- `responseDueAt`.

These dates are entered explicitly by Staff from an authoritative notice or trusted source.

**Never calculate an RFE/NOID deadline by parsing status text.**

This data becomes a deadline source for later calendar/reminder integration, but Phase 11 does not build another task/calendar engine.

## Official provider boundary

Create a server-only provider interface such as:

```text
CaseStatusProvider
  getStatus(receiptNumber)
    -> normalized ProviderObservation
```

First concrete adapter:

`USCISCaseStatusProvider`

The adapter:

- obtains OAuth Client Credentials token server-side;
- caches token in process memory only until shortly before expiry;
- sends Bearer token only from Express/server;
- uses configurable sandbox/production endpoints;
- applies a short timeout;
- handles USCIS 2xx/4xx/401/403/404/429/5xx explicitly;
- does not log access tokens/client secrets;
- redacts/masks receipt numbers in logs;
- converts provider HTML-ish descriptions to safe plain text before persistence/display;
- never passes raw provider payloads to Angular/Client Portal;
- stores a payload hash/provenance rather than an unrestricted raw response.

Provider credentials are server environment secrets, for example:

```text
USCIS_CASE_STATUS_ENABLED=false
USCIS_CASE_STATUS_ENV=sandbox
USCIS_CASE_STATUS_CLIENT_ID=...
USCIS_CASE_STATUS_CLIENT_SECRET=...
USCIS_CASE_STATUS_OAUTH_URL=https://api-int.uscis.gov/oauth/accesstoken
USCIS_CASE_STATUS_BASE_URL=https://api-int.uscis.gov/case-status
USCIS_CASE_STATUS_DEMO_ID=...    # only when required by USCIS onboarding/demo
```

Production URLs/credentials must be configured from the values USCIS provides after approval, not guessed from sandbox URLs.

No secret is prefixed `NEXT_PUBLIC_` or compiled into Angular.

### Rate and quota handling

The adapter must stay below configured USCIS limits.

Defaults should be conservative. Provider rate/quota settings are configuration, not immutable constants.

Phase 11 does **not** need a distributed worker/queue just to ship tracking. It may support:

- single-filing **Refresh from USCIS**;
- controlled bounded batch refresh if implementation remains safe.

Do not create an uncontrolled loop that refreshes every receipt on every page load.

A future scheduler can consume the same provider service.

## Provider synchronization semantics

Add a mutation similar to:

`POST /api/v1/staff/uscis/:filingId/sync`

Requirements:

- `uscis_tracking.sync` capability;
- filing/case row authorization;
- trusted-origin protection;
- provider configured;
- valid receipt;
- per-user/IP and provider-level rate limiting;
- idempotent event import;
- current snapshot refresh;
- safe provider error DTO;
- no secret/provider token in response.

A successful provider check that returns the same current observation updates `lastCheckedAt` but does not create duplicate events or duplicate notifications.

Historical provider events, when supplied, are imported idempotently and sorted by event time.

## Authorization

Add explicit capabilities:

```text
uscis_tracking.view
uscis_tracking.manage
uscis_tracking.sync
```

Suggested initial grants, reconciled with the current capability registry during implementation:

**View**
- super_admin
- admin
- operations_admin
- pm
- petition_writer
- uscis_forms_specialist
- reviewer

**Manage**
- super_admin
- admin
- operations_admin
- pm
- uscis_forms_specialist

**Sync**
- super_admin
- admin
- operations_admin
- pm
- uscis_forms_specialist

Every operation also uses the existing case/workspace row policy. `cases.view_all` remains the existing organization-wide bypass. Otherwise an active employee workspace membership is required.

Removed members lose access immediately.

Angular never authorizes by hard-coded role names; it consumes capabilities/action flags.

## Staff API

Canonical JSON routes:

```text
GET    /api/v1/staff/cases/:caseId/uscis
POST   /api/v1/staff/cases/:caseId/uscis

GET    /api/v1/staff/uscis
GET    /api/v1/staff/uscis/provider-status

GET    /api/v1/staff/uscis/:filingId
PATCH  /api/v1/staff/uscis/:filingId
POST   /api/v1/staff/uscis/:filingId/status-events
POST   /api/v1/staff/uscis/:filingId/sync
POST   /api/v1/staff/uscis/:filingId/archive
```

No hard delete.

DTOs are explicit and never raw Mongoose documents.

Cross-case list supports bounded, server-side:

- search by receipt/case/client/form title where safely implementable;
- status category;
- action required;
- due date range;
- tracking provider;
- archived;
- scope;
- page/limit;
- stable sort.

Filters only narrow already-authorized rows.

## Staff UX

### Case workspace

Add **Case Tracking** (or **USCIS Tracking**, following the current stabilized navigation vocabulary) as a real case-workspace destination.

Show:

- filing title/form type;
- receipt number;
- current observed status;
- status timestamp;
- filed/receipt dates;
- service center;
- source badge: Manual / USCIS;
- last checked;
- provider sync state;
- action-required state;
- response due date;
- client visibility;
- chronological timeline.

Authorized controls:

- Add filing;
- Edit filing metadata;
- Add manual status update;
- Link a relevant notice document if implemented;
- Refresh from USCIS when provider is configured;
- Archive tracking record.

No fake sync button when the provider is not configured.

### Global tracking workspace

Provide a real operational queue under the stabilized navigation:

- Action Required;
- Response Dates;
- Recently Updated;
- All Tracking;
- Approved/Closed.

Use URL-backed filters and server pagination.

Add a Staff dashboard queue/card for USCIS action-required items only if it links to this real view.

## Client Portal

A client may read tracking only for:

1. a case they can access through active client workspace membership;
2. a filing where `clientVisible=true`;
3. status events where `clientVisible=true`.

Client view shows:

- form/filing label;
- receipt number;
- filed/receipt date;
- current **client-visible** status;
- status date;
- client-visible timeline;
- explicit action/due date only when intentionally client-visible.

It never exposes:

- internal-only events;
- provider errors;
- OAuth/provider metadata;
- provider payloads/hashes;
- employee identifiers;
- internal audit data;
- internal notes;
- hidden filings.

If an internal newer status exists but is not client-visible, do **not** accidentally expose it through the filing snapshot. Client current status must be computed from the newest **client-visible event**, not blindly copied from the Staff current snapshot.

## Notifications

Extend the existing notification registry and service rather than creating another notification system.

Recommended new types:

```text
uscis_filing_added
uscis_status_changed
uscis_action_required
```

Use existing `dedupeKey` support.

Rules:

- notify relevant assigned/manager Staff for action-required status changes;
- notify a client only when the filing and event are client-visible and the client still has active workspace membership;
- provider replays do not create duplicate notifications;
- unchanged syncs do not create new notifications;
- notification failure never rolls back the tracking event.

## CaseActivity

Add bounded safe activity types such as:

```text
uscis_filing_created
uscis_filing_updated
uscis_status_recorded
uscis_filing_archived
```

Activity messages may contain safe labels/status titles, but never OAuth data, raw provider payloads, secrets, full free-text provider descriptions, or sensitive notice contents.

The immutable USCIS event collection remains the detailed tracking history.

## Indexes

Additive indexes only, registered in the existing dry-run/createIndexes tooling.

Recommended:

### uscis_filings

- unique partial `receiptNumber`;
- `{ case: 1, archivedAt: 1, updatedAt: -1 }`;
- `{ workspace: 1, archivedAt: 1, updatedAt: -1 }`;
- `{ currentStatusCategory: 1, updatedAt: -1 }`;
- `{ actionRequired: 1, responseDueAt: 1 }`;
- optional provider-refresh operational index only if the implemented query requires it.

### uscis_status_events

- `{ filing: 1, occurredAt: -1, createdAt: -1 }`;
- `{ case: 1, createdAt: -1 }`;
- unique partial `providerEventKey`.

No `syncIndexes()`.

No production index application in the implementation phase.

## Tests

Integration coverage must include at minimum:

- multiple filings per case;
- receipt normalization;
- duplicate receipt uniqueness;
- malformed receipt validation;
- draft/manual filing without a receipt if allowed;
- case/workspace authorization;
- removed-member denial;
- view/manage/sync capability separation;
- safe Staff DTO;
- safe Client DTO;
- internal current event cannot leak through client snapshot;
- status event append-only enforcement;
- historical event does not replace newer current status;
- snapshot repair/rebuild;
- action-required/due date;
- archive behavior;
- cross-case filters cannot widen row access;
- notification recipient and dedupe behavior;
- provider token handling through mocked adapter;
- 401 token-refresh behavior;
- provider 404/429/5xx handling;
- same provider observation idempotency;
- provider history import idempotency;
- provider HTML description becomes safe plain text;
- secrets/tokens never appear in DTO/log test fixtures.

Angular tests cover working case and global tracking states.

Client Portal tests cover membership + client-visible filtering.

Browser CI should exercise one complete synthetic tracking journey.

## Migration/backfill

Prefer **no broad migration**.

Do not invent receipt/status history from:
- `ClientCase.currentStage`;
- filing packet lifecycle;
- task names;
- document titles.

If an authoritative existing receipt number is discovered in production data, write a separate dry-run migration with explicit source evidence and conflict reporting. Never guess.

## Deployment

Phase 11 implementation does not:

- merge itself to main;
- deploy production;
- alter nginx;
- apply production indexes;
- add production USCIS credentials;
- run a production backfill.

USCIS production synchronization is a separate operational enablement step after:
- USCIS production approval;
- server secrets are configured;
- provider sandbox/demo acceptance is complete;
- exact-SHA CI is green;
- production backup/index review is complete.

Manual tracking remains usable even when provider integration is disabled.

## Consequences

This architecture supports a real immigration operations workflow now while preserving a clean path to official automated status synchronization.

It avoids:
- one-receipt-per-case limitations;
- unsupported scraping;
- provider-coupled domain design;
- duplicate status notifications;
- leaking internal status to clients;
- storing USCIS credentials in frontend code;
- turning provider status text into legal advice.
