# Stabilization production preflight — 2026-10-04

This record uses the user's local date (Asia/Karachi); operational timestamps below are UTC. Stabilization remains open. Phase 11 — USCIS Tracking has not started.

## Release and CI

- Deployed SHA: `1408784255ca0aff8f1a2d6cc7086998bc11fe80`.
- Active VPS release: `/srv/immigration-horizons/releases/20261003182108-1408784`, checked directly through SSH.
- [PR #6](https://github.com/ashderkarim123/Immigration-Horizons/pull/6) merged stabilization. [PR #7](https://github.com/ashderkarim123/Immigration-Horizons/pull/7) fixed the test fixture's duplicate workspace/channel order and awaited index initialization.
- [Main CI](https://github.com/ashderkarim123/Immigration-Horizons/actions/runs/37143380915): all five jobs successful; root 431 tests, server 663 tests, Angular 137 Staff plus one Admin test, seven browser tests without retries, lint/types/release builds successful.
- [Automatic production deployment](https://github.com/ashderkarim123/Immigration-Horizons/actions/runs/37143851200) successful on the same SHA.

The earlier failed run used the superseded `040e93d` merge. The corrected Main run and deployed release are already green; rerunning that old run does not validate the current release.

## Preflight and backups

At `2026-10-03T19:46:16Z`, the production environment audit passed every required key and confirmed matching private-document roots. Both runtimes use the same MongoDB URI/database. All application processes were online. The volume had 166 GB free, and private documents were owned by `deploy` with mode `0700`.

Backup ID: `stabilization-20261003T195314Z-1408784`.

VPS directory: `/srv/immigration-horizons/backups/stabilization-20261003T195314Z-1408784` (mode `0700`; backup files mode `0600`). Created through the existing `deploy` SSH connection; no credentials or document contents were printed or copied into the repository.

| Archive | Scope | Verification |
| --- | --- | --- |
| `private-documents.tgz` | Shared private documents | gzip integrity and SHA-256 recorded |
| `admin-uploads.tgz` | Shared CMS uploads | gzip integrity and SHA-256 recorded |
| `nginx-config.tgz` | Main config, three Immigration Horizons host configs and symlinks, Staff routing snippet | gzip integrity and SHA-256 recorded |
| `mongodb-dump.tgz` | Verified database used by both runtimes | 49 collections, 365 BSON documents and 49 metadata files parsed; gzip integrity and SHA-256 recorded |

MongoDB export ran from `19:56:48Z` to `19:57:22Z`. MongoDB Database Tools 100.19.1 came from the official release manifest; its Ubuntu archive SHA-256 was verified before execution. Connection credentials stayed in a temporary mode `0600` VPS config, removed on exit. The dump is limited to the application database.

This is a logical backup without an oplog or point-in-time guarantee, stored on the same VPS. A full restore was not attempted. The cutover runbook §3 separately requires confirmation of a fresh Atlas snapshot and a named restore operator; those details and off-host backup coverage remain unconfirmed. No migration, seed, index build or direct production database write was executed. Login-page GETs can establish normal anonymous CMS sessions.

## Database review and proposed actions

Read-only reviews disabled automatic index and collection creation before loading models. The old server index runner covered 130 declared indexes, all present. Loading all 47 server models revealed 142 declarations: nine missing evidence indexes and no option conflicts. Portal-only password-reset indexes were also checked: all three present.

| Collection | Missing key | Options |
| --- | --- | --- |
| `evidencetemplates` | `{caseType: 1}` | ordinary |
| `evidencetemplates` | `{status: 1}` | ordinary |
| `evidencetemplates` | `{key: 1, version: 1}` | unique |
| `evidencetemplates` | `{caseType: 1, status: 1, version: -1}` | ordinary |
| `evidencerequirements` | `{case: 1}` | ordinary |
| `evidencerequirements` | `{workspace: 1}` | ordinary |
| `evidencerequirements` | `{case: 1, templateKey: 1, templateVersion: 1, templateItemKey: 1}` | partial unique; preserve the schema's exact filter |
| `evidencerequirements` | `{case: 1, section: 1, order: 1}` | ordinary |
| `evidencerequirements` | `{case: 1, status: 1, importance: 1}` | ordinary |

Both application index runners omitted evidence models. The correction includes those models in both runners and employee sessions in the server runner, retaining additive `createIndexes()` and the no-connection dry run.

Both evidence collections contain zero documents, so the proposed unique constraints have no existing duplicate records to resolve. Both corrected dry runs list all nine evidence declarations against an unreachable loopback URI and finish without making a connection.

| Review | Would change/create | Unresolved | Decision |
| --- | --- | --- | --- |
| 001 notification recipient identity | 0 | 0 | No action |
| 002 consultation/client linkage | 1 (four already linked) | 0 | Keep deferred pending a specific apply decision |
| 003 task/case linkage | 0 | 0 | No action |
| 004 evidence templates | 2 | 0 | Proposed after backup confirmation and evidence indexes |
| Smart Forms catalog | 15 missing versions | 0 | No proactive seed needed: first case provisioning seeds insert-only |

The runbook previously said 004 was unregistered. The runner actually registers 001–004; the runbook is corrected. Index creation and migration 004 must be separately reviewed and approved under runbook §§12–13. Do not bulk-apply migrations or substitute `syncIndexes()`.

## Live checks

Read-only production browser smoke at `19:54:53Z`–`19:55:52Z` passed its assertions. Evidence is retained outside the repository in `validation-20261004/production-smoke.json` and six screenshots.

- Marketing, Staff login, Client Portal login, API health and Admin CMS login returned 200; health JSON reported `ok`.
- `/staff`, `/staff/login` and `/staff/cases` served the Angular shell with `/staff/` base and `no-cache`. Hashed bundles/styles returned 200 with long-lived cache headers. A nonexistent Staff bundle returned 404.
- An unauthenticated protected Staff API returned 401. Staff case deep-link navigation and refresh reached login correctly.
- Staff, Portal and CMS login pages rendered at 1440px and 390px with no horizontal overflow, browser runtime errors or 5xx responses.
- Portal observations include a cancelled password-reset prefetch and a failed cross-host consultation prefetch. Actual clicks were checked separately at `20:05:22Z`–`20:05:43Z`: password reset and the public consultation page both opened successfully without browser runtime errors. The prefetch observations remain in the evidence. These checks are unauthenticated.

## Short observation

Process samples at `19:46:16Z` and `20:05:30Z` covered 19 minutes 14 seconds. Both web workers and the admin process stayed online with unchanged restart counts (web 15/15; admin 14). The exporter also stayed online. Application error logs for that interval contained no MongoDB/index or storage errors. Nine admin log errors were classified as expected 401 authentication rejections in `staffAuth.js`, consistent with the unauthenticated smoke requests. All four backup archive checksums were reverified.

This is a sampled application/process observation. nginx logs were not readable by the available SSH account, so overall request-rate/error patterns and unrelated traffic were not assessed. Authenticated workflows and real-user QA remain unverified.

## Remaining release gates

1. Confirm the Atlas snapshot ID/time, off-host coverage and restore operator.
2. Finish validation of the index-script correction, then obtain a specific decision for the nine evidence indexes and migration 004. Keep migration 002 deferred unless approved separately.
3. Obtain operator review of nginx request-rate/error patterns. The short application/process observation is complete; the current SSH account cannot read nginx access/error logs or run passwordless sudo.
4. Run real-user QA with approved admin, reviewer, specialist and client accounts and a controlled case: sign-in/write/session behavior, requested uploads/downloads, evidence, tasks/chat, Forms, Petition, Packet, CMS role separation and removed-member access. Include a real device/keyboard check and public lead/email confirmation.
5. Record QA and observation sign-off, then close Stabilization and begin Phase 11.

No authenticated production mutations, migrations, seeds, index builds or nginx routing changes have been performed in this preflight. The historical implementation report remains the pre-merge delivery record.
