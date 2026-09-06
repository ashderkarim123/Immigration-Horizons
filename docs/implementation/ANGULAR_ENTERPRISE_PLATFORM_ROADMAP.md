# Immigration Horizons — Angular Enterprise Platform Roadmap

**Created:** 2026-09-06  
**Migration branch:** `architecture/angular-enterprise-platform`  
**Production baseline:** `main@e9e04f54a17db1ed4de21b9d08882d0e1225ecd1`  
**Architecture decision:** `docs/architecture/ADR-015-angular-enterprise-platform.md`

## 1. Mission

Build Immigration Horizons into a complete immigration case-management and operations platform while preserving the live website, production data, existing security controls, and already-completed domain work.

The final product is not one giant frontend. It has clear product surfaces:

- `immigrationhorizons.com` — public marketing, services, SEO, blog, resources and lead capture;
- `app.immigrationhorizons.com` — enterprise case management for staff, with client portal capability maintained during migration;
- `admin.immigrationhorizons.com` — website/CMS/platform administration;
- one canonical backend API/domain layer;
- one authoritative MongoDB data model.

Angular is the long-term frontend for enterprise staff and admin/CMS workflows. Next.js remains the public SEO frontend. The Vite/React prototype is a UX/product reference, not a codebase to merge.

## 2. Production baseline found in the repository

### Public/Next.js

The root application is Next.js 16 + React 19 + TypeScript + Mongoose. It already separates `(site)` and `(app)` route groups and serves both the public host and SaaS host through host-aware routing.

Existing SaaS surfaces include:

- client portal;
- staff login/session;
- role-aware staff dashboard;
- clients;
- cases;
- operations queues;
- queries;
- tasks (currently lead-scoped);
- staff case mutations for manager/stage/membership.

### Express admin/backend

`server/` is an Express/EJS application with a testable `createApp()` factory, Mongo-backed sessions, CSRF protection, Helmet, rate limiting, Mongoose, mail, file handling and extensive integration tests.

Existing admin/CMS modules include:

- dashboard;
- leads;
- tasks/sprints/deliveries;
- cases;
- clients;
- documents;
- collaboration;
- queries;
- notifications;
- blog;
- FAQs;
- testimonials;
- media;
- SEO/settings/users/search/reporting-related surfaces.

### Existing domain foundation

Do not rebuild these casually. The codebase already contains the foundations for:

- `ClientUser` / client authentication;
- `EmployeeSession` / staff authentication;
- `AdminUser`;
- `Consultation`;
- `ClientCase`;
- `CaseWorkspace`;
- `WorkspaceMember`;
- `CaseActivity`;
- secure case documents;
- document categories, requests, versions and access logging;
- consultation interactions/queries;
- collaboration channels/messages/read state;
- notifications/preferences;
- security events;
- migration/retention tooling.

The capability registry has 54 named capabilities and row-level case access rules. Preserve server-side capability and membership enforcement.

### Production deployment

Production already has:

- Node 22;
- PM2;
- nginx;
- `ih-web` Next.js cluster;
- `ih-admin` Express process;
- GitHub Actions CI;
- production deploy after green CI on `main`;
- smoke checks for public/app/admin hosts.

This makes `main` a deployment-sensitive branch. Migration work must remain off main until reviewed.

## 3. Architectural problems to solve

### Problem A — multiple write implementations

Case mutations exist in Express and Next.js, with semantic parity maintained by mirrored code/tests. Angular must not add another direct writer.

**Resolution:** canonical API/application service layer.

### Problem B — staff UI is split from CMS and still incomplete

The SaaS staff area has real operations, but important workflows still live in the CMS and the long-term enterprise feature set is larger.

**Resolution:** Angular case-management app progressively replaces staff Next.js screens and consumes canonical API endpoints.

### Problem C — admin CMS is presentation + business logic mixed together

Several Express route files are large and still contain transport/presentation-adjacent business logic.

**Resolution:** extract services/policies/repositories when exposing each module through `/api/v1`; legacy EJS and Angular then use the same underlying rule.

### Problem D — tasks are not case-native

Current `Task.lead` points to `Consultation`.

**Resolution:** dedicated backwards-compatible task/domain migration before presenting tasks as case-native.

### Problem E — advanced immigration workflows do not yet have authoritative domain models

Evidence checklists, smart forms, petition work, filing packets, USCIS receipt/status tracking and calendar/deadline semantics need explicit designs.

**Resolution:** one ADR/domain cycle per major capability; no mock-state persistence.

## 4. Target module map

### Staff application — `app.*`

1. Dashboard
2. Leads
3. Clients
4. Cases / Matters
5. Case workspace
6. Tasks
7. Deadlines
8. Calendar
9. Evidence
10. Documents
11. Smart Forms
12. Petition Work
13. Filing Packets
14. USCIS Tracking
15. Communications
16. Notifications
17. Search
18. Reports
19. Personal/profile/security settings

### Case workspace

The case workspace is the main operating context:

- Overview
- Client
- Case Information
- Strategy
- Team
- Tasks
- Deadlines
- Evidence
- Forms
- Documents
- Petition
- Filing Packet
- USCIS Status
- Communications
- Notes
- Activity

### Admin application — `admin.*`

1. Admin dashboard
2. User/role/capability administration
3. Client account administration
4. Elevated case administration
5. Blog
6. FAQs
7. Testimonials
8. Media
9. SEO metadata/content configuration
10. Site settings
11. Search/indexing controls where applicable
12. Notifications/configuration
13. Reports/exports
14. Security-event viewer
15. Audit/retention/operational tooling

## 5. Target repository layout

Initial migration keeps the current root intact:

```text
Immigration-Horizons/
├── src/                         # Next.js public + transitional app
├── server/                      # Express API + transitional EJS CMS
├── enterprise-ui/               # Angular workspace
│   ├── projects/
│   │   ├── case-management/
│   │   └── admin-console/
│   └── shared/
├── docs/
├── scripts/
├── package.json                 # Next.js only
└── ecosystem.config.js
```

Do not convert the repo to npm workspaces/Turborepo in the same cycle as Angular scaffolding. That is optional later and should be justified separately.

## 6. Canonical backend layering

Target for newly exposed operations:

```text
HTTP/API controller
        ↓
request validation / DTO mapping
        ↓
authentication + capability guard
        ↓
row-level/domain policy
        ↓
application service
        ↓
repository/model gateway
        ↓
Mongoose / storage / mail
```

This is not permission to rewrite every existing service. Reuse working services and extract only when a vertical slice needs it.

## 7. API policy

### Versioning

Use `/api/v1` for the new enterprise contract.

### Same-origin deployment

Prefer nginx to expose `/api/v1` on `app.*` and `admin.*` and proxy to the backend. This avoids broad CORS and keeps secure-cookie behavior understandable.

### DTO rules

Never send raw Mongoose documents as the frontend contract.

Every DTO should intentionally expose fields. This is especially important for:

- `AdminUser` credentials/role data;
- internal actor snapshots;
- security-event metadata;
- document storage paths;
- client-visible vs staff-only activity;
- role/capability leakage into client surfaces.

### OpenAPI

Once the API foundation stabilizes, define OpenAPI and generate Angular types/client stubs. Do not generate Mongo models from it.

## 8. Authentication plan

### Staff/app host

Carry forward the existing staff session design (`EmployeeSession`, secure opaque cookie, live role/status re-read, account lockout). Teach the canonical API to authenticate that session.

Do not store bearer tokens in localStorage.

### Admin host

Keep existing Express admin session during early CMS migration. Do not widen cookies across subdomains merely for convenience.

A later explicit authentication-unification cycle may choose SSO or one session authority, but it is not necessary to begin Angular.

### Client portal

Keep client sessions separate from staff sessions. Do not collapse actor types behind one polymorphic browser token.

## 9. Migration phases

### Phase 0 — Architecture baseline — CURRENT

Deliverables:

- ADR-015;
- this roadmap;
- safe branch from production baseline;
- no production runtime changes.

Exit criteria:

- architecture direction accepted;
- branch stays isolated from `main`.

### Phase 1 — Angular workspace and CI

Goal: prove Angular can coexist safely.

Work:

- verify Node compatibility with selected stable Angular 22.x;
- create `enterprise-ui/`;
- initialize strict standalone Angular workspace;
- create `case-management` shell;
- create `admin-console` shell or document why it is deferred one cycle;
- add shared design tokens/layout package/library only as needed;
- add placeholder authenticated/unauthenticated routes without real auth;
- add Angular build/test job to CI;
- no production nginx/PM2 change;
- no MongoDB dependency;
- no real API calls.

Tests:

- Angular tests/build;
- root `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`;
- server `npm test`;
- dry-run index checks if touched (they should not be).

Rollback: revert Phase 1 commits; production is unaffected.

### Phase 2 — Canonical API foundation

Goal: create the transport layer without changing domain behavior.

Work:

- mount `/api/v1` in Express;
- JSON response/error middleware;
- request/correlation ID;
- health/readiness endpoint;
- trusted-origin/CSRF strategy for Angular same-origin mutations;
- API auth middleware foundation;
- pagination/filter utilities;
- API integration-test harness;
- first OpenAPI document skeleton.

No case mutation is migrated yet.

### Phase 3 — Staff session bootstrap

Goal: Angular can authenticate using the existing staff identity.

Endpoints:

- session/login if needed by final host routing;
- session/logout;
- `/api/v1/me`;
- capabilities/role label needed by presentation.

Requirements:

- preserve lockout semantics;
- record security events;
- live user re-read;
- client cookie cannot authenticate staff API;
- negative auth tests.

Angular:

- login;
- session bootstrap;
- auth guard;
- capability-aware navigation (UX only).

### Phase 4 — Dashboard vertical slice

Read-only.

Move/reuse role-aware operational dashboard semantics behind `/api/v1/dashboard` and render in Angular.

This is the first deployable canary candidate because it can be made read-only and low consequence.

### Phase 5 — Clients + case list/detail reads

Expose:

- client directory/detail;
- case list/detail;
- case team;
- activity;
- currently available panels.

Preserve row-level scope and `null` vs empty semantics where they communicate permission vs absence.

### Phase 6 — Canonical case mutations

Move manager/stage/member mutations behind canonical service/API paths.

Critical objective: stop Angular from needing duplicated Next.js case mutation semantics.

After parity, Next staff mutation endpoints become legacy and can be adapted or retired later.

### Phase 7 — Case tasks + deadlines

Design and implement case-native task relationship without breaking lead tasks.

Likely migration shape (subject to ADR):

- add optional `case` relationship to Task first;
- preserve `lead` during transition;
- define invariants for one/both relationships;
- backfill only when unambiguous;
- indexes + dry run;
- expose case tasks/deadlines after data semantics are real.

### Phase 8 — Evidence checklist

Design reusable case-type evidence requirements.

Reuse:

- document categories;
- document requests;
- CaseDocument;
- review/version state.

Do not create a second evidence-file collection.

Potential new domain concepts:

- EvidenceTemplate;
- EvidenceRequirement;
- requirement fulfillment relation/snapshot.

Only add them if the ADR proves existing request/category models are insufficient.

### Phase 9 — Documents

Move full staff document functionality to app UI/API:

- upload;
- request;
- review;
- reject/request replacement;
- versions;
- archive;
- access history where appropriate.

Security gates:

- private storage remains outside public directories;
- magic-byte/type checks remain backend-controlled;
- scanner remains honest if not configured;
- all downloads pass policy + audit.

### Phase 10 — Communications

Expose app-native:

- consultation/case queries;
- answering/clarification;
- collaboration channels/messages;
- client-visible update publishing;
- unread/read-state;
- notifications.

### Phase 11 — Smart Forms

ADR first.

Minimum domain questions:

- template versioning;
- case/client ownership;
- typed field schema;
- repeated groups;
- validation;
- drafts/autosave;
- review/lock state;
- generated USCIS form provenance;
- audit history.

### Phase 12 — Petition workflow

ADR first.

Define:

- whether a case can own multiple petitions/filings;
- drafting sections/work products;
- assignments;
- review/approval;
- dependencies on evidence/forms/business plans/letters;
- immutable final versions.

### Phase 13 — Filing packets

Build ordered packet composition from approved documents/forms/work product versions.

Must capture an immutable packet version/snapshot used for filing. Rebuilding later should not silently change historical packet contents.

### Phase 14 — USCIS tracking

ADR first.

Define:

- receipt numbers;
- filing dates;
- service center if applicable;
- append-only status history;
- current derived status;
- data source (manual/API/provider);
- polling frequency and failure behavior;
- notification rules.

Do not build unsupported scraping into the core.

### Phase 15 — Calendar/deadlines/reminders

Define timezone semantics explicitly. Store timestamps canonically; render user-local/practice-local intentionally.

Sources can include:

- target filing dates;
- task due dates;
- evidence due dates;
- query response due dates;
- USCIS/RFE/NOID deadlines;
- appointments.

### Phase 16 — Search/reporting

Create authorized cross-module search and operational reporting.

Search results must never widen row-level access.

### Phase 17 — Angular CMS

Migrate:

- blog;
- FAQ;
- testimonials;
- media;
- SEO/configuration.

The public Next app continues to render published content.

### Phase 18 — Angular administration

Migrate:

- users;
- roles/capabilities;
- settings;
- client account administration;
- security event viewer;
- audit/retention operational screens.

Any capability-management UI requires a careful design because current capabilities are code-owned. Do not introduce DB-editable permissions accidentally.

### Phase 19 — Legacy retirement

Only after parity and production observation:

- remove replaced EJS pages/routes;
- remove replaced Next staff pages/routes;
- keep services/API;
- update smoke checks;
- simplify nginx/PM2.

### Phase 20 — Client portal decision

Choose among:

1. keep Next.js client portal;
2. separate Next.js client portal runtime/host;
3. migrate client portal to Angular.

Do not let this decision block staff/admin migration.

### Phase 21 — AI-assisted operations

Only after deterministic workflows and access controls are stable.

AI should initially be assistive:

- document classification suggestions;
- missing-evidence suggestions;
- drafting assistance;
- summarization;
- form consistency checks.

Humans approve consequential legal/case actions. AI should not autonomously file, change status, send legal conclusions, or mutate client records without explicit controlled workflows.

## 10. Deployment/cutover pattern for every Angular module

For each migrated screen/module:

```text
1. expose/reuse canonical service
2. build tested API endpoint
3. build Angular UI
4. add auth negative tests
5. compare feature parity
6. deploy at preview/canary path or controlled route
7. manual QA
8. switch navigation/routing
9. observe
10. retire old presentation later
```

Never combine steps 6 and 10 in one release.

## 11. Git strategy

Current migration branch:

```text
architecture/angular-enterprise-platform
```

Recommended child branches for implementation if Antigravity supports a branch-per-cycle workflow:

```text
feat/angular-workspace
feat/api-v1-foundation
feat/angular-staff-auth
feat/angular-dashboard
feat/angular-cases
feat/case-tasks
feat/evidence-domain
...
```

Alternatively continue sequentially on the architecture branch locally, but keep commits atomic and never push migration code to `main` without review.

Do not use:

- `git reset --hard` on a working directory with user changes;
- force-push;
- unrelated-history merge with the UI prototype;
- wholesale directory replacement;
- direct production edits.

## 12. Known repository-history caution

Prior implementation documentation records an unexplained concurrent/checkpoint commit during an earlier cycle and a long-lived unrelated `server/public/css/admin.css` modification in one working copy. Even though the GitHub `main` tree itself is a concrete commit, local Antigravity sessions must still treat unknown local changes as user-owned and never reset/revert them automatically.

At the beginning and end of every cycle record:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline -12
git diff
git diff --cached
```

## 13. Mandatory acceptance gate per cycle

A cycle is not complete until its report lists:

- starting/ending SHA;
- files changed;
- domain models changed;
- collections/indexes changed;
- routes/API endpoints changed;
- auth/capability effects;
- environment variables changed;
- tests executed and exact results;
- migration/data effects;
- deployment effects;
- known limitations;
- rollback command/procedure.

## 14. Immediate next action

Run **Phase 1 only** using the implementation prompt in:

`docs/implementation/PHASE_01_ANGULAR_WORKSPACE_PROMPT.md`

Phase 1 must stop after Angular workspace + CI. It must not connect to production data and must not cut over any production host.