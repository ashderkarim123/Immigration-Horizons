# Phase 01 — Angular Workspace + CI Only

Use this prompt in Antigravity with Claude or Gemini when implementing the first Angular migration cycle.

---

You are working on the live-production repository:

`ashderkarim123/Immigration-Horizons`

The architectural migration is documented in:

- `docs/architecture/ADR-015-angular-enterprise-platform.md`
- `docs/implementation/ANGULAR_ENTERPRISE_PLATFORM_ROADMAP.md`

## Mission for this cycle

Implement **Phase 01 only: Angular workspace + CI coexistence**.

Do not begin API migration, authentication migration, case-management feature implementation, database work, nginx cutover, PM2 changes, or production deployment in this cycle.

The purpose of Phase 01 is to prove that the new Angular enterprise frontend can coexist safely with the current Next.js + Express production system without changing production behavior.

## Production safety rules

The website is live.

Before touching any file:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log --graph --decorate --oneline -20
git diff
git diff --cached
git remote -v
```

Expected architecture branch:

`architecture/angular-enterprise-platform`

The production baseline from which this program started is:

`e9e04f54a17db1ed4de21b9d08882d0e1225ecd1`

A GitHub safety branch also exists:

`backup/pre-angular-enterprise-platform-2026-09-06`

If the working branch is `main`, STOP and switch to the architecture branch before editing.

Never:

- force-push;
- reset unknown local changes;
- run `git clean -fd`;
- run `git reset --hard` against user work;
- deploy;
- edit production `.env` values;
- connect to the production database;
- apply migrations/indexes;
- alter nginx/PM2 production routing;
- replace the root `package.json`;
- replace the root Next.js `tsconfig`/Next config;
- merge `Immigrationhorizons-app` into this repo;
- copy its Vite/Express runtime into this repo;
- add MongoDB/Mongoose to the Angular browser application.

A prior development session documented an unrelated local modification in `server/public/css/admin.css`. If that or any other unexplained local change exists, treat it as user-owned: record it, leave it unstaged/unmodified, and do not absorb it into this cycle.

## Read before implementation

Inspect at minimum:

```text
CLAUDE.md
AGENTS.md
docs/architecture/ADR-008-application-separation.md
docs/architecture/ADR-009-employee-saas-shell.md
docs/architecture/ADR-010-staff-case-operations.md
docs/architecture/ADR-012-security-privacy-and-audit.md
docs/architecture/ADR-014-migrations-and-retention.md
docs/architecture/ADR-015-angular-enterprise-platform.md
docs/implementation/ANGULAR_ENTERPRISE_PLATFORM_ROADMAP.md
package.json
server/package.json
.github/workflows/ci.yml
.github/workflows/deploy.yml
ecosystem.config.js
src/proxy.ts
```

Also inspect the actual current directories so documentation is not trusted blindly.

## Step 1 — Verify runtime compatibility

Record:

```bash
node --version
npm --version
```

The repo production/CI baseline currently uses Node 22.

Before scaffolding, verify the exact latest stable Angular 22.x CLI/framework version you intend to install and confirm its Node.js compatibility against the official Angular compatibility/release documentation.

Do not blindly use an outdated globally installed Angular CLI.

Record the selected Angular CLI/framework versions in the cycle report.

## Step 2 — Create the isolated Angular workspace

Create a new top-level directory:

`enterprise-ui/`

It must be independently installable and must own its own:

- `package.json`;
- lockfile;
- `angular.json`;
- TypeScript configs;
- test setup.

Do not turn the repository root into an npm workspace in this cycle.

Do not change the root package dependency graph merely to host Angular.

Use strict Angular configuration with:

- standalone APIs;
- Angular Router;
- SCSS;
- strict TypeScript/template checking;
- Vitest;
- no SSR;
- no NgRx;
- no database/browser secrets;
- Signals for simple presentation state where state is needed.

Preferred workspace model:

```text
enterprise-ui/
├── projects/
│   ├── case-management/
│   └── admin-console/
├── angular.json
├── package.json
├── package-lock.json
└── ...
```

Create both application shells if the current Angular CLI supports doing so cleanly without awkward generated-app relocation. If doing both in one command sequence would introduce unnecessary churn, create `case-management` first and create `admin-console` as a second explicit Angular application within the same workspace before the cycle ends.

Do not create a separate Angular repository.

## Step 3 — Application shells only

### `case-management`

Purpose: future staff case-management UI for `app.immigrationhorizons.com`.

Create only structural placeholder routes/screens such as:

- sign-in placeholder;
- dashboard placeholder;
- cases placeholder;
- not-found/error shell as appropriate.

Do not implement real staff authentication yet.

Do not call existing staff APIs yet.

Do not mock production case records.

### `admin-console`

Purpose: future Angular CMS/platform administration UI for `admin.immigrationhorizons.com`.

Create only structural placeholder routes/screens such as:

- sign-in placeholder;
- admin dashboard placeholder;
- content/CMS placeholder;
- not-found/error shell as appropriate.

Do not implement real admin authentication yet.

Do not call existing EJS routes as fake APIs.

## Step 4 — Shared structure

Create only the minimal shared architecture needed now.

A reasonable target is conceptually:

```text
core/
  api/
  auth/
  config/
  guards/
  errors/

layout/
  app-shell/
  navigation/

shared/
  ui/

features/
  ...
```

Do not generate dozens of empty modules/services/directories just to match the future diagram.

Avoid business logic in shared UI.

Avoid premature abstractions.

## Step 5 — Basic enterprise design foundation

Create a small neutral Immigration Horizons enterprise shell that demonstrates:

- responsive sidebar/header layout;
- route outlet;
- accessible navigation semantics;
- focus-visible states;
- keyboard-usable navigation;
- sensible loading/empty placeholder conventions;
- reusable typography/spacing tokens.

Do not spend the cycle reproducing the React prototype pixel-for-pixel.

The `Immigrationhorizons-app` repository is a product/UX reference only.

Do not copy:

- `server.ts`;
- `mockData.ts`;
- Vite config;
- package config;
- Google AI integration;
- React components wholesale.

No case-management workflow should be declared implemented merely because the Angular shell has navigation text for it.

## Step 6 — Browser security constraints

The Angular source must contain no:

- Mongo URI;
- database password;
- Resend key;
- SMTP password;
- session secret;
- private document root;
- API private key;
- production-only backend secret.

Angular runtime configuration may eventually contain public values such as same-origin API base paths, but Phase 01 should not require real production API configuration.

## Step 7 — CI integration

Modify `.github/workflows/ci.yml` additively.

Add an Angular/enterprise UI job that:

1. checks out the repo;
2. installs the same supported Node version selected for the repo/Angular compatibility;
3. runs `npm ci` inside `enterprise-ui/`;
4. runs Angular tests non-interactively;
5. builds both Angular applications;
6. performs any lint/type/template checks that are actually configured.

Use `cache-dependency-path: enterprise-ui/package-lock.json` where appropriate.

Do not remove or weaken any existing root/server jobs.

Do not modify `deploy.yml` to serve Angular yet.

The production smoke URLs must remain unchanged in this phase.

## Step 8 — Local verification

Run the complete relevant validation.

### Existing Next.js application

From repo root:

```bash
npm ci --no-audit --no-fund
npm run lint
npx tsc --noEmit
npm test
npm run build
```

Use only the repo's isolated/local test Mongo mechanism. Never point tests at production.

### Existing Express backend/CMS

```bash
cd server
npm ci --no-audit --no-fund
npm test
cd ..
```

### Angular

From `enterprise-ui/`, run the real scripts established in its package file. At minimum prove:

- tests pass;
- `case-management` production build passes;
- `admin-console` production build passes;
- type/template checks pass.

Do not fake a green result. If an existing unrelated test fails, record the exact failure and determine whether your changes caused it before editing unrelated production code.

## Step 9 — Inspect generated dependencies and files

Before committing:

- confirm no `node_modules` is tracked;
- confirm no `.angular/cache` is tracked;
- confirm no Angular build output is tracked unless deliberately required by the existing deployment model (it should not be in Phase 01);
- confirm no secret files are tracked;
- confirm root package/lock was not unintentionally modified;
- inspect every changed file;
- run `git diff --check`.

## Step 10 — Documentation

Create:

`docs/implementation/PHASE_01_ANGULAR_WORKSPACE_REPORT.md`

It must record:

- starting SHA;
- ending SHA after commits;
- working branch;
- initial worktree state;
- any pre-existing anomalies left untouched;
- Node/npm versions;
- selected Angular CLI/framework versions and compatibility source checked;
- exact scaffold commands used;
- files/directories added;
- root files changed;
- CI changes;
- tests/build commands and results;
- database effects: `NONE`;
- indexes/migrations effects: `NONE`;
- production routing effects: `NONE`;
- environment-variable effects: `NONE` unless a non-secret local example was genuinely required;
- known limitations;
- rollback procedure.

Rollback for this phase should be Git-level only because there must be no runtime/data migration.

## Git commits

Use coherent atomic commits rather than one dump. Suggested shape:

```text
chore(angular): initialize enterprise UI workspace
feat(angular): add enterprise application shells
ci(angular): validate enterprise UI builds and tests
docs(angular): record Phase 1 implementation
```

Do not push to `main`.

Do not deploy.

If you push at all, push only the migration/feature branch explicitly requested by the owner.

## Completion criteria

Phase 01 is complete only when:

- Angular coexists under `enterprise-ui/`;
- root Next.js architecture remains intact;
- Express architecture remains intact;
- case-management Angular shell builds;
- admin-console Angular shell builds;
- Angular tests pass;
- existing Next.js validation passes;
- existing server tests pass;
- CI includes Angular without weakening existing checks;
- no production host routes to Angular;
- no production data/index/migration was touched;
- no existing case/domain logic was duplicated in Angular;
- Phase 01 report is complete.

## STOP CONDITION

STOP after Phase 01.

Do not begin `/api/v1` work in the same session unless the owner explicitly gives the Phase 02 instruction after reviewing this cycle.

At the end, return a concise implementation report containing:

1. branch and start/end SHA;
2. files changed;
3. selected Angular version;
4. application/workspace structure;
5. exact tests/builds and outcomes;
6. whether any existing behavior changed;
7. known issues;
8. rollback procedure;
9. recommended Phase 02 starting point.
