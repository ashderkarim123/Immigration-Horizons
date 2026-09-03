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
# Repository state (as of 2026-09-03)

**This is a snapshot, not a guarantee.** Verify with `git log --oneline -3`
and `git status` before relying on any of it.

At the time of writing: `main` is `50b6c8a`, the working tree is clean, and
`origin/main` matches. Cycles 1 through 10 are committed. Nothing is
pending approval.

## Two things about the history worth knowing

**`50b6c8a` says less than it did.** Its message — "feat: Implement host
management and employee session handling" — describes Cycles 8A and 8B, but
the commit also contains all of Cycle 8C (ADR-010, the staff case and
client operations console) and all of Cycle 9 (ADR-011, the client portal
experience layer). If you are looking for where `/staff/clients`,
`/staff/operations`, `/portal/profile` or `/portal/security` came from, it
is there. Don't conclude they are uncommitted because the message doesn't
mention them.

**`cc43363` is a dead commit, and it is harmless.** It was authored outside
an agent session and contained only Cycle 8A's 38 route-group file moves —
`0 insertions, 0 deletions` — without `src/proxy.ts`, the route-group
layouts, or the import fixes that make those moves build. It briefly sat on
`main`. It no longer does: `main` was rebuilt cleanly on top of `a7cc546`,
which is still an ancestor, so nothing was rewritten destructively. The
commit object survives in the object store but is unreachable from any
branch, and `git log` will not show it. Nothing needs to be done about it.

## Running the test suites

Run the two suites **sequentially**, never concurrently. Run together they
contend for `mongodb-memory-server` instances and fail with "Instance
failed to start within Nms" — which reads exactly like a real failure and
is not one. Both helpers set a 60s launch timeout for the same reason.

Last verified green: root **281/281**, server **407/407**, `tsc --noEmit`
clean, `npm run lint` clean, `npm run build` clean.
<!-- END:working-state -->
