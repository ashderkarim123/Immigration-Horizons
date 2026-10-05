# Phase 11 — Case-Native USCIS Filing & Status Tracking: Implementation Report

**Architecture:** [ADR-026](../architecture/ADR-026-uscis-filing-status-tracking.md)
**Prompt:** [PHASE_11_USCIS_TRACKING_PROMPT.md](PHASE_11_USCIS_TRACKING_PROMPT.md)

| | |
|---|---|
| Starting `main` SHA | `1408784255ca0aff8f1a2d6cc7086998bc11fe80` |
| Working branch | `phase-11/uscis-tracking-main` |
| Code SHA (all feature commits) | `1132714da4e827084ca6a0c31952ab0a546851b4` |
| Merged to `main` / deployed | **No.** No merge, no deploy, no nginx change |
| Production database / USCIS actions | **None performed** |

A report cannot contain the CI result of the commit that adds it, so exact-SHA CI evidence is in the hand-off message. Facts known at the time of writing:

- CI run [37370178907](https://github.com/ashderkarim123/Immigration-Horizons/actions/runs/37370178907) on the code SHA was **cancelled by GitHub, not failed**: four of five jobs never received a runner (0 steps executed) and were cancelled after the 15-minute queue limit. The one job that did run, *Tests (Next.js app)*, passed.
- Everything CI runs was run locally on the same tree and passed (section 9).

---

## 1. What was built

A case can own many USCIS filings (receipts). Each filing has an immutable status history and a fast current-status snapshot. Everything works by hand with no USCIS credentials; an official-API refresh is added behind the Express backend and is **off** unless server secrets are set.

| Area | Delivered |
|---|---|
| Domain | `USCISFiling`, append-only `USCISStatusEvent`, server-owned receipt normalization, deterministic current-status snapshot, rebuild/repair |
| Staff API | 8 endpoints under `/api/v1/staff` (section 4) |
| Provider | Server-only OAuth 2.0 client-credentials adapter for the USCIS Torch Case Status API, injected transport, safe errors, rate pacing |
| Staff UI | **Case Tracking** tab on the case workspace; **Tracking** queue (`/staff/tracking`) with 5 views; dashboard card; sidebar entry |
| Client Portal | Read-only `GET /api/portal/cases/:caseId/uscis`, `/portal/cases/:id/uscis` page, entry card on the case page |
| Platform | 3 capabilities, 4 activity types, 3 notification types, indexes, OpenAPI, contracts, tests, sandbox verification script |

## 2. Commits (8 feature commits, atomic, on top of the two docs commits)

| SHA | Subject |
|---|---|
| `10b2ca3` | feat(uscis): add case-native filing and immutable status domain |
| `4abdbc0` | feat(uscis-provider): integrate official USCIS Case Status API adapter |
| `8a09a29` | feat(uscis-api): add authorized tracking endpoints and queues |
| `b2afb5a` | feat(portal): expose client-safe USCIS status |
| `63605e5` | feat(staff-ui): add case and global USCIS tracking workspace |
| `8d7ac4b` | fix(staff-ui): carry an outstanding USCIS action into the next status update |
| `bf7cae0` | feat(uscis-provider): add manual sandbox verification script |
| `1132714` | test(uscis): add the synthetic Staff / client USCIS browser journey |

Note: `10b2ca3` shipped `src/lib/auth/capabilities.ts` with the three new entries inserted inside the previous array (a syntax error, `tsc` failed on that commit alone). It was fixed in `b2afb5a` rather than rewriting history; the branch tip is clean.

## 3. Collections, indexes, capabilities

**Collections:** `uscis_filings`, `uscis_status_events` (contract: `docs/architecture/uscis-schema-contract.json`, asserted from both the Express and Next.js sides).

**Indexes** (registered in `server/scripts/createIndexes.js`; dry run verified, **nothing applied**):

| Collection | Index |
|---|---|
| `uscis_filings` | `receiptNumber` unique, partial (`$type: string`) · `{case, archivedAt, updatedAt}` · `{currentStatusCategory, updatedAt}` · `{actionRequired, responseDueAt}` |
| `uscis_status_events` | `{filing, occurredAt, createdAt}` · `{case, createdAt}` · `providerEventKey` unique, partial |

Deviation from ADR-026: the recommended `{workspace, archivedAt, updatedAt}` index was **not** added. No implemented query filters by workspace (the queue and case list filter by `case`), and the prompt says to keep only indexes that serve real queries. Never use `syncIndexes()`.

**Capabilities** (server map, Next mirror, regenerated contract): `uscis_tracking.view` (super_admin, admin, operations_admin, pm, petition_writer, uscis_forms_specialist, reviewer) · `uscis_tracking.manage` and `uscis_tracking.sync` (super_admin, admin, operations_admin, pm, uscis_forms_specialist). Every operation also needs case row access (`cases.view_all` or an active employee membership).

**Activity types:** `uscis_filing_created`, `uscis_filing_updated`, `uscis_status_recorded`, `uscis_filing_archived` (titles only; never provider descriptions).
**Notification types:** `uscis_filing_added`, `uscis_status_changed`, `uscis_action_required`. In-app only; no email side effect.

## 4. APIs

**Staff** (`/api/v1/staff`, documented in `server/openapi/v1.yaml`):

```
GET   /uscis/provider-status        { configured, enabled, environment } only
GET   /uscis                        cross-case queue (filters, flat pagination)
GET   /cases/:caseId/uscis          POST same path: add a filing
GET   /uscis/:filingId              PATCH: edit metadata
POST  /uscis/:filingId/status-events
POST  /uscis/:filingId/sync         explicit, per filing, rate limited
POST  /uscis/:filingId/archive      soft only; no delete route exists
```

No raw documents; explicit DTOs; per-filing `actions` flags drive the UI. Missing / malformed / inaccessible / removed-member targets are one identical 404; every mutation requires a trusted `Origin`.

**Portal:** `GET /api/portal/cases/:caseId/uscis` (read-only; no write handlers exist).

Queue filters (all only narrow the actor's authorized case set; search is regex-escaped and cannot widen scope): `search` (receipt prefix, case number, title, form type), `statusCategory` (one value or a comma list), `actionRequired`, `responseDueFrom/To`, `hasDue`, `trackingProvider`, `scope=all|mine`, `archived`, `sort=updated|due|status`, `page`, `limit` (max 100).

## 5. Key behaviours (each is tested)

- **Snapshot:** one atomic conditional update: newest `occurredAt` wins, ties go to the later event id. A backfilled older event never rolls the status back; 8 concurrent writers end on the newest; `rebuildCurrentSnapshot` recomputes the same answer from events and repairs a corrupted snapshot.
- **Append-only:** model refuses 8 query operations plus document `save`/`updateOne`/`deleteOne`; there is no HTTP route to attempt an edit.
- **Client current status** = newest **client-visible** event, never the Staff snapshot. A dedicated regression test fails (verified by temporarily removing the filter) if a newer internal event leaks.
- **Provider sync is idempotent:** deterministic event keys, checked in application code *and* by the unique index (so replay is safe even before the index is built). Unchanged observation: no event, no notification, only `lastCheckedAt` moves. Failure never touches known status; only a safe code is recorded.
- **Provider text is sanitized twice** (adapter and service) to bounded plain text; provider events never invent `actionRequired` or a due date.
- **Notifications** fire once per event that *became current*; clients only when filing **and** event are visible and the client is still an active member. A notification failure never rolls back an event.
- **Outstanding action:** found by the browser journey. A newer update replaces the current status, including its action flag and due date, so a routine internal note silently dropped an unanswered RFE from the Action Required queue. The status dialog now carries an outstanding action and due date forward and says so; clearing is a deliberate act.

## 6. Provider architecture and configuration

`server/services/uscis/torchProvider.js`: OAuth client-credentials, token in process memory only (refreshed 60 s early, concurrent callers share one request), one retry on a 401 with a fresh token, `AbortController` timeout, `redirect: 'error'`, https-only configuration, process-wide pacing below a configurable TPS (default 2; USCIS documents 5 sandbox / 10 production today) that refuses rather than queues forever, every outcome mapped to a safe code. `status()` never exposes a URL, id, secret or token. Explicit per-filing refresh only; **no poller, no refresh on page load**. Per-employee limit: 10 syncs/minute (`USCIS_SYNC_RATE_LIMIT`).

**Environment variable names** (values only in `server/.env`, never in root `.env`, Angular or `NEXT_PUBLIC_*`): `USCIS_CASE_STATUS_ENABLED`, `USCIS_CASE_STATUS_ENV`, `USCIS_CASE_STATUS_CLIENT_ID`, `USCIS_CASE_STATUS_CLIENT_SECRET`, `USCIS_CASE_STATUS_OAUTH_URL`, `USCIS_CASE_STATUS_BASE_URL`, `USCIS_CASE_STATUS_DEMO_ID`, `USCIS_CASE_STATUS_TIMEOUT_MS`, `USCIS_CASE_STATUS_MAX_TPS`.

## 7. Sandbox verification: NOT performed

No sandbox credentials were available, so **the adapter has never talked to USCIS**. It is verified against a scripted fake transport only. Two consequences to be aware of:

1. **Response field names are unverified.** The mapper reads USCIS's published Case Status sample tolerantly (`case_status.current_case_status_text_en`, `…_desc_en`, `modifiedDate`, `hist_case_status[]`). If the live sandbox differs, `getStatus` fails closed (`provider_bad_response`) rather than storing wrong data, but history import in particular needs a real response to confirm.
2. `USCIS_CASE_STATUS_DEMO_ID` is read nowhere: USCIS has not documented how it is sent, and guessing would be invention.

**Manual procedure** (needs your own sandbox credentials and a staging receipt from USCIS's documentation; never put either in the repo):

```
cd server
USCIS_CASE_STATUS_ENABLED=true USCIS_CASE_STATUS_ENV=sandbox \
USCIS_CASE_STATUS_CLIENT_ID=... USCIS_CASE_STATUS_CLIENT_SECRET=... \
USCIS_CASE_STATUS_OAUTH_URL=... USCIS_CASE_STATUS_BASE_URL=... \
npm run uscis:verify-sandbox -- --receipt <staging receipt>
```

It checks the token exchange plus one successful case-status call, then one deliberate bad-receipt path; prints only a masked summary; refuses production; writes nothing. Then, in a staging Staff app with the same variables: add a filing with that receipt, press **Refresh from USCIS**, and confirm the timeline, the unchanged-refresh message, and (by temporarily using a bad secret) the "could not be retrieved" message with the known status intact. Do not commit captured responses.

## 8. Enabling production USCIS access (operator checklist)

The code assumes **no** USCIS approval exists. Production sync stays OFF until all of this is true; re-check the USCIS Torch developer documentation at release time, since requirements change.

1. USCIS Developer Portal account and Developer App; sandbox implementation and testing (including error handling and traffic expectations); USCIS review/demo; production credentials and endpoints supplied by USCIS.
2. Take a database backup, then apply the new indexes: `cd server && npm run db:indexes:dry-run`, then `npm run db:indexes`. They are additive; apply them **before** first production use (duplicate checks exist in code, but the unique indexes are the race-proof guard).
3. Set the `USCIS_CASE_STATUS_*` values USCIS provides (do not derive production URLs from sandbox ones) in the VPS `server/.env`, keep `…_ENABLED=false` until step 4, restart the admin/API process.
4. Run `provider-status`, then one manual refresh on a test filing, then set `…_ENABLED=true`.

## 9. Verification run on the final tree

| Gate | Result |
|---|---|
| Express suite (`cd server && npm test`) | **703 / 703** pass |
| Root suite (`npm test`) | **442 / 442** pass |
| Angular (`npx ng test case-management`) | **170 / 170** pass |
| Browser (`npx playwright test`, all 8 incl. the new journey) | **8 / 8** pass (2.8 min, local) |
| `npx tsc --noEmit`, `npm run lint` | clean |
| `ng build case-management`, `ng build admin-console`, `npm run build` | clean |
| `scripts/deploy/verify-staff-build.js` | OK |
| `npm run db:indexes:dry-run` | 4 + 3 indexes listed, no connection |
| `git diff --check` | clean |

**New tests:** server — `uscis-tracking.integration` (20), `uscis-sync-rate-limit.integration` (1), `uscis-provider` (15), `uscis-schema-contract` (4); root — `portal-uscis.integration` (8), `uscis-schema-contract` (3); Angular — `tracking-tab` (20), `tracking` queue (6), `api-error` (2) plus additions to dashboard, navigation and case-detail specs; browser — one full Staff / reviewer / client / removal journey.

Coverage maps to the prompt's matrix: multiple filings; receipt normalization; duplicate 409; malformed receipt rejected for sync; receipt-less drafts; unauthenticated, no-capability, view-only, outsider and removed-member behaviour; sync independent of view; append-only; older event never rolls back; rebuild; action required and due date; archive without hard delete; queue row scope and search that cannot widen it; provider token, caching, one 401 retry, 404/429/5xx/timeout mapping, no duplicate events or notifications on replay, HTML sanitized; notification once and never to removed or hidden-visibility recipients; secrets absent from DTOs and errors; client DTO excludes internals; newer internal event cannot leak. Nothing requires internet access or USCIS credentials.

## 10. Known limitations

- Provider field names and history import are unverified against a live sandbox (section 7). Catalog titles are exact matches; anything else is `other`.
- `relatedDocument` (notice document link, prompt §24, optional) was **not** implemented, to avoid dead schema and an unreachable UI.
- A manual receipt is accepted as 5–20 letters/digits; only the provider-shaped `AAA1234567890` can be refreshed from USCIS.
- The API itself lets a newer status clear `actionRequired`; only the Staff UI carries it forward by default.
- `sort=due` sorts ascending, so a filing with action required but no due date appears first (MongoDB sorts null lowest). Treated as "most urgent"; revisit with the calendar phase.
- Rate pacing is per Node process (a second instance paces independently) and there is no daily-quota counter; the per-employee limit and TPS pacing are the only controls.
- Provider events inherit the filing's client visibility at import time and are immutable; changing visibility later does not alter past events.
- Queue search covers receipt, case number, title and form type; primary-client name search was left out (no safe, non-N+1 implementation in scope).
- No scheduled/batch refresh, by design (ADR-026). A future scheduler should call `syncFiling`.
- No staff or client email is sent for tracking events; notifications are in-app.

## 11. Rollback

Everything is additive. Revert the merge (or the commits above); the two new collections can stay. Notification and activity rows already written with the new `uscis_*` types stay readable (they would only fail enum validation if re-saved by older code). No migration was written or needs reversing. Disabling `USCIS_CASE_STATUS_ENABLED` turns provider refresh off immediately without a deploy; manual tracking continues.

## 12. Next-phase recommendation

Phase 11 is feature-complete pending exact-SHA CI and the sandbox verification in section 7. Calendar/Reminders is now technically unblocked: `actionRequired` and `responseDueAt` are stored explicitly (never inferred) and can be consumed as a deadline source. Before enabling the provider in production: complete USCIS onboarding, run the sandbox verification, apply indexes, then enable (section 8). Do not start Calendar/Reminders, USCIS form autofill, Admin Angular migration or AI work without a separate go-ahead.
