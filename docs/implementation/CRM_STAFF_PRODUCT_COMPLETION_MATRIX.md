# CRM and Staff product completion matrix

**Audited:** 2026-10-26, against the tree of `release/phase-15-integration` (`main@4922860` plus the Phase 15 merges). Production facts come from the live checks of 2 and 26 October 2026 and are labelled.
**Rule:** one blanket "complete" is not a state. Each workflow gets six separate truth states, and a state is `yes` only where evidence exists in this repository or was observed live.

Truth states: **Code** implemented · **CI** an automated test covers it · **Pkg** production static package exists · **Route** production route verified live · **UAT** a human accepted it end to end · severity P0 (blocks go-live) / P1 (blocks the workflow) / P2 (polish).

## Summary

| # | Workflow | Code | CI | Pkg | Route | UAT | Worst gap |
|---|---|---|---|---|---|---|---|
| 1 | Website lead → consultation/intake | yes | yes | n/a | **yes** (contact form, 2 Oct) | partial | Consultation form not live-tested; no lead email retry (P2) |
| 2 | Query triage and scheduling | yes | yes | yes | yes (route loads) | pending | No real queries exist yet (P2) |
| 3 | Lead → client/case conversion | yes | yes | yes | yes (route loads) | pending | Not exercised on a real lead (P1) |
| 4 | Admin creates employee → first password | yes | yes | EJS yes / Angular no | **EJS yes** / Angular no | pending | Angular Admin not served (P1) |
| 5 | Staff sign-in → dashboard, capability nav | yes | yes | yes | **yes** (2 Oct, browser) | partial | none known |
| 6 | PM opens case → stages, team | yes | yes | yes | yes (route loads) | pending | No case data in Angular view of a real PM (P1) |
| 7 | Tasks/deadlines → calendar → reminders | yes | yes | yes | yes (routes load) | pending | **Reminder worker not registered in PM2** (P1) |
| 8 | Evidence, document requests, review, audit | yes | yes | yes | unverified | pending | **Evidence collections have no indexes in production** (P1) |
| 9 | Messages, notifications, client updates | yes | yes | yes | partial (portal pages load) | pending | Email depends on Resend, working since 2 Oct (P2) |
| 10 | Smart Forms, review, approvals | yes | yes | yes | unverified | pending | Template seeding in production unverified (P1) |
| 11 | Petition sections, review, final versions | yes | yes | yes | unverified | pending | none known beyond UAT (P2) |
| 12 | Filing packets, finalisation | yes | yes | yes | unverified | pending | none known beyond UAT (P2) |
| 13 | USCIS receipt/status, provider sync | yes (manual + optional sync) | yes | yes | unverified | pending | **Official provider sandbox never validated** (P1) |
| 14 | Search (case-scoped) and reports/CSV | yes | yes | yes | unverified | pending | none known beyond UAT (P2) |
| 15 | Client portal invite → login → case actions | yes | yes | n/a (Next.js) | **yes** (sign-in, 2 Oct) | partial | Real client journey not accepted (P1) |
| 16 | Admin console CMS/users/settings/security | yes | yes | **yes (this phase)** | **EJS only** | pending | Angular Admin needs the canary (P1) |
| 17 | Public site consuming CMS content | **partial** | partial | n/a | partial | n/a | **Only Blog is consumed**; FAQ, Testimonial, SEO, Settings, Media records are not read by the public site (P1) |
| 18 | Legacy Next Staff / EJS usage and parity | yes (kept) | partial | yes | EJS yes; Next Staff **unreachable** after the 2 Oct nginx switch | n/a | Retirement is undecided (P2) |
| 19 | Observability, audit, backup/restore, workers | partial | partial | n/a | partial | pending | **No restore drill, no worker supervision, no alerting** (P0 before scale) |
| 20 | Responsive and accessibility of key flows | partial | partial | n/a | partial | pending | Public site checked at phone width (2 Oct); Angular apps checked at desktop only (P2) |
| + | **CRM pipeline (Phase 15)** | yes | yes | yes | **not yet deployed** | pending | Needs the release plus UAT (P1) |

## Evidence per workflow

Each line: UI route · API · domain · security gate · tests.

1. **Lead capture.** Public `/contact`, `/consultation` (Next.js server actions in `src/app/(site)/*/actions.ts`) → `src/lib/leads.ts` `deliverLead` (saves to MongoDB and emails independently). Domain: `consultations`. Gate: honeypot + rate limit. Tests: `server/test/integration/lead-operations.integration.test.js`. **Live:** the contact form was submitted on 2 Oct (saved, emailed). The consultation form shares the code but was not submitted.
2. **Query triage.** Angular `/consultations`, `/planning`; `server/routes/api/v1/staff/queries.js`, `planning.js`; domain `consultationinteractions`. Tests: `interaction-lifecycle`, `staff-planning`, `operations-queues` integration.
3. **Conversion.** Angular `/intake`, `/cases/new`, `/create`; `staff/case-intake.js`, `cases.js`; test `case-conversion.integration.test.js`. Identity: matching email is a suggestion only (never an automatic merge).
4. **Employee onboarding.** EJS `/admin/users` (live); Angular Admin `/users` (packaged, not served); one-time temporary password, forced change (`staff/account.js`, ADR-016). Tests: `admin-users`, `admin-api-users`, `auth` integration. Production holds 2 real employee accounts.
5. **Staff sign-in.** Angular `/staff/login`, `/dashboard`; `staff/session.js`, `me.js`, `dashboard.js`; `EmployeeSession`; lockout 5 attempts / 15 min. Tests: `staff-api`, `staff-cutover`, `staff-angular-contracts`. **Live:** 17/17 browser checks on 2 Oct, including a signed-out redirect loop that was found and fixed.
6. **Cases.** `/cases`, `/cases/:id`, `/work-queues`; `staff/cases.js`, `case-mutations.js`; gate `leadScope` / case membership. Tests: `case-policy`, `case-conversion`, `staff-client-first`.
7. **Tasks, deadlines, calendar.** `/tasks`, `/deadlines`, `/calendar`; `staff/tasks.js`, `deadlines.js`, `calendar.js`. Tests: `staff-tasks`, `calendar`, `calendar-reminders` integration. **Gap:** `ecosystem.config.js` defines only `ih-web` and `ih-admin`. `npm run calendar:reminders:worker` exists but nothing runs it, so reminders do not fire in production.
8. **Evidence and documents.** Case detail tabs; `staff/evidence.js`, `documents.js`; `PRIVATE_DOCUMENT_ROOT` on local disk. Tests: `evidence`, `document-lifecycle`, `document-*` unit tests. **Gap:** production `evidencetemplates` and `evidencerequirements` have only the default `_id` index (checked 26 Oct); the index fix (`5a6e550`) is merged in this phase but **not applied**. Uploads are not malware-scanned and storage is single-host.
9. **Communication.** `/messages`, `/notifications`, `/mail`; `staff/chat.js`, `mail.js`; portal chat. Tests: `staff-chat`, `staff-mail*`, `notification-*`. Resend verified working 2 Oct.
10. **Smart Forms.** Case detail tab; `staff/forms.js`; `npm run forms:seed-templates:apply` (not confirmed run in production). Tests: `smart-forms`, `smart-form-engine`.
11. **Petitions.** `staff/petitions.js`; tests `petitions.integration`, `petition-templates`.
12. **Filing packets.** `staff/filing-packets.js`; test `filing-packets.integration`.
13. **USCIS tracking.** `/tracking`; `staff/uscis.js`; tests `uscis-tracking`, `uscis-provider`, `uscis-sync-rate-limit`; browser `e2e/uscis-tracking.spec.ts`. **Gap:** the official sandbox/production provider has not been validated by a human; manual entry works without it.
14. **Search and reports.** `/search`, `/reports`; `staff/search.js`, `reports.js`; CSV export audited and rate-limited. Tests: `staff-search*`, `staff-reports*`, `csv-cell`.
15. **Client portal.** `/portal/*` (Next.js); `PortalInvitation`, `ClientSession`; tests `portal-*`. **Live:** sign-in and 11 portal pages load (2 Oct, test account, since deleted except the client).
16. **Admin console.** Angular Admin: sign-in, dashboard, Blog, FAQs, Testimonials, Media, Services/SEO, Settings, Integrations, Users, Roles, Security events; `/api/v1/admin/*`; browser `e2e/admin-console.spec.ts`. **This phase:** packaged into `static/admin-console/`, verified, runbook written (`ANGULAR_ADMIN_CUTOVER_RUNBOOK.md`). **Not served** until the operator canary.
17. **Public CMS consumers.** `src/lib/blogs.ts` is the only reader of CMS records in `src/`. Editing an FAQ, testimonial, SEO record or setting in either admin console does **not** change the public site. Phase 14's report says the same.
18. **Legacy.** The Next.js `/staff/*` pages still exist in the tree but are unreachable on the live host since the 2 Oct nginx switch; the EJS CMS is live and is the rollback path.
19. **Operations.** `security_events` (append-only), `ActivityLog`, `npm run db:purge` (dry run by default). **Gaps:** no restore drill has been performed; Atlas snapshot confirmed for the cutover but no schedule documented; PM2 does not run reminder, digest or mail-watcher workers; no uptime or error alerting.
20. **Responsive and accessibility.** Public site: phone-width checks passed, one `<h1>` per page (2 Oct). Angular Staff checked at desktop width only. No automated accessibility scan exists.

## Specific omissions, stated plainly

- **Firebase client login:** the agreed architecture (ADR-016) is **not implemented**. There is no Firebase code in `src/`. Sign-in is the existing cookie and bcrypt system.
- **Public CMS wiring:** only Blog (workflow 17).
- **Angular Admin routing:** absent until the operator completes the canary and switch.
- **USCIS sandbox:** never validated by a human.
- **Calendar reminder worker:** exists, is not in PM2, so is not running.
- **Legacy removal:** the EJS CMS and the Next.js staff pages are intentionally kept as rollback.

## Recommended sequence

| Phase | Scope | Why |
|---|---|---|
| Release (now) | Deploy this integration branch, apply the evidence indexes (after a backup), UAT of CRM | Closes workflows 8 and the CRM row |
| 16 | Operations: register reminder, digest and mail workers under PM2; backup and restore drill; uptime and error alerting | The only P0 (workflow 19) |
| 17 | Admin canary and host switch (this phase's runbook), then public CMS wiring for FAQ, Testimonial, SEO, Settings, Media | Workflows 16 and 17 |
| 18 | USCIS provider validation, real-client UAT across workflows 1–15 | Turns "code and CI" into "accepted" |
| Later | Firebase login, EJS and Next Staff retirement, malware scanning, off-box document storage | Each is a separate decision |
