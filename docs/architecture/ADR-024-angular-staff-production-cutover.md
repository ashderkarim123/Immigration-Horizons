# ADR-024 — Angular Staff Release Candidate and Production Cutover

**Status:** Accepted for Release Gate 01  
**Date:** 2026-10-02  
**Branch:** `architecture/angular-enterprise-platform`  
**Release position:** Between Execution Phase 10 and Phase 11  
**Phase 11 remains:** USCIS Tracking, deferred until after first production cutover  
**Phase 10 code SHA:** `07cd8e1f5c00d235a47d461f36abd3b93286b4f6`  
**Phase 10 code CI:** #80 — success  
**Phase 10 docs tip:** `7541a6af12d47b44af8bd1c81beaaaa73308a5a3`  
**Phase 10 docs CI:** #81 — success  
**Current main:** `d722c01b0f49d748193e19c08afcf03eee639f47`  
**Branch relation at decision time:** enterprise branch 56 commits ahead of main, 0 behind

---

## 1. Context

The core enterprise case-management workflow is now implemented through Filing Packets:

- staff session/authentication;
- dashboard;
- clients/cases/team;
- tasks/deadlines;
- evidence;
- secure documents;
- client-employee chat;
- Smart Forms;
- petition drafting/review;
- immutable filing packets.

The original roadmap says the next feature is USCIS Tracking.

However, production currently does **not** build or serve the Angular `enterprise-ui` application at all.

The existing production deploy script:

- builds Next.js;
- installs the Express admin/backend;
- starts `ih-web` on port 3000;
- starts `ih-admin` on port 4000.

The current `app.immigrationhorizons.com` nginx configuration proxies every request to Next.js port 3000.

Therefore implementing another Angular feature before cutover would increase code without moving the existing Angular platform any closer to users.

The deadline requires closing the deployment gap first.

---

## 2. Decision

Insert **Release Gate 01 — Angular Staff Production Cutover** between Phase 10 and Phase 11.

This is a deployment/readiness gate, not a new product feature phase.

Phase 11 remains USCIS Tracking and is deferred until the first production release is stable.

The first cutover keeps the strangler architecture intact:

```text
immigrationhorizons.com
  -> Next.js marketing/public site

app.immigrationhorizons.com
  /portal/*       -> Next.js client portal
  /api/portal/*   -> Next.js portal API

  /staff/*        -> Angular case-management static application
  /api/v1/*       -> Express canonical API

admin.immigrationhorizons.com
  -> Express/EJS admin CMS
```

No Angular admin-console cutover in this release.

---

## 3. Why deploy before USCIS Tracking

The currently completed workflow already covers the operational path through a finalized filing packet.

USCIS Tracking begins **after filing**.

It is useful, but it is not required for staff to:

- onboard a case;
- communicate with the client;
- collect evidence/documents;
- collect structured intake;
- draft/review a petition;
- assemble/finalize a filing packet.

The deployment gap is therefore more launch-critical than Phase 11.

---

## 4. Preserve current public analytics work

At this decision point:

```text
main = d722c01...
enterprise = 7541a6a...
enterprise is ahead 56 / behind 0
```

The GA4/GTM production commit on `main` is already an ancestor of the enterprise branch.

The release must preserve:

- GTM;
- GA4;
- public conversion events;
- public contact/consultation behavior.

Do not overwrite or reimplement analytics during cutover.

---

## 5. Staff URL decision

Angular staff application is served under:

```text
https://app.immigrationhorizons.com/staff/
```

The Angular router remains internally rooted at:

```text
/login
/dashboard
/cases
/tasks
/deadlines
...
```

but the production build uses:

```text
base href = /staff/
```

Therefore:

```text
Angular /login      -> /staff/login
Angular /dashboard  -> /staff/dashboard
Angular /cases      -> /staff/cases
```

Local Angular development remains root-based.

---

## 6. Client portal remains Next.js

The client portal remains:

```text
/portal/*
/api/portal/*
```

on the Next.js process.

Do not migrate the client portal in this release gate.

Do not route `/portal` through Angular.

This preserves the already-tested dual-surface architecture.

---

## 7. Canonical API production route

On `app.immigrationhorizons.com`:

```text
/api/v1/* -> http://127.0.0.1:4000/api/v1/*
```

The request Host and forwarding headers must remain the real app host.

Angular already uses relative URLs beginning with:

```text
/api/v1
```

and sends credentials.

No CORS layer is introduced.

The request remains same-origin in the browser.

---

## 8. Staff session/cookie decision

The existing canonical Express staff API sets:

```text
ih_staff_session
Path=/
HttpOnly
SameSite=Lax
Secure in production
```

No Domain attribute is set.

When login is performed through the app-host nginx proxy, the cookie is therefore scoped to:

```text
app.immigrationhorizons.com
```

This is the intended behavior.

No parent-domain cookie is introduced.

---

## 9. Trusted-origin decision

The current staff API trusted-origin middleware accepts the apex and proper subdomains of:

```text
immigrationhorizons.com
```

Therefore:

```text
Origin: https://app.immigrationhorizons.com
```

is accepted.

No broad CORS or CSRF exception is required.

Cutover QA must explicitly test staff mutations through the real app host.

---

## 10. Angular production build

The deploy process must install/build `enterprise-ui`.

Required production build:

```bash
cd enterprise-ui
npm ci --no-audit --no-fund
npx ng build case-management
```

The production case-management configuration must emit an app whose base href is:

```text
/staff/
```

The build output is copied into the release at a deterministic path such as:

```text
<release>/static/staff/
```

Do not serve from a developer directory.

Do not add Angular SSR.

---

## 11. nginx routing

The app-host nginx configuration becomes route-aware.

Required precedence:

```text
/api/v1/      -> Express :4000
/staff/       -> static Angular release
everything else -> Next.js :3000
```

This means:

- portal stays Next;
- portal APIs stay Next;
- marketing URLs reached on app host continue to use current Next host-boundary behavior;
- staff Angular API is canonical Express.

The exact `/staff` path should redirect to:

```text
/staff/
```

Angular deep-link refreshes must fall back to:

```text
/staff/index.html
```

within the active release.

---

## 12. Next app-root routing

Today the Next proxy internally rewrites app-host `/` to `/staff` when the staff cookie exists.

An internal rewrite never returns to nginx, so after Angular cutover it would still render the legacy Next staff route.

Change that behavior to a **browser redirect** for staff:

```text
app host /
+ ih_staff_session
-> /staff/
```

A browser redirect creates a new request that nginx can route to Angular.

Client/non-staff app-root behavior may continue to route to `/portal`.

This change is safe before nginx cutover because the old nginx configuration still proxies `/staff/` to Next.js.

---

## 13. No legacy staff retirement in this release

Keep the existing Next.js staff routes/code.

Do not delete:

```text
/staff/*
/api/staff/*
```

during the first Angular cutover.

They are the immediate presentation-layer rollback.

If Angular cutover has a critical issue:

1. restore the previous app-host nginx configuration;
2. reload nginx;
3. staff returns to the existing Next.js staff surface.

No DB rollback is required merely to undo routing.

Legacy retirement remains a later roadmap phase after production observation.

---

## 14. Two-step first cutover

The first production release is deliberately split.

### Step A — deploy code with old nginx routing

Deploy the release containing:

- all enterprise backend/API code;
- Angular static build;
- updated deploy script;
- Next root redirect change.

But leave production nginx routing unchanged initially.

Result:

- public site continues Next;
- client portal continues Next;
- staff continues legacy Next;
- Angular files exist on disk but receive no production traffic.

Smoke-test all existing production surfaces.

### Step B — switch app-host nginx

Only after Step A is healthy:

- back up current app-host nginx file;
- install the reviewed route-aware config;
- run `nginx -t`;
- reload nginx;
- test Angular staff + canonical API.

If Step B fails:

- restore the old nginx config;
- `nginx -t`;
- reload nginx.

This gives an immediate routing rollback without changing database state or release symlinks.

---

## 15. Deployment script changes

`scripts/deploy/deploy.sh` must:

1. install root dependencies;
2. install server dependencies;
3. install enterprise-ui dependencies;
4. build Next.js;
5. build Angular case-management;
6. copy Angular browser output to the deterministic staff static directory;
7. verify the Angular index exists before activating;
8. preserve current release-directory/symlink semantics;
9. keep admin entrypoint syntax checks;
10. add a local Express API health check after activation.

The deployment must still fail before symlink activation when a build fails.

Do not build/deploy Angular admin-console yet unless doing so is essentially free and does not alter routing. It is not required for Release Gate 01.

---

## 16. Production smoke checks

The deployment workflow/runbook must cover:

```text
https://immigrationhorizons.com/
https://app.immigrationhorizons.com/portal/login
https://app.immigrationhorizons.com/staff/login
https://app.immigrationhorizons.com/api/v1/health
https://admin.immigrationhorizons.com/admin/login
```

A simple HTTP 200 is not enough for final manual QA.

---

## 17. Production database indexes

Production runs with automatic index creation disabled.

Phases through Filing Packets added new indexes intentionally without executing them against production.

Before enabling Angular staff traffic:

1. confirm production DB backup;
2. run the server index dry run against the production environment;
3. review all declared indexes;
4. run additive `createIndexes()` only;
5. verify resulting indexes;
6. record the operation in the release report.

Use:

```text
server/scripts/createIndexes.js
```

which uses `createIndexes()`, never `syncIndexes()`.

Do not drop indexes.

---

## 18. Data migrations

The enterprise feature phases were designed so the release does not require a broad migration.

Do **not** automatically apply every historical migration.

Before cutover:

- run migration dry-run;
- review each migration's effect;
- apply only migrations explicitly judged necessary for launch;
- require backup confirmation for production writes;
- leave ambiguous records untouched.

New Smart Forms, Petitions and Filing Packets are lazy/additive and do not require bulk production backfill.

---

## 19. Smart Form templates

Smart Form provisioning seeds the versioned code-owned catalog on first provision.

Therefore a separate template-seed operation is not mandatory for first cutover.

The release QA must nevertheless verify:

- a test case can provision forms;
- templates appear;
- repeated provisioning is idempotent.

If operators choose to pre-seed, use the existing dry-run/apply seeder.

---

## 20. Evidence/documents/chat provisioning

Do not mass-provision all cases merely for cutover.

Use the existing lazy/idempotent provisioning behavior where available.

For production QA, exercise one controlled test case/workspace end-to-end.

Do not mutate unrelated live cases.

---

## 21. Environment audit

Before production cutover verify, without printing secret values:

### Root/Next

- `MONGODB_URI`;
- `SITE_URL=https://app.immigrationhorizons.com`;
- `NEXT_PUBLIC_SITE_URL=https://immigrationhorizons.com`;
- public/app/admin host variables if set;
- `RESEND_API_KEY`;
- contact receiver/from settings;
- GA4/GTM settings already used by production;
- timezone.

### Express/server

- `NODE_ENV=production`;
- `MONGODB_URI`;
- `SESSION_SECRET`;
- fallback admin credential policy;
- `PRIVATE_DOCUMENT_ROOT`;
- mail settings where used;
- timezone.

Do not put secrets into reports or CI logs.

---

## 22. Backup requirement

Before any production DB write for the release:

- confirm Atlas backup/snapshot capability;
- take a fresh manual/scheduled snapshot according to the current deployment runbook;
- record timestamp/backup identifier externally or in the release report without credentials.

No DB mutation/index operation before backup confirmation.

---

## 23. Release QA — public

Verify:

- homepage;
- service pages;
- consultation/contact submission;
- lead stored;
- lead notification email;
- sitemap;
- robots;
- GA4/GTM loads on public layout;
- conversion events contain no PII;
- mobile rendering.

The enterprise cutover must not regress acquisition.

---

## 24. Release QA — client portal

Verify on real app host:

- login/logout;
- case list/detail;
- documents;
- secure download;
- Smart Forms;
- chat;
- read/unread;
- direct chat attachment;
- notifications where currently supported;
- no staff route/data leak.

The client portal remains Next.js.

---

## 25. Release QA — Angular staff

Verify through:

```text
https://app.immigrationhorizons.com/staff/
```

At minimum:

- login;
- logout;
- session refresh;
- password-setup flow if applicable;
- dashboard;
- clients;
- cases;
- case membership;
- tasks/deadlines;
- evidence;
- secure documents/download/version;
- client-team chat;
- Smart Forms;
- petition;
- filing packet;
- capability-hidden actions;
- 403/404 behavior;
- direct deep-link refresh;
- mobile/basic responsive layout.

Use at least one non-admin role in addition to an admin/reviewer account.

---

## 26. Release QA — admin

Verify existing Express/EJS:

- login/session persistence;
- dashboard;
- leads;
- users;
- cases;
- tasks;
- documents;
- blog/SEO/media/settings.

Angular admin-console is not cut over.

---

## 27. Rollback hierarchy

### Routing-only rollback

Preferred first response to an Angular staff UI issue:

```text
restore previous app nginx config
nginx -t
reload nginx
```

This returns staff traffic to legacy Next staff.

### Release rollback

If backend/public/client/admin regression exists:

- point `current` to previous release;
- reload PM2 with previous ecosystem config;
- verify public/portal/admin.

### Database

No destructive down migration is assumed.

Indexes are additive and normally remain.

For an actual data-corruption event, follow backup restore procedure rather than improvising reverse writes.

---

## 28. Main-branch release decision

Do not merge the enterprise branch to `main` as part of implementation work automatically.

Release Gate implementation ends with:

- cutover code complete;
- exact enterprise SHA green;
- release report complete;
- deployment runbook complete;
- production operator checklist ready.

Then STOP for explicit release approval.

After approval:

1. confirm backup/preflight;
2. merge/fast-forward through normal GitHub review;
3. CI must be green on exact `main` SHA;
4. existing deploy workflow deploys code;
5. perform Step A smoke checks;
6. apply/review production indexes/migrations as approved;
7. perform nginx Step B cutover;
8. manual QA;
9. observe;
10. rollback if necessary.

---

## 29. Observability

At cutover watch:

- GitHub deploy result;
- PM2 status/restarts;
- `ih-web` logs;
- `ih-admin` logs;
- nginx access/error logs;
- staff API 401/403/409/5xx;
- MongoDB connection/index errors;
- document download/storage errors;
- public lead/email failures.

Do not add a new observability platform solely for this cutover.

Use what production already has unless a blocker is found.

---

## 30. Release success definition

Release Gate 01 is complete when production can serve:

```text
public Next site
+
Next client portal
+
Angular staff case-management
+
Express canonical /api/v1
+
Express/EJS admin CMS
```

with smoke/manual QA green and rollback proven/documented.

At that point the product is deployable without first implementing USCIS Tracking.

---

## 31. Post-release roadmap

After a successful observation window:

1. Phase 11 — USCIS Tracking;
2. calendar/reminders;
3. search/reporting;
4. Angular CMS/admin as needed;
5. legacy retirement only after parity/observation.

Deadline pressure must not turn those post-filing/administrative capabilities into blockers for the first Angular staff production cutover.
