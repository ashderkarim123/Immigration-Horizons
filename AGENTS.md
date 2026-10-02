<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:project-topology -->
# Three applications, two runtimes, one repo

Before changing routing, layouts, or auth, know which application you are in.

| Host | Application | Runtime | Indexed |
|---|---|---|---|
| `immigrationhorizons.com` | Public marketing site | Next.js — `src/app/(site)/**` | **Yes** — the only one |
| `app.immigrationhorizons.com` | SaaS: client portal **and** staff app | Next.js — `src/app/(app)/**` | No |
| `admin.immigrationhorizons.com` | Express/EJS admin CMS | `server/` (separate process, port 4000) | No |

The two Next.js applications share one runtime and are separated by
**host**, in `src/proxy.ts`. Route groups `(site)` and `(app)` give each its
own layout and chrome; route groups are URL-transparent, so moving a page
between them never changes its URL.

**Host checks are routing, never authorization.** If `src/proxy.ts` were
deleted, URLs would leak across hosts — not data. Every page and route
keeps its own session check and row-level policy.

## Conventions that will bite you

- **`proxy.ts`, not `middleware.ts`.** Next 16 renamed it. Named export
  `proxy` plus `config.matcher`, at the same level as `app/`.
- **Never name an EJS render local `client`.** Express passes render locals
  to EJS as its *options*, and `options.client` means "compile to a
  standalone client function" — which drops `include()` and breaks the
  shared admin layout with a stack trace pointing nowhere near the cause.
  Same trap: `filename`, `cache`, `async`, `delimiter`, `root`, `strict`.
- **Two capability maps must stay in step.** `server/utils/permissions.js`
  owns the map; `src/lib/auth/capabilities.ts` mirrors it. Both assert
  against `docs/architecture/employee-capability-contract.json`, which is
  *generated* from the server map — regenerate it, don't hand-edit it.
- **Two session types, deliberately not unified.** `ClientSession`
  (`ih_portal_session`) and `EmployeeSession` (`ih_staff_session`) are
  separate collections and cookies. Do not merge them behind a shared
  abstraction with a `type` field.
- **Cross-app models are mirrored, not shared** (separate deployables).
  Each mirror pair has a schema-contract fixture under
  `docs/architecture/*-contract.json` asserted from both sides. Add a field
  on one side only and the tests fail on both — that is the point.

## Before declaring work done

`npm run lint` · `npx tsc --noEmit` · `npm run build` · `npm test` ·
`cd server && npm test`. Architecture decisions go in
`docs/architecture/ADR-*.md`; cycle outcomes go in
`docs/implementation/IMPLEMENTATION_STATUS.md`.
<!-- END:project-topology -->

<!-- BEGIN:working-state -->
# The staff platform: Angular app + canonical Express API

Employees work in an **Angular** app, not in Next.js or the EJS CMS. Know where things live:

| Thing | Where |
|---|---|
| Staff case-management app (served at `app.immigrationhorizons.com/staff/`, `<base href="/staff/">`) | `enterprise-ui/projects/case-management` |
| Placeholder admin console (cutover deferred, do not build on it) | `enterprise-ui/projects/admin-console` |
| Canonical staff API (`/api/v1/staff/*`) | `server/routes/api/v1/staff/*.js` + `server/services/*` |
| Admin CMS (EJS): leads, blog, users, the older case/query screens | `server/routes/admin/*`, `server/views/admin/*` |
| Client portal | `src/app/(app)/portal/**` (Next.js) |
| Decisions and per-phase records | `docs/architecture/ADR-*.md`, `docs/implementation/*` |

Employee accounts are one `AdminUser` model shared by the CMS and the staff app (separate session stores).
Client accounts (`ClientUser`) are separate: clients never sign in to staff surfaces, and staff never sign in to the portal.

## Rules for the staff API and Angular app (each one was a real bug)

1. **The API returns `id`, never `_id`.** Angular must not assume Mongo fields. Give every response a typed DTO in
   `core/api/*.types.ts`; avoid `any`.
2. **Never infer permission from a role name in Angular.** Render from the server's `actions` flags (or `capabilities`).
   The function that builds the flags must be the one the mutation route enforces (see `server/services/taskDto.js`).
3. **Mutation endpoints may return a compact result.** Re-read the canonical state, or return the refreshed DTO. Never replace a
   screen's state with a partial response. On a rejected change keep the modal and the user's input.
4. **Errors use `{ error: { code, message, fieldErrors } }`.** Read them with `apiErrorMessage()` (`core/api/api-error.ts`);
   `err.error.message` is the wrong place. Use `createApiError`; bad input is a 4xx, never a Mongoose 500.
5. **Conceal, don't confess.** A missing, malformed, inaccessible or removed-member target is one identical 404; visible but not
   permitted is 403. Every mutating route uses `trustedOriginMiddleware`. Removed workspace members lose access on the next request.
6. **Resolve the workspace explicitly.** `ClientCase` has no `workspace` field; use `caseManagement.loadCaseAndWorkspace`.
7. **Angular specs use fixtures shaped like the real response**, and each touched endpoint has a server integration test pinning the
   same fields. Two green suites that disagree is the failure mode this repo has already hit.
8. **Adding an enum or capability is a three-place change:** the server model/map, its Next.js mirror (`src/lib/**`), and the contract
   fixture in `docs/architecture/*-contract.json` (regenerate it, never hand-edit). `CaseActivity` types, capabilities and
   security-event types all work this way. An undefined capability makes `can()` false for **everyone, Super Admin included**.
9. **A migration must be registered** in `scripts/migrate.ts`; an unregistered one silently never runs.
10. Component styles are encapsulated: a modal's CSS in a parent does not reach a child component.

# Safety: production

- `main` is wired to deployment. **Merging or pushing to `main` deploys to production** after CI. Work on a branch; merge only when asked.
- Never run migrations, index builds, backfills or scripts against the production database without the owner's explicit say-so.
  `npm run db:migrate` is a dry run by default, and `--apply` on a production-looking URI needs `--i-have-a-backup`.
- Credentials never go in the repo. `server/scripts/seedStaffUser.js` takes them from the environment (`SEED_EMAIL`, `SEED_PASSWORD`,
  optional `SEED_NAME`, `SEED_ROLE`) and is the break-glass way to create or recover a Super Admin. Run it from `server/`.
- Evidence checklists need migration `004-seed-evidence-templates` applied in production (it was written but unregistered until
  Stabilization 01). Check `docs/implementation/STABILIZATION_PHASE_01_REPORT.md` §6 before assuming it has been run.

# Current state (a snapshot as of 2026-10-03; verify before relying on it)

- The Angular staff app covers dashboard, cases, clients, team, activity, tasks, deadlines, evidence, documents, chat, a Messages
  inbox, Smart Forms, petition work and filing packets. **Stabilization Phase 01 (Batches A to F) is merged and deployed.**
  `docs/implementation/STABILIZATION_PHASE_01_REPORT.md` lists the defects, the limitations and the two-session QA checklist (not yet run).
- **Phase 11 (USCIS Tracking) is not started.** It is gated on migration 004, the QA run, and a decision on staff notifications.
- Deferred on purpose, do not start unasked: calendar/reminders, global search/reporting, Angular admin-console cutover, retiring CMS
  operational routes, official USCIS PDF rendering, e-signature/e-filing, AI features.
- Undecided: moving case operations out of the admin CMS (denying PMs, retiring routes). PMs still do real work there (document
  review, answering queries); do not remove it before Angular covers it.

Run `git log --oneline -5` and `git status` before trusting any of this.

## Running the test suites

Run suites **sequentially**, never concurrently: they contend for `mongodb-memory-server` instances and fail with "Instance failed to
start within Nms", which looks exactly like a real failure.

| Suite | Command (run from) | Last verified |
|---|---|---|
| Root (Next.js) | `npm test` (repo root) | 430 pass |
| Express API + CMS | `npm test` (`server/`, about 10 to 15 minutes) | 637 pass |
| Angular | `npx ng test case-management --watch=false` (`enterprise-ui/`) | 136 pass |
| Types, lint, build | `npx tsc --noEmit` · `npm run lint` · `npx ng build case-management` | clean |

Tips:
- On Windows PowerShell set env vars with `$env:NAME='x'`; the `NAME=x command` form only works in bash.
- Do not `grep -r .` from the repo root (it walks `node_modules`); use the search tools.
- One server test file: `node --test path/to/file.test.js`. Root tests need `--conditions=react-server` (the npm script adds it).
<!-- END:working-state -->
