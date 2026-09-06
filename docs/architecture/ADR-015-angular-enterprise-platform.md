# ADR-015 — Angular enterprise case-management platform

**Status:** Proposed  
**Date:** 2026-09-06  
**Branch:** `architecture/angular-enterprise-platform`  
**Starting production HEAD:** `e9e04f54a17db1ed4de21b9d08882d0e1225ecd1`

## Context

Immigration Horizons is no longer a marketing website with a small back office. The repository already contains a real immigration operations domain: client identities and sessions, employee identities and capabilities, consultations/leads, client cases and workspaces, case membership, case activity, secure documents and versions, document requests/review, consultation interactions, collaboration channels/messages, notifications, security events, migrations, retention tooling, a client portal, a staff SaaS surface, and an Express/EJS CMS.

The current production topology intentionally exposes three product surfaces:

- `immigrationhorizons.com` — public, indexed marketing/SEO/content application;
- `app.immigrationhorizons.com` — non-indexed client + staff SaaS application;
- `admin.immigrationhorizons.com` — non-indexed Express/EJS administration and CMS.

ADR-008 through ADR-010 established this separation and then made the Next.js SaaS application a second writer for parts of the case domain. That was a pragmatic way to make the staff console operational, but it also creates the central constraint for the next architecture: **a new Angular frontend must not become a third implementation of case business rules or a third direct MongoDB writer**.

The owner has selected Angular as the long-term enterprise frontend for case-working employees and, progressively, for the administrative/CMS experience. The public marketing/SEO application remains Next.js because server rendering, metadata, structured data, sitemap generation, public content routes, and lead acquisition are already mature and are a better fit for that surface.

A separate Vite/React prototype repository exists (`Immigrationhorizons-app`). It contains useful case-management information architecture and UX concepts such as matter dashboards, evidence checklists, form editing, filing packets and USCIS tracking. It is a **product reference only**. Its Vite runtime, Express server, mock data, state model and package configuration are not migration inputs.

## Decision summary

We will migrate by **strangulation**, not replacement.

1. Keep the public Next.js website.
2. Introduce an Angular workspace for enterprise user interfaces.
3. Build two Angular applications in that workspace over time:
   - `case-management` for `app.immigrationhorizons.com` staff operations;
   - `admin-console` for `admin.immigrationhorizons.com` CMS/platform administration.
4. Keep the existing Next.js client portal during the staff migration. It will be split to its own host or migrated only after staff/admin parity is reached.
5. Turn the existing Node/Express service layer into the **canonical application API and canonical write path**.
6. Angular never imports Mongoose models and never talks to MongoDB directly.
7. Existing Next.js and EJS screens remain usable until their Angular replacement has functional, authorization and test parity.
8. Existing MongoDB collection names and domain identities remain authoritative. UI terminology may change without duplicating entities.
9. API contracts become the frontend boundary. Database schemas are backend concerns, not frontend contracts.
10. Every migration is additive, testable and reversible at the routing/deployment layer before legacy code is retired.

## Target product topology

```text
Internet
│
├── immigrationhorizons.com
│   └── Next.js public application
│       ├── marketing
│       ├── services
│       ├── resources
│       ├── blog
│       ├── SEO/schema/sitemap
│       ├── contact
│       └── consultation / lead capture
│
├── app.immigrationhorizons.com
│   ├── Angular case-management application (target)
│   └── Next.js client portal during transition
│
├── admin.immigrationhorizons.com
│   ├── Angular admin-console (target)
│   └── Express/EJS CMS during transition
│
└── nginx
    ├── static Angular assets
    ├── Next.js reverse proxy
    └── /api/v1/* → canonical Node/Express API
                         │
                         ▼
              Controllers / transport
                         │
                         ▼
                Application services
                         │
                         ▼
              Domain policies / guards
                         │
                         ▼
                 Repositories / Mongoose
                         │
                         ▼
                    MongoDB Atlas
```

The API can remain inside the existing Express process initially. A new microservice is **not** required to achieve the boundary. Splitting processes later is an operational decision, not a prerequisite for good architecture.

## Angular workspace

The preferred low-risk location is a new top-level directory without moving the production Next.js root:

```text
/
├── src/                       # existing Next.js public + transitional portal/staff code
├── server/                    # existing Express backend/CMS; evolves into canonical API
├── enterprise-ui/             # new Angular workspace
│   ├── projects/
│   │   ├── case-management/
│   │   └── admin-console/
│   └── shared libraries
├── docs/
├── scripts/
└── package.json               # existing Next.js package; not replaced
```

The Angular workspace gets its own `package.json`, lockfile, `angular.json` and TypeScript configuration. The root Next.js package is not converted into an Angular package and is not moved during the initial migration.

### Angular baseline

At scaffold time use the latest stable supported Angular 22.x release that is compatible with the production Node runtime. Before scaffolding, record `node --version` locally, in CI and on the VPS; Angular 22's exact Node minor requirement must be satisfied rather than assuming any Node 22 build is sufficient.

Initial Angular choices:

- standalone APIs;
- strict TypeScript/template checking;
- Angular Router;
- SCSS;
- Vitest;
- zoneless where the selected Angular minor supports it cleanly;
- HttpClient;
- Signals for local/feature state;
- RxJS for asynchronous streams and composition where it adds value;
- no SSR for internal staff/admin applications;
- no NgRx by default. Add it only if a measured cross-feature state problem justifies it.

## Angular application architecture

Both applications are domain-first rather than organized as a global collection of components.

```text
src/app/
├── core/
│   ├── api/
│   ├── auth/
│   ├── config/
│   ├── guards/
│   ├── interceptors/
│   ├── permissions/
│   ├── telemetry/
│   └── errors/
├── layout/
├── shared/
│   ├── ui/
│   ├── forms/
│   ├── pipes/
│   └── utilities/
└── features/
    ├── dashboard/
    ├── leads/
    ├── clients/
    ├── cases/
    ├── tasks/
    ├── evidence/
    ├── documents/
    ├── forms/
    ├── petitions/
    ├── filing/
    ├── uscis/
    ├── calendar/
    ├── communications/
    ├── notifications/
    ├── reports/
    ├── cms/
    │   ├── blog/
    │   ├── faqs/
    │   ├── testimonials/
    │   ├── media/
    │   └── seo/
    └── administration/
        ├── users/
        ├── roles/
        ├── settings/
        ├── security/
        └── audit/
```

Features own their pages, routes, domain-facing DTOs, feature services and state. Shared UI cannot contain case authorization or business decisions.

## Product information architecture

### Staff case-management application

Primary navigation:

- Dashboard
- Leads
- Clients
- Cases
- Tasks & Deadlines
- Calendar
- Evidence
- Documents
- Forms
- Petition Work
- Filing
- USCIS Tracking
- Communications
- Notifications
- Reports

The central working object remains `ClientCase`. The UI may call it **Case** or **Matter**, but no new `Matter` collection is created.

A case workspace should progressively expose:

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
- Internal Notes
- Activity / Audit

### Admin console

The admin console is administrative, not the normal place employees work cases. Its target modules are:

- Website dashboard
- Leads/CRM administration where elevated controls are needed
- Users & roles
- Client account administration
- Case administration / break-glass operations
- Blog
- FAQs
- Testimonials
- Media
- SEO metadata/content settings
- Site settings
- Notifications/configuration
- Reports/export administration
- Security events and audit viewers
- Migration/operational status surfaces where safe

Case-working functionality belongs primarily on `app.*`; organization-wide configuration and CMS functionality belongs on `admin.*`.

## Canonical API

The next architecture introduces a versioned JSON contract under `/api/v1`.

The API is built incrementally. Do not create empty speculative endpoints.

Representative resources:

```text
/api/v1/session
/api/v1/me
/api/v1/dashboard
/api/v1/leads
/api/v1/clients
/api/v1/cases
/api/v1/cases/:caseId
/api/v1/cases/:caseId/members
/api/v1/cases/:caseId/tasks
/api/v1/cases/:caseId/evidence
/api/v1/cases/:caseId/documents
/api/v1/cases/:caseId/activity
/api/v1/documents/:documentId/versions
/api/v1/queries
/api/v1/channels
/api/v1/notifications
/api/v1/forms
/api/v1/petitions
/api/v1/filing-packets
/api/v1/uscis
/api/v1/reports
/api/v1/admin/blog
/api/v1/admin/faqs
/api/v1/admin/testimonials
/api/v1/admin/media
/api/v1/admin/seo
/api/v1/admin/users
/api/v1/admin/settings
/api/v1/admin/security-events
```

### API response rules

Use a stable envelope and machine-readable errors. Exact naming will be finalized in the API-foundation cycle, but the contract must distinguish:

- success data;
- validation errors;
- authentication failure;
- authorization/resource concealment;
- conflicts/concurrency;
- rate limiting;
- server errors.

Every response that represents a list must define pagination and filtering semantics. Do not let Angular depend on Mongoose document serialization.

### OpenAPI

Adopt OpenAPI as the transport contract once the API foundation exists. Generate Angular request/response types or a client from the specification rather than hand-maintaining frontend DTO mirrors indefinitely.

OpenAPI does **not** become the database schema. Mongoose models remain backend-owned.

## Canonical write-path convergence

Today both Next.js and Express write portions of the case domain, and ADR-010 maintains semantic parity by duplicating decisions. Angular must not add a third copy.

Migration rule:

```text
BEFORE
Express/EJS ─────→ server services / Mongoose
Next staff ──────→ mirrored Next case operations / Mongoose

TRANSITION
Express/EJS ─┐
Angular ──────┼──→ canonical API/application services → Mongoose
Next staff ───┘   (as screens are migrated or adapted)

TARGET
Angular ─────────→ canonical API/application services → Mongoose
Next client ─────→ portal API/domain path
Public Next ─────→ narrow lead/content integration paths
```

Where server services already exist (`caseManagement`, document services, collaboration services, policies), API controllers call them. Where logic still lives in large Express route handlers, extract the business operation first and let both EJS and API transport call the same service.

Never copy route-handler business logic into Angular.

## Authentication and authorization

Angular does not create a third staff identity/session system.

The existing `EmployeeSession`/`ih_staff_session` design is the preferred staff identity to carry forward for `app.*`. The API foundation must gain middleware capable of validating that session and re-reading the live `AdminUser` role/status, preserving ADR-009/ADR-012 semantics.

The Express CMS's `express-session` login remains separate during migration. Admin-console authentication can be unified later only through a deliberate ADR; no parent-domain cookie is introduced casually.

Rules:

- secure HttpOnly cookies;
- no access or refresh token in localStorage;
- Origin/CSRF protection on mutations;
- rate limiting;
- employee lockout remains account-based;
- capability checks are server-side;
- case/workspace row-level checks are server-side;
- Angular guards and hidden navigation are UX only;
- inaccessible case-scoped resources continue to conceal existence where current policy requires it;
- all material mutations append the appropriate case/security/audit event.

## Domain strategy

### Preserve existing identities

Do not create duplicates for concepts already represented:

- `ClientCase` remains the case/matter aggregate.
- `ClientUser` remains the authenticated client identity.
- `CaseWorkspace` + `WorkspaceMember` remain access/team primitives.
- `CaseActivity` remains case history.
- `CaseDocument` and document-version/request/category models remain the secure-document foundation.
- consultation interactions remain the query/consultation communication foundation.
- collaboration channels/messages remain the in-case conversation foundation.
- `SecurityEvent` remains authentication/account/refusal audit.

### Models that require a future design cycle

The following enterprise capabilities should not be implemented as ad-hoc fields. Each needs a scoped ADR/domain design before code:

1. **Case-scoped tasks and deadlines.** Current `Task` is lead/consultation-scoped. Introduce a backwards-compatible case relationship before any Angular UI pretends tasks are case-native.
2. **Evidence checklist.** Reuse secure documents and document requests for the actual evidence files. Add a requirement/template concept only if the audit proves categories/requests cannot express reusable petition-specific checklists.
3. **Smart forms.** Needs template versions, form instances, typed fields, validation, status and audit. UI state from the reference prototype is not persistence design.
4. **Petition/workflow.** Determine whether one `ClientCase` can contain multiple filings/petitions. If yes, a separate petition/work-item entity is justified; if no, do not duplicate the case.
5. **Filing packets.** Needs explicit packet/item ordering, immutable snapshots/versions, review state and generated artifact provenance.
6. **USCIS tracking.** Needs receipt/case identifiers and append-only status events, with a documented data source and polling/manual-import policy. No unsupported scraping assumption.
7. **Calendar/deadlines.** Define authoritative deadline sources, timezone semantics and reminder ownership.

## CMS migration

Do not rebuild the CMS from scratch.

For each CMS module:

1. identify current EJS routes, models, sanitization, media behavior and capability checks;
2. extract/reuse service logic if the route currently owns it;
3. expose a tested `/api/v1/admin/*` endpoint;
4. build the Angular admin-console module;
5. run functional and authorization parity tests;
6. deploy Angular route behind a non-destructive path or feature switch;
7. switch navigation only after parity;
8. leave EJS rollback available;
9. remove the EJS surface in a later cleanup cycle.

CMS data must continue driving the public Next.js website from the same authoritative collections during this migration.

## Deployment strategy

Angular is a static browser application and should normally be served by nginx, not PM2.

### Transition

- keep `ih-web` serving the public Next.js app and existing portal/staff routes;
- keep `ih-admin` serving legacy EJS CMS;
- add Angular builds to CI first, without routing production traffic to them;
- introduce nginx path routing for a preview/canary path when the first Angular vertical slice is usable;
- proxy `/api/v1` to the canonical Express API on the same origin as each Angular application to minimize CORS/cookie complexity.

### Target

```text
nginx
├── immigrationhorizons.com → ih-web (Next.js)
├── app.immigrationhorizons.com
│   ├── Angular static case-management UI
│   └── /api/v1 → ih-api
├── admin.immigrationhorizons.com
│   ├── Angular static admin-console UI
│   └── /api/v1 → ih-api
└── portal host or transitional portal routes → Next.js

PM2
├── ih-web
└── ih-api
```

The existing `ih-admin` process is retired only after the Angular admin console and API have replaced its rendering responsibilities. The API may continue to use the same Express codebase even after EJS is removed.

## CI/CD

The current rule that production deploy follows green CI on `main` remains.

Before any Angular code can be considered mergeable, CI must include a dedicated enterprise UI job that performs at minimum:

- deterministic install from lockfile;
- Angular build;
- tests;
- TypeScript/template checking;
- linting once configured.

Root Next tests, server tests and builds remain mandatory throughout migration.

A branch build must never alter production. Production routing to Angular is a separate cutover cycle with explicit smoke tests and rollback.

## Migration and data safety

ADR-014 remains authoritative:

- additive first;
- dry-run by default;
- production apply requires explicit backup acknowledgement;
- idempotent migrations where possible;
- no guessing ambiguous relationships;
- no silent collection renames;
- no destructive enum narrowing in one deployment step.

Every new case-management model/index must document current readers/writers, new readers/writers, compatibility, index rollout and rollback consequences.

## Observability and security hardening

Before Angular owns material production writes, the API should have:

- request/correlation IDs;
- structured server logs with credential redaction;
- centralized JSON error middleware;
- consistent audit recording;
- health/readiness endpoint suitable for deploy checks;
- route-level rate limits appropriate to auth and write actions;
- explicit trusted-origin handling;
- negative authorization integration tests.

Existing security-event, case-activity and document-access logs are preserved rather than replaced by a generic event log.

## Migration phases

0. Architecture baseline and repository protection.
1. Angular workspace + CI only.
2. Canonical `/api/v1` transport foundation.
3. Staff authentication/session bootstrap through API.
4. Angular dashboard read vertical slice.
5. Clients and case list/detail reads.
6. Case assignment/stage/membership writes through canonical API.
7. Case-scoped task/deadline domain migration.
8. Evidence requirements/checklist.
9. Documents, requests, review and versions.
10. Communications, queries and client updates.
11. Smart forms foundation.
12. Petition/workflow domain.
13. Filing packet builder and immutable packet versions.
14. USCIS status/receipt tracking.
15. Calendar, deadline reminders and notifications.
16. Reporting/search/operational dashboards.
17. Angular CMS: blog/FAQs/testimonials/media/SEO.
18. Angular administration: users/roles/settings/security/audit.
19. Retire replaced EJS and Next staff surfaces.
20. Client portal host/runtime decision.
21. AI-assisted workflows only after the deterministic platform is stable.

Each phase is independently shippable or reversible. A later phase never begins merely because an earlier phase compiles.

## First implementation cycle acceptance criteria

The first code cycle after this ADR is **Angular workspace + CI only**. It must not add real database reads/writes.

Acceptance criteria:

- exact Node versions are recorded and Angular compatibility confirmed;
- `enterprise-ui/` is initialized without modifying the root Next.js package;
- Angular workspace contains `case-management` and `admin-console` application shells or a documented reason to stage the second shell one cycle later;
- strict, standalone, routed, SCSS, Vitest configuration;
- common design tokens/layout primitives without case business logic;
- placeholder routes only;
- no MongoDB dependency in Angular;
- no production API secrets in browser environments;
- CI builds/tests Angular in addition to all existing jobs;
- root Next.js lint/type/build/tests still pass;
- server tests still pass;
- deployment workflow does not yet route production traffic to Angular;
- documentation records start/end commits and rollback (`revert` the cycle commits).

## Explicit non-goals

- No big-bang rewrite.
- No Angular rewrite of the public marketing site.
- No direct Angular-to-Mongo access.
- No third staff auth system.
- No duplicate `Matter` model.
- No immediate microservices conversion.
- No speculative NgRx, Redis, Kafka or queue infrastructure.
- No copying mock reference data into production persistence.
- No autonomous AI legal advice, filing decisions or unsupervised client-record mutation.

## Consequences

The system temporarily carries three frontend technologies: public/transitional Next.js, new Angular enterprise UI, and legacy EJS. This is deliberate migration cost, not the target state.

The benefit is that existing production security/domain work remains useful while presentation is replaced safely. More importantly, the migration creates one canonical application boundary so future web, portal, mobile, automation and AI clients consume the same rules instead of reproducing them.

The architecture can therefore grow into a full immigration operations platform without rewriting the business foundation that already exists.