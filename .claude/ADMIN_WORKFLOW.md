# ADMIN_WORKFLOW.md

# Immigration Horizons Operations Workflow

Version: 1.0

---

# Purpose

Describes how work actually moves through the admin CMS today, and the fuller operations workflow this is being built toward. The current implementation is more built-out than a bare CMS — it already has real lead-ops tooling (tasks, sprints, notifications, delivery tracking) — but it's centered on the Lead itself, not a separate Client/Case/Petition hierarchy.

---

# Part 1 — Current Implementation

# Actual Workflow

```
Visitor
↓
Consultation submitted (site or legacy site — same `Consultation`/leads collection)
↓
Lead appears in /admin/leads
↓
Status updated via /admin/leads/:id/status  (free-form status field, not a fixed enforced state machine)
↓
Notes added (/admin/leads/:id/notes), Tasks created (/admin/leads/:leadId/tasks), assigned to a team member
↓
Tasks tracked via /admin/tasks + /admin/sprints (real Kanban-style Task/Sprint models)
↓
Delivery tracked via /admin/delivery (DeliveryRecord: drafting → internal_review → client_review → ready → delivered)
```

There is no enforced `Client`/`Case`/`Petition` conversion step — a lead stays a `Consultation` document throughout its entire lifecycle. "Convert to client" as a distinct action/entity doesn't exist (see Part 2).

# Actual Admin Module List

Dashboard, Leads, Tasks, Sprints, Notifications, Delivery, Blog, SEO, Testimonials, FAQs, Services (SEO overrides), Media, Settings, Contact Form (integration status), Users, Search.

No separate Clients, Cases, Petitions, Documents, Calendar, or Analytics modules exist yet.

# Actual Lead Management

- Sources aren't a structured, validated field yet distinguishing Website/Facebook/Instagram/WhatsApp/etc. — check `Consultation` schema directly before assuming a source-attribution field exists.
- Status is a free-text/enum field on `Consultation`, updated via `/admin/leads/:id/status` — not the long staged pipeline (`New → Contacted → Qualified → Consultation Scheduled → ... → Archived`) described in Part 2; verify the actual enum in `server/models/Consultation.js` before relying on a specific status list.
- Every status change, note, task action, and delivery event is recorded to `ActivityLog` (append-only, per-lead) — this *is* a working activity trail, just scoped to the lead rather than the whole admin.

# Actual Task Management

Real and working: `Task` model tied directly to a `Consultation` (`lead: ObjectId`), with `type` (Petition Writing, Business Plan, Recommendation Letters, Expert Opinion Letters, USCIS Forms, Evidence Review, Client Follow-Up, QC Review, Package Assembly, Delivery, Other), `status` (todo/in_progress/waiting/review/completed), `priority`, `assignee`, `dependencies`, and `sprint` linkage. Managed via `/admin/tasks` and the `leadOps` routes.

# Actual Sprint Management

Real: `Sprint` model (`name`, `goal`, `startDate`, `endDate`, `status`: planning/active/completed). Tasks link to a sprint via `Task.sprint`. Managed via `/admin/sprints`, gated by `requireManager`.

# Actual Team Roles & Assignment

`AdminUser.role` enum already includes lead-ops-specific roles (added in a prior "Phase 9" pass): `super_admin`, `admin`, `editor` (legacy/back-compat) plus `pm`, `petition_writer`, `business_plan_specialist`, `recommendation_letter_specialist`, `uscis_forms_specialist`, `evidence_collector`, `reviewer`, `viewer`. Assignment happens via `/admin/leads/:id/assign`, gated to `MANAGER_ROLES` (`super_admin`, `admin`, `pm`) — see `SECURITY.md` Part 1. The other roles exist for labeling/display today; they aren't yet individually gated to specific modules (see Part 2's fuller RBAC).

# Actual Document/Delivery Workflow

`DeliveryRecord` tracks per-lead delivery state (drafting → internal_review → client_review → ready → delivered) and a `files[]` array with per-file status. **Real file generation (PDF bundle/ZIP export) is not wired up yet** — this is a clean tracking record for a workflow that's usable now, with actual export deferred. This is not the same as a general-purpose, versioned `Documents` module (see Part 2).

# Actual Notifications

Real and working, in-app only: `Notification` model, typed (`new_lead`, `lead_assigned`, `task_assigned`, `task_overdue`, `lead_waiting_on_client`, `lead_in_review`, `lead_package_ready`, `lead_submitted`, `lead_delivered`, `note_added`, `client_response`), targeted by recipient, linked back to the related lead/task. No email/SMS/push delivery of notifications themselves.

# Actual Dashboard

`/admin` — shows lead + content counts and recent activity, per the admin CMS's own `README.md`. Not yet the full widget set described in Part 2 (deadlines, calendar, performance charts, revenue).

# Actual Permissions

See `SECURITY.md` Part 1 — two-tier (`MANAGER_ROLES`/`READ_ONLY_ROLES`), not full per-module RBAC.

# Actual Audit Trail

`ActivityLog` — per-lead only. No platform-wide audit log covering blog edits, settings changes, or user management actions yet.

---

# Part 2 — Target Architecture

The following is the fuller operations platform this is heading toward. Treat it as the product specification, not a punch list of missing features to build opportunistically — each of these is real, scoped work.

## Planned Workflow

```
Visitor → Lead Created → Qualification → Consultation → Client Onboarding
→ Case Creation → Petition Planning → Task Assignment → Quality Review
→ Submission Package → Client Delivery → Case Closed
```

Introducing an explicit "convert lead to client" step, after which `Client` (not `Consultation`) becomes the anchor for `Cases`/`Petitions`/`Documents` — see `DATABASE.md` Part 2.

## Planned Module Set

Dashboard, CRM, Lead Management, Client Management, Case Management, Petition Management, Task Board (exists in simpler form today), Calendar, Documents, Blog CMS (exists), SEO (exists), Analytics, Team Management, Notifications (exists), Settings (exists).

## Planned Lead Status Pipeline

A fixed, enforced staged pipeline (`New → Assigned → Contacted → Qualified → Consultation Scheduled → Proposal Sent → Won/Lost → Client Created`) with source attribution (Website/Facebook/Instagram/WhatsApp/Google Ads/Referral/Manual) as a structured, validated field — replacing today's simpler status field.

## Planned Client Onboarding

Create Client Profile → generate Client ID → upload initial documents → assign Case Manager → create first Case → (future) enable Client Portal access.

## Planned Case & Petition Management

Each Client may have multiple Cases (EB-2 NIW, EB-1A, etc.); each Case has its own Petition workflow (Eligibility Review → Evidence Collection → Research → Recommendation Letters → Business Plan → Petition Draft → Internal QA → USCIS Forms → Final Review → Package Assembly → Client Approval → Submission → RFE handling → Completion). Today, this entire sequence happens against the `Consultation` directly via `Task`/`ActivityLog`/`DeliveryRecord` — migrating it onto `Case`/`Petition` entities is the scoped work, not a rename.

## Planned Full RBAC

Every module protected by configurable, per-role permissions (see `SECURITY.md` Part 2 and `DATABASE.md` Part 2) — replacing today's manager/read-only split with granular access per role per module (e.g. `petition_writer` sees only their assigned petitions, `recommendation_letter_specialist` only that task type, etc.).

## Planned Platform-Wide Audit Log

Beyond today's per-lead `ActivityLog`: login, logout, client created, petition submitted, task completed, blog published, settings changed, user/role changes — across the entire admin, not just lead activity.

## Planned Analytics & Reports

Lead sources, conversion rate, petition types, team productivity, blog performance, marketing ROI — as real stored/queryable metrics, not just the current dashboard's counts.

## Planned Document Management

First-class `Documents` entity with versioning, preview, approval workflow — replacing `DeliveryRecord.files` and local-disk `Media` uploads. Needs cloud storage first (see `ARCHITECTURE.md` Part 2).

## Future Expansion

AI Task Assignment, AI Case Assistant, OCR Document Processing, Workflow Automation, eSignature, Payment Tracking, Client Portal, Mobile App — long-horizon items, sequenced behind the more foundational Part 2 work above.

---

# Success Criteria

The Admin Dashboard should let the team manage leads, clients, petitions, documents, tasks, and operations from one centralized platform with complete visibility and accountability. A meaningful amount of this is already real and working today (lead-centric task/sprint/notification/delivery tracking); the Part 2 items are what completes the picture.
