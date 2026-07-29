# ARCHITECTURE.md

# Immigration Horizons Technical Architecture

> This document defines the software architecture for Immigration Horizons: what's actually built today, and what it's being built toward. Every engineer and AI agent must understand and follow these architectural principles before implementing new features — and must not confuse the two sections below.

---

# Purpose

The architecture must support scalability, maintainability, performance, security, developer experience, SEO, modular development, and future expansion. The project should evolve into a complete immigration operations platform rather than staying a simple marketing website — but "should evolve toward" is a Target Architecture statement, not a description of what exists now.

---

# Part 1 — Current Implementation

# Actual Repository Structure

This repo (`Immigration-Horizons`) is the split-out new stack. It is **not** a single monorepo with `web/`/`legacy/` subfolders — that structure describes the *old*, pre-split monorepo and no longer applies.

```
/                       ← this repo's root IS the Next.js app
├── src/
│   ├── app/             routes (App Router)
│   ├── components/      layout/, sections/, seo/, ui/, service/
│   └── lib/             content/, models/, db.ts, leads.ts
├── server/              standalone Express + EJS admin CMS (separate app, own package.json)
└── public/
```

The legacy Express+EJS site (the original production site) lives in its own separate repo (`Immigrationhorizons`), not inside this one at all.

# Actual System Architecture

Two independently deployed Node processes sharing one MongoDB cluster:

```
Public Website (Next.js, this repo's root)  ──┐
                                                ├──▶  MongoDB Atlas (shared `consultations` collection, etc.)
Admin CMS (Express/EJS, server/)            ──┘
```

There is no unified "Public Website → Auth → Admin Dashboard → CRM → Lead Management → Petition Workflow → CMS → SEO Manager → Analytics → Client Portal" pipeline running through one system yet — the admin CMS is a wholly separate application with its own auth, its own routes, and its own rendering (server-rendered EJS, not React). See Part 2 for that unified vision.

# Actual Frontend Architecture

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4.
- Server Components by default; `src/components/layout/header.tsx` is the only Client Component in the whole app.
- Forms use React 19 Server Actions (`app/*/actions.ts` + `useActionState`) directly — there is no separate API layer, no React Hook Form, no Zod, no TanStack Query. See `FRONTEND_ARCHITECTURE.md` for the full current-vs-target stack breakdown.

# Actual Backend Architecture (admin CMS, `server/`)

Traditional Express: routes call Mongoose models directly (`server/routes/admin/index.js`, `server/routes/admin/leadOps.js`). There is no Controller → Service → Repository layering — routes *are* the controller and contain the business logic. This is a real architectural gap versus Part 2's target, not a stylistic choice to preserve.

# Actual Data Layer

See `DATABASE.md` for the full current schema. In short: `Consultation` (the lead) is the central entity; `Task`, `Sprint`, `ActivityLog`, `Notification`, and `DeliveryRecord` all attach to it directly. There is no `Client`/`Case`/`Petition` chain yet.

# Actual Authentication & Authorization

Session-based (`express-session` + `connect-mongo`). A single `requireAdmin` boolean gate for most admin pages, plus a coarser two-tier manager/read-only check (`server/utils/permissions.js`) specifically for the lead-ops module. Not full per-module RBAC yet — see `SECURITY.md` and `DATABASE.md` Part 1 for the actual current model.

# Actual Notifications

In-app only, via the `Notification` model — working today. No queueing system, no email/SMS/push delivery for notifications themselves (separate from lead-notification email, which does go out via Resend).

# Actual CMS

Blog: draft/publish via `BlogPost` + admin routes. No revision history, no scheduling. SEO metadata handled per-page via `SEOMeta`.

# Actual Search

`/admin/search` exists as a global search route across the admin's own content. Not yet extended to a unified cross-module search described in Part 2.

# Actual Error Handling & Logging

Standard Express error handling in `server/`; no dedicated logging service yet (console-based). Errors are not currently tracked with a per-request standard response envelope (`{ success, message, data }`) — see `API_ARCHITECTURE.md` for the target format, which doesn't exist yet since there's no JSON API layer to apply it to.

# Actual Performance

Server Components by default, CSS-only animations (no JS animation library — see `FRONTEND_ARCHITECTURE.md`), `next/image`, self-hosted variable fonts. No caching layer beyond Next's own defaults; no Redis.

# Actual Security

Input validation via Mongoose schema constraints (no Zod on the backend yet). File uploads via `multer` with type/size checks. `helmet` and `express-rate-limit` are in place on the admin CMS. See `SECURITY.md` Part 1 for the full current-state list, including the bcrypt (not Argon2) correction.

# Actual Testing

Manual QA per `DEPLOYMENT.md`'s Part 9 verification checklist (build, lint, real end-to-end lead submission, admin login). No automated integration/E2E test suite exists yet.

# Actual Deployment

Single VPS, PM2, nginx reverse proxy, no separate staging environment — see the repo's own `DEPLOYMENT.md` for the actual, detailed, current process (this is the authoritative deployment doc; the process described in Part 2 below and in `.claude/DEPLOYMENT.MD` is aspirational).

---

# Part 2 — Target Architecture

The following is the long-term architectural direction. It is the product specification for what this platform becomes, not a description of a bug or an oversight in Part 1. Do not "fix" Part 1 to match this without a deliberate, scoped decision to do so — several of these are genuine forks in direction (e.g., whether the admin CMS is ever folded into the Next.js app, or stays a separate Express/EJS service).

## Planned High-Level System Architecture

```
Public Website
↓
Authentication
↓
Admin Dashboard
↓
CRM
↓
Lead Management
↓
Petition Workflow
↓
CMS
↓
SEO Manager
↓
Analytics
↓
Future Client Portal
```

Each subsystem modular but sharing common services — implying a unified codebase/API surface rather than two entirely separate deployed apps as exists today. **This is an open architectural question, not a decided migration** — flag it explicitly before starting any work that assumes the admin CMS will be rebuilt inside the Next.js app.

## Planned Layered Architecture

```
Presentation → Application → Business Logic → Data Access → Database
```

Business logic must never live inside UI components or (per the target) inside Express route handlers either — routes → controllers → services → repositories, replacing today's routes-call-Mongoose-directly pattern in `server/`.

## Planned Module Architecture

Every feature: `Components / Hooks / Types / Services / Validation / API / Utils`, self-contained and independently understandable.

## Planned Authentication & Authorization

Full RBAC with a configurable `Roles` + `Permissions` collection pair (see `DATABASE.md` Part 2), replacing today's hardcoded `MANAGER_ROLES`/`READ_ONLY_ROLES` split. Every protected action verifies permissions server-side; never rely on frontend authorization (already true today, just not yet granular).

## Planned Database Architecture

Full collection set: Users, Roles, Permissions, Leads, Clients, Cases, Petitions, Tasks, Documents, Notifications, BlogPosts, Categories, Media, Settings, AuditLogs — see `DATABASE.md` Part 2 for the detailed breakdown.

## Planned File Storage

Documents with version history and access control, on cloud storage (S3/Cloudinary) rather than local disk — required before any move off the current single-persistent-VPS topology.

## Planned Notification System

Queue-based (for scalability), multi-channel: in-app (exists) + email + future SMS + future push.

## Planned Search

Global search across Leads, Clients, Documents, Tasks, Blog, Media, Settings — today's `/admin/search` only covers the admin's existing content types.

## Planned CMS Architecture

Content → Draft → Review → Publish → SEO Validation → Indexing, with scheduling and revision history — none of which exists on `BlogPost` today.

## Planned SEO Engine

Every page automatically generating metadata/OG/Twitter/canonical/JSON-LD/breadcrumbs/sitemap/robots — largely already true on the Next.js site's public pages (see the site's own `CLAUDE.md`); the gap is on the admin/CMS side (no auto-generated schema from CMS content yet).

## Planned Error Handling

Standard response envelope (`success`/`error`/`validation`/`authentication`/`authorization`/`server`) across a real API layer — see `API_ARCHITECTURE.md` Part 2.

## Planned Performance

Redis caching, background job queues — not needed at current scale, revisit when real usage data justifies it.

## Planned Testing Strategy

Manual QA (current) + integration testing + end-to-end testing + regression testing + deployment verification, formalized rather than ad hoc.

## Planned Deployment Architecture

Development → Staging → Production, with a real staging environment (doesn't exist today — see the repo's actual `DEPLOYMENT.md`, which only covers dev → production directly).

## Future Expansion

Client Portal, AI Document Assistant, Workflow Automation, Payment Integration, Calendar Integration, E-Signatures, Business Intelligence, Mobile Application, Third-Party Integrations — the architecture should avoid decisions that would require a rewrite to support these later, but none should be built speculatively ahead of an actual roadmap commitment.

## Architectural Rules (apply to both current work and the migration path)

Never duplicate business logic. Never bypass RBAC once it exists. Never hardcode business rules that should be configuration. Prefer configuration over customization. Design for extensibility. Keep modules loosely coupled. Every architectural decision should improve the long-term health of the platform — and every decision to adopt a piece of Part 2 should be an explicit, discussed choice, not an incidental side effect of an unrelated feature request.

---
# End of ARCHITECTURE.md
