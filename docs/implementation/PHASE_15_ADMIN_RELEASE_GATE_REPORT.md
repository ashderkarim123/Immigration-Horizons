# Phase 15 — Admin release gate, CRM pipeline and branch consolidation: report

**Date:** 2026-10-26. **Branch:** `release/phase-15-integration`, cut from `main@4922860` (the audit-cleanup merge). **Authority:** ADR-031 (the Admin release gate) and `PHASE_15_CRM_PIPELINE_PLAN.md`.

## What this phase delivered

1. **Branch consolidation.** Seven branches that had never reached `main` were merged into one integration branch with no source-code conflicts:

   | Branch | Content | Notes |
   |---|---|---|
   | `fix/evidence-index-provisioning` | Evidence models added to both index scripts | Closes a real gap: production `evidencetemplates` and `evidencerequirements` had only the `_id` index |
   | `docs/agent-context-refresh` | AGENTS.md, CLAUDE.md, README | |
   | `phase-11/uscis-tracking` | Phase 11 master prompt | Its ADR-026 draft collided with the ADR-026 built and merged in Phase 11; `main`'s version was kept |
   | `phase-15/admin-release-gate` | ADR and prompt | ADR renumbered 030 → **031** (030 is the Outlook mailbox decision) |
   | `seo/google-audit-integrations` | SEO audit, read-only Google reporting, www → apex redirect, stricter robots | ADR renumbered 026 → **032** |
   | `phase-15/crm-pipeline` | Ten-stage CRM board, editor, analytics, tests | Additive, no migration |
   | `dependabot/.../next-16.3.6` | Next.js 16.2.11 → 16.3.6 | Lockfile reconciled by `npm install`; no further diff |

2. **Admin release gate (ADR-031 Gates A–D).** `deploy.sh` builds `admin-console` next to `case-management`, copies it into `static/admin-console/` (separate from `static/staff/`), verifies both with their verifiers before the symlink moves, and checks both in the health step. `static/` is wiped exactly once, before either copy, and the toolchain is removed only after both are copied. It never touches nginx.
3. **`verify-admin-build.js`** checks distribution files only: one `<base href="/">`, hashed entry bundles, every referenced asset present (including the favicon), a `noindex` meta, no loopback or `:4000` origin, the same-origin `/api/v1/admin` path, no Staff app inside the Admin tree, and the *shape* of secrets (a credentialed MongoDB URI, a Resend key, a PEM key, a Google service-account key, an AWS key). A screen that merely names `SESSION_SECRET` does not fail it. Positive and negative fixtures are in `test/release-admin-build.test.ts`; it also passes on a real Admin build and rejects a real Staff build.
4. **CI:** new steps verify the Admin artifact and run `bash -n` on `deploy.sh`. Every pre-existing job stays mandatory.
5. **Runbook and template:** `docs/deployment/ANGULAR_ADMIN_CUTOVER_RUNBOOK.md` (Steps A–E, an isolated canary host because the SPA is built for `<base href="/">`, acceptance checklist, failure modes) and `scripts/deploy/nginx/snippets/ih-admin-routes.conf`, a template that nothing applies.
6. **Completion matrix:** `docs/implementation/CRM_STAFF_PRODUCT_COMPLETION_MATRIX.md`, 20 workflows with six separate truth states.
7. **Icons:** the root layout declared `favicon.ico`, `favicon-16.png`, `favicon-32.png` and `apple-touch-icon.png`, none of which existed. They are generated from the logo globe and also used by both Angular apps; `test/site-icons.test.ts` fails if a declared icon is ever missing.

## Defects found and fixed while verifying

- **`portal-calendar` tests were time bombs.** Two tests used fixed October dates and went through a route that reads the real clock, so they passed on 14 October and failed from the 18th. They now use dates relative to today (the tests that inject their own clock were fine).
- **Navigation spec** did not expect the "CRM pipeline" menu entry the CRM branch added; updated.
- **Release Gate 01 test** asserted that `admin-console` must never be built; that was true for Gate 01 and is deliberately false now. The assertion was replaced by the new tests, and an echo line was reworded because the text `; nginx` matched the "deploy.sh never touches nginx" guard.
- **A local build trap, not a code defect:** `npm run build` on a machine whose `.env` holds the production Atlas URI fails when Next prerenders `/portal/activate` from an IP that is not allowlisted. Building with `MONGODB_URI=` blank is correct for local runs and keeps the build away from production data.

## Verification (local, on this branch)

| Check | Result |
|---|---|
| `npm run lint`, `npx tsc --noEmit` | clean |
| Root tests | 480 run; 478 passed before the two calendar tests were fixed, then 13/13 in that file; full run repeated before push (below) |
| Server tests | 910/910 |
| Angular Staff | 323/323 |
| Angular Admin | 77/77 |
| `verify-staff-build.js`, `verify-admin-build.js` on real builds | OK both; the Admin verifier rejects the Staff build |
| `bash -n scripts/deploy/deploy.sh` | OK |
| Playwright browser suite (`npm run test:e2e`) | **18/18**, built with `MONGODB_URI=` blank against a disposable database |

**The `main` CI failure.** CI on `main@4922860` failed only in the browser job (the other four jobs passed). The same suite passes 18/18 on this branch, which contains `4922860`. I could not read the failed run's log (GitHub requires sign-in), so the cause of that single failure is **not established**; it may have been environmental. The CI run on this branch's exact SHA is the evidence that matters.

**Exact-SHA CI:** recorded in the section below once the final commit has run.

## What did NOT happen

- No production nginx change, no production database or index operation, no deploy by this implementation. The evidence-index fix is merged but **not applied**: running `npm run db:indexes` against production needs a fresh Atlas snapshot and the operator's go.
- The Admin host root still serves the EJS CMS. Nothing in this phase routes to the Angular Admin bundle.
- Firebase login, public CMS wiring, legacy retirement and AI work were not started.

## Production-release checklist (for the CRM and the packaging)

1. Merge this branch to `main` as a merge commit; wait for green CI on the exact merge SHA.
2. Automatic deploy builds both Angular apps. Confirm `ls /srv/immigration-horizons/current/static` shows `admin-console` and `staff`.
3. Take an Atlas snapshot; run `npm run db:indexes:dry-run` in both apps; then apply `db:indexes` once, deliberately.
4. Smoke: public site, `/staff/login`, `/portal/login`, `/admin/login`, and the new `/staff/crm` for an account with `leads.view`.
5. Human acceptance of the CRM pipeline (workflow row "+" in the matrix).
6. Only then consider the Admin canary, following the runbook.

## Recommended Phase 16

Operations hardening: run the calendar reminder, digest and mail-watcher workers under PM2, perform and document a backup restore drill, and add uptime and error alerting. This is the only P0 in the matrix.
