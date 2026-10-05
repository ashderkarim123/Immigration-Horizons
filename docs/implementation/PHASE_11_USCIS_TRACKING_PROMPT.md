# Phase 11 — USCIS Tracking Implementation Prompt

**Working branch:** `phase-11/uscis-tracking-main`  
**Production code baseline:** `main@1408784255ca0aff8f1a2d6cc7086998bc11fe80`  
**Architecture:** `docs/architecture/ADR-026-uscis-filing-status-tracking.md`  
**Date prepared:** 2026-10-05

> This is a production feature phase. Do not build placeholders or mock product screens. Anything visible to Staff/Clients must be backed by the real canonical API/domain and real authorization.

---

## 0. Mission

Implement **Phase 11 — Case-Native USCIS Filing & Status Tracking** for Immigration Horizons.

The finished phase must provide:

1. real case-scoped USCIS filing/receipt records;
2. immutable status history;
3. real Staff Case Tracking UX in Angular;
4. a real cross-case tracking queue;
5. safe read-only USCIS status in the Next.js Client Portal;
6. manual status management that works with zero external credentials;
7. official USCIS Case Status API integration behind the Express backend when sandbox credentials are configured;
8. provider idempotency, security, authorization, notifications and audit;
9. full regression/CI coverage.

Do not stop at model scaffolding, API skeletons or blank tabs.

---

## 1. Git safety and preflight

The old `phase-11/uscis-tracking` branch is intentionally **not** the implementation base. It was created from an older baseline and diverged.

Use only:

```text
phase-11/uscis-tracking-main
```

Before editing:

```bash
git fetch origin --prune

git branch --show-current
git status --short
git rev-parse HEAD
git rev-parse origin/phase-11/uscis-tracking-main
git rev-parse origin/main
git log --graph --decorate --oneline -30
git diff
git diff --cached

git rev-list --left-right --count origin/main...HEAD
```

Expected initial production baseline ancestry:

```text
1408784255ca0aff8f1a2d6cc7086998bc11fe80
```

If `main` has advanced after this prompt was written, **inspect the newer commits first**. Do not blindly rebase/merge. Report material conflicts and integrate only through an explicit safe plan.

Never:

```text
git reset --hard
git clean -fd
git rebase shared history
git commit --amend shared commits
git push --force
work directly on main
```

Do not deploy.

---

## 2. Required reading

Read completely before coding:

```text
CLAUDE.md
AGENTS.md

.claude/SECURITY.md
.claude/API_ARCHITECTURE.md
.claude/DATABASE.md
.claude/TESTING.md
.claude/DEPLOYMENT.MD

docs/architecture/ADR-012-security-privacy-and-audit.md
docs/architecture/ADR-014-migrations-and-retention.md
docs/architecture/ADR-015-angular-enterprise-platform.md
docs/architecture/ADR-016-authentication-boundaries.md
docs/architecture/ADR-017-case-native-tasks-and-deadlines.md
docs/architecture/ADR-018-evidence-checklists-and-requirements.md
docs/architecture/ADR-019-canonical-staff-documents-and-secure-file-operations.md
docs/architecture/ADR-020-canonical-staff-communications-and-collaboration.md
docs/architecture/ADR-021-smart-forms-v1.md
docs/architecture/ADR-022-case-native-petition-work-v1.md
docs/architecture/ADR-023-case-native-filing-packets-v1.md
docs/architecture/ADR-024-angular-staff-production-cutover.md
docs/architecture/ADR-025-stabilization-staff-cms-and-guided-work.md
docs/architecture/ADR-026-uscis-filing-status-tracking.md

docs/implementation/STABILIZATION_PHASE_01_REPORT.md
docs/implementation/REFERENCE_UX_AND_USCIS_AUTOFILL_PRODUCT_SPEC.md
docs/implementation/PHASE_08_SMART_FORMS_REPORT.md
docs/implementation/PHASE_09_PETITION_WORK_REPORT.md
docs/implementation/PHASE_10_FILING_PACKETS_REPORT.md

docs/deployment/ANGULAR_STAFF_CUTOVER_RUNBOOK.md
```

Inspect actual code; documentation is not automatically authoritative if code has moved.

At minimum inspect current:

```text
server/models/ClientCase.js
server/models/CaseWorkspace.js
server/models/WorkspaceMember.js
server/models/CaseActivity.js
server/models/CaseDocument.js
server/models/admin/Notification.js

server/services/casePolicy.js
server/services/notificationService.js
server/utils/permissions.js
server/utils/securityEvents.js
server/routes/api/v1/
server/openapi/v1.yaml
server/scripts/createIndexes.js

enterprise-ui/projects/case-management/src/app/
src/app/portal/
src/app/api/portal/
src/lib/auth/
src/lib/models/
test/
server/test/
```

Re-audit whether any USCIS tracking implementation has appeared since the baseline. If it has, extend/refactor it rather than duplicating it.

---

## 3. Official USCIS provider facts

The provider integration in this phase is based only on the official USCIS Torch Developer Portal.

Reference:

```text
https://developer.uscis.gov/
https://developer.uscis.gov/api/case-status
https://developer.uscis.gov/article/how-get-access-tokens-client-credentials
https://developer.uscis.gov/get-started/go-live
```

Current documented behavior:

- OAuth 2.0 Client Credentials;
- backend-mediated access;
- Sandbox OAuth URL:
  `https://api-int.uscis.gov/oauth/accesstoken`;
- Sandbox Case Status URL:
  `https://api-int.uscis.gov/case-status/{receiptNumber}`;
- current sandbox quota/throughput documentation: 1,000/day and 5 TPS;
- current production Case Status documentation: 400,000/day and 10 TPS;
- production endpoints/credentials are supplied after USCIS production approval;
- production access requires USCIS onboarding, sandbox use/testing and review/demo.

Treat external limits/processes as changeable. Keep provider configuration server-owned.

### Absolutely prohibited

Do not:

- scrape Case Status Online HTML;
- use browser automation against USCIS;
- place USCIS credentials in Angular/Next public env;
- expose OAuth access tokens to browsers;
- commit service credentials;
- assume sandbox production URLs;
- fabricate live statuses.

---

## 4. Product boundary

Current product topology remains:

```text
immigrationhorizons.com
  -> Next.js public site

app.immigrationhorizons.com
  /portal/*   -> Next.js Client Portal
  /staff/*    -> Angular Staff app
  /api/v1/*   -> Express canonical Staff API

admin.immigrationhorizons.com
  -> Express/EJS CMS
```

Phase 11 must not:

- replace Next.js public site;
- migrate Admin CMS to Angular;
- migrate Client Portal to Angular;
- introduce Firestore;
- introduce a new microservice;
- introduce Kafka/Redis merely for tracking;
- change nginx routing;
- remove legacy Staff rollback routes.

---

## 5. Domain model — USCISFiling

Create:

```text
server/models/USCISFiling.js
collection: uscis_filings
```

Use the current model conventions.

Required concepts:

```text
case                  ObjectId ClientCase required
workspace             ObjectId CaseWorkspace required

title                 bounded string required
formType              bounded string required
formSubType           bounded string optional

receiptNumber         normalized string optional

filedAt               Date optional
receiptDate            Date optional
serviceCenter          bounded string optional

trackingProvider      none | uscis_case_status
trackingEnabled       boolean

currentEvent          ObjectId USCISStatusEvent optional
currentStatusCategory normalized category optional
currentStatusTitle    bounded string
currentStatusDescription bounded string
currentStatusAt       Date optional
currentStatusSource   manual | uscis_api optional

actionRequired        boolean
responseDueAt         Date optional

clientVisible         boolean

lastCheckedAt         Date optional
lastSyncSucceededAt   Date optional
lastSyncErrorAt       Date optional
lastSyncErrorCode     bounded safe code optional

archivedAt            Date optional

createdBy             ObjectId AdminUser optional
createdByName         string
updatedBy             ObjectId AdminUser optional
updatedByName         string

timestamps
```

No raw OAuth data.

No raw provider payload blob.

### Receipt normalization

Create one server-owned helper.

Normalize:

1. trim;
2. uppercase;
3. remove spaces/hyphens.

For official Case Status synchronization require the currently documented normal receipt shape:

```text
AAA1234567890
3 letters + 10 digits
```

Do not auto-correct ambiguous characters.

Do not make Angular the source of truth for validity.

A manual draft filing may exist without a receipt number.

Once present, receipt number must be globally unique through a partial unique DB index.

Return duplicate receipt conflicts as controlled `409 conflict`, not raw Mongo errors.

---

## 6. Domain model — USCISStatusEvent

Create:

```text
server/models/USCISStatusEvent.js
collection: uscis_status_events
```

Required concepts:

```text
filing                ObjectId USCISFiling required
case                  ObjectId ClientCase required
workspace             ObjectId CaseWorkspace required

statusCategory        normalized category required
statusTitle           bounded string required
statusDescription     bounded string

occurredAt            Date required
observedAt            Date required

source                manual | uscis_api

providerEventKey      string optional
providerModifiedAt    Date optional
providerPayloadHash   string optional

actionRequired        boolean
responseDueAt         Date optional

clientVisible         boolean

relatedDocument       ObjectId CaseDocument optional

createdBy             ObjectId AdminUser optional
createdByName         string

createdAt
```

### Append-only

Protect at the model layer:

- updates throw;
- replacements throw;
- deletes throw;
- saving an existing event throws.

There is no API route to edit or delete a status event.

Correction = append a new event.

---

## 7. Status categories

Server-owned values:

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

Preserve the actual observed/provider title separately.

If implementing provider-title normalization, use a conservative tested mapping catalog.

Unknown titles => `other`.

Never create legal conclusions from text.

Do not infer a due date from "RFE", "NOID", "notice", or any provider sentence.

---

## 8. Tracking service

Create a proper application/domain service, for example:

```text
server/services/uscisTracking.js
```

The exact module layout may differ if current conventions support a cleaner split.

Service responsibilities:

- load filing + case + primary workspace safely;
- row-scope authorization helpers where appropriate;
- normalize/validate receipt;
- create filing;
- update editable filing metadata;
- archive filing;
- append manual status event;
- append/import provider events;
- current-snapshot selection;
- current-snapshot rebuild/repair;
- case filing list;
- filing detail;
- cross-case authorized query;
- client-safe projection;
- notifications;
- safe CaseActivity entries;
- provider synchronization orchestration.

Routes should be transport, not the business-logic owner.

Angular contains no filing business rules.

---

## 9. Current snapshot algorithm

Events are authoritative.

When an event is appended/imported:

1. persist the immutable event;
2. determine whether it is newer than the current event;
3. update `USCISFiling.current*` snapshot only if it wins;
4. update filing actionRequired/responseDueAt from the winning event where the design intentionally treats those as current;
5. provide a `rebuildCurrentSnapshot(filingId)` helper.

Ordering must be deterministic.

At minimum:

```text
occurredAt
then createdAt/provider stable key
```

Tests must prove that backfilling an older historical event does not roll the current status backward.

If event creation succeeds but snapshot update fails, the event history must still make repair possible.

---

## 10. Capabilities and authorization

Add:

```text
uscis_tracking.view
uscis_tracking.manage
uscis_tracking.sync
```

Update every mirrored capability contract/fixture required by the current repository.

Suggested initial grants, subject to current role registry:

### view

```text
super_admin
admin
operations_admin
pm
petition_writer
uscis_forms_specialist
reviewer
```

### manage

```text
super_admin
admin
operations_admin
pm
uscis_forms_specialist
```

### sync

```text
super_admin
admin
operations_admin
pm
uscis_forms_specialist
```

Do not authorize by role in Angular.

Every filing is case-scoped.

Authorization = capability AND:

```text
cases.view_all
OR
active WorkspaceMember employee membership
```

Use the existing case-policy infrastructure.

Malformed ObjectId, nonexistent filing, filing in inaccessible case, and removed-member filing must follow the existing concealment contract (normally identical external 404 semantics).

---

## 11. Staff API

Mount under the canonical Express `/api/v1/staff` boundary.

Required functionality:

```text
GET    /cases/:caseId/uscis
POST   /cases/:caseId/uscis

GET    /uscis
GET    /uscis/provider-status

GET    /uscis/:filingId
PATCH  /uscis/:filingId
POST   /uscis/:filingId/status-events
POST   /uscis/:filingId/sync
POST   /uscis/:filingId/archive
```

If current API naming conventions strongly favor a different plural resource path, remain consistent and document it.

All mutations:

- trusted-origin middleware;
- authenticated employee session;
- forced first-login password setup complete;
- required capability;
- case row authorization;
- validated JSON body;
- stable error envelope;
- request ID.

No raw Mongoose serialization.

### Case list DTO

Include intentional fields only.

### Filing detail DTO

Recommended shape:

```json
{
  "data": {
    "filing": {
      "id": "...",
      "caseId": "...",
      "title": "I-140",
      "formType": "I-140",
      "receiptNumber": "IOE1234567890",
      "filedAt": "...",
      "receiptDate": "...",
      "serviceCenter": "...",
      "clientVisible": true,
      "archived": false,
      "provider": {
        "type": "uscis_case_status",
        "enabled": true,
        "lastCheckedAt": "...",
        "lastSuccessfulSyncAt": "..."
      },
      "currentStatus": {
        "category": "received",
        "title": "Case Was Received",
        "description": "...",
        "occurredAt": "...",
        "source": "uscis_api",
        "actionRequired": false,
        "responseDueAt": null
      },
      "actions": {
        "canEdit": true,
        "canAddStatus": true,
        "canSync": true,
        "canArchive": true
      }
    },
    "events": []
  },
  "meta": {
    "requestId": "..."
  }
}
```

Do not make UI infer actions from roles.

---

## 12. Cross-case tracking API

`GET /api/v1/staff/uscis`

Support real bounded filters:

- search;
- statusCategory;
- actionRequired;
- responseDueFrom;
- responseDueTo;
- trackingProvider;
- scope;
- archived;
- page;
- limit;
- sort.

Search may cover:

- normalized receipt number;
- case number;
- filing/form label;
- primary-client display name only if implemented without unsafe/N+1 behavior.

Filters must only narrow the already-authorized case set.

Never use a broad search query and then filter unauthorized rows in application memory.

---

## 13. Official USCIS provider adapter

Create a provider abstraction, for example:

```text
server/services/uscis/providers/caseStatusProvider.js
server/services/uscis/providers/uscisTorchCaseStatusProvider.js
```

### Environment

Update `.env.example` with names only, never real values:

```text
USCIS_CASE_STATUS_ENABLED=false
USCIS_CASE_STATUS_ENV=sandbox
USCIS_CASE_STATUS_CLIENT_ID=
USCIS_CASE_STATUS_CLIENT_SECRET=
USCIS_CASE_STATUS_OAUTH_URL=https://api-int.uscis.gov/oauth/accesstoken
USCIS_CASE_STATUS_BASE_URL=https://api-int.uscis.gov/case-status
USCIS_CASE_STATUS_DEMO_ID=
USCIS_CASE_STATUS_TIMEOUT_MS=8000
USCIS_CASE_STATUS_MAX_TPS=
```

Do not prefix secrets with `NEXT_PUBLIC_`.

Do not add credentials to Angular environments.

### OAuth token lifecycle

Use Client Credentials.

Cache access token in server process memory.

Refresh before expiry.

Do not store the access token in MongoDB.

Do not log:

- client secret;
- access token;
- Authorization header.

If a provider request returns authentication-expired semantics, clear token cache and retry token acquisition/provider request at most once.

No infinite retry.

### HTTP client

Use a backend HTTP facility already compatible with current Node runtime (native `fetch` is acceptable if existing project style supports it).

Requirements:

- AbortController timeout;
- controlled headers;
- explicit JSON parsing;
- safe error normalization;
- no redirect to arbitrary host;
- configurable base URL;
- no browser fetch to USCIS.

### USCIS response mapping

The official sandbox response contains a `case_status` object with fields such as receipt number, form type, submitted/modified dates, current English status text/description and, for some staging receipts, historical case-status data.

Do not expose the raw object to users.

Normalize into:

```text
ProviderObservation
  receiptNumber
  formType
  submittedAt
  providerModifiedAt
  current:
    title
    descriptionPlainText
    occurredAt
  history[]
  providerFingerprint
```

Strip/sanitize provider HTML to plain text before storage.

Do not persist arbitrary provider HTML.

Use a cryptographic payload/status fingerprint for provenance/idempotency where the provider lacks a durable event id.

---

## 14. Provider synchronization endpoint

```text
POST /api/v1/staff/uscis/:filingId/sync
```

Behavior:

1. authenticate/authorize;
2. ensure provider feature configured;
3. ensure filing has valid receipt;
4. rate-limit;
5. request official API;
6. normalize observation;
7. import historical events idempotently;
8. import current event idempotently;
9. rebuild/update snapshot;
10. set `lastCheckedAt`;
11. on success set `lastSyncSucceededAt` and clear safe error state;
12. return current filing DTO.

If observation is unchanged:

- no duplicate event;
- no duplicate notification;
- update last checked/success time.

On provider failure:

- do not destroy existing known status;
- set safe sync error metadata;
- return controlled error;
- never leak provider credentials/token;
- log only safe request ID/error code/masked receipt.

### Provider status endpoint

`GET /api/v1/staff/uscis/provider-status`

Return only operational facts such as:

```json
{
  "configured": true,
  "enabled": true,
  "environment": "sandbox"
}
```

Never return URLs containing secrets, client ID, secret, token or credential values.

---

## 15. Rate limits / quotas

Respect USCIS's published limits but do not assume they never change.

Implement conservative server-side throttling.

Sandbox currently documents 5 TPS; production Case Status currently documents 10 TPS.

Do not refresh automatically on page load.

Phase 11 required provider interaction:

- explicit per-filing refresh.

Optional only if clean/safe:

- bounded batch refresh for selected authorized filings.

Do not implement an uncontrolled full-database poller in this phase.

A future scheduled job may call the same service after operations approve cadence/quota strategy.

---

## 16. Manual tracking is mandatory

The platform must remain fully useful when:

```text
USCIS_CASE_STATUS_ENABLED=false
```

Staff with manage capability can:

- create filing;
- add receipt;
- set filed/receipt date;
- add manual status event;
- mark action required;
- enter response due date;
- control client visibility;
- archive filing.

The UI must not show a fake/disabled "USCIS connected" experience.

When provider is unavailable, show normal manual tracking and an unobtrusive provider-not-configured state only where relevant.

---

## 17. Case Tracking Angular UX

Integrate into the real Case Workspace.

Use existing Immigration Horizons design system, shell, responsive behavior and case command-center patterns.

### Tab/section

Add:

```text
Case Tracking
```

or `USCIS Tracking` if current product vocabulary has standardized on that term.

Do not create both competing labels.

### Filing list

Show real filing rows/cards:

- form type/title;
- receipt number;
- current official/manual title;
- source badge;
- status date;
- action required;
- response due;
- client visibility;
- last checked.

### Filing detail

Show:

- metadata summary;
- status timeline newest/oldest with a clear chronology;
- provider/manual source;
- dates;
- safe description;
- Staff notice-document link if implemented and authorized.

### Mutations

Authorized controls:

- Add Filing;
- Edit Metadata;
- Add Status Update;
- Refresh from USCIS;
- Archive.

Use proper dialogs/forms.

Never use browser `confirm()` for important case operations if current UI has dialog primitives.

### Form quality

Receipt input:

- uppercase formatting;
- explain expected shape;
- server error association;
- do not imply receipt validity means legal status.

Status update:

- category;
- title;
- description optional;
- occurred date/time;
- action required checkbox;
- response due date shown only when action required;
- client-visible toggle;
- optional Staff document link.

### States

Implement:

- skeleton/loading;
- empty;
- loaded;
- validation error;
- conflict;
- provider unavailable;
- provider rate-limited;
- provider not configured;
- inaccessible/not found;
- responsive mobile/tablet.

No placeholder copy.

---

## 18. Global Staff Tracking workspace

Add a functional route following current navigation conventions, e.g.:

```text
/staff/tracking
```

or the equivalent Angular child route.

Views/filters:

```text
Action Required
Response Dates
Recently Updated
All Tracking
Approved / Closed
```

This is a real API-backed queue.

Useful table columns:

- Case;
- Client;
- Form;
- Receipt;
- Current Status;
- Updated;
- Action Required;
- Due;
- Source;
- PM.

Click goes to that case's tracking filing.

URL-backed filters/pagination where current Staff list patterns support it.

If current nav is already crowded, nest under Cases instead of blindly adding a top-level item.

---

## 19. Dashboard integration

Add a Staff dashboard metric/queue only when the actor has `uscis_tracking.view`.

Useful:

```text
USCIS Action Required
```

It links to the tracking queue.

Do not add decorative charts.

A count must use the same authorized server filter as the queue.

---

## 20. Client Portal API

Create read-only portal endpoints consistent with current portal route architecture, for example:

```text
GET /api/portal/cases/:caseId/uscis
GET /api/portal/uscis/:filingId
```

or one case-bundle endpoint if current portal style favors that.

Use the existing portal guard/session/origin/rate-limiting conventions.

Authorization requires active client membership for that case/workspace.

Projection rules:

- filing `clientVisible=true`;
- event `clientVisible=true`.

### Critical current-status rule

The Client current status is the newest **client-visible event**.

Do NOT return the Staff filing snapshot if its event is internal-only.

This must have a dedicated leakage regression test.

---

## 21. Client Portal UX

Add USCIS status to the real accessible case experience.

The client should see language such as:

```text
USCIS Status
I-140
Receipt: IOE1234567890
Current status: Case Was Received
Updated: Oct 2, 2026
```

Timeline shows client-visible events only.

If Staff marked an action/due date client-visible, show it prominently.

Do not show:

- provider connection/error details;
- internal normalized codes;
- employee names/ids unless an existing safe client UX explicitly needs them;
- raw provider payload;
- internal-only events;
- audit hashes.

If nothing is visible:

```text
No USCIS tracking updates are available for this case yet.
```

No error.

---

## 22. Notifications

Extend current Notification enums/contracts in both runtimes where mirrored.

Add only needed types:

```text
uscis_filing_added
uscis_status_changed
uscis_action_required
```

Use `notificationService.js`.

Use `dedupeKey`.

### Staff recipients

For action-required/current changes, notify relevant active employees based on existing case assignment/membership rules.

Do not notify every employee in the database.

### Client recipients

Notify only when:

- filing is client-visible;
- event is client-visible;
- client has active workspace membership.

Provider replay/same observation cannot create another notification.

Email side effects must not become a transaction requirement.

---

## 23. Case activity

Add safe activity types to Express and any mirrored contract:

```text
uscis_filing_created
uscis_filing_updated
uscis_status_recorded
uscis_filing_archived
```

CaseActivity messages must remain concise.

Do not copy full provider descriptions or status payloads into CaseActivity.

Example:

```text
I-140 tracking status updated to "Case Was Received" by Sarah.
```

The detailed immutable status history remains `USCISStatusEvent`.

---

## 24. Related notice document

If implemented this phase, `USCISStatusEvent.relatedDocument` must:

- point only to a CaseDocument in the same case/workspace;
- be selectable only from authorized Staff documents;
- never grant document access;
- use existing secure download policy;
- not automatically become client-visible because the status is client-visible.

Do not implement duplicate file storage.

This is optional if it materially threatens the core phase schedule.

---

## 25. OpenAPI

Update:

```text
server/openapi/v1.yaml
```

Document actual implemented endpoints only.

Include:

- Staff auth cookie;
- filters/pagination;
- explicit DTOs;
- 400 validation;
- 401 unauthenticated;
- 403 capability where concealment does not apply;
- 404 concealed/inaccessible;
- 409 duplicate/conflict;
- 429 provider/application rate limit;
- 502/503-style provider failure semantics if used;
- provider sync response.

Do not document future polling endpoints that do not exist.

---

## 26. Indexes

Register indexes in:

```text
server/scripts/createIndexes.js
```

and any index-contract tooling used by current CI.

Expected:

### USCISFiling

```text
receiptNumber unique partial
case + archivedAt + updatedAt
workspace + archivedAt + updatedAt
currentStatusCategory + updatedAt
actionRequired + responseDueAt
```

### USCISStatusEvent

```text
filing + occurredAt + createdAt
case + createdAt
providerEventKey unique partial
```

Only keep indexes that serve actual implemented queries.

Run dry-run only.

Do not apply production indexes.

Never use `syncIndexes()`.

---

## 27. No migration by default

Do not create USCIS status from:

- `ClientCase.currentStage`;
- petition status;
- filing packet status;
- task titles;
- document filenames.

Those are not authoritative USCIS status.

If the audit finds a real existing receipt field/data source:

1. document it;
2. write dry-run migration;
3. report conflicts;
4. do not apply production migration.

---

## 28. Security/privacy

Treat receipt numbers and provider data as case-confidential operational data.

Required:

- never log full OAuth tokens/secrets;
- mask receipt numbers in provider error logs where practical;
- no receipt number in route path for internal app routes;
- no raw provider JSON in browser DTO;
- sanitize provider description;
- bounded description length;
- no HTML injection;
- no provider URLs rendered from response payload;
- CSRF/origin on all writes;
- rate limit sync endpoint;
- case authorization every time.

Do not send provider credentials to monitoring error context.

---

## 29. Server tests

Add comprehensive integration tests.

Minimum matrix:

1. create manual filing;
2. multiple filings same case;
3. receipt normalization;
4. duplicate receipt conflict;
5. malformed receipt rejected for provider sync;
6. filing without receipt allowed where specified;
7. unauthenticated denied;
8. client session cannot authenticate as Staff;
9. role without view denied;
10. specialist active member can view;
11. other-team filing concealed;
12. removed member immediately denied;
13. manager can mutate;
14. view-only role cannot mutate;
15. sync capability independent from view;
16. status append;
17. append-only model rejects mutation/delete;
18. older historical event does not replace current;
19. rebuild snapshot produces correct current state;
20. action required and due date;
21. archive no hard delete;
22. cross-case queue row scope;
23. search cannot widen scope;
24. provider configuration safe status response;
25. provider token obtained through mock transport;
26. token cached;
27. expired/auth failure causes one token refresh retry;
28. provider 404 mapped safely;
29. provider 429 mapped safely;
30. provider 5xx/timeout does not destroy known status;
31. unchanged provider status creates no duplicate event;
32. provider event/history replay idempotent;
33. HTML-ish provider description sanitized to plain text;
34. notification created exactly once;
35. inactive/removed client not notified;
36. Staff DTO excludes provider secrets;
37. Client DTO excludes internal events/provider internals;
38. newer internal event does not leak through client current status.

Use fake/mocked provider transport.

CI must not require internet access or USCIS credentials.

---

## 30. Angular tests

Use real API-shaped fixtures.

Cover:

- Case Tracking empty state;
- loaded multiple filings;
- action-required due state;
- add filing validation;
- add manual status;
- edit metadata;
- archive flow;
- provider disabled => no fake usable sync;
- provider configured => sync action shown only with capability;
- provider failure display;
- timeline;
- global queue filters/pagination;
- capability-based controls;
- removed/inaccessible error state.

Do not write tests that merely assert components instantiate.

---

## 31. Client Portal tests

Cover:

- active client case membership;
- removed client denied;
- invisible filing omitted;
- invisible event omitted;
- newest internal event never becomes displayed current status;
- client-visible due date;
- no tracking => safe empty state;
- no provider internals;
- no employee IDs;
- no raw Mongoose fields.

---

## 32. Browser/E2E workflow

Extend the existing stabilized browser suite if feasible without making CI flaky.

Synthetic scenario:

### Staff

1. sign in Operations Admin/PM;
2. open synthetic case;
3. open Case Tracking;
4. add I-140 filing;
5. enter synthetic receipt;
6. add manual Received status;
7. add client-visible action-required RFE-like event with an explicit synthetic due date;
8. verify timeline and queue;
9. optionally run mocked/sandbox provider route only in a controlled provider-specific test layer — never hit USCIS live from CI.

### Client

1. sign in test client;
2. open same case;
3. see only client-visible filing/events;
4. verify internal-only event remains invisible.

### Specialist/reviewer

- view permitted;
- mutation rejected when capability absent.

### Removed member

- access immediately denied.

Keep E2E data synthetic.

---

## 33. Provider sandbox support

If the operator supplies **sandbox** USCIS credentials locally/staging, provide a separate manual verification procedure.

Do not make the normal test suite depend on it.

Use USCIS-provided staging receipt numbers from the official developer documentation only.

The report should provide a command/checklist that can validate:

- OAuth token exchange;
- successful case-status response;
- one intentional 4xx handling path;
- safe UI/provider-error display;
- no secret output.

This helps satisfy future USCIS production-onboarding requirements.

Do not commit captured responses containing credentials.

---

## 34. Production access readiness

Phase 11 implementation should produce a short operator section explaining that USCIS production sync remains OFF until official access is granted.

Current USCIS onboarding documentation should be rechecked at release time.

Current documented path includes:

- Developer Portal account;
- Developer App;
- Sandbox implementation/testing;
- required traffic/error handling;
- USCIS review/demo;
- production credentials/endpoints supplied after approval.

No code may assume approval already exists.

---

## 35. UI/UX quality

Use the existing stabilized Immigration Horizons enterprise design.

Requirements:

- navy/gold brand;
- no new unrelated color system;
- status uses text + color, never color alone;
- receipt number uses readable monospace/tabular presentation if current design permits;
- clear timestamp/source labels;
- accessible timeline semantics;
- keyboard-operable dialogs;
- visible focus;
- WCAG AA contrast;
- responsive case workspace;
- sensible mobile stacking;
- no horizontal overflow;
- skeletons rather than layout jumps;
- concise operational copy.

Avoid decorative charts.

Avoid a giant marketing hero inside Staff.

---

## 36. Performance

- server-side pagination;
- bounded event history;
- indexed row-scope queries;
- no N+1 client/case lookup per filing;
- no provider call during ordinary list/page load;
- no unbounded historical import;
- provider descriptions bounded;
- lazy-load Angular tracking feature route/component where consistent.

---

## 37. Git commits

Use atomic commits.

Suggested:

```text
feat(uscis): add case-native filing and immutable status domain
feat(uscis-api): add authorized tracking endpoints and queues
feat(uscis-provider): integrate official USCIS Case Status sandbox adapter
feat(staff-ui): add case and global USCIS tracking workspace
feat(portal): expose client-safe USCIS status
test(uscis): cover authorization provider and visibility boundaries
docs(phase-11): record USCIS tracking implementation
```

Do not bundle unrelated refactors.

---

## 38. Validation

Inspect current scripts first.

At minimum run the current production-grade gate, including:

```bash
# root
npm ci --no-audit --no-fund
npm run lint
npx tsc --noEmit
npm test
npm run build

# server
cd server
npm ci --no-audit --no-fund
npm test
npm run db:indexes:dry-run 2>/dev/null || true   # use the actual server script name if different
cd ..

# Angular
cd enterprise-ui
npm ci --no-audit --no-fund
npm test
npx ng build case-management
npx ng build admin-console
cd ..

# repository-specific staff build verifier if present
node scripts/deploy/verify-staff-build.js enterprise-ui/dist/case-management/browser

# browser tests where configured
npm run test:e2e
```

Do not blindly use the example command if the repository's actual script name differs.

Also:

```bash
git diff --check
git status --short
```

No production DB connection for automated tests.

---

## 39. CI

Push only after local verification.

The exact final SHA must have every required GitHub Actions job green.

Do not weaken tests to get green.

Do not skip browser/security suites merely because the feature compiles.

If provider integration tests require network, redesign them to use dependency injection/mock transport so CI remains deterministic.

---

## 40. Implementation report

Create:

```text
docs/implementation/PHASE_11_USCIS_TRACKING_REPORT.md
```

Record:

- starting main SHA;
- working branch;
- ending SHA;
- commits;
- files/domains created;
- collections;
- indexes;
- capability changes;
- notification/activity changes;
- Staff API;
- portal API;
- Angular routes/components;
- Client Portal UI;
- provider architecture;
- environment variable names only;
- provider sandbox verification performed or not performed;
- exact tests/counts;
- build results;
- browser results;
- CI run URL/id;
- migrations;
- index dry-run;
- production actions performed (**must be none**);
- production USCIS access state (not assumed);
- known limitations;
- rollback;
- next-phase recommendation.

---

## 41. Completion gate

Phase 11 is complete only when all of the following are true:

### Domain

- case can own multiple USCIS filings;
- receipt normalized/unique;
- immutable status events;
- current snapshot deterministic;
- historical event does not roll status backward;
- no hard-delete status history.

### Security

- view/manage/sync capabilities exist;
- case membership enforced;
- removed member denied;
- client visibility enforced;
- internal current event cannot leak through client snapshot;
- provider secrets never reach frontend.

### Staff product

- Case Tracking is a real working case workspace;
- filing CRUD subset works;
- manual status entry works;
- global tracking queue works;
- action required/due dates work;
- dashboard integration is real if added.

### Client product

- Client sees safe tracking on accessible case;
- client-visible timeline works;
- internal events stay hidden.

### Official provider

- server-only adapter exists;
- OAuth Client Credentials supported;
- provider sync route works against mocked adapter;
- idempotency works;
- error handling works;
- sandbox can be enabled through server secrets;
- no scraping.

### Quality

- OpenAPI updated;
- index dry-run updated;
- root tests green;
- server tests green;
- Angular tests green;
- Client Portal tests green;
- builds green;
- E2E/browser green where required;
- exact-SHA CI green.

### Safety

- no main merge;
- no deployment;
- no nginx change;
- no production index apply;
- no production migration;
- no production USCIS secret committed/configured by the agent.

---

## 42. Stop condition

When the exact Phase 11 SHA is green:

**STOP.**

Do not begin Calendar/Reminders, USCIS form autofill/PDF generation, Admin Angular migration, AI, or any other phase automatically.

Return the Phase 11 report and state:

- final SHA;
- CI result;
- whether official USCIS sandbox was manually verified;
- what is needed to request/enable USCIS production access;
- whether the next product phase is unblocked.
