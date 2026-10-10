# Phase 13 — Authorized Global Search & Operational Reporting: Implementation Report

Branch `phase-13/search-reporting`. Specification: [ADR-028](../architecture/ADR-028-authorized-global-search-operational-reporting.md) and the [Phase 13 prompt](PHASE_13_SEARCH_REPORTING_PROMPT.md).

## Revisions

- Starting SHA: `4037d30` (branch head at start; based on `main@d9e90a4`, the Phase 12 merge).
- Branch: `phase-13/search-reporting`. Ending SHA and CI run: see "CI" at the end.
- Implementation commits, in order:
  - `da779ca` federated Staff search, shared helper extractions, `report_exported` event type
  - `c6838f8` reporting services, API and audited CSV export
  - OpenAPI documentation commit
  - `7bb2d52` Angular command search, full results page and Reports workspace
  - browser journey and harness commit, then a one-line lint fix
  - this report

## Search

### Contract
`GET /api/v1/staff/search`, two documented modes:
- **Quick** (no `type`): grouped by source, `limit` per source (default 5, max 10), `types` is an optional comma list.
- **Full results** (`type=<one source>`): one source, `page` (1–200) and `limit` (default 25, max 50).

`q` is trimmed, 2–80 visible characters, no control characters; unknown types, bad pages and limits are 422. Asking for a source the actor may not search is a 403, never a silent empty list. No `global_search` collection, no index, no worker, no external service.

### Sources, capability gate and row scope (all applied inside the database query as the first `$match`)

| Source | Gate | Row scope (reused policy) | Searched fields | Never returned |
|---|---|---|---|---|
| cases | `cases.view` | `accessibleCaseIdFilter` | case number, title | description |
| clients | `clients.view` | the client directory rule (org-wide, disabled excluded) | email, full name, last name | credentials, lockout, sessions, phone |
| consultations | `leads.view` | `leadScope` (extracted from the leads route) | email, name, service | message, notes |
| tasks | any employee | `visibleTaskFilter` (extracted into `taskDto`) | title, type | notes, description, attachments |
| documents | `documents.view` | `documents.view_all` or member cases; unarchived | display name, file name, type | storage key, path, checksum, review comments, contents |
| queries | `queries.view` | `accessibleInteractionFilter` | reference, subject | description, internal response |
| evidence | `cases.view` | member cases | title, section | internal notes, guidance |
| forms | `forms.view` | member cases | template title, key | answers, review notes |
| petitions | `petitions.view` | member cases | title, kind | section text, review notes |
| filing packets | `filing_packets.view` | member cases | title, kind, petition title | items, notes |
| USCIS | `uscis_tracking.view` | the Phase 11 convention (org-wide with `cases.view_all`, else member cases; unarchived) | receipt (normalized like Phase 11), title, form, status | provider data |
| conversations | `channels.view` | active workspace membership unless `channels.view_all`, plus channel membership for restricted channels | channel name; its case number/title | message bodies |

All twelve sources of the ADR are implemented; none was omitted. Document contents, message bodies, form answers, petition body text and internal notes are deliberately not searched (a test searches for secret strings seeded in every such field and finds nothing).

### Ranking and bounds
Within a source: exact identifier, identifier prefix, name/title prefix, literal text match, newest `updatedAt` then `_id` as the stable tiebreaker; computed in the aggregation, so no authorized rows are fetched into Node to be ranked. `match.field` and `match.quality` (exact/prefix/text) explain each hit. Results are grouped by source, never mixed. `hasMore` is returned (limit+1 fetched); no per-source total counts. User text is escaped to a literal (`.*`, `^`, `(`, `[` and friends match only themselves). Each source query has a time limit.

### Failure behavior (choice "B")
A quick search that loses a source returns the others and lists it in `meta.unavailableTypes` (the UI says so); a full-results search of a failed source fails with a controlled 500 and no stack trace. A failure is never shown as "0 matches".

### Logging
One safe line per request: request id, mode, query **length**, source names, per-source durations and counts, failed sources. A test captures every console stream and asserts the query text, an email and a receipt number never appear.

### Rate limit
90 requests per minute per employee (`STAFF_SEARCH_RATE_LIMIT` overrides); the 429 uses the standard envelope. Tested, including that one employee does not throttle another.

### Authorization helpers reused or extracted
Reused: `casePolicy` (`accessibleCaseIdFilter`, `memberCaseIds`), `interactionPolicy`, the document and collaboration rules, Phase 11 receipt normalization. Extracted (route behavior unchanged): `leadScope` → `services/leadPolicy.js`; the task visibility rule → `visibleTaskFilter` in `taskDto.js`. The Tasks list route keeps its own inline copy of the same case-membership rule (left untouched to avoid regressing it).

## Reporting

### Endpoints (`reports.view`; first-login password setup completed)
`GET /api/v1/staff/reports/overview | pipeline | workload | deadlines | review-queues`, `GET /api/v1/staff/reports/export.csv`. Explicit DTOs, bounded filters, request id and `meta { asOf, timeZone, scope, basis, from, to }`, no writes. A database failure is a 500, never a report of zeroes.

### Scope
- `accessible` (default): the live case policy (`cases.view_all` sees the firm, everyone else their member cases).
- `mine`: cases the actor manages (project manager), inside what they may already see.
- `firm`: needs `cases.view_all`; otherwise **403**, never silently narrowed or widened.
- Filters (`caseType`, `stage`, `priority`, `projectManager`, plus `source` and `granularity` where real) only narrow; unknown values are 422.

### Snapshot versus period
Every metric says which. **Snapshot** = the state right now (active cases, open/overdue/unassigned tasks, documents awaiting review, overdue document requests, evidence still needed, forms/petitions/filing packets awaiting review, USCIS action required, unanswered queries, the pipeline groupings, workload, deadlines, review queues). **Period** = events between `from` and `to` (cases opened, cases closed = archived, tasks completed, opened/closed series). Default period: the previous 90 days; maximum 366 days; buckets use the employee's Phase 12 time zone and every bucket is present, so a quiet week is a real zero. A test proves a past period leaves every snapshot figure unchanged.

### Metric definitions
- **Overview**: counts as above; queue-style metrics reuse the Dashboard work-queue definitions from `staffWorkQueues` (now exported), so the two cannot disagree (a test compares them). A metric the actor may not see is `null` ("Not available to your role"), never 0.
- **Pipeline**: active cases by stage (all stages listed, zeros included), case type, priority and project manager; opened/closed per week or month. No time-in-stage, success, approval or legal-outcome measure.
- **Workload**: per employee, open cases as project manager, open tasks, overdue tasks, tasks due within 7 days, alphabetical; unassigned tasks and cases without a project manager separately. Other employees' rows and the unassigned count need `tasks.view_all`; otherwise only the actor's own row and `unassignedTasks: null`. Case-native tasks inside the report scope only. No utilization percentage, score or ranking.
- **Deadlines**: built by calling the Phase 12 calendar service, so it shares its authorization (a source capability the actor lacks removes that source, exactly as in the calendar). Target filing, task, document request, query response, USCIS response and manual events typed "deadline"; appointments and meetings excluded. Counts are cumulative (due within 7 days includes today); overdue covers up to 180 days past. Table bounded to 200 rows; `rowsTotal` says how many exist.
- **Review queues**: documents to review, quarantined documents, overdue document requests, evidence still needed, forms to review / needing changes, petitions to review / needing changes, filing packets to review / needing changes, USCIS action required, unanswered and overdue queries. A queue without its capability is `available: false`, `count: null`.

### CSV export
Same report function as the screen (`buildReport` feeds both), so an export can never contain a row the screen would not show; `report` ∈ pipeline, workload, deadlines, review-queues, with the same filters. Needs `reports.view` **and** `csv.export`. Explicit column allowlist, hard cap 10,000 rows (422 with a narrowing hint beyond; `REPORT_EXPORT_MAX_ROWS` can only lower it), UTF-8 with BOM, every cell quoted, CRLF, deterministic filename `immigration-horizons-<report>-<date>.csv` with no names, `Content-Disposition: attachment`, `no-store`. 6 exports per minute per employee (`REPORT_EXPORT_RATE_LIMIT`).

**CSV utility:** `server/utils/csv.js` already held `csvCell` (used by the Admin lead export). It is now the single shared implementation and gained `csvRow`/`toCsv`; the injection rule now also looks through leading whitespace (`  =1+1`), per the ADR. All existing `csvCell` tests and the Admin lead export behavior are unchanged.

**Audit:** a successful export is recorded as `report_exported` (result `success`, surface `staff`, the employee as actor) with only `report`, `scope`, `from`, `to`, `rowCount`. The type was added to the Express enum, the Next mirror and `docs/architecture/security-event-contract.json` (drift tests pass). A refused export is not recorded as an export; a test asserts no row content, names, receipt numbers or filenames appear in the event. The audit write stays fail-open per ADR-012.

### Indexes and data
**No indexes added, no schema change beyond the SecurityEvent enum value, no migration, no backfill.** Every search and report query starts with an indexed case/scope filter on bounded collections; the new queries were not measured at production scale, which is called out under limitations. `npm run db:indexes:dry-run` is unchanged from Phase 12 (it lists the Phase 12 additive indexes, creates nothing, and makes no connection).

## Angular

- **Header command search** (`ih-global-search`, in the shell): trigger button with the shortcut hint, Ctrl+K / Cmd+K, accessible dialog (`role=dialog`, combobox input, listbox of options in labelled groups), focus on open and returned on close, Escape, arrow keys with wrap, Enter opens the active result, Tab trapped, 300 ms debounce with cancellation of stale requests, no request under 2 characters, grouped results with the source named in words, loading / no results / error / rate-limit / unavailable-source states, "View all results", no history, no `innerHTML`, a full-width sheet on phones. Hrefs come from the server; anything that is not a plain in-app path is ignored.
- **`/search`**: `q`, `type`, `page` live in the URL (back/forward work); "All sources" grouped summaries (10 per source) or one source with server pagination; only sources the server offers are shown as filters; plain statement of what is not searched.
- **`/reports`** (nav entry only with `reports.view`): Overview, Case pipeline, Workload, Deadlines, Review queues. Scope selector (firm only with `cases.view_all`), period inputs where a period applies, case type / stage / priority filters, deadline type. "Generated <time> (<zone>)", explicit "Current snapshot" and "Selected period: …" headings, "Not available to your role" instead of zero, tables as the source of truth with the count as text beside every bar, deep links into the owning case tab or module, tables that scroll inside their own container on a phone. "Export CSV" appears only with `csv.export` on an exportable report and its link is built by the same function as the report request, so it carries exactly the filters on screen.

## Tests

Final numbers are in "Validation results" below.

New automated coverage:
- Server integration `staff-search` (20) and `staff-search-rate-limit` (1): validation, unauthenticated/client cookie, every source's scope, other-team exact identifiers, removed member, capability removal, source filters that cannot widen access, restricted conversations, no sensitive content, DTO key allowlist, hrefs, regex literals, ranking, USCIS receipts, full-name client search, per-source caps and pagination that cannot widen access, seeded noise, failed-source behavior, no query logging.
- Server integration `staff-reports` (19) and `staff-report-export-rate-limit` (1): `reports.view` guard, scopes (PM, mine, firm refused, admin firm), snapshot-versus-period, period validation (366 days), null-versus-zero and a failed query being a 500, pipeline filters and time-zone buckets, workload scope and `tasks.view_all`, deadlines reusing the calendar, review queues matching the Dashboard, removed member in every report, export gates, headers, row-for-row equality with the screen, formula/comma/quote/newline encoding, row cap, audit metadata.
- Server unit: `csvCell` whitespace rule, `csvRow`, `toCsv`.
- Angular: command search (11), search page (10), reports page (16), reports model (8), navigation gating, shell search control.
- Browser `search-reporting.spec.ts` (2): the ten-step scenario of ADR-028 (PM search with deep links, other team's exact number, restricted conversation, specialist, PM and admin report scopes with real data moving the numbers, CSV rows/headers/formula safety/download, membership revocation across search, reports and export) and a phone viewport.

## Validation results (local, final code)

| Check | Result |
|---|---|
| Root `npm test` | 457 / 457 pass |
| Server `npm test` | 805 / 805 pass (44 new) |
| Angular `npm test` | 283 / 283 pass in 31 files (case-management) + 1 / 1 (admin-console) |
| `ng build case-management`, `ng build admin-console`, root `npm run build` | all succeed |
| `node scripts/deploy/verify-staff-build.js` | staff build releasable (base href `/staff/`, relative `/api/v1` only) |
| `npm run lint`, `npx tsc --noEmit`, `git diff --check` | clean |
| `npm run db:indexes:dry-run` | unchanged: lists the Phase 12 additive indexes, creates nothing, makes no connection (no indexes were added in Phase 13) |
| Browser `npm run test:e2e` | 12 / 12 pass (2 calendar, 2 search/reporting, 7 stabilization, 1 USCIS) |

Browser note: one earlier full run had 11 of 12 passing; the failure was the pre-existing stabilization test "two sessions complete document, intake, messaging and case preparation workflows" waiting for a client portal chat reply to appear (`Staff browser reply`), a timing-sensitive step unrelated to search or reports. That test passed when run alone, and the whole suite then passed 12 of 12 on a repeat run with no code change between them. It is recorded here rather than hidden; if it recurs in CI it is a flake of that existing test, not of Phase 13.

## Safety and production

- Not merged to main, not deployed, no production database touched, no production index or migration applied, no worker added, no PM2 or nginx change.
- No Elasticsearch, OpenSearch, Atlas Search, vector or AI search; no search or report collection.
- No Client Portal search or reports; the Admin CMS `/admin/search` is untouched (only the shared CSV helper was extended).

## Known limitations

- Search is federated regex over each collection after the authorization filter; there is no text index, so a very large collection with a broad scope would scan. Quick search is bounded (5 per source, a time limit per source) but its cost at production scale is unmeasured. A later phase can swap a source for a dedicated index behind the same contract.
- Not searched by design: document contents, message bodies, form answers, petition text, internal notes, case descriptions.
- Reports are live read-time queries with no cache; `asOf` says when they were computed.
- Overdue deadlines older than 180 days are not listed in the Deadlines report.
- "Cases closed" means archived; there is no other authoritative closing event.
- Case-less (lead-linked) tasks are not part of the case-scoped reports.
- The Tasks list route still carries its own copy of the case-membership rule that `visibleTaskFilter` now expresses.
- The Dashboard has no Reports shortcut (optional in the ADR).

## Rollback
Code-only: revert the branch. No data changed; the one persisted effect is the extra `report_exported` event type, which older code simply never writes. Audit events already written remain valid documents.

## Next-phase recommendation
The Angular CMS/Admin migration and administration/security operational surfaces, planned from the actual state after this phase.
