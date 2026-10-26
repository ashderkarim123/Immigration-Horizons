# ADR-031 — Angular Admin Console Production Cutover and CRM Completion Boundaries

**Status:** Accepted for Phase 15 implementation  
**Date:** 2026-10-11  
**Branch:** `phase-15/admin-release-gate`  
**Starting baseline:** `main@150bc4b5cc0bccfd0ee1f3f41d6450f712e2bda0`

## Context and verified state

Phase 14 (`docs/implementation/PHASE_14_ADMIN_CONSOLE_CMS_REPORT.md`, ADR-029) is merged into main, and exact-main CI and CD completed successfully. The Angular Admin UI and 42 `/api/v1/admin` operations exist, but the active `scripts/deploy/deploy.sh` only builds/packages Angular Staff into `static/staff`; Angular Admin is **not** packaged into a release directory or served by nginx. The existing EJS CMS still answers `admin.immigrationhorizons.com/admin/*`.

The Staff product is substantially implemented. Client Portal is still Next.js. Blog data is consumed by the public website, but FAQ/Testimonial/SEO/settings/media data are not broadly wired to public rendering. Firebase Google/email-link client login has been selected architecturally but is not yet a completed deployment.

## Decision

Phase 15 is a **production release gate**, not a new duplicate Admin or CRM implementation.

Build the Angular Admin static bundle as an atomic release-local artifact, expose a **canary path** with nginx only through a separately approved operator change, verify functionality, preserve `/admin/*` EJS and an immediate routing rollback, then optionally switch the Admin host root to Angular after human sign-off.

No production routing change, database/index change, or EJS removal is authorized merely by implementing or merging Phase 15 code. Phase 15 produces safe code, tests, runbook, and operator handoff. Its eventual routing steps are separate and require explicit operator approval.

### Target routing after approved cutover

```text
immigrationhorizons.com         → Next.js marketing, blog, SEO
app.immigrationhorizons.com
  /staff/*                     → Angular Staff static bundle
  /portal/*                    → Next.js Client Portal
  /api/v1/*                    → canonical Express Staff API, as currently routed

admin.immigrationhorizons.com
  /api/v1/admin/*              → existing Express Admin API :4000
  /admin/*                     → existing EJS CMS (rollback/emergency)
  /                           → Angular Admin Console static bundle (only after explicit cutover)
```

Note that the Staff deployment's routing may depend on the nginx Release Gate 01 operator action: **inspect the live routing before assuming it is switched**. This ADR does not modify Staff host routing.

## Two-step Admin release

1. **Step A — release packaging:** Add `ng build admin-console` to the existing release build, validate bundle and base href, copy into `$RELEASE/static/admin-console/`, make nginx-readable, and preserve it under release-directory rollback. Do not disturb Staff output or overwrite `static/staff/`. The existing deploy may install Angular once and build both apps.
2. **Step B — explicit nginx routing:** The operator backs up nginx, adds a route/isolated canary URL to `static/admin-console`, proxies `/api/v1/admin/*` with session/CSRF headers and cookies to Express, retains `/admin/*` EJS, runs `nginx -t`, reloads, and performs synthetic human QA. Only after canary acceptance may root host routing be changed. Never flip the host simply because CI is green.

For a path-prefixed canary, an Angular base href of `/` must not be naively served at `/admin-preview/`. Either build an explicitly separate canary artifact with the matching base href and verify router/assets, or use an isolated operator-controlled hostname; do not force the root bundle into a broken prefixed path. Hosting must preserve the admin origin and cookie/CSRF boundaries. Avoid an externally available canary with weak/no admin auth; the Angular app and API remain admin-authenticated.

## Admin/Staff session isolation

Existing Staff and Admin identity boundaries are authoritative:

- Staff: `EmployeeSession` / `ih_staff_session`, Staff API mounted before Express CMS sessions.
- Admin: `express-session` CMS cookie, admin identity and `admin.cms.access`, live `AdminUser` re-read, `X-CSRF-Token` plus trusted Origin.
- Client: distinct ClientUser/ClientSession.

Do not share or widen cookies across parent domain. Do not authorize Admin by Staff session. Do not migrate to localStorage JWT/Firebase employee login. Emergency environment break-glass stays EJS-only, not Angular API.

## Production invariants

- `/admin/login` and EJS mutation flows remain viable for emergency rollback.
- `/api/v1/admin/session/bootstrap` must initialize CSRF, login creates the CMS session, `/me` accurately re-checks live role.
- Same-origin requests must resolve to the correct API; no broad CORS or frontend-stored secrets.
- Published Blog remains indexed only through the public Next site; drafts remain hidden.
- Angular Admin bundle contains no SMTP, database, Firebase Admin, session, USCIS, private document, or other secrets.
- Media uploads remain in the existing shared public uploads directory; private client documents remain outside any web root.
- Existing server-side input allowlists, CSRF, user privilege escalation checks and audit remain intact.

## Admin live-acceptance matrix

Test with synthetic accounts/content:

- Super Admin: login, dashboard, Blog draft/edit/publish, FAQ/Testimonial, approved image upload, SEO, settings, employee create/reset one-time temporary password, role reference, security events, logout.
- Editor: content operations only, no employee/security/settings privilege.
- Operations Admin: Admin login denied but Staff login permitted according to role.
- Client/Staff cookies presented to Admin API: denied.
- EJS: login, emergency fallback, Blog/Settings/Users/Media, CSRF protected.
- Public Next: Blog draft remains unavailable; published HTML sanitized.
- Mobile: responsive, keyboard focus, forms/errors/dialogs.
- Failure: API down yields honest error; old EJS entry remains accessible.

### Rollback

First restore the previous nginx file/snippet and reload after `nginx -t`. The EJS console must remain available and use the same data; reverting static release is optional if routing rollback suffices. If release itself fails, use the existing release symlink/PM2 rollback path; do not hard-reset Git or edit production DB.

## CRM and Staff product completion assessment

The Staff CRM is a **case-operations CRM**, not a traditional sales-only CRM. Real modules include lead intake, clients, cases, tasks/deadlines, documents/evidence, communications, forms, petitions, filing packets, USCIS, Calendar, search and reporting.

Phase 15 must produce an honest, evidence-linked **CRM & Staff Gap Matrix**, but must not add speculative product modules to the Admin release gate. Audit:

- lead → consultation → conversion → client activation → case opened;
- employee provisioning → permissions → case assignment;
- client portal invitation/registration → case membership → documents/messages;
- case work end-to-end and closure/archive;
- data freshness, UX, performance, monitoring, deployment/routing;
- product parity vs legacy operations and EJS;
- public CMS content consumption;
- client Firebase identity migration state;
- operational enablement still disabled (USCIS provider, calendar reminders).

Mark each: **implemented**, **CI tested**, **production-route verified**, **human QA verified**, **missing**, or **blocked**. Do not equate passing CI/CD with completed runtime routing or end-user UAT.

## Future phases (not implemented in Phase 15)

Product work after this gate should be prioritized by evidence, not by a stale Phase 0–21 numeric list:

1. CRM/Staff operational parity and workflow completion, performance and user acceptance;
2. Client Portal Firebase Google + email-link identity migration with MongoDB business authorization preserved;
3. Public Next CMS integration for FAQ, Testimonials, SEO/meta/settings/media with safe caching and indexing;
4. Later EJS/legacy Next Staff retirement only after observed parity and rollback window;
5. Optional AI-assisted operations under human review and no autonomous legal actions.

If a Staff/CRM gap is P0 and impacts sensitive case data, it may justify a focused hardening phase before any cutover. This ADR does not authorize automatic EJS deletion.

## Completion gate

Phase 15 implementation must finish with green exact-SHA CI, release-local verified Angular Admin packaging, an operator-grade canary/cutover/rollback runbook, updated smoke tooling, fully preserved EJS/Admin API security, synthetic Admin/Staff/Client regression tests, and a verified CRM gap report.

**STOP after branch implementation and CI.** No production nginx edits or production routing without operator approval.
