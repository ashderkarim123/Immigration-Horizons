# ADR-028 — Authorized Global Search & Operational Reporting

**Status:** Accepted for Phase 13 implementation  
**Date:** 2026-10-07  
**Branch:** `phase-13/search-reporting`  
**Baseline:** `main@d9e90a46cdc07feb8c588afe60ba7259de7b12a0`

## Context

Immigration Horizons now has a production Staff application with real modules for:

- consultations/intake;
- clients;
- cases/workspaces;
- tasks and deadlines;
- evidence;
- secure documents;
- queries;
- collaboration/messages;
- Smart Forms;
- petition work;
- filing packets;
- USCIS tracking;
- calendar/reminders.

Each module already has its own authorized list/search/filter semantics, but Staff still has to know where an item lives before searching for it.

The legacy Express Admin CMS has a separate `/admin/search` route that searches blog posts, leads, testimonials and FAQs. That route is CMS-oriented and is not a safe or sufficient Staff universal search.

The capability registry already contains:

- `reports.view`;
- `csv.export`.

Those capabilities are currently underused in the Angular Staff product.

The next platform need is therefore:

1. one **universal Staff search** that never becomes an authorization side channel;
2. one **operational reporting workspace** built from the real case-management domains;
3. safe, bounded CSV export for actual report tables;
4. no reporting warehouse or duplicate search database until scale proves one is required.

## Decision summary

### Search

Phase 13 implements a **federated, read-time Staff search**.

The backend owns a registry of search adapters. Each adapter:

1. checks the source capability;
2. applies row-level authorization inside the database query;
3. searches only explicitly approved fields;
4. returns an explicit safe DTO;
5. never exposes a raw model;
6. never relies on Angular to hide unauthorized results.

No `global_search` Mongo collection is introduced.

No background indexing pipeline is introduced.

No Atlas Search dependency is assumed.

### Reporting

Phase 13 implements **read-time operational reports** from the existing source models.

The system does not create a duplicate analytics warehouse in this phase.

Every report is explicit about whether a metric is:

- a **current snapshot**; or
- a **period measure**.

The UI must not present a current-state count as if it were a historical trend.

### Export

CSV exports reuse the exact same report services/filters/authorization as the on-screen report.

Exports require both:

- `reports.view`;
- `csv.export`.

Exports are bounded and CSV-injection safe.

A successful report export is recorded in the append-only security log using a dedicated safe event type.

## Product scope

Phase 13 is Staff-only.

It does not add:

- Client Portal global search;
- Client Portal reporting;
- CMS search migration;
- SEO analytics;
- billing/financial reporting;
- external BI;
- Elasticsearch/OpenSearch;
- Atlas Search;
- AI semantic search;
- vector search;
- legal-success scoring;
- approval-probability reporting.

The legacy Admin CMS search remains until the Angular CMS/Admin migration reaches it.

## Search architecture

### Canonical endpoint

```text
GET /api/v1/staff/search
```

Quick-search mode supports a grouped cross-source response.

A typed/full-results mode may use either:

```text
GET /api/v1/staff/search?type=cases
```

or:

```text
GET /api/v1/staff/search/:type
```

The implementation must choose one style and document it consistently in OpenAPI and Angular.

### Query rules

Recommended:

```text
q              required
types/type     optional
limit          bounded
page           only for single-type/full-results mode
```

Server validation:

- trim;
- minimum 2 visible characters;
- maximum 80 characters;
- escape regex metacharacters;
- reject unknown source types;
- cap per-source result counts.

One-character searches are not worth a cross-collection query.

The browser should debounce quick search, but server rate limiting remains authoritative.

### Search source registry

Initial source types:

```text
cases
clients
consultations
tasks
documents
queries
evidence
forms
petitions
filing_packets
uscis
conversations
```

A source can be omitted at implementation time only if the report documents a concrete policy/performance blocker. It must not be replaced with fake results.

### Approved searchable fields

#### Cases

Gate:

- `cases.view`;
- case row scope.

Search:

- caseNumber;
- title.

Do not search description in Phase 13.

#### Clients

Gate:

- `clients.view`;
- current client/case policy.

Search:

- firstName;
- lastName;
- normalizedEmail/email.

Return only safe client-directory fields.

Never:

- passwordHash;
- lockout counters;
- authentication metadata not already in the safe client directory DTO.

#### Consultations / leads

Gate:

- `leads.view`;
- current lead visibility semantics.

Search:

- name;
- email;
- service where useful and bounded.

Do not expose internal notes through search.

#### Tasks

Gate:

- current task visibility;
- case scope for case-native tasks;
- ownership/all-task rules from the Staff Tasks module.

Search:

- title;
- type.

Do not return task notes in search snippets.

#### Documents

Gate:

- `documents.view`;
- document policy;
- case row scope.

Search:

- displayName;
- originalName;
- documentType.

Never search or expose:

- storageKey;
- filesystem path;
- checksum;
- internal review comment;
- file contents.

Phase 13 does not implement OCR/full-text document content search.

#### Queries

Gate:

- `queries.view`;
- `accessibleInteractionFilter()`.

Search:

- interactionNumber;
- subject.

Do not expose internalResponse or private notes.

#### Evidence

Gate:

- `cases.view`;
- case row scope.

Search:

- requirement title;
- section;
- template item label where safe.

Do not expose internalNotes/staffGuidance in universal search.

#### Smart Forms

Gate:

- `forms.view`;
- case row scope.

Search:

- templateTitleSnapshot;
- templateKey where useful.

Do not search or return form answers.

#### Petition Work

Gate:

- `petitions.view`;
- case row scope.

Search:

- petition title;
- kind.

Do not search or return petition section body text or internal review notes.

#### Filing Packets

Gate:

- `filing_packets.view`;
- case row scope.

Search:

- packet title;
- kind;
- safe petition title snapshot.

Do not return packet item notes/internal review notes.

#### USCIS

Gate:

- `uscis_tracking.view`;
- case row scope.

Search:

- normalized receipt number;
- title;
- formType;
- currentStatusTitle where safely bounded.

Receipt-number searches should rank exact and prefix matches highly.

#### Conversations

Gate:

- `channels.view`;
- existing collaboration policy including restricted-channel membership.

Search:

- channel name;
- case number/title context.

Phase 13 **does not search message body text** in universal search.

That is deliberate: message-body search requires stronger indexing/privacy design and could otherwise become a restricted-channel leakage surface.

### Search result DTO

All adapters normalize to:

```text
type
id

title
subtitle
statusLabel

case:
  id
  caseNumber
  title

context[]              short safe labels only

updatedAt

href

match:
  field                safe enum/label
  quality              exact | prefix | text
```

Not every result uses every field.

`href` is backend-owned or derived from a server-owned result mapping so Angular does not invent sensitive object routes.

### Ranking

Within a source:

1. exact primary identifier;
2. identifier prefix;
3. title/name prefix;
4. literal text match;
5. newest relevant item as a stable tiebreaker.

Do not invent one opaque numeric "AI relevance" score.

Cross-source quick search should group by source rather than pretend that a Client and USCIS receipt have directly comparable numeric relevance.

### Search result counts

The API may return:

```text
returned
hasMore
```

per visible source.

Do not return a count derived from unauthorized rows.

Do not run an expensive exact total count merely to decorate the quick-search dialog.

### Search errors

Search adapters are fail-closed.

If one adapter fails:

- do not return partial unauthorized data;
- log request id + source name + safe error;
- either mark that source unavailable in safe metadata or fail the request consistently.

Never silently convert a failed search source into "0 matches" if that would mislead the user.

### Search logging/privacy

Search text may contain PII, receipt numbers or client names.

Therefore normal application logs and security events must not record raw query text.

Safe telemetry may include:

- request id;
- query length;
- requested source types;
- source durations;
- returned counts;
- timeout/error source.

No persisted search-history feature in Phase 13.

## Search UI

### Command search

The Angular Staff top bar gains a real universal search control.

Keyboard shortcut:

```text
Ctrl+K
Cmd+K
```

Expected behavior:

- accessible dialog/combobox;
- input focused on open;
- 250–350 ms debounce;
- no request before minimum query length;
- grouped real results;
- arrow-key navigation;
- Enter opens result;
- Escape closes;
- clear loading/error/no-result states;
- result type conveyed with text, not color alone;
- no innerHTML-based highlighting.

The top bar control is no longer a placeholder.

### Full search page

Add:

```text
/staff/search?q=...
```

or Angular route equivalent under the existing `/staff/` base.

Features:

- query in URL;
- source filters;
- grouped quick results or selected-source pagination;
- keyboard accessible;
- result deep links;
- capability-hidden source filters;
- no fake "search everything" claims for sources intentionally excluded from Phase 13.

## Search performance

Phase 13 is intentionally federated rather than a new indexing subsystem.

Safeguards:

- minimum query length;
- max query length;
- escaped literal regex;
- source-specific row scope;
- per-source result limit;
- rate limit;
- parallel adapters;
- bounded query timeout where practical;
- no document/message body scan;
- no unbounded aggregation.

If production scale later proves this insufficient, a future ADR may introduce Atlas Search/OpenSearch or a dedicated search projection. That future index must still carry authorization-safe metadata and never become the authority for case access.

## Reporting authorization

Existing `reports.view` remains the report-view capability.

Existing `csv.export` remains the export capability.

No new broad reporting bypass is created.

A report user must have:

```text
reports.view
AND
the underlying resource capability
AND
row-level access
```

for each section represented.

Because manager roles currently hold most operational capabilities, many sections will be available to them, but the implementation must not hard-code that assumption.

### Case scope

Report service supports explicit scope:

```text
accessible
mine
firm
```

Rules:

- `accessible` = current case-policy scope;
- `mine` = current actor's operational case ownership (normally project manager) plus only their permitted rows;
- `firm` requires `cases.view_all`.

Do not invent a "department/team" scope until the application has an authoritative organizational team hierarchy.

If the user requests `firm` without `cases.view_all`, reject or narrow explicitly according to documented API semantics. Never silently return firm totals.

## Reporting time semantics

Each response includes:

```text
asOf
timeZone
scope
basis
```

`basis` distinguishes:

- `snapshot`;
- `period`;
- mixed sections where each metric is labeled.

Period inputs:

- `from`;
- `to`;
- bounded to 366 days;
- default period: previous 90 days.

Use the resolved Staff IANA timezone from Phase 12 for date bucket labels.

Do not bucket dates with naive string slicing when timezone affects the day.

## Operational reports

### 1. Overview

Endpoint:

```text
GET /api/v1/staff/reports/overview
```

Current snapshot:

- active accessible cases;
- open tasks;
- overdue tasks;
- unassigned tasks where authorized;
- documents awaiting review;
- missing/in-progress evidence;
- forms awaiting review;
- petitions awaiting review;
- filing packets awaiting review;
- USCIS action required;
- unanswered queries.

Period measures:

- cases opened;
- cases closed;
- tasks completed.

Every metric that the actor cannot legitimately see is omitted or `null` according to the existing dashboard convention. Never show a false zero for "not permitted".

### 2. Case pipeline

Endpoint:

```text
GET /api/v1/staff/reports/pipeline
```

Current snapshot:

- active cases by currentStage;
- active cases by caseType;
- active cases by priority;
- cases by project manager where authorized.

Period:

- opened by week/month;
- closed by week/month.

Do not report "average time in stage" unless the current event history can prove exact stage-entry timestamps for the requested period.

Do not derive a legal-success/approval rate from case stage.

### 3. Workload

Endpoint:

```text
GET /api/v1/staff/reports/workload
```

Current snapshot rows by authorized employee:

- open case count as project manager;
- open task count;
- overdue task count;
- tasks due within 7 days;
- unassigned task count separately.

Only tasks/cases inside the report case scope participate.

Do not infer "utilization percentage" without authoritative capacity data.

Do not rank employees as "best/worst".

### 4. Deadlines

Endpoint:

```text
GET /api/v1/staff/reports/deadlines
```

Reuse the Phase 12 calendar projection where practical.

Include deadline-oriented sources only:

- target filing dates;
- task due dates;
- document-request due dates;
- query response dates;
- USCIS response due dates;
- manual deadline events.

Appointments/meetings may be excluded from the deadline report.

Return:

- overdue;
- due today;
- due 7 days;
- due 30 days;
- rows by source;
- bounded upcoming/overdue table.

Do not duplicate calendar authorization logic.

### 5. Review & workflow queues

Endpoint:

```text
GET /api/v1/staff/reports/review-queues
```

Snapshot counts/rows for authorized scope:

- documents awaiting review;
- quarantined documents where current product policy permits them;
- overdue document requests;
- missing/in-progress evidence;
- forms submitted/needs changes;
- petitions internal review/needs changes;
- filing packets review/needs changes;
- USCIS action required;
- unanswered/overdue queries.

Prefer reuse of `staffWorkQueues` or extracted common query definitions so Dashboard and Reports cannot silently disagree.

Do not call this a legal-quality score.

## Report API contract

All report endpoints:

- require employee session;
- require completed first-login credential setup;
- require `reports.view`;
- use explicit DTOs;
- accept bounded filters only;
- never return raw models;
- include request id;
- fail on data errors rather than converting unavailable metrics into zero;
- do not perform writes.

Report filters may include, where actually supported:

- scope;
- from/to;
- caseType;
- stage;
- priority;
- projectManager;
- source type.

A filter must only narrow authorized data.

## CSV export

Canonical endpoint, for example:

```text
GET /api/v1/staff/reports/export.csv
```

Parameters:

```text
report=pipeline|workload|deadlines|review-queues
same report filters
```

Requirements:

- `reports.view`;
- `csv.export`;
- same report service/query as UI;
- explicit column allowlist;
- bounded rows;
- recommended hard maximum 10,000 rows;
- UTF-8;
- stable header names;
- safe filename;
- Content-Disposition attachment;
- no raw model serialization.

### CSV injection

The existing Admin lead CSV already has CSV-formula protection.

Extract/reuse one tested server utility rather than implementing another slightly different sanitizer.

Any cell beginning with:

```text
=
+
-
@
```

after leading-space normalization must be neutralized according to the current safe CSV convention.

Preserve existing lead-export behavior/tests when extracting the utility.

### Export audit

Add `report_exported` to the SecurityEvent contract/mirrors.

Record only safe metadata:

- report type;
- scope;
- from/to;
- row count.

Do not record:

- CSV contents;
- client names;
- search query;
- receipt numbers;
- filenames.

Audit write remains fail-open per ADR-012, with stderr visibility on failure.

## Reporting UI

Add:

```text
/staff/reports
```

Navigation appears only with `reports.view`.

Recommended sections/tabs:

```text
Overview
Case Pipeline
Workload
Deadlines
Review Queues
```

UI requirements:

- clear "Current snapshot" vs selected period labels;
- scope selector;
- date-range control where relevant;
- case-type/stage filters where real;
- cards for headline metrics;
- accessible tables as the source of truth;
- simple accessible bar/stack visuals only when they improve reading;
- every chart has the underlying values available as text/table;
- no charting dependency unless justified;
- deep links from operational rows into real modules;
- CSV export button only when `csv.export`.

No fake KPI tiles.

No success-rate or approval-rate graphics.

No vanity charts.

## Reporting freshness

Reports are live/read-time operational views.

Display:

```text
Generated <timestamp>
```

No "real-time" claim unless push/streaming is actually implemented.

No caching layer is required initially.

If short server caching is later added, the cache key must include actor authorization scope and all filters. Cross-user shared caches are unsafe by default.

## Dashboard integration

Do not replace the Staff dashboard.

Phase 13 may add:

- a "Reports" deep link for users with `reports.view`;
- universal search in the shell.

Do not duplicate all reporting charts onto Dashboard.

## Client Portal

No Phase 13 universal client search or client reports.

This is deliberate.

Client search/reporting has different visibility semantics and can be designed later if it becomes a real product need.

## CMS/Admin search

The existing Express `/admin/search` remains unchanged except for shared CSV utility extraction if needed.

Do not point Admin CMS search at Staff case data merely because the Staff search service exists.

CMS migration remains a later phase.

## Data model and migrations

Preferred Phase 13 domain changes:

- no new search collection;
- no report collection;
- no data backfill;
- SecurityEvent enum addition only;
- additive indexes only if actual query plans require them.

If implementation discovers a required denormalized search field, stop and document why before introducing a broad backfill.

## Index strategy

Use existing indexes first.

Potential additive indexes should be justified by the implemented query.

Candidates may include:

- case title/search support;
- task title within case/assignee scope;
- document display name within case scope;
- petition/form/packet title within case scope;
- consultation/query identifiers.

Do not add a dozen speculative single-field indexes.

Do not use `syncIndexes()`.

Register approved indexes in the existing dry-run tooling.

Do not apply them to production in the implementation phase.

## Search/report rate limiting

Add bounded application rate limits.

Suggested initial policy:

### Quick search

- enough for debounced interactive use;
- per employee/IP;
- no more than roughly 60–120 requests/minute depending on current middleware conventions.

### Report endpoints

- normal Staff interactive rate limit.

### CSV export

- stricter, e.g. single-digit exports/minute per employee;
- bounded row count.

Exact limits should align with current rate-limit utilities and be tested.

## Search and reporting security invariants

1. exact case number of another team's case returns nothing;
2. exact client email does not reveal a client to a role without `clients.view`;
3. exact receipt number does not bypass USCIS/case policy;
4. exact document filename does not bypass document policy;
5. restricted channel name does not appear to a non-member;
6. search result counts do not include unauthorized rows;
7. report totals never include unauthorized cases;
8. CSV export never includes rows excluded from the equivalent report;
9. removed membership takes effect on the next request;
10. a source capability disappearing removes that source immediately;
11. regex metacharacters are literal, not executable search patterns;
12. no password/session/storage/internal-note fields appear in results or reports.

## Test requirements

### Search

Cover:

- minimum/maximum query validation;
- regex escaping;
- case exact/prefix/text ranking;
- client search;
- task visibility;
- document metadata only;
- query policy;
- evidence;
- forms without answers;
- petition without body;
- filing packet without internal notes;
- USCIS receipt search;
- restricted conversation/channel concealment;
- other-team exact-id/number searches return nothing;
- removed-member access revocation;
- source capability removal;
- per-source limit;
- full-results pagination;
- safe hrefs;
- safe DTO key allowlists;
- rate limit;
- no raw query logging in tested logger hooks where practical.

### Reporting

Cover:

- reports.view guard;
- PM accessible scope;
- firm scope denied without cases.view_all;
- admin firm scope;
- date range validation;
- current snapshot vs period metrics;
- pipeline stage/type/priority;
- opened/closed buckets;
- workload current rows;
- deadlines reuse authorized calendar scope;
- review queue counts match their source definitions;
- source capability omission/null semantics;
- removed member disappears;
- filters only narrow.

### CSV

Cover:

- reports.view required;
- csv.export required;
- same row scope as screen;
- 10k cap or implemented cap;
- formula injection;
- commas/quotes/newlines;
- content disposition;
- safe filename;
- report_exported SecurityEvent;
- audit metadata contains no row PII.

### Angular

Cover:

- Ctrl/Cmd+K open;
- keyboard navigation;
- debounce/min length;
- grouped result rendering;
- full search page;
- source filters;
- no-result/error state;
- reports nav capability;
- snapshot/period labels;
- filters;
- report tables;
- accessible chart fallback/table;
- CSV button capability;
- mobile behavior.

### Browser

Synthetic workflow:

1. PM searches an assigned case by number and finds it;
2. PM cannot find another team's case by exact case number;
3. PM searches assigned document/USCIS/task and deep-links correctly;
4. restricted conversation is invisible to a non-member;
5. Admin opens Reports and sees firm scope;
6. PM sees only accessible scope;
7. create synthetic task/case/deadline, report totals update;
8. export CSV and verify only authorized synthetic rows;
9. formula-shaped synthetic label is neutralized in CSV;
10. remove membership and verify search/report visibility disappears.

## Production rollout

Phase 13 implementation does not:

- merge itself to main;
- deploy;
- apply production indexes;
- run a migration;
- introduce a worker;
- change nginx;
- change PM2 topology.

Release follows the same exact-SHA CI -> merge -> main CI -> automatic CD pattern already proven by Phase 12.

## Consequences

Immigration Horizons gains a single operational discovery surface and management reporting without weakening module security or creating a new data authority.

The architecture favors correctness over premature search infrastructure:

- the real models remain authoritative;
- existing policies remain authoritative;
- global search is only an orchestrator;
- reports are live authorized projections;
- exports are audited.

A later scale phase can replace individual search adapters with a dedicated index while keeping the same API/authorization contract.
