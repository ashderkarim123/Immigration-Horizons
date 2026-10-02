# Release Gate 01 — Angular Staff Production Cutover Implementation Prompt

**Branch:** `architecture/angular-enterprise-platform`  
**ADR:** `docs/architecture/ADR-024-angular-staff-production-cutover.md`  
**Position:** Between Execution Phase 10 and Phase 11  
**Phase 11 remains:** USCIS Tracking  
**Phase 10 code SHA:** `07cd8e1f5c00d235a47d461f36abd3b93286b4f6`  
**Phase 10 code CI:** #80, run ID `36938005936`, all required jobs green  
**Phase 10 docs tip:** `7541a6af12d47b44af8bd1c81beaaaa73308a5a3`  
**Phase 10 docs CI:** #81, run ID `36938607097`, all required jobs green  
**Main at gate start:** `d722c01b0f49d748193e19c08afcf03eee639f47`

---

## 1. Mission

Make the existing enterprise platform **actually deployable**.

Do not add another product feature.

The release-candidate outcome is:

```text
immigrationhorizons.com
  -> Next.js public site

app.immigrationhorizons.com
  /portal/*       -> Next.js client portal
  /api/portal/*   -> Next.js portal API
  /staff/*        -> Angular case-management
  /api/v1/*       -> Express canonical API

admin.immigrationhorizons.com
  -> Express/EJS admin CMS
```

This gate prepares the complete cutover and verifies it locally/CI.

**STOP before merging to main or touching production.**

---

## 2. Deadline priority

Optimize for shipping safely and quickly.

Do:

- minimum routing/build changes;
- reuse current release-directory deployment;
- reuse current nginx/PM2;
- reuse current sessions;
- reuse current API;
- preserve legacy staff as routing rollback.

Do not:

- implement USCIS Tracking;
- migrate admin CMS to Angular;
- migrate client portal to Angular;
- introduce containers/Kubernetes;
- add a new API service;
- add CORS;
- add SSO;
- add a new observability platform;
- retire legacy staff routes;
- refactor unrelated code.

---

## 3. Preflight

```bash
git fetch origin --prune

git branch --show-current
git status --short
git rev-parse HEAD
git rev-parse origin/architecture/angular-enterprise-platform
git rev-parse origin/main
git log --graph --decorate --oneline -30
git diff
git diff --cached
```

Required branch:

```text
architecture/angular-enterprise-platform
```

Confirm enterprise is not behind main:

```bash
git rev-list --left-right --count origin/main...HEAD
```

At gate start it was:

```text
main d722c01...
enterprise ahead 56 / behind 0
```

Preserve the GA4/GTM commit already in ancestry.

Never:

```text
git reset --hard
git clean -fd
git rebase
git commit --amend
git push --force
```

---

## 4. Required reading

Read fully:

```text
CLAUDE.md
AGENTS.md

.claude/DEPLOYMENT.MD
DEPLOYMENT.md

docs/architecture/ADR-014-migrations-and-retention.md
docs/architecture/ADR-015-angular-enterprise-platform.md
docs/architecture/ADR-016-authentication-boundaries.md
docs/architecture/ADR-024-angular-staff-production-cutover.md

docs/implementation/PHASE_10_FILING_PACKETS_REPORT.md

.github/workflows/ci.yml
.github/workflows/deploy.yml
scripts/deploy/deploy.sh
scripts/deploy/nginx/app.immigrationhorizons.com.conf
scripts/deploy/nginx/admin.immigrationhorizons.com.conf
scripts/deploy/nginx/immigrationhorizons.com.conf
ecosystem.config.js

src/proxy.ts
src/lib/hosts.ts

server/app.js
server/server.js
server/routes/api/v1/index.js
server/routes/api/v1/staff/session.js
server/middleware/api/trustedOrigin.js

enterprise-ui/angular.json
enterprise-ui/projects/case-management/src/app/app.routes.ts
enterprise-ui/projects/case-management/src/app/app.config.ts
enterprise-ui/projects/case-management/src/app/core/interceptors/api.interceptor.ts
```

Code is authoritative.

---

## 5. Do not start USCIS Tracking

Phase 11 remains deferred.

This gate exists because Angular is not served in production today.

Do not add:

```text
receipt numbers
USCIS status models
polling
provider integrations
status timelines
```

until after cutover.

---

## 6. Angular base-href

Configure production case-management build for:

```text
/staff/
```

Preferred approach:

- production config in `angular.json`;
- local dev remains root;
- no hard-coded absolute app host.

Verify emitted `index.html` contains:

```html
<base href="/staff/">
```

Angular route URLs must therefore work as:

```text
/staff/login
/staff/dashboard
/staff/cases
/staff/tasks
/staff/deadlines
...
```

Deep-link refresh must work via nginx fallback.

---

## 7. Angular build output

Determine the actual Angular 22 output path.

Do not guess.

After:

```bash
cd enterprise-ui
npm ci --no-audit --no-fund
npx ng build case-management
```

inspect:

```bash
find dist -maxdepth 4 -type f | sort | head -100
```

The deploy script must copy the actual browser assets into:

```text
<release>/static/staff/
```

or an equally explicit deterministic release-local path.

Verify:

```text
static/staff/index.html exists
static/staff assets exist
```

before activation.

---

## 8. Deploy script — enterprise-ui install/build

Update:

```text
scripts/deploy/deploy.sh
```

Add before symlink activation:

```bash
cd enterprise-ui
npm ci --no-audit --no-fund
npx ng build case-management
```

Do not use `npm install`.

Do not build admin-console for production routing.

If CI/deploy time impact is small, building admin-console is acceptable as a compile check, but do not copy/serve it.

---

## 9. Deploy script — copy static Angular build

After build:

- create release-local `static/staff`;
- copy the browser build output;
- verify `index.html`;
- fail deployment if missing.

Do not symlink Angular build to a mutable shared path.

Each release must contain its own Angular assets so symlink rollback is complete.

---

## 10. Deploy script — health verification

Keep existing local checks:

```text
Next :3000
Express admin :4000
```

Add:

```text
http://127.0.0.1:4000/api/v1/health
```

Angular static assets cannot be verified through localhost nginx from `deploy.sh` unless nginx route is already active.

At minimum verify release file exists:

```text
$RELEASE/static/staff/index.html
```

Do not make initial code deploy depend on the future Step-B nginx switch.

---

## 11. app-host nginx route-aware config

Update the repository template:

```text
scripts/deploy/nginx/app.immigrationhorizons.com.conf
```

Required routing precedence:

### Canonical staff API

```nginx
location /api/v1/ {
    proxy_pass http://127.0.0.1:4000;
    ...
}
```

Preserve:

```text
Host
X-Real-IP
X-Forwarded-For
X-Forwarded-Proto
```

Do not strip `/api/v1`.

### Angular staff static app

Use the current release path:

```text
/srv/immigration-horizons/current/static/staff
```

Support:

```text
/staff -> /staff/
/staff/... -> Angular file
unknown /staff/... -> /staff/index.html
```

Use safe `try_files`.

Do not accidentally let `/staff/assets/foo.js` return `index.html` when the actual static file is missing if that would hide deployment bugs; configure normal SPA fallback carefully.

### Next fallback

All other app-host routes:

```text
/portal/*
/api/portal/*
/
/other existing app-host Next behavior
```

continue to proxy to:

```text
127.0.0.1:3000
```

Preserve current upload-size/security headers.

---

## 12. nginx config must be rollback-friendly

Create and document:

```text
old config -> all app traffic to Next
new config -> /staff Angular + /api/v1 Express + rest Next
```

The production operator must be able to restore the previous file quickly.

Do not automate production nginx replacement from the app deploy script in this gate.

Step B is a deliberate operator action.

---

## 13. Next app-root staff routing

Update:

```text
src/proxy.ts
```

Current app-host `/` staff-cookie handling uses a rewrite to `/staff`.

Change staff behavior to a browser redirect to:

```text
/staff/
```

Reason:

- nginx must see the new request;
- internal Next rewrite would bypass nginx and still render legacy Next staff.

For no staff cookie:

```text
/ -> /portal
```

may remain rewrite or become redirect if tests/UX justify it.

Do not change authorization.

Cookie presence remains a routing hint only.

---

## 14. Legacy Next staff remains

Do not delete:

```text
src/app/(app)/staff
src/app/api/staff
```

or their supporting code.

They are rollback presentation.

Do not redirect every legacy staff deep link to Angular in app code.

nginx routing is the primary cutover control.

---

## 15. /api/v1 same-origin contract

Add tests/documentation proving Angular's relative API path remains:

```text
/api/v1/*
```

with credentials.

Do not introduce:

```text
http://localhost:4000 in production bundle
absolute admin host API URL
CORS
browser bearer token
```

---

## 16. Staff login production behavior

Verify:

```text
POST https://app.../api/v1/staff/session/login
```

produces:

```text
ih_staff_session
Path=/
HttpOnly
SameSite=Lax
Secure
```

No Domain attribute.

Do not change cookie semantics unless tests prove necessary.

---

## 17. CSRF/trusted-origin production behavior

Verify mutation requests from:

```text
Origin: https://app.immigrationhorizons.com
```

are accepted.

Verify an unrelated origin is rejected.

Do not weaken:

```text
server/middleware/api/trustedOrigin.js
```

for cutover convenience.

---

## 18. CI deployment-asset test

Add a CI-safe test/check that catches:

- Angular case-management build failure;
- incorrect/missing base href;
- missing browser index;
- nginx config syntax/structure regression where practical.

Do not require root privileges/nginx daemon in CI.

A static config test/script is acceptable.

The existing Enterprise UI CI build remains required.

---

## 19. Deployment workflow smoke targets

Update:

```text
.github/workflows/deploy.yml
```

only as needed for post-cutover production checks.

Desired external checks after Step B:

```text
https://immigrationhorizons.com
https://app.immigrationhorizons.com/portal/login
https://app.immigrationhorizons.com/staff/login
https://app.immigrationhorizons.com/api/v1/health
https://admin.immigrationhorizons.com/admin/login
```

Important:

The deploy workflow triggers immediately after main CI.

For the first two-step cutover, code may deploy before nginx Step B.

Therefore do not add a mandatory `/staff/login` external smoke that would fail while old nginx routing is intentionally active unless the old Next `/staff/login` also returns successfully.

A detailed Angular-specific smoke belongs in the Step-B operator runbook.

---

## 20. Release runbook

Create:

```text
docs/deployment/ANGULAR_STAFF_CUTOVER_RUNBOOK.md
```

It must be executable by an operator.

Sections:

1. release SHA;
2. prerequisite secrets/access;
3. backup;
4. env audit;
5. pre-production dry runs;
6. main merge/release approval;
7. main CI;
8. Step A deploy;
9. Step A smoke;
10. index dry run;
11. migration dry run;
12. approved production index application;
13. explicitly approved migration application only;
14. Step B nginx backup;
15. install config;
16. `nginx -t`;
17. reload;
18. Angular staff QA;
19. client portal QA;
20. public QA;
21. admin QA;
22. log observation;
23. routing rollback;
24. full release rollback;
25. final go/no-go checklist.

Do not include secret values.

---

## 21. Release candidate report

Create:

```text
docs/implementation/RELEASE_GATE_01_ANGULAR_STAFF_CUTOVER_REPORT.md
```

Include:

```text
starting SHA
ending SHA
implementation commits

Phase 10 verification
main vs enterprise ancestry

files changed
Angular base href
Angular output path
deploy script changes
nginx routing
Next proxy redirect
API/session/CSRF validation

CI tests
manual local/preview QA performed
production actions performed: NONE

production index dry-run instructions
production migration dry-run instructions
Smart Form seed behavior
backup requirement
rollback paths
known risks
release checklist
final CI run number/id/jobs
```

Do not claim production QA occurred.

---

## 22. Production index runbook

The report/runbook must use:

```bash
cd server
npm run db:indexes:dry-run
```

against the explicit production environment.

Before real create:

- backup confirmed;
- output reviewed;
- low-traffic window;
- no `syncIndexes()`.

Then:

```bash
npm run db:indexes
```

Record counts.

Do not execute production indexes during implementation.

---

## 23. Production migrations

Run dry-run only in implementation/dev environments.

Production runbook:

```bash
npm run db:migrate
```

from root for dry run.

Only if a migration is explicitly approved as required:

```bash
npm run db:migrate -- --apply --i-have-a-backup --only <migration-id>
```

Do not bulk-apply simply because migrations exist.

Phase 08–10 domains require no bulk migration.

---

## 24. Smart Form template release behavior

Confirm through tests/docs:

```text
POST provision -> seed catalog insert-only -> create missing case forms
```

No mandatory production pre-seed.

Add a runbook optional command:

```bash
cd server
npm run forms:seed-templates
```

and only apply if operator wants proactive seed:

```bash
npm run forms:seed-templates:apply
```

Do not run production seed during implementation.

---

## 25. Private document root

Release preflight must verify:

```text
PRIVATE_DOCUMENT_ROOT
```

points to:

```text
/srv/immigration-horizons/shared/private-documents
```

or the configured shared equivalent outside release/public directories.

Do not change storage location in this gate.

---

## 26. Environment audit script/checklist

If useful, add a non-secret validation helper that reports only:

```text
SET
MISSING
INVALID SHAPE
```

for required env keys.

Never print secret values.

Do not add a dependency for this.

At minimum the runbook must clearly audit root/server envs.

---

## 27. Public analytics regression

Add/retain tests or manual checks for:

- GTM present only where intended;
- GA4 public layout;
- no PII in conversion events;
- portal/staff/admin unaffected.

Do not modify analytics unless needed to preserve behavior.

---

## 28. Local reverse-proxy simulation

Where practical without requiring root nginx:

- build Angular;
- serve Angular static output with a simple local static server OR validate files directly;
- run Express;
- verify Angular API client assumptions through tests.

Do not introduce a permanent dev proxy stack just for this gate.

If Docker/nginx is already available in CI/local and setup is trivial, an optional config smoke is acceptable; do not make it a new architecture.

---

## 29. Staff manual QA matrix before release approval

Test at least:

### Admin/manager

```text
login
dashboard
clients
cases
case overview/team
tasks/deadlines
evidence
documents
chat
forms
petition
filing packet
logout
```

### Specialist

Use a petition writer or forms specialist:

```text
login
only authorized nav/actions
assigned case
authorized task/section/forms behavior
forbidden manager/finalizer actions absent/rejected
```

### Reviewer

```text
petition review
filing packet approval/finalization permissions
```

### Removed member

```text
remove from case team
next request loses case access
```

Do not use production client data for destructive QA.

---

## 30. Client portal manual QA

Verify:

```text
login
case list
documents
download
forms
chat
attachment
logout
```

No route collision with `/staff`.

---

## 31. Deep-link QA

Directly request/refresh:

```text
/staff/login
/staff/dashboard
/staff/cases/<valid-id>
/staff/tasks
/staff/deadlines
```

nginx SPA fallback must return Angular index for Angular routes.

Static assets must return actual assets.

---

## 32. Release rollback test/documentation

Do not alter production.

But validate/document exact commands for:

### nginx routing rollback

```bash
sudo cp <backup> /etc/nginx/sites-available/app.immigrationhorizons.com
sudo nginx -t
sudo systemctl reload nginx
```

### release symlink rollback

Use existing release path and:

```text
ln -sfn <previous-release> current
pm2 reload <previous>/ecosystem.config.js --update-env
```

Use the exact production paths from deploy.sh.

---

## 33. No production mutation in this implementation gate

Do not:

- merge to main;
- run workflow_dispatch production deploy;
- SSH to production;
- edit live nginx;
- run production indexes;
- run production migration apply;
- run production seeding apply;
- change DNS;
- change Atlas;
- change secrets.

This implementation gate prepares those actions.

---

## 34. Local verification

### Root

```bash
npm ci --no-audit --no-fund
npm run lint
npx tsc --noEmit

SITE_URL=https://app.example.invalid \
NEXT_PUBLIC_SITE_URL=https://example.invalid \
npm run build

TEST_MONGODB_URI=mongodb://127.0.0.1:27017/ih-ci-root \
npm test
```

### Server

```bash
cd server
npm ci --no-audit --no-fund

TEST_MONGODB_URI=mongodb://127.0.0.1:27017/ih-ci-server \
LOGIN_RATE_LIMIT=1000 \
npm test

npm run db:indexes:dry-run
npm run forms:seed-templates

cd ..
```

### Angular

```bash
cd enterprise-ui
npm ci --no-audit --no-fund
npm test
npx ng build case-management
npx ng build admin-console

# Verify production staff base/output.
grep -R '<base href="/staff/">' dist/case-management -n
find dist/case-management -maxdepth 4 -type f | sort | head -100

cd ..
```

### Deployment script hygiene

```bash
bash -n scripts/deploy/deploy.sh
```

If shellcheck is already installed/configured, run it. Do not add it as a new dependency solely for this gate.

### Final

```bash
git diff --check
git status --short
```

---

## 35. CI gate

Push only:

```text
architecture/angular-enterprise-platform
```

Verify exact final SHA.

Required jobs:

```text
Tests (Next.js app)
Lint · types · build
Enterprise UI (Angular)
Tests (admin CMS)
```

All green.

Add release-asset/config test to an existing job if needed; do not explode CI into many new jobs under deadline pressure.

---

## 36. Stop condition

Release Gate 01 implementation is complete only when:

- Angular production base href is correct;
- deploy script builds/copies Angular staff;
- app nginx template routes /staff, /api/v1, portal correctly;
- Next app-root sends staff to /staff/ through browser navigation;
- legacy staff remains available for routing rollback;
- release runbook exists;
- release report exists;
- backup/index/migration/env steps are explicit;
- all tests/builds are green;
- exact final enterprise SHA has green CI;
- no production changes occurred.

Then **STOP and request release approval**.

Do not start Phase 11.
Do not merge main automatically.
Do not deploy production automatically.
