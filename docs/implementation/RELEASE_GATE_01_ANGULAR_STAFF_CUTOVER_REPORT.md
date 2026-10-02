# Release Gate 01 — Angular Staff Production Cutover: Implementation Report

**Branch:** `architecture/angular-enterprise-platform`
**Authority:** `ADR-024-angular-staff-production-cutover.md`, `RELEASE_GATE_01_ANGULAR_STAFF_CUTOVER_PROMPT.md`
**Runbook:** `docs/deployment/ANGULAR_STAFF_CUTOVER_RUNBOOK.md`

> **Production actions performed: NONE.** No merge to `main`, no deploy, no SSH to the VPS, no live nginx edit, no production index build, migration, seed or backfill, no DNS/Atlas/secret change. This gate only *prepares* those actions. **No production QA has been performed or is claimed.**

## Commits

- **Starting SHA:** `0714914` (Release Gate 01 prompt; Phase 10 code `07cd8e1` and docs `7541a6a` are ancestors and unchanged).
- **Implementation commits and final CI:** see [Final status](#final-status) — filled in after the push, from the real log.

## Phase 10 verification and ancestry

- Phase 10 implementation `07cd8e1f5c00d235a47d461f36abd3b93286b4f6` — CI #80 (run 36938005936) green on all four jobs; docs tip `7541a6a` — CI #81 green. Both are ancestors of this branch.
- Branch relation at gate start: `origin/main` = `d722c01b0f49d748193e19c08afcf03eee639f47`; the enterprise branch is **ahead, 0 behind** — `main` is an ancestor, so a fast-forward / merge-commit release is possible and the GA4 + GTM production commit (`d722c01`) is preserved in ancestry. No analytics code was touched.

## What changed (files)

| File | Change |
|---|---|
| `enterprise-ui/angular.json` | `case-management` **production** configuration gets `"baseHref": "/staff/"`; development and `admin-console` unchanged |
| `scripts/deploy/deploy.sh` | installs `enterprise-ui` (`npm ci --include=dev`), builds `case-management`, copies the browser output to `<release>/static/staff/`, verifies it, adds the `/api/v1/health` + staff-files health checks |
| `scripts/deploy/verify-staff-build.js` (new) | dependency-free build verifier, used by CI and `deploy.sh` |
| `scripts/deploy/nginx/snippets/ih-app-staff-routes.conf` (new) | the route-aware nginx locations (`/api/v1/`, `/staff`) |
| `scripts/deploy/nginx/app.immigrationhorizons.com.conf` | template now includes the snippet; Next.js stays the default |
| `scripts/deploy/nginx/rollback/app.immigrationhorizons.com.next-only.conf` (new) | the previous Next-only routing, kept as the rollback reference |
| `scripts/deploy/check-env.js` (new) | environment audit that prints only `SET` / `MISSING` / `INVALID SHAPE` |
| `src/proxy.ts` | app-root staff handling: rewrite → browser redirect |
| `.github/workflows/ci.yml` | one step in the existing *Enterprise UI* job: verify the staff build |
| `.github/workflows/deploy.yml` | one informational, non-failing step after the mandatory smoke checks |
| `docs/deployment/ANGULAR_STAFF_CUTOVER_RUNBOOK.md` (new), `docs/deployment/CONTABO_VPS_SETUP.md`, `DEPLOYMENT.md` | operator runbook; setup doc now installs the snippet; pointer |
| Tests | `test/release-gate-config.test.ts`, `test/release-env-check.test.ts`, `test/host-separation.test.ts` (updated), `server/test/integration/staff-cutover.integration.test.js` |

No application feature code, no model, no API route, no capability and no migration changed. Legacy Next staff routes (`src/app/(app)/staff`, `src/app/api/staff`) are **untouched**.

## Angular base href and output path

- Production build emits `<base href="/staff/">` (verified in the real build output). Angular's router is unchanged and rooted at `/login`, `/dashboard`, …, so the URLs become `/staff/login`, `/staff/dashboard`, `/staff/cases`, … Local `ng serve` and `ng test` use the development/default-free configuration and stay root-based. A plain `ng build case-management` *is* the production build (`defaultConfiguration: production`), which is what CI and `deploy.sh` run.
- **Actual Angular 22 output path** (inspected, not assumed): `enterprise-ui/dist/case-management/browser/` — `index.html`, hashed `main-*.js`, `polyfills-*.js`, `chunk-*.js`, `styles-*.css`, `favicon.ico`. (`dist/case-management/` also holds `3rdpartylicenses.txt` and `prerendered-routes.json`, which are **not** copied.) `deploy.sh` copies `browser/.` into `<release>/static/staff/`.
- The bundle contains the relative path `/api/v1` and no `localhost`, loopback, `:4000` or admin-host string (asserted by the verifier on every build).

## Deploy script changes

Order inside `deploy.sh`, all **before** the `current` symlink moves: `npm ci` for root, server (`--omit=dev`) and `enterprise-ui` (`--include=dev`, the same reason the root needs it) → Next.js build → admin entrypoint `node --check` → **Angular build** → copy to `static/staff/` → `[[ -f index.html ]] || die` → `verify-staff-build.js` → `chmod -R a+rX static` (nginx's worker user must read through the symlink) → remove the Angular toolchain from the release (`node_modules`, `dist`, `.angular`) to save disk across the 5 kept releases → activate. A failure at any earlier step runs the existing trap and removes the incomplete release. Assets live **inside each release**, never via a shared mutable path, so a symlink rollback rolls the UI back with the code. Post-activation checks now also cover `http://127.0.0.1:4000/api/v1/health` and `$CURRENT/static/staff/index.html`; the existing `:3000` and `/admin/login` checks and the automatic rollback are preserved. `deploy.sh` never touches nginx (a test enforces this). `admin-console` is **not** built or served here.

`bash -n scripts/deploy/deploy.sh` passes (also asserted by a test where bash exists).

## nginx routing

The live app-host file has been rewritten by certbot (TLS + redirect), so copying a whole template over it would drop the certificate configuration. The new routes are therefore an **include**:

```text
location ^~ /api/v1/   -> http://127.0.0.1:4000      (no URI part: path NOT stripped; Host, X-Real-IP, X-Forwarded-For/Proto preserved)
location =  /staff     -> shell of the active release (no redirect)
location ~  ^/staff/.+\.(js|css|map|ico|png|svg|woff2|…)$  -> real file or 404 (a missing bundle is NOT hidden behind index.html), expires 1y
location    /staff/    -> try_files $uri /staff/index.html (deep-link refresh), expires -1
everything else (/portal, /api/portal, /, …)             -> Next.js :3000 (unchanged `location /`)
```

Design decisions worth knowing:

- **Step B is one line** in the live HTTPS server block — `include /etc/nginx/snippets/ih-app-staff-routes.conf;` — and **routing rollback is deleting that line** (or restoring the backup), `nginx -t`, reload.
- **No permanent redirects anywhere**, and `/staff` is *served*, not redirected to `/staff/`. Verified against a local Next dev server: Next answers `/staff/` with a **308 → /staff**. A browser that cached that 308 during Step A would loop against an nginx `/staff → /staff/` redirect after cutover (and vice versa after a rollback). Serving `/staff` directly makes the chain `/ → 307 /staff/ → (cached 308) /staff → Angular shell` terminate. Angular handles the missing trailing slash (it strips the `/staff` base path).
- `expires` (not `add_header`) sets cache headers, so the server-level security headers (`X-Robots-Tag`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`) are still inherited.
- Upload size (`client_max_body_size 25M`), the security headers and the Next.js proxy settings are preserved verbatim. No CORS.
- The `nginx` daemon/`nginx -t` could not be run here (no nginx, no Docker on this machine, and CI deliberately avoids it); structure is covered by static tests and **the runbook makes `nginx -t` a mandatory operator step before reload** (a failing `nginx -t` does not affect live traffic).

## Next.js proxy redirect

`src/proxy.ts`, app host, path `/`: with the `ih_staff_session` cookie present → **`307` redirect to `https://app.immigrationhorizons.com/staff/`** (was an internal rewrite to `/staff`, which never returns to nginx and would keep showing the legacy UI after cutover). Without the cookie → rewrite to `/portal` as before. Details: the target host is explicit because behind nginx `request.url` is the upstream; **307 not 308** so nothing permanent is cached past a rollback; the response still carries `X-Robots-Tag: noindex` and `Cache-Control: private, no-store`. Cookie *presence* remains a routing hint only — authorization is unchanged. `/staff`, `/staff/*`, `/portal` and the portal API are not redirected by this rule; single-host/local mode never redirects. Safe before Step B: with the old nginx the chain is `/ → 307 /staff/ → 308 /staff` → legacy UI. Four tests cover it, including the forwarded-host case.

## API / session / CSRF validation

Verified by tests and by a local reverse-proxy simulation (below), without changing any server code:

- Angular calls only relative `/api/v1/*` with `withCredentials: true` — asserted statically (no absolute API origin, no `apiBaseUrl`/`localhost`/`:4000` in production source, no bearer token) and against the built bundle.
- **Cookie:** login through the app host returns `ih_staff_session` with `Path=/`, `HttpOnly`, `SameSite=Lax`, **`Secure` in production**, and **no `Domain`** (host-only on `app.immigrationhorizons.com`). The token is never in the JSON body; a bearer header is not honoured.
- **Trusted origin:** a mutation with `Origin: https://app.immigrationhorizons.com` is accepted; `https://evil.example`, `https://immigrationhorizons.com.evil.example`, `https://evilimmigrationhorizons.com`, `https://app.immigrationhorizons.com.attacker.io`, `null` and a missing Origin are all 403. `server/middleware/api/trustedOrigin.js` was **not** weakened.
- **No CORS:** the API sends no `Access-Control-*` headers on normal or preflight requests.
- The legacy Next staff UI and the Express staff API share the cookie name `ih_staff_session`, the `EmployeeSession` collection and the sha256 token hash, so a signed-in user survives a routing rollback.

## CI tests

- `Enterprise UI (Angular)` job gains one step after `ng build case-management`: `node scripts/deploy/verify-staff-build.js enterprise-ui/dist/case-management/browser` — fails on a wrong base href, missing index/entry bundles, a missing referenced asset, or a bundle talking to another origin. No new CI job.
- `test/release-gate-config.test.ts` (15 tests, root suite): angular base href config; same-origin API contract; nginx structure (balanced braces, terminated directives, includes resolvable, `^~ /api/v1/` with intact path and preserved headers, `/staff` roots point at the active release, missing asset = 404, SPA fallback, no permanent redirect, no `add_header`, no CORS, Next default preserved, rollback reference); `deploy.sh` order (install → build → copy → verify → activate), assets inside the release, index guard, health checks, no nginx/sudo commands, no `npm install`, no admin-console build, `bash -n`; deploy workflow's mandatory smoke list does not require Step B routes; verifier against good and bad fixtures.
- `test/release-env-check.test.ts` (8 tests): the audit's rules and that the command line never prints a value.
- `test/host-separation.test.ts`: the app-root redirect (+3 tests).
- `server/test/integration/staff-cutover.integration.test.js` (5 tests): API through the app host, no CORS, cookie attributes, trusted origin, cookie-only auth.

## Local reverse-proxy simulation (performed, not committed)

A throw-away Node script (kept out of the repo) served the **real production Angular build** under `/staff/` with the same rules as the snippet and proxied `/api/v1/*` to the **real Express app** over an in-memory MongoDB. 15/15 checks passed: `/staff/` and `/staff` → shell with `<base href="/staff/">`; deep links `/staff/login`, `/dashboard`, `/cases`, `/cases/<id>`, `/tasks`, `/deadlines` → shell; hashed `main-*.js` → 200 JS; a non-existent hashed bundle → **404 (not the shell)**; `/api/v1/health` → 200 JSON; login with the app Origin → 200 + cookie (`Path=/; HttpOnly; SameSite=Lax`; `Secure` is asserted in the production-mode test); `/api/v1/staff/me` with the cookie → 200; a mutation with an untrusted origin → 403; `/portal/*` not captured. This validates the build output and the API contract. It is **not nginx** and not a browser: no real nginx was run and no browser rendered the Angular app under `/staff/`.

## Manual local/preview QA performed

Only the above (simulation + a local `next dev` check of the `/` → `/staff/` redirect and Next's own `/staff/` → `/staff` 308). The local dev server could not reach MongoDB Atlas (Atlas's own message: the machine's current IP is probably not on the cluster's allowlist), so rendered pages that need the database returned 500 in that dev session; this is environmental, not caused by this change (the anonymous `/` → `/portal` path is byte-identical to before and covered by unit tests). **The staff QA matrix, the client-portal QA and the public/admin QA in the runbook (§18–§21) have NOT been executed.** They are the release approver's/operator's job against the real host.

## Production actions performed: NONE

See the banner. Specifically **not** done: merge to `main`; `workflow_dispatch` deploy; SSH; live nginx edit; `db:indexes`; `db:migrate --apply`; `forms:seed-templates:apply`; any backfill; DNS/Atlas/secret changes.

`npm run forms:seed-templates` (dry run) was **deliberately not run locally**: it connects to MongoDB to compare existing templates, and the local `.env` points at a real Atlas cluster. The seeder is covered by the existing Phase 08 tests (`smart-forms.integration.test.js`: idempotent, insert-only, divergence-checked).

## Production index dry-run instructions

Runbook §10/§12. `cd server && npm run db:indexes:dry-run` (no connection) against the production env, review, then — only with a recorded backup, an approved window and approval — `npm run db:indexes` (`createIndexes()` only, never `syncIndexes()`). The local dry run lists 44 models, including `case_smart_forms`, `smart_form_templates`, `smart_form_audits`, `case_petitions`, `petition_versions`, `filing_packets`, `filing_packet_versions`. The unique indexes (`{case, templateKey, templateVersion}`, `{case, sequence}`, `{petition|packet, versionNumber}`) are what make provisioning and version numbering safe under concurrency, so the runbook requires them **before** Angular staff traffic.

## Production migration dry-run instructions

Runbook §11/§13. `npm run db:migrate` from the repo root is a read-only dry run; `--apply --i-have-a-backup --only <id>` only for a migration explicitly approved as launch-necessary. Registered migrations: 001 notification recipient identity, 002 link consultations to clients, 003 link tasks to cases. **Phases 08–10 need no migration or backfill.** Observation: `scripts/migrations/004-seed-evidence-templates.ts` exists but is **not registered** in `scripts/migrate.ts` (`MIGRATIONS = [m001, m002, m003]`), so `db:migrate` will not run it — flagged, not changed.

## Smart Form seed behavior

`POST …/forms/provision` seeds the code-owned catalog **insert-only** (a changed published version fails loudly) and then creates the case's missing forms; repeating it is idempotent. No mandatory pre-seed. Optional: `npm run forms:seed-templates` (dry run) / `forms:seed-templates:apply` (runbook §13).

## Environment audit

`scripts/deploy/check-env.js root|server|both` reports only `SET` / `MISSING` / `INVALID SHAPE` and a short reason that never quotes the value; exit 1 if a required key is missing or malformed; `both` also checks `PRIVATE_DOCUMENT_ROOT` is identical in both apps. Enforced: root `SITE_URL` exactly `https://app.immigrationhorizons.com` (the CSRF Origin check for every portal and staff write — wrong ⇒ every write 403) and `NEXT_PUBLIC_SITE_URL` exactly `https://immigrationhorizons.com`; `NODE_ENV=production`; a real `MONGODB_URI` (without it leads email but are never saved); `PRIVATE_DOCUMENT_ROOT=/srv/immigration-horizons/shared/private-documents`; server `SESSION_SECRET` ≥ 32 chars and a ≥ 12-char break-glass password; one working mail transport; analytics ids optional but well-formed. No dependency was added. The helper can run from the repo cache **before** the release is deployed (runbook §4).

## Backup requirement

Recorded as a hard gate in the runbook (§3, §27): a fresh Atlas snapshot id/timestamp, private-documents/uploads coverage and nginx backups **before any production write** (indexes, migrations, seeds). `db:migrate --apply` additionally refuses a production-looking URI without `--i-have-a-backup`.

## Rollback paths

1. **Routing only (preferred):** remove the one `include` line or restore the timestamped nginx backup → `nginx -t` → reload. Staff returns to the legacy Next UI; no DB or release change; no cached permanent redirect can trap a browser.
2. **Release:** `ln -sfn <previous> current` + `pm2 reload <previous>/ecosystem.config.js --update-env` (exact production paths from `deploy.sh`). **Ordering caveat documented:** a release built *before* this gate has no `static/staff`, so with Step B live do routing rollback first or at the same time; releases from this gate on carry their own `static/staff`, so rollback between them rolls the UI back too. `deploy.sh` also auto-rolls-back if the new release fails its own health checks.
3. **Database:** no down-migration; indexes are additive and stay; real corruption ⇒ the Atlas restore procedure.

## Known risks

- **Not proven in a browser or on nginx.** The Angular app has not been rendered under `/staff/` by a real browser, and the nginx snippet has not been through `nginx -t`. The base-href build, the static asset resolution, the nginx structure and the API contract are verified; the first real browser run is the runbook's §18.
- **Angular build on the VPS** needs network (Angular inlines the Inter font CSS at build time from `fonts.gstatic.com`) and roughly a minute and ~1 GB RAM. A failure aborts the deploy before activation, leaving the live release untouched.
- **External font request.** The staff UI loads Inter from Google Fonts at runtime (pre-existing, unlike the marketing site's self-hosted fonts). Not changed in this gate; worth a follow-up if the staff app must make zero third-party requests.
- **Merging to `main` auto-starts Step A** (`deploy.yml` runs after CI on `main`). The runbook therefore requires backup + env audit + approval *before* the merge.
- **`/staff` content on a release built before this gate** is a 404 when the include is active (see rollback ordering).
- **Stale tabs after a deploy** request old hashed bundles and get a 404 by design (reload fixes it).
- **Legacy Next staff UI stays deployed** as the rollback; its retirement is a later, separate decision.
- **Atlas reachability from this developer machine** failed in the local dev check (IP not on the Atlas allowlist, per Atlas's message); unrelated to this change, but anyone repeating local QA needs their IP allowlisted or a local MongoDB.

## Release checklist

The full go/no-go list is runbook §27. In short: report approved · enterprise SHA CI-green · branch not behind `main` · backup recorded · env audit clean · test accounts and a controlled test case ready · PR merged (no squash) · `main` CI green on the exact SHA · deploy succeeded · `static/staff` present with `<base href="/staff/">` · Step A smoke matches the table · indexes dry-run reviewed and applied · migration decision recorded · nginx backup taken · `nginx -t` ok · reload · staff/portal/public/admin QA · observation window · rollback understood.

## Verification

Local, run sequentially (never concurrently):

- root `npm test`: **425/426** on the full run; the single failure was the new workflow-slicing assertion in `release-gate-config.test.ts` (it read into the informational step). Fixed; that file then passed **15/15** on its own. The full root suite was **not** re-run after the fix — the CI `Tests (Next.js app)` job on the pushed SHA is the full re-run.
- `cd server && npm test`: **590/590** (includes the 5 cutover tests)
- Angular `ng test case-management`: **73/73** (includes `base-href.spec.ts`: `/staff/login` → `/login`, deep link with id, `/staff` and `/staff/` → router root, `prepareExternalUrl('/login')` → `/staff/login`)
- `ng build case-management` emits `<base href="/staff/">`; `verify-staff-build.js` passes on it; `ng build admin-console` succeeds
- `npm run lint`, `npx tsc --noEmit`, `git diff --check`, `bash -n scripts/deploy/deploy.sh`: clean
- `cd server && npm run db:indexes:dry-run`: 44 models listed, no connection made

A local `next build` is blocked on this machine (Application Control blocks SWC); the production build is covered by the CI `Lint · types · build` job.

## Final status

_Filled in after the push._
