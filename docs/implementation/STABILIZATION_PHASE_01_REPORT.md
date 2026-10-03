# Stabilization Phase 01 report

Date: 2026-10-03. Branch: `stabilization/angular-feature-parity-audit`.

Starting SHA: `5c30c51a55c798add6aed1d9d79ef34b94ab25bc`.

Main implementation checkpoint SHA: `5f93ab0f891c37080d383b6ad5037b8583f2d62c`; the later hydration repair is included in the final delivery SHA.

The exact final delivery SHA, commits and CI URL/job results are recorded in the delivery receipt and final handoff after the final push. The browser CI artifact also contains `test-results/tested-commit.txt` with that exact SHA. A tracked report cannot embed the hash of the commit containing itself.

## History and scope

All branches were fetched and compared before implementation. Completed task/chat work from `origin/stabilization/batch-c-tasks` was incorporated by merge `3fe90819014de6051a022c01fffd30a7e028466c`. Existing core-contract and evidence repairs were retained. The complete audit and reference UX/autofill specification were read; future USCIS architecture was not treated as permission to implement Phase 11 or a PDF generator.

CMS separation is commit `5acc1af` (`fix(auth): separate CMS access from staff operations roles`). While the session was active, `041ecc2107920c7e1a29726d44432b2a416cf526` (`feat: add work queue feature for staff dashboard`) committed the in-progress intake, queues, channels and document work. Its valid contents were preserved, not amended or reset. `a366611` moves intake/planning/notifications into Staff; `5f93ab0` completes document actions, case state, accessibility and the browser-discovered repairs. The final receipt lists the QA/report commits. Unrelated `.claude/settings.local.json` was excluded.

## Confirmed defects and repairs

| Area | Delivered repair |
|---|---|
| CMS/Staff authentication | Explicit `admin.cms.access` for super_admin/admin/editor. Correct-password operational-role denials are audited without changing bad-password counters. Active role/capability is rechecked on protected CMS requests; Staff/CMS sessions remain independent. |
| Operational authority | Individual Staff Operations Admin accounts create/convert cases, assign PMs, manage teams/channels/tasks and see firm queues, without CMS/users/settings capability. PMs retain live membership scope. |
| First login | Current/new/confirmation password contract and 12-character minimum; real browser completion. |
| Cases/Clients | Canonical DTO IDs/status/display fields, search/pagination/URL filters and working links; no fabricated portal status. |
| Case command center | Server capabilities/action flags; real members/member-options/activity endpoints; canonical refresh after compact mutations; stale-response guards; readable header, grouped navigation and actionable overview. |
| Evidence | Explicit primary CaseWorkspace resolution instead of invalid case.workspace/null workspace; template discovery/provisioning, custom requirements, status/reasons, guidance, same-case link/unlink and document navigation. |
| Tasks | Shared case/global create/edit/assign/reassign/status operations, ownership and removed-member enforcement; specialists cannot reassign their task. |
| Messages | Discoverable global Unread/All/search inbox using the existing channels/messages/read-state domain, case context and privacy labels. |
| Dashboards | Capability/assignment queues for due, overdue, unassigned tasks, missing PMs, documents/forms/evidence/petitions/packets; permitted workload and actual work destinations. |
| Client documents | Server-owned taxonomy, requested category/subtype/client binding, general metadata and drag/drop/native picker, replacement reason beside action. |
| Client attention | Action required first, with safe request/form/message destinations and no employee-only comments. |
| Operational separation | Staff lead intake/team/notes, consultation initialization, manual delivery records, sprint/task planning, notifications/preferences. CMS dashboard/navigation focuses on website administration; EJS recovery routes remain. |
| Real browser defects | Mobile focus waits until inert content updates, with Escape/Tab handling. Static country options prevent ICU hydration differences from replacing edits. Native file fallback preserves early selection. Native SVG paths restore stripped icons. Channel management refresh preserves the selected conversation and unsent draft. |

## Validation

Local verification: root **430 passed**, with the existing Bash syntax check skipped on Windows (431 total); server **662 passed**, followed by **6/6 guided** and **6/6 planning** tests after the final queue/channel-notification refinements; Angular **137 Staff + 1 admin-console passed**; browser **7/7 passed**, no test retries (3.2 minutes). Lint, typecheck, Next build, both Angular builds and Staff build verification passed. The browser read helper retries only ECONNRESET on idempotent GET assertions; mutations and HTTP failures are not retried. Exact final CI results follow in the delivery receipt. Real commands:

CI verification SHA: `744ef65bbfbd50b6381bfbca036b49b00fd7ebfc`. [CI run 37133185285](https://github.com/ashderkarim123/Immigration-Horizons/actions/runs/37133185285) completed with **all five jobs successful**: lint/types/Next build; root **431/431** (including Bash); server **663/663**; Angular **137 Staff + 1 admin-console**, both builds and Staff verification; browser **7/7** (40.5 seconds). Artifact `stabilization-browser-evidence` contains screenshots/report and the exact tested commit. This final documentation update is checked again on its own delivery SHA; that run and SHA are pinned in the delivery receipt/final handoff.

The subsequent documentation SHA `b1039ae` exposed an early-input race in [run 37134001351](https://github.com/ashderkarim123/Immigration-Horizons/actions/runs/37134001351). The browser trace showed that the first date-of-birth input never reached the answers PATCH; submission correctly returned 422 for the missing field. A local follow-up also reproduced Client sign-in's native GET fallback before hydration. Smart Form and Next.js sign-in controls now remain disabled until hydration; sign-in forms explicitly use POST. The browser regression deliberately holds script downloads, checks that editing/submission remain disabled, then releases scripts and completes login and the same form lifecycle without test retries. Repair verification passed lint, typecheck, Next build and all **7/7 browser workflows** locally. The delivery receipt records CI verification on the final SHA.

- Root: `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`.
- Server: `npm test`.
- Angular: `npm test`, `npx ng build case-management`, `npx ng build admin-console`.
- Staff contract: `node scripts/deploy/verify-staff-build.js enterprise-ui/dist/case-management/browser`.
- Browser: `npm run test:e2e`, using the built Next.js app and release Angular bundles.

Root/server/browser database suites run sequentially locally. CI uses separate Mongo databases. The browser runner overrides Mongo before loading either application and clears email-provider credentials; fixtures are synthetic. Screenshots/traces are retained as CI artifacts for 14 days.

Added tests cover operational CMS role denials and positive CMS roles, counter preservation, independent/revoked sessions, Operations Admin capabilities, canonical intake/team/channel queues, typed requests, safe client actions, converted-lead scope, assignment validation/idempotent notifications, consultation initialization, delivery, sprint task scope, notification identity/preferences and removed-member denial. Existing evidence, form revision/audit, chat, petition and packet suites remain.

Independent Client/PM browser sessions exercise requested/general/replacement uploads, document review, form submit/return/resubmit/approve, shared chat, tasks, evidence linking/status, petition autosave and packet assembly. Operations Admin/reviewer/specialist sessions exercise PM/team/channel/task management, forbidden mutations and immediate removed-member denial. Desktop/tablet/mobile viewports check overflow; keyboard checks cover mobile menu focus. Intake/planning/delivery/notifications and first-login password setup are also exercised.

## Limits and remaining human QA

- Chromium automation uses emulated tablet/mobile viewports. Real devices, screen-reader behavior and first-time user learnability require human acceptance before release; an automated assertion does not establish the ten-second goal.
- Cases retain the primary-client model. Multi-party canonical facts, reusable USCIS intake assembly, PDF generation and tracking are future work. Existing form keys, autosave, revisions and audit lifecycle were preserved.
- Filing Packet remains a versioned manifest with secure downloads and Smart Form references; it does not generate a combined PDF/ZIP. Delivery records describe manually prepared/sent files; production delivery email requires a separate check.
- Legacy EJS operations routes remain CMS recovery code. Staff planning supports sprint creation/status and scoped task assignment; destructive legacy administration is not promoted into the ordinary workflow.
- Existing case categories/uploader policies are preserved. Missing categories can be initialized idempotently; new default labels do not rewrite existing documents. Country-label updates require regenerating the checked-in country list.
- Conversation aggregation is bounded at 300 accessible channels. Unread metrics count conversations. The explicit channels.view_all capability permits authorized Staff administrators, including Operations Admin, to read restricted channels; ordinary PMs/specialists require live membership. Unread counts rely on workspace membership/read state.
- Consultation conversion is idempotent. Separate deliberate new-case submissions can create separate cases; no universal duplicate-case policy was invented.
- Unconverted lead access retains existing leads.view policy; converted leads/case tasks use live membership. Sprint metadata remains shared while task visibility/assignment remains scoped.
- Due-today queues use UTC day boundaries. Next milestone is an open-task due date, falling back to target filing date; it is not USCIS tracking.
- CI's Next build reports a Turbopack tracing warning for dynamic private-storage paths; compilation and the storage security/browser tests pass. Review packaging during staging. GitHub's push hook also reported existing default-branch Dependabot alerts (43, including four critical); dependency remediation is outside this feature-stabilization batch and needs review before a production release.

## Production requirements

No merge to main, deploy, nginx change, production migration/index/seed/database write was performed. No syncIndexes, force push, shared rebase, hard reset or clean was used.

Before an approved release, inspect the production migration ledger and backup. If outstanding, migrations 001–003 link immutable notification recipients, consultations/clients and case tasks; registered migration 004 seeds evidence templates. Dry-run first; apply only with separate authorization and a backup. Do not blindly repeat seeds. This stabilization's optional metadata/subtype fields and added role require no destructive migration or new index. Review the existing domain indexes with the repository dry-run tooling before approving any apply.

Assign Operations Admin only to named employees through authorized account management. Review live memberships, PMs and category uploader policies; initialize missing categories/channels through idempotent controls or reviewed tooling. Validate mail, private file storage/scanning and host routing in staging. No shared elevated employee account is required.

## Release, rollback and Phase 11

After explicit human approval: review the diff and exact-SHA CI receipt, complete staging/human acceptance, back up the database, review outstanding migration/index dry-runs, approve required applies, merge without rewriting history, and follow ADR-024/deployment documentation. Verify all three hosts, Staff /staff/ routing, canonical API origin, separate cookies, document privacy and client/PM workflows after cutover.

Rollback by redeploying the previously approved application revision or targeted revert commits. Retained EJS routes are authorized CMS recovery code. Avoid blind data deletion; additive metadata/activity can remain. Before rolling back to code without the new role enum, the owner must update or reassign Operations Admin accounts so saved-user validation remains valid. Restore backups only through the recovery procedure.

Phase 11 was not started. Passing technical stabilization removes the tested functional blockers, but ADR-024's human acceptance and approved stable production cutover remain gates. Separate authorization is required to begin Phase 11; this report does not authorize release or deployment.
