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
# ⚠️ Read this before touching git (as of 2026-08-29)

**There is uncommitted work in the tree and one broken commit on `main`.**
Verify with `git log --oneline -3` and `git status` before assuming any of
this is still true — it is a snapshot, not a guarantee.

## The broken commit

`cc43363` ("feat: add reviews and services pages…") was authored outside
the agent session. It contains **only the 38 route-group file moves** from
Cycle 8A — `0 insertions, 0 deletions` — and its message describes
unrelated work. It **excludes** everything that makes those moves function:
`src/proxy.ts`, `src/lib/hosts.ts`, both route-group layouts,
`(app)/not-found.tsx`, ADR-008, the host tests, and the import fixes.

**That commit does not build.** Six stale imports across four files point
at pre-move paths (e.g. `consultation-form.tsx` imports
`@/app/consultation/actions`, which now lives at `@/app/(site)/...`).

Mitigating facts: ancestry is intact (`a7cc546` is still an ancestor,
nothing was rewritten), and it is **local only** — `origin/main` is still
at `a7cc546`. Every missing piece is in the working tree.

**Do not push `main` until this is resolved.** Ask the owner how they want
it fixed (amend, or commit the remainder on top) — it is their history,
not the agent's to rewrite.

## Uncommitted work in the tree

Cycles 8A and 8B, complete and green, never committed (the owner asked for
approval before committing):

- **8A** — host separation: `proxy.ts`, `lib/hosts.ts`, route groups
  `(site)`/`(app)` with their own layouts, host-aware `robots.ts`,
  SaaS 404 + portal catch-all, ADR-008, DEPLOYMENT.md vhost.
- **8B** — employee SaaS: `lib/auth/capabilities.ts` (mirror),
  `EmployeeSession` + staff login/logout, `employee-case-policy.ts`,
  `AppShell`/`AccountMenu`, `lib/dashboard/*`, `/staff/**` pages, ADR-009.
- **A capability change the owner explicitly approved:** the five
  specialist roles and `reviewer` gained `cases.view`, `documents.view`,
  and `document_versions.view` — **view-only**, and still membership-scoped
  because none of them hold `*.view_all`. This edits the *shared* map in
  `server/utils/permissions.js`, so it affects the admin CMS too. That
  consequence was stated and accepted.

Last verified green: root **186/186**, server **371/371**, tsc clean, lint
clean, build clean.
<!-- END:working-state -->
