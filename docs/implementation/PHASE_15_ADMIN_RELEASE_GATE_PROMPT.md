# Phase 15 — Angular Admin Console Release Gate & CRM/Staff Completion Audit

**Working branch:** `phase-15/admin-release-gate`  
**Starting production baseline:** `main@150bc4b5cc0bccfd0ee1f3f41d6450f712e2bda0`  
**Architecture:** `docs/architecture/ADR-030-angular-admin-release-gate.md`  
**Date:** 2026-10-11

> **Mission:** Turn the already-complete Angular Admin Console into a **safe, release-packaged, canary-testable production application**, without automatically cutting over nginx or removing the EJS CMS. Also deliver an evidence-based CRM/Staff gap matrix. Do not build a second Admin product or add fake CRM modules.

## 0 — Stop and verify repository state

This is a sensitive production repo. Phase 14 is already merged into `main` and its CI/CD ran successfully, but current `deploy.sh` still packages **only Angular Staff**, not Angular Admin. Do not confuse deployment of source/API with serving Angular Admin to users.

Run before any edit:

```bash
git fetch origin --prune
git branch --show-current
git status --short
git rev-parse HEAD
git rev-parse origin/main
git rev-parse origin/phase-15/admin-release-gate
git log --graph --decorate --oneline -30
git diff
git diff --cached
git rev-list --left-right --count origin/main...HEAD
```

Required implementation branch: `phase-15/admin-release-gate`, created from `150bc4b5cc0bccfd0ee1f3f41d6450f712e2bda0`.

If HEAD is `main`, stop and switch only if the worktree is safe to switch. Never overwrite unexplained local changes. If main advanced, inspect the new commit tree before proceeding. No shared-history rebase, force push, hard reset or git clean.

## 1 — Required reading

Read, not skim:

```text
CLAUDE.md
AGENTS.md
.claude/DESIGN_SYSTEM.md
.claude/SECURITY.md
.claude/API_ARCHITECTURE.md
.claude/DATABASE.md
.claude/TESTING.md
.claude/DEPLOYMENT.MD

docs/architecture/ADR-008-application-separation.md
docs/architecture/ADR-012-security-privacy-and-audit.md
docs/architecture/ADR-014-migrations-and-retention.md
docs/architecture/ADR-015-angular-enterprise-platform.md
docs/architecture/ADR-016-authentication-boundaries.md
docs/architecture/ADR-024-angular-staff-production-cutover.md
docs/architecture/ADR-029-angular-admin-console-cms-platform-administration.md
docs/architecture/ADR-030-angular-admin-release-gate.md

docs/implementation/PHASE_14_ADMIN_CONSOLE_CMS_REPORT.md
docs/implementation/PHASE_14_ADMIN_CONSOLE_CMS_PROMPT.md
docs/implementation/PHASE_13_SEARCH_REPORTING_REPORT.md
docs/implementation/PHASE_12_CALENDAR_REMINDERS_REPORT.md
docs/implementation/STABILIZATION_PHASE_01_REPORT.md
docs/deployment/ANGULAR_STAFF_CUTOVER_RUNBOOK.md

scripts/deploy/deploy.sh
scripts/deploy/verify-staff-build.js
ecosystem.config.js
.github/workflows/ci.yml
.github/workflows/deploy.yml
server/app.js
server/routes/api/v1/admin/
enterprise-ui/angular.json
enterprise-ui/projects/admin-console/
enterprise-ui/projects/case-management/
```

Also inspect real nginx template/snippets in the repo. If none exist for Admin, add a documented, operator-applied **template only**. Do not assume the exact live nginx file without checking the approved operator runbook.

## 2 — Verified Phase 14 baseline

Phase 14 already built:

- Angular Admin sign-in, dashboard, Blog, FAQs, Testimonials, Media, Services/SEO, Settings, Integrations, Users, Roles and Security Events;
- 42 real `/api/v1/admin/*` operations;
- shared EJS/Admin application services;
- secure CMS session and CSRF boundaries;
- one-time temporary employee credentials;
- 77 Angular Admin specs;
- Admin Browser workflow;
- EJS emergency/rollback still working.

Do **not** rebuild these as fake screens.

Critical outstanding item: current `scripts/deploy/deploy.sh` installs Angular once, builds `case-management`, copies its dist to `static/staff`, and then removes node_modules/dist. It does **not** copy Angular `admin-console` into a releasable static tree.

Phase 15 fixes this and prepares human-operated cutover. It does not auto-cut over.

## 3 — Gate A: deployment packaging

Update `scripts/deploy/deploy.sh` additively.

Keep current deploy safety:

- release-specific build directory;
- fail before changing `current` on build failure;
- shared .env/uploads/private docs unchanged;
- Next.js and Express install/build/smoke unchanged;
- Angular Staff base href `/staff/` unchanged;
- Staff static remains `$RELEASE/static/staff/`;
- EJS CMS remains running;
- existing rollback/symlink/PM2 behavior unchanged.

New Admin packaging:

```text
$RELEASE/static/admin-console/
  index.html
  assets/bundles...
```

Build:

```bash
NG_CLI_ANALYTICS=false npx --no-install ng build admin-console
```

under the existing independent Angular workspace.

Verify `enterprise-ui/dist/admin-console/browser/index.html` and assets before copy.

Do not allow an Admin build failure to become a partial activated release.

Never let cleanup of `static/` wipe the Staff bundle while adding the Admin bundle; use two dedicated subdirectories and test both survive.

Preserve read permissions for nginx.

Clean only generated local toolchain/output **after both build outputs are copied and validated**. Don't remove source, lock files or unknown work.

Do not package secrets.

## 4 — Gate B: Admin static artifact verifier

Create a small reusable, testable verifier such as:

```text
scripts/deploy/verify-admin-build.js
```

Validate the real generated files, not only index.html existence:

- correct Angular Admin root base href for planned host-root deployment;
- no absolute development/localhost API base URLs;
- same-origin `/api/v1/admin` transport;
- no embedded Admin service secrets, Mongo URI, SMTP/Resend token, session secret, Firebase Admin key or USCIS OAuth key;
- bundles referenced by index exist;
- routing fallback expectations documented;
- correct asset and favicon references;
- no Staff app accidentally copied into Admin tree;
- no external CDN dependency invented for auth.

Do not build an impossible verifier that merely grep-matches arbitrary strings and fails on benign documentation or source maps. Scope checks to distribution files and known disallowed patterns. Add positive and negative fixture tests.

Do not silently change the Admin Angular base href in a way that breaks production root routing.

## 5 — Gate C: CI/build parity

Update `.github/workflows/ci.yml` additively.

Angular Admin build/test already runs. Add the new **Admin artifact verifier**, then ensure both generated Staff and Admin trees pass their verification steps.

Add shell syntax validation of `scripts/deploy/deploy.sh` and static-copy tests/fixtures if appropriate.

Keep all pre-existing CI jobs mandatory: root/Next, server/EJS, Angular Staff/Admin, lint/types/build, browser suites.

Do not edit `.github/workflows/deploy.yml` to deploy feature branch or bypass exact-main-green gating.

## 6 — Gate D: Admin nginx canary/cutover runbook

Create:

```text
docs/deployment/ANGULAR_ADMIN_CUTOVER_RUNBOOK.md
```

This is an OPERATOR manual, not an automatic script executed by CI.

The runbook must explicitly distinguish:

**Step A — code packaging**: after merge and green main CI, normal CD builds both Angular apps, copies them into the release, but does not change nginx. Current EJS host remains.

**Step B — canary**: deliberately route a chosen, authenticated Admin canary path or isolated same-origin host to the Admin static artifact and proxy `/api/v1/admin/*` to existing Express `:4000`. Account for `<base href="/">`; do not serve a root-built SPA naively at `/admin-preview/`. If a path canary is chosen, create a separate `--base-href /admin-preview/` canary build with tested assets/router, OR choose a clearly documented operator-controlled canary host with correct cookies/origin/CSRF. Do not create broad parent-domain cookies.

**Step C — acceptance**: test with authorized synthetic admin accounts, client and Staff session isolation, CSRF, editor boundaries, Blog publish/public read, media, users/password reset, security viewer, mobile responsiveness, EJS escape hatch.

**Step D — approved host switch**: only after a human approves the canary, switch Admin host root to Angular static fallback; retain `/admin/*` EJS and `/api/v1/admin/*` Express, with correct location precedence and proxy headers.

**Step E — watch/rollback**: document nginx config backup, `nginx -t`, safe reload, key smoke commands, restore original snippet in seconds, EJS login still works, when to revert release symlink if required.

Do not include any real host private IP, credentials, certificates, SSH keys or client data.

Explicitly document failure modes:

- login CSRF bootstrap;
- session cookie scoped to Admin host;
- browser refresh on Angular nested route;
- API 401/403 vs static SPA fallback;
- large CMS upload handling/max body size;
- cache-control for index.html vs hashed assets;
- noindex for Admin;
- public uploads URLs and cross-origin media;
- Next public/portal and Staff must remain unaffected.

If host/root cutover needs an nginx operator action the assistant cannot perform safely, document it and STOP. No direct production nginx edits in Phase 15.

## 7 — Gate E: operational smoke and rollback tests

Extend safe automation:

- GitHub Actions test of both packaged static outputs;
- production smoke script/docs for Admin static bundle and API health with no secrets, suitable for manual use;
- canary URL route verifies `index.html` has correct base;
- /api/v1/admin/session/bootstrap returns expected safe contract on Admin origin;
- legacy /admin/login remains accessible;
- unauthorized Admin API requests stay JSON/401, never SPA HTML;
- `/api/v1/staff` does not become authorized through the Admin session;
- EJS recovery remains reachable if Angular app fails.

Do not make CI require access to production or external accounts. Browser tests must use disposable MongoDB and synthetic accounts.

## 8 — Gate F: CRM + Staff production completion audit

Create:

```text
docs/implementation/CRM_STAFF_PRODUCT_COMPLETION_MATRIX.md
```

Audit the **current actual tree**, not just the old roadmap.

For each workflow, record:

```text
workflow
actor(s)
UI route(s)
API/service(s)
domain source(s)
security gate(s)
local/integration test evidence
browser test evidence
production routing status (verified / unverified)
manual UAT status (verified / pending)
remaining gap
severity P0/P1/P2
recommended subsequent phase
```

Minimum workflows:

1. Website lead captured → consultation/intake.
2. Query triage and scheduling → consultation action.
3. Lead-to-client / case conversion without duplicate identity.
4. Admin creates employee + temporary credential → employee first password setup.
5. Staff signs in → dashboard + capability-aware nav.
6. PM opens case → case stages/team/members.
7. Tasks/deadlines → calendar → reminders (worker status explicit).
8. Evidence requirements + secure document requests/review/download/audit.
9. Communications, notifications, client-facing updates.
10. Smart Forms, draft review, approvals.
11. Petition section ownership/review/final versions.
12. Filing packet versioned sources/finalization.
13. USCIS receipt/status manual and optional provider sync (sandbox verification status explicit).
14. Search → case scope + security; Reports → CSV audit.
15. Client Portal invitation/onboarding/login + case actions.
16. Admin Console CMS/user/settings/security + EJS fallback.
17. Public website CMS consumers: Blog vs FAQ/Testimonial/SEO/Settings/Media.
18. Legacy Next Staff / legacy EJS production route usage and parity.
19. Operational observability, audit, backup/restore, worker enablement.
20. Responsive/mobile/accessibility high-priority flow.

Use the following truth states, not one blanket "complete":

- code implemented;
- CI verified;
- production static packaged;
- production route verified;
- human end-to-end accepted;
- missing/blocker.

### Specific omissions you MUST acknowledge

- **Firebase client login:** agreed architecture but not implemented as a completed migration (do not claim otherwise without code+runtime proof).
- **Public CMS wiring:** Phase 14 report says public Next currently consumes Blog but not many FAQ/Testimonial/SEO/Settings/Media records.
- **Angular Admin routing:** absent until the release gate's operator cutover.
- **USCIS official sandbox:** may still lack manual provider validation.
- **Calendar reminder worker:** env-gated and not registered in PM2 as of Phase 12; may not be enabled in production.
- **Legacy removal:** EJS and Next Staff rollback paths still exist intentionally.

Do not fix all these in Phase 15. Prioritize and turn the matrix into phase recommendations.

## 9 — Product boundaries / security

Staff = operations CRM. Admin = CMS and organization management. Client Portal = client-facing case collaboration. Public Next = SEO/marketing.

Never create duplicate case/client/employee identities, a second document store, Firestore case records, a third staff login or a second authorization engine.

Do not migrate Admin CMS business logic into Angular. Reuse the Phase 14 canonical Admin API services.

The existing EJS emergency credential must stay EJS-only.

Do not grant Angular Admin case-working powers merely because a Super Admin is logged in.

## 10 — Git, tests, validation

Suggested atomic commits:

```text
build(admin): package Angular Admin as a release-local static artifact
test(deploy): verify Admin build and preserve Staff bundle
docs(deploy): write Angular Admin canary cutover and rollback runbook
docs(product): audit CRM and Staff completeness
docs(phase-15): implementation and release-gate report
```

Run full actual repository scripts (adapt only to names in package files):

```bash
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
node scripts/deploy/verify-admin-build.js enterprise-ui/dist/admin-console/browser
bash -n scripts/deploy/deploy.sh
npm run test:e2e

git diff --check
git status --short
```

Use disposable test DB. Never source production .env in tests. Never run a production migration, production index apply, `calendar:reminders:apply`, or USCIS production requests as part of this phase.

The exact final SHA on this branch must have **green GitHub CI**. Do not claim green while the workflow is still running. A CI green status does not mean the Admin host root has been switched.

## 11 — Phase 15 report

Create:

```text
docs/implementation/PHASE_15_ADMIN_RELEASE_GATE_REPORT.md
```

Include:

- branch, start/end SHA, worktree anomalies;
- source changes and deploy packaging;
- both static bundle validation results;
- CI exact run id/url;
- root/server/Angular/browser test counts;
- what was changed about CD;
- confirmation that production nginx was **not changed by this implementation**;
- confirmation that Admin root still uses EJS until operator cutover;
- manual canary steps, no secrets;
- EJS rollback plan;
- any deployment/PM2 or nginx caveats;
- location of CRM completeness matrix;
- prioritized remaining CRM/Staff/Client/Public CMS gaps;
- recommended Phase 16 scope.

## 12 — Completion gate / STOP

Phase 15 **implementation** is complete only when:

1. release script builds Staff and Admin without overwriting either;
2. release-local `static/admin-console` exists and is verified;
3. Admin SPA refresh/base/API rules are tested;
4. all session/capability/CSRF/EJS regressions remain green;
5. canary/cutover/rollback runbook is operator-grade;
6. CRM/Staff completion matrix is evidence-based and honest;
7. exact-SHA CI is green;
8. there has been NO main merge, production nginx change, production DB/index apply, or automatic EJS retirement performed by the implementation agent.

STOP after Phase 15 branch is tested and the reports are committed.

**Do not self-execute the production Admin cutover.** Ask the owner for explicit approval for the separate canary/host-switch operation. Do not start Firebase migration, public CMS consumer wiring, legacy retirement or AI work in the same phase.
