# DATABASE.md

# Immigration Horizons Database Architecture

Version: 2.0

---

# Purpose

This document defines the data architecture for Immigration Horizons — both what exists in the database today and the target model the platform is being built toward.

It is split into two parts:

- **Part 1 — Current Implementation**: matches the actual Mongoose schemas in `server/models/` right now. Keep this in sync with the code; if you change a schema, update this section in the same change.
- **Part 2 — Target Architecture**: the long-term data model (CRM, Clients, Cases, Petitions, Documents, Audit Logs, Analytics). This is the product specification for where the platform is going, not a bug list. Do not treat gaps here as things to silently "fix" — they're scoped work for a future phase.

---

# Part 1 — Current Implementation

# Database Stack (actual)

- **Database**: MongoDB
- **ODM**: Mongoose
- **Auth**: `express-session` + `connect-mongo` (session store in Mongo), not a custom `Sessions` collection
- **Password hashing**: **bcryptjs**, not Argon2 — `UserSchema.pre('save')` in `server/models/admin/User.js` hashes with `bcrypt.genSalt(12)`
- **Email**: Resend (site's `src/lib/leads.ts`), not Gmail SMTP
- **Validation**: plain Mongoose schema validation — no Zod layer on the backend yet

# Current Collections

All models live in `server/models/` (root: `BlogPost`, `Comment`, `Consultation`) and `server/models/admin/` (the rest).

## Consultation (the "Lead")

The core entity. There is no separate Lead → Client → Case → Petition chain yet — a `Consultation` document *is* the lead, and it carries its own lifecycle via `status`, plus everything else (tasks, activity, delivery) references it directly by `lead: ObjectId`.

Shared exactly with the legacy site and the Next.js site's own copy (`src/lib/models/Consultation.ts`) — same collection name, same enum, same field names, so a lead submitted through either frontend shows up in the same admin dashboard.

## AdminUser

Roles enum (already richer than "just admin/editor"):

```
super_admin, admin, editor                                   — original roles, kept for back-compat
pm, petition_writer, business_plan_specialist,
recommendation_letter_specialist, uscis_forms_specialist,
evidence_collector, reviewer, viewer                          — added for lead-ops (see Permissions below)
```

Permissions are **not** a separate configurable collection yet — see Part 1 Permissions below for the actual (coarser) model.

## Task

Tied directly to a `Consultation` (`lead: ObjectId, ref: 'Consultation'`), not to a Case/Petition entity. Fields: `type` (Petition Writing, Business Plan, Recommendation Letters, Expert Opinion Letters, USCIS Forms, Evidence Review, Client Follow-Up, QC Review, Package Assembly, Delivery, Other), `status` (todo/in_progress/waiting/review/completed), `priority`, `assignee` + `assigneeName` (denormalized so a task still displays if the assigned user is later removed), `dependencies` (self-referencing), `sprint` (ref `Sprint`), `attachments`.

## Sprint

Simple: `name`, `goal`, `startDate`, `endDate`, `status` (planning/active/completed). Tasks link to a sprint via `Task.sprint`.

## ActivityLog

Append-only, per-lead event log — powers the lead detail page's timeline. Fixed `type` enum: `received, contacted, assigned, note_added, task_created, task_completed, status_changed, file_uploaded, message_sent, package_delivered`. This *is* the current audit trail for lead activity — there is no separate general-purpose `AuditLogs` collection covering the rest of the admin (blog edits, settings changes, etc.) yet.

## Notification

In-app only right now (no email/SMS/push delivery for notifications themselves — that's separate from lead email via Resend). Typed (`new_lead`, `lead_assigned`, `task_assigned`, `task_overdue`, etc.), targeted by `recipientId` or `recipientName` (so it works for both DB-backed users and the env-credential fallback admin), links back to `relatedLead`/`relatedTask`.

## DeliveryRecord

Tracks the "final package to client" state per lead: `state` (drafting/internal_review/client_review/ready/delivered), `method` (email/dashboard/both), `files[]` with per-file status. **Real file generation (PDF bundle/ZIP) is not wired up** — this is a clean tracking record for a workflow that's usable now, with export completion deferred.

## BlogPost, Comment, FAQ, Testimonial, SEOMeta, Media, Setting, InternalNote

Standard CMS-support collections backing the admin's Blog, FAQs, Testimonials, SEO, Media, and Settings sections. No versioning on `Media` yet; uploads are local-disk (`server/public/uploads/`).

# Current Auth & Permissions Model

Not full RBAC with a configurable permissions matrix — it's two layers:

1. **Page-level gate**: `requireAdmin` (`server/middleware/auth.js`) — a single boolean session check (`req.session.isAdmin`), used for most admin routes.
2. **Lead-ops role gate**: `server/utils/permissions.js` — coarser than the 11-role enum suggests. Only two buckets actually matter for authorization:
   - `MANAGER_ROLES = ['super_admin', 'admin', 'pm']` — can assign leads/tasks, create sprints, change delivery state, delete records.
   - `READ_ONLY_ROLES = ['viewer']` — blocked from all mutations.
   - Every other role (`petition_writer`, `business_plan_specialist`, etc.) behaves like a full read-write user for now — the role exists on the user record and shows up in `ROLE_LABELS` for display, but doesn't yet gate access to specific modules.

Do not describe this as "full RBAC" in current-state language elsewhere in the docs — it's a two-tier manager/read-only split today, with room to grow into per-role permissions later (see Target Architecture).

---

# Part 2 — Target Architecture

The following describes the platform this project is being built toward. None of it exists in the current schema. This is the product specification, not a defect list — treat it as scoped future work, and don't rewrite Part 1 to match it.

## Planned Collections

```
Users
│
├── Roles              (configurable, not a hardcoded enum)
├── Permissions         (per-role, independently assignable)
├── Sessions            (device/browser/IP/last-activity tracking, beyond the current connect-mongo store)
│
Leads
│
└── Clients             (a Lead converts into exactly one Client)
      │
      ├── Cases
      │     ├── Petitions
      │     ├── Tasks    (currently tied to Lead directly, not Case/Petition)
      │     └── Documents (first-class, versioned, not DeliveryRecord.files)
      │
      └── Communications

CMS
│
├── Blog / Categories / Tags / Media (versioned) / SEO

System
│
├── Notifications (queue-based, multi-channel: in-app + email + future SMS/push)
├── Audit Logs (platform-wide, not just per-lead ActivityLog)
├── Settings
└── Analytics
```

## Planned: Roles & Permissions

Move from the current hardcoded `MANAGER_ROLES`/`READ_ONLY_ROLES` split to a real `Roles` + `Permissions` collection pair, independently assignable per module (Leads, Clients, Cases, Petitions, Documents, Blog, SEO, Settings, Audit Logs, etc.), so access control doesn't require a code change to adjust.

## Planned: Client / Case / Petition hierarchy

Introduce `Clients` (created when a Lead is won), `Cases` (one client, multiple immigration matters — EB-2 NIW, EB-1A, etc.), and `Petitions` (the actual petition work item within a case: eligibility → evidence → draft → QA → forms → submission → RFE → completion). Today's `Task`/`ActivityLog`/`DeliveryRecord` all reference `Consultation` directly; migrating them to reference `Case`/`Petition` instead is part of this work, not a rename done casually.

## Planned: Documents as first-class entities

Versioned, with preview/download/replace/history/tags/category/owner, replacing today's `DeliveryRecord.files` array and local-disk `Media` uploads. Needs cloud storage (S3/Cloudinary) first — local disk doesn't survive a move to a multi-instance or ephemeral host (flagged already in the deployment docs).

## Planned: Platform-wide Audit Logs

Today's `ActivityLog` only covers per-lead events. A general `AuditLogs` collection would also cover blog publishing, settings changes, user/role changes, login/logout — anything sensitive across the whole admin, not just the lead-ops module.

## Planned: Analytics collection

Business metrics (lead sources, conversion rate, blog performance, traffic) as stored, queryable data — not yet implemented; today's `/admin/contact-form` only shows integration *status*, not analytics.

---

# Development Standards (applies to both current work and future migrations)

- Use `ObjectId` references, not embedded duplication.
- Prefer soft deletes for anything user-facing (not yet applied everywhere in the current schema — e.g. `Testimonial`/`FAQ` deletes are currently hard deletes; treat this as a gap to close deliberately, not silently).
- Validate all inputs — currently via Mongoose schema validation; Zod is part of the target stack (see `FRONTEND_ARCHITECTURE.md`), not yet wired into the backend.
- Keep schemas modular; index searchable fields.
- Maintain backward compatibility — see the `AdminUser.role` enum's own comment (`// Original roles — kept for back-compat with existing accounts`) as the model to follow.

---

# Success Criteria

The database should eventually support multi-user collaboration, high-volume lead management, complex petition workflows, SEO-driven CMS, enterprise reporting, and future AI automation — without requiring a rewrite of what's built today. The current schema already gets partway there (Task/Sprint/Notification/ActivityLog/DeliveryRecord are real and working); the Target Architecture section above is the remaining distance.
