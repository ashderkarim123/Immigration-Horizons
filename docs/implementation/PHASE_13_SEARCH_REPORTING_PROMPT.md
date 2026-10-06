# Phase 13 — Authorized Global Search + Operational Reporting Implementation Prompt

**Working branch:** `phase-13/search-reporting`
**Production baseline:** `main@d9e90a46cdc07feb8c588afe60ba7259de7b12a0`
**Architecture:** `docs/architecture/ADR-028-authorized-global-search-operational-reporting.md`
**Prepared:** 2026-10-07

> This is a production feature phase. Search and reports must use real authorized data. Do not create placeholder search cards, fake analytics, mock KPIs, or a second data authority.

---

## 1. Mission

Implement Phase 13 completely:

1. universal Staff search across the real case-management modules;
2. command-palette style search in the Angular shell;
3. full Staff search-results page;
4. operational reports for managers/admins;
5. case pipeline reporting;
6. workload reporting;
7. deadline reporting;
8. review/workflow queue reporting;
9. authorized CSV exports;
10. full authorization, leakage, export, Angular and browser regression coverage.

Search and reporting must never widen an actor's access.

---

## 2. Verified Phase 12 baseline

Phase 12 is merged and deployed.

Main merge:

    d9e90a46cdc07feb8c588afe60ba7259de7b12a0
    Merge phase-12/calendar-reminders: unified calendar and reminders

The exact main CI completed successfully and production Deploy workflow run #34 completed successfully.

Phase 13 must start from that main history, not from an older migration branch.

Phase 12 reminder-worker enablement is an operational rollout concern and does not block Phase 13 implementation. Do not silently enable or reconfigure the Phase 12 reminder worker while implementing Phase 13.

---

## 3. Git preflight

Before editing:

    git fetch origin --prune
    git branch --show-current
    git status --short
    git rev-parse HEAD
    git rev-parse origin/phase-13/search-reporting
    git rev-parse origin/main
    git log --graph --decorate --oneline -30
    git diff
    git diff --cached
    git rev-list --left-right --count origin/main...HEAD

Required branch:

    phase-13/search-reporting

At prompt creation the branch started from:

    d9e90a46cdc07feb8c588afe60ba7259de7b12a0

If main has advanced, inspect the newer commits first. Do not blindly rebase or merge shared history.

Never:

- `git reset --hard` on user work;
- `git clean -fd`;
- force push;
- amend shared commits;
- work directly on main;
- deploy from this branch.

---

## 4. Required reading

Read completely:

- `CLAUDE.md`
- `AGENTS.md`
- `.claude/SECURITY.md`
- `.claude/API_ARCHITECTURE.md`
- `.claude/DATABASE.md`
- `.claude/TESTING.md`
- `.claude/DESIGN_SYSTEM.md`
- `.claude/DEPLOYMENT.MD`
- `docs/architecture/ADR-012-security-privacy-and-audit.md`
- `docs/architecture/ADR-015-angular-enterprise-platform.md`
- `docs/architecture/ADR-017-case-native-tasks-and-deadlines.md`
- `docs/architecture/ADR-019-canonical-staff-documents-and-secure-file-operations.md`
- `docs/architecture/ADR-020-canonical-staff-communications-and-collaboration.md`
- `docs/architecture/ADR-021-smart-forms-v1.md`
- `docs/architecture/ADR-022-case-native-petition-work-v1.md`
- `docs/architecture/ADR-023-case-native-filing-packets-v1.md`
- `docs/architecture/ADR-024-angular-staff-production-cutover.md`
- `docs/architecture/ADR-025-stabilization-staff-cms-and-guided-work.md`
- `docs/architecture/ADR-026-uscis-filing-status-tracking.md`
- `docs/architecture/ADR-027-unified-calendar-deadlines-reminders.md`
- `docs/architecture/ADR-028-authorized-global-search-operational-reporting.md`
- `docs/implementation/STABILIZATION_PHASE_01_REPORT.md`
- `docs/implementation/PHASE_11_USCIS_TRACKING_REPORT.md`
- `docs/implementation/PHASE_12_CALENDAR_REMINDERS_REPORT.md`
- `docs/implementation/ANGULAR_ENTERPRISE_PLATFORM_ROADMAP.md`

Inspect actual code, especially:

- `server/utils/permissions.js`
- `server/services/casePolicy.js`
- `server/services/interactionPolicy.js`
- `server/services/documentPolicy.js`
- `server/services/collaborationPolicy.js`
- `server/services/staffChatService.js`
- `server/services/staffWorkQueues.js`
- `server/services/calendarService.js`
- `server/services/uscisTracking.js`
- `server/services/petitionPolicy.js`
- `server/services/filingPacketPolicy.js`
- Smart Forms policy/service modules;
- Staff case/client/task/document/query/forms/petitions/packets/USCIS routes;
- `server/routes/admin/index.js` legacy `/admin/search` and lead CSV export;
- `server/models/SecurityEvent.js` and Next mirror;
- `server/utils/securityEvents.js`;
- `server/openapi/v1.yaml`;
- `server/scripts/createIndexes.js`;
- Angular app shell/navigation/routes;
- existing Staff list/search components and tests.

Re-audit the current repository before implementing. If a search/report service already appeared after this prompt, extend/refactor rather than duplicate.

---

## 5. Architecture rule — global search is an orchestrator, not a new database

Do NOT create:

- `global_search` collection;
- `search_index` collection;
- Elasticsearch/OpenSearch service;
- Atlas Search dependency;
- vector database;
- background denormalized search pipeline.

Phase 13 uses federated source adapters over the authoritative collections.

Target:

    Staff Search API
         |
         +-- Cases adapter -------- existing case policy
         +-- Clients adapter ------ existing client policy
         +-- Tasks adapter -------- existing task scope
         +-- Documents adapter ---- existing document policy
         +-- Queries adapter ------ interaction policy
         +-- Evidence adapter ----- case scope
         +-- Forms adapter -------- forms policy
         +-- Petitions adapter ---- petition policy
         +-- Packets adapter ------ filing-packet policy
         +-- USCIS adapter -------- USCIS + case policy
         +-- Conversations adapter  collaboration policy

Each adapter performs authorization before returning rows.

Angular is never the authorization boundary.

---

## 6. Search service structure

Create a canonical service, e.g.:

    server/services/globalSearch.js

or a small directory:

    server/services/search/
      index.js
      adapters/

Do not over-engineer.

A source adapter should conceptually expose:

    search(req, { query, limit, page })

and return normalized safe results plus `hasMore`/pagination metadata.

Use one registry mapping source name to:

- capability gate;
- adapter;
- label;
- safe result type.

---

## 7. Search endpoint

Implement canonical Staff search under `/api/v1/staff`.

Preferred:

    GET /api/v1/staff/search

Support:

    q=<query>
    type=<optional source>
    types=<optional comma source list for quick search>
    page=<single-source full page>
    limit=<bounded>

Choose one clear contract for `type` versus `types` and document it.

Validation:

- query required;
- trimmed;
- min 2 visible characters;
- max 80;
- unknown types rejected;
- page bounded;
- quick result limit small;
- full single-source limit max 50.

Use the current API error envelope and request-id conventions.

---

## 8. Search rate limit

Add a Staff search rate limiter using current middleware conventions.

It must support interactive debounced use without making abuse unbounded.

Suggested initial target:

    90 requests / minute / employee+IP

or a nearby value consistent with existing rate-limit infrastructure.

Do not rate-limit legitimate typeahead so aggressively that the product becomes unusable.

Add tests.

---

## 9. Search query safety

Never execute the user's input as an arbitrary regular expression.

Escape regex metacharacters.

`.*`, `^`, `$`, brackets and other regex syntax must be treated as literal text.

Do not log raw search text.

Do not persist search history.

Do not send search terms to analytics/third parties.

---

## 10. Search result DTO

Normalize results to an explicit structure such as:

    {
      type,
      id,
      title,
      subtitle,
      statusLabel,
      case: { id, caseNumber, title } | null,
      context: [],
      updatedAt,
      href,
      match: { field, quality }
    }

`match.quality` may be:

    exact
    prefix
    text

No raw Mongoose documents.

No raw HTML.

No backend-only fields.

---

## 11. Search ranking

Within each source rank deterministically:

1. exact primary identifier;
2. identifier prefix;
3. name/title prefix;
4. literal text match;
5. recent update as stable tiebreaker.

Group quick-search results by source rather than pretending a Client and USCIS receipt share one universal relevance score.

Do not add AI/embedding relevance.

---

## 12. Cases search

Gate:

- `cases.view`;
- `accessibleCaseIdFilter(req)` / current case policy.

Fields:

- caseNumber;
- title.

Do not search case description in Phase 13.

Result should deep-link to the real case workspace.

Searching the exact number of another team's case must return nothing.

---

## 13. Client search

Gate:

- `clients.view`;
- current client policy.

Fields:

- firstName;
- lastName;
- normalizedEmail/email.

Return only safe directory fields.

Never return:

- password/passwordHash;
- failedLoginCount;
- lockedUntil;
- session/auth fields.

A specialist without `clients.view` must not be able to discover client email addresses through universal search.

---

## 14. Consultation/lead search

Gate:

- `leads.view`;
- existing current lead visibility semantics.

Fields:

- name;
- email;
- service only if safe/useful.

Return safe operational metadata only.

Do not include consultation notes/free-text internal detail.

---

## 15. Task search

Reuse the exact visibility semantics of the Staff Tasks module.

Case tasks:

- must be in an accessible case;
- ownership/all-task capability still applies.

Lead-linked tasks:

- use the existing task/lead scope.

Fields:

- title;
- task type.

Do not return task notes or attachment URLs in search.

If current task-list authorization is route-owned, extract/reuse a query helper rather than copy a slightly different rule into search.

---

## 16. Document search

Gate:

- `documents.view`;
- document/case policy.

Fields:

- displayName;
- originalName;
- documentType.

Return safe metadata only.

Never:

- search file contents;
- OCR files;
- return storageKey;
- return filesystem paths;
- return checksum;
- return internal review comments.

Phase 13 does not implement content indexing.

---

## 17. Query search

Gate:

- `queries.view`;
- `accessibleInteractionFilter(req)`.

Fields:

- interactionNumber;
- subject.

Do not include internalResponse or internal operational notes.

---

## 18. Evidence search

Gate:

- `cases.view`;
- case row scope.

Search:

- requirement title;
- section;
- safe template labels.

Do not return `internalNotes` or staff-only guidance.

---

## 19. Smart Forms search

Gate:

- `forms.view`;
- forms/case policy.

Search:

- templateTitleSnapshot;
- templateKey where useful.

Never search or return form answer values in universal search.

---

## 20. Petition search

Gate:

- `petitions.view`;
- petition/case policy.

Search:

- petition title;
- kind.

Never search section body text in Phase 13.

Never expose internal review notes.

---

## 21. Filing packet search

Gate:

- `filing_packets.view`;
- filing-packet/case policy.

Search:

- packet title;
- kind;
- petitionTitleSnapshot where safe.

Do not return packet notes/internal review notes.

---

## 22. USCIS search

Gate:

- `uscis_tracking.view`;
- case row access.

Search:

- normalized receipt number;
- filing title;
- formType;
- currentStatusTitle where safe.

Normalize receipt-like search the same way Phase 11 does.

Exact/prefix receipt matches rank highest.

Do not reveal a receipt belonging to an inaccessible case.

---

## 23. Conversation search

Gate:

- `channels.view`;
- full collaboration/channel visibility policy;
- restricted channel membership where required.

Search:

- channel name;
- case number/title context.

Do NOT search message body text in Phase 13.

Do NOT include latest-message body snippets in universal search results unless the existing collaboration serializer and product need clearly justify it; default to no message content.

A restricted channel name itself is sensitive and must not leak.

---

## 24. Search performance

Quick search:

- run eligible adapters in parallel;
- max about 5 results per source;
- total response bounded;
- no exact total-count query for each source;
- return `hasMore` where useful.

Full source page:

- server pagination;
- max 50 rows/page;
- stable sort.

Use Mongo filters that include authorization scope before text matching.

Do not fetch all authorized rows into Node and then search them in memory.

Add `.maxTimeMS()` or equivalent only if consistent with current Mongoose/runtime conventions and tested; do not hide query-design problems behind huge timeouts.

---

## 25. Search failure behavior

Do not silently convert an adapter/database failure into `0 results`.

Choose one documented behavior:

A. whole search fails with controlled server error;

or

B. quick search returns successful sources plus `meta.unavailableTypes` while the failed source returns no data.

If B is chosen, full single-source search must fail when that source fails.

Never expose stack traces.

---

## 26. Search logs and telemetry

Raw query text may contain client PII.

Application logs may record:

- request id;
- source type;
- duration;
- result count;
- query length;
- safe error code.

Do not log:

- raw q;
- emails;
- receipt numbers;
- filenames.

---

## 27. Angular universal search control

Put a real search control in the Staff top header.

Keyboard:

- Ctrl+K;
- Cmd+K;
- Escape closes;
- Arrow Up/Down changes active option;
- Enter opens active result.

Use an accessible dialog/combobox/listbox pattern.

Behavior:

- focus input on open;
- debounce about 300 ms;
- no API call below 2 characters;
- grouped results;
- text labels for source type;
- loading/error/no-results;
- 'View all results' link;
- no fake recent searches;
- no persisted query history;
- no `innerHTML` highlighting.

On mobile, use a full-width search sheet/dialog.

---

## 28. Full search page

Add:

    /staff/search

Angular route is under the existing `/staff/` deployment base.

Expected:

- `q` in URL;
- source-type tabs/filters;
- full pagination when one source selected;
- grouped all-source summary;
- result deep links;
- capability-ineligible source filters absent;
- browser back/forward preserves state.

Do not display filters for sources the server says the actor cannot search.

---

## 29. Reporting architecture

Create canonical services, for example:

    server/services/reporting/
      filters.js
      overview.js
      pipeline.js
      workload.js
      deadlines.js
      reviewQueues.js

or one well-structured `operationalReporting.js` if that is simpler.

Routes do not own aggregation logic.

No reporting Mongo collection.

No nightly snapshot worker.

No BI warehouse.

---

## 30. Reporting capability and scope

All report endpoints require:

- authenticated Staff;
- completed first-login password setup;
- `reports.view`.

Underlying source capability remains required for each section.

Scope:

    accessible
    mine
    firm

Rules:

- `accessible` uses live current case scope;
- `mine` means actor-owned operational cases using the current authoritative project-manager relationship;
- `firm` requires `cases.view_all`.

Do not invent a team/department hierarchy.

If a PM requests `scope=firm`, deny or explicitly reject the invalid scope. Do not silently provide firm totals.

---

## 31. Report date range

Period reports accept:

    from=YYYY-MM-DD
    to=YYYY-MM-DD

Default:

- last 90 days.

Maximum:

- 366 days.

Use the Phase 12 resolved employee IANA timezone for calendar buckets.

Response metadata includes:

- generatedAt/asOf;
- timeZone;
- scope;
- from/to where relevant;
- requestId.

---

## 32. Snapshot vs period semantics

This is non-negotiable.

A report response/UI must distinguish:

### Snapshot

Current state right now.

Examples:

- active cases;
- open tasks;
- overdue tasks;
- documents awaiting review.

### Period

Events occurring between from/to.

Examples:

- cases opened;
- cases closed;
- tasks completed.

Do not apply a date range to current stage counts and then label them current pipeline without explaining the basis.

Do not display a snapshot metric as a trend.

---

## 33. Overview report

Endpoint:

    GET /api/v1/staff/reports/overview

Current snapshot, where authorized:

- active cases;
- open tasks;
- overdue tasks;
- unassigned tasks;
- documents awaiting review;
- overdue document requests;
- missing/in-progress evidence;
- forms awaiting review;
- petitions awaiting review;
- filing packets awaiting review;
- USCIS action required;
- unanswered queries.

Period:

- cases opened;
- cases closed;
- tasks completed.

Permission semantics:

- `null`/omitted for unavailable source;
- `0` only means authorized and genuinely zero.

Do not catch database errors and return zero.

---

## 34. Case Pipeline report

Endpoint:

    GET /api/v1/staff/reports/pipeline

Current accessible active cases grouped by:

- currentStage;
- caseType;
- priority;
- project manager where permitted.

Period series:

- opened cases by week/month;
- closed cases by week/month.

Do NOT implement:

- average time-in-stage unless exact historical stage timestamps prove it;
- success rate;
- approval probability;
- legal outcome score.

---

## 35. Workload report

Endpoint:

    GET /api/v1/staff/reports/workload

Current authorized rows by employee:

- open cases managed;
- open tasks;
- overdue tasks;
- tasks due within 7 days.

Also:

- unassigned task count;
- unassigned case/PM count where current schema can represent it.

Every grouped task/case must first be within the actor's report scope.

Do NOT create:

- utilization percentage without capacity data;
- employee performance score;
- best/worst rankings.

Use neutral operational language.

---

## 36. Deadlines report

Endpoint:

    GET /api/v1/staff/reports/deadlines

Reuse Phase 12 `calendarService` or extracted calendar source helpers where possible.

Deadline-oriented sources:

- case target filing;
- task due;
- document request due;
- query response due;
- USCIS response due;
- manual event of deadline kind.

Do not include meetings/appointments unless a clearly separate filter requests them.

Return:

- overdue count;
- due today;
- due within 7 days;
- due within 30 days;
- count by source;
- bounded row table.

Do not duplicate calendar authorization.

---

## 37. Review Queues report

Endpoint:

    GET /api/v1/staff/reports/review-queues

Current snapshot based on the existing work-queue definitions where possible:

- documents awaiting review;
- quarantined documents where authorized;
- overdue document requests;
- missing/in-progress evidence;
- forms submitted/needs changes;
- petitions internal review/needs changes;
- filing packets review/needs changes;
- USCIS action required;
- unanswered/overdue queries.

Prefer extracting/reusing `staffWorkQueues` definitions rather than writing a second version that can drift from Dashboard.

Do not label this a legal-quality score.

---

## 38. Report filters

Support only filters that real services can enforce:

- scope;
- from/to;
- caseType;
- stage;
- priority;
- projectManager;
- source type for deadline/review tables.

Every filter only narrows authorized rows.

Do not build a generic report-builder DSL.

---

## 39. Report API errors

Invalid:

- date range;
- unsupported scope;
- unauthorized firm scope;
- invalid enum;
- over-limit range;

must return controlled validation/authorization errors.

A database/aggregation error is a server error, not a fake report full of zeroes.

---

## 40. CSV export

Implement:

    GET /api/v1/staff/reports/export.csv

Require BOTH:

- `reports.view`;
- `csv.export`.

Supported report exports:

- pipeline;
- workload;
- deadlines;
- review-queues.

Use the exact same reporting service and filters as the screen.

Do not create an independent export query.

Hard-cap exported rows, recommended:

    10,000

Return controlled validation error when the requested export would exceed the cap unless a smaller bounded export can be explicitly requested.

---

## 41. Shared CSV safety utility

The Admin CMS lead export already neutralizes spreadsheet formulas.

Extract/reuse one shared server utility, e.g.:

    server/utils/csv.js

Preserve existing lead export behavior and tests.

CSV cells that begin with formula-trigger characters after leading whitespace must be neutralized:

    =
    +
    -
    @

Correctly quote commas, quotes and newlines.

Do not regress the existing Admin lead CSV.

---

## 42. Export audit

Add SecurityEvent type:

    report_exported

Update:

- Express SecurityEvent enum;
- Next mirror;
- security-event contract fixture;
- drift tests.

Record successful exports with:

- type `report_exported`;
- result `success`;
- surface `staff`;
- current employee actor;
- meta: report type, scope, from, to, rowCount.

Never put row contents, names, emails, receipt numbers, filenames or search query in audit metadata.

SecurityEvent remains append-only.

---

## 43. Report export filenames

Use safe deterministic filenames, e.g.:

    immigration-horizons-workload-2026-10-07.csv

Do not put client/case names in filename.

Set Content-Type and Content-Disposition correctly.

---

## 44. Angular Reports route

Add:

    /staff/reports

Navigation visible only with `reports.view`.

Recommended sections:

- Overview;
- Case Pipeline;
- Workload;
- Deadlines;
- Review Queues.

Use lazy-loaded feature code where consistent.

---

## 45. Report UI/UX

Use the Immigration Horizons enterprise design system.

Required:

- page header with Generated timestamp;
- scope selector;
- date range for period sections;
- explicit Current snapshot / Selected period labels;
- headline metrics;
- accessible tables;
- simple visual bars only where helpful;
- text value available for every visual;
- deep links to the real operational destination;
- export button only with `csv.export`.

Do not add a large chart library merely for basic bars.

Do not use pie charts if a table/bar is clearer.

No vanity metrics.

---

## 46. Report semantics in UI

Examples:

Good:

    Active cases — Current snapshot
    Cases opened — Oct 1 to Oct 31
    Open tasks by assignee — Current snapshot

Bad:

    Productivity score
    Approval success
    Efficiency 92%

unless authoritative definitions exist. They currently do not.

---

## 47. Deep links

Rows should open real working destinations:

- case -> Case workspace;
- workload employee task count -> Tasks filtered if current routes support it;
- deadline -> owning Case tab/module;
- review queue -> corresponding work queue/module;
- USCIS -> Case Tracking;
- document -> Documents;
- petition -> Petition;
- packet -> Filing Packet.

Do not create dead-end analytics tables.

---

## 48. No client reporting in Phase 13

Do not add Client Portal reports.

Do not expose firm aggregate metrics to clients.

Do not add client universal search.

---

## 49. Legacy Admin search boundary

The existing Express `/admin/search` remains CMS-oriented.

Do not replace it in Phase 13.

Do not make it search case-management collections.

Do not expose Staff global search through Admin CMS just because the service exists.

Only shared CSV utility extraction is expected to touch legacy Admin export code.

---

## 50. Database/index rules

Prefer zero schema changes outside:

- SecurityEvent enum contract;
- justified additive indexes.

Do not add denormalized search fields unless a measured query requirement proves unavoidable.

Do not run a search backfill.

Do not add speculative indexes for every searched string field.

Use current indexes and authorization scope first.

If an index is added:

- explain the exact query it serves;
- register in `server/scripts/createIndexes.js`;
- run dry-run only;
- do not apply to production.

Never use `syncIndexes()`.

---

## 51. Report/query performance

Reporting endpoints must be bounded.

Rules:

- period max 366 days;
- row tables paginated or hard-bounded;
- aggregate in Mongo where appropriate;
- do not load every row into Node to count/group;
- avoid N+1 client/case/user lookups;
- batch lookup labels;
- use authorized case filter inside `$match` before grouping.

For `cases.view_all`, avoid constructing a huge unnecessary `$in` list if current policy returns no restriction.

---

## 52. Search performance tests

Add a seeded-noise test or equivalent proving:

- quick search remains bounded;
- per-source result cap respected;
- exact inaccessible identifiers still return no result;
- no adapter returns all rows for a short query.

Do not write timing tests so strict they become CI-flaky.

---

## 53. Search security matrix

At minimum:

1. unauthenticated denied;
2. client cookie cannot authenticate as Staff;
3. case exact number outside membership returns nothing;
4. removed member immediately loses result;
5. client email hidden without clients.view;
6. document filename hidden without documents.view;
7. USCIS receipt hidden without uscis_tracking.view/case access;
8. query hidden without queries.view;
9. form answers never appear;
10. petition body never appears;
11. packet internal note never appears;
12. restricted channel hidden from non-member;
13. regex metacharacters literal;
14. result DTO allowlist;
15. type filter cannot widen access;
16. pagination cannot widen access;
17. rate limiter works.

---

## 54. Report security matrix

At minimum:

1. reports.view required;
2. PM `accessible` scope only includes accessible cases;
3. PM `firm` denied;
4. admin/operations with cases.view_all may use firm;
5. removed member disappears from PM report scope;
6. underlying source capability omission/null works;
7. pipeline counts only authorized cases;
8. workload tasks only authorized scope;
9. deadline report reuses calendar authorization;
10. review queues do not include hidden cases;
11. caseType/stage/priority filters only narrow;
12. invalid period rejected;
13. >366-day period rejected.

---

## 55. CSV security tests

At minimum:

1. csv.export required;
2. reports.view also required;
3. exported rows equal authorized report scope;
4. inaccessible case absent;
5. removed member absent;
6. formula-prefixed data neutralized;
7. comma/quote/newline encoded correctly;
8. safe filename;
9. correct Content-Disposition;
10. row cap;
11. report_exported event created;
12. SecurityEvent metadata contains no row PII.

---

## 56. Search Angular tests

Test user behavior:

- Ctrl+K opens;
- Cmd+K opens;
- Escape closes;
- focus moves correctly;
- minimum query blocks request;
- debounce;
- grouped results;
- keyboard result selection;
- Enter navigation;
- source filters;
- full search URL state;
- back/forward state;
- loading;
- no results;
- server error;
- unavailable source behavior if implemented;
- no unauthorized source filter.

Do not settle for component creation tests.

---

## 57. Reports Angular tests

Cover:

- reports nav gated;
- Overview snapshot and period labels;
- scope selector;
- PM has no firm option;
- admin firm option;
- pipeline values;
- workload rows;
- deadline rows/deep links;
- review queues;
- unavailable metric does not render as zero;
- export button gated by csv.export;
- export URL carries same filters;
- loading/error/empty;
- phone layout.

---

## 58. Browser/E2E Phase 13 workflow

Extend the existing browser suite with synthetic data only.

Scenario:

### Search — PM

1. sign in PM;
2. Ctrl/Cmd+K;
3. search assigned case number -> found;
4. search assigned task/document/USCIS receipt -> found and deep link works;
5. search another team's exact case number -> no result;
6. search restricted channel the PM cannot view -> no result.

### Search — specialist

1. assigned case result visible;
2. other case hidden;
3. Clients source absent without clients.view if that is the role's capability state.

### Reports — PM

1. Reports opens;
2. scope limited to accessible/mine;
3. synthetic assigned case/task affects counts;
4. another team's data does not.

### Reports — admin/operations

1. firm scope available;
2. firm synthetic totals correct.

### CSV

1. export a synthetic report;
2. inaccessible row absent;
3. formula-shaped synthetic title is safe;
4. download headers valid.

### Revocation

Remove workspace membership and verify search + reports lose that case on next request.

---

## 59. OpenAPI

Update `server/openapi/v1.yaml` for actual implemented endpoints:

- Staff search;
- report overview;
- pipeline;
- workload;
- deadlines;
- review queues;
- CSV export.

Document:

- source enums;
- report scope;
- date range;
- result DTO;
- 400/401/403/404/429/500 semantics;
- CSV response content type.

Do not document future semantic search or BI endpoints.

---

## 60. CI

All existing CI jobs remain mandatory.

Do not remove or weaken:

- Next tests;
- Admin/Express tests;
- Angular tests/build;
- lint/type/build;
- browser workflows;
- CodeQL if repository configuration runs it.

Search/report tests must use local/test Mongo only.

No external search service/network required.

---

## 61. Local validation

Use actual package scripts as authoritative.

At minimum:

    npm ci --no-audit --no-fund
    npm run lint
    npx tsc --noEmit
    npm test
    npm run build

    cd server
    npm ci --no-audit --no-fund
    npm test
    npm run db:indexes:dry-run
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

If package scripts changed, use the current correct scripts and document them.

---

## 62. Git commits

Use atomic commits.

Suggested:

    feat(search): add authorized federated Staff search
    feat(search-ui): add command search and full results workspace
    feat(reports): add authorized operational reporting services and API
    feat(reports-ui): add Staff reporting workspace
    feat(exports): add audited safe report CSV exports
    test(search-reporting): cover authorization and browser workflows
    docs(phase-13): record search and reporting implementation

Do not combine unrelated CMS work.

---

## 63. Implementation report

Create:

    docs/implementation/PHASE_13_SEARCH_REPORTING_REPORT.md

Record:

- starting SHA;
- ending SHA;
- branch;
- commits;
- search sources;
- searchable fields;
- sources deliberately excluded and why;
- authorization helpers reused/extracted;
- ranking rules;
- search rate limit;
- report endpoints;
- report metric definitions;
- snapshot versus period semantics;
- scope semantics;
- CSV utility/extraction changes;
- export cap;
- SecurityEvent change;
- indexes added or none;
- DB migrations/backfills;
- Angular routes/components;
- exact tests/counts;
- browser results;
- build results;
- CI run id/url;
- production actions performed (must be none);
- known limitations;
- rollback;
- next-phase recommendation.

---

## 64. Completion gate

Phase 13 is complete only when all of the following are true.

### Search

- real universal Staff search works;
- command palette works;
- full search page works;
- all intended sources use real data;
- row authorization tested per source;
- no sensitive body/content search;
- inaccessible exact identifiers return nothing;
- results are bounded and paginated;
- no raw search-query logging.

### Reporting

- Overview works;
- Pipeline works;
- Workload works;
- Deadlines works;
- Review Queues works;
- snapshot/period semantics explicit;
- PM versus firm scope correct;
- no fake performance/legal-success metrics.

### Export

- authorized CSV export works;
- same service/filter as report;
- injection-safe;
- bounded;
- audited.

### Quality

- OpenAPI updated;
- index dry-run clean;
- root tests green;
- server tests green;
- Angular tests green;
- both Angular builds green;
- Next build green;
- browser workflows green;
- exact final SHA CI green.

### Safety

- no main merge;
- no deployment;
- no production DB migration;
- no production index apply;
- no search infrastructure service added;
- no external AI/search provider.

Then STOP.

Do not begin Phase 14 automatically.

The next likely product phase is the Angular CMS/Admin migration and administration/security operational surfaces, but it must be planned from the actual Phase 13 result.