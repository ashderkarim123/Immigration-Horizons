# TESTING.md

# Immigration Horizons Testing Guide

Version: 1.0

---

# Purpose

Defines the testing standards for the Immigration Horizons platform.

Every feature must be tested before deployment.

**Scope note**: sections below mix what's testable today against what exists (Current) with the fuller test scope once Target modules (CRM, Case Management, full Petition Workflow, Documents) are built. Only test what actually exists; don't write test plans against modules that don't exist yet. See `ADMIN_WORKFLOW.md` and `DATABASE.md` for the current-vs-target module breakdown.

---

# Testing Levels

- Unit Testing
- Integration Testing
- End-to-End Testing
- Manual QA
- User Acceptance Testing (UAT)

---

# What Must Be Tested

## Authentication

- Login
- Logout
- Session Expiry
- Password Reset
- Role Access

---

## Lead Management (Current)

- Lead creation (via consultation/contact form submission)
- Lead assignment (`/admin/leads/:id/assign`, manager-only)
- Status updates, notes, activity log entries
- Search & filters on `/admin/leads`
- CSV export

## CRM — Client Creation, Lead Conversion (Target)

No `Client` entity or lead-to-client conversion exists yet — nothing to test here until `DATABASE.md` Part 2's Client model ships.

---

## Task & Sprint Management (Current)

- Task creation against a lead, status transitions, assignment
- Sprint creation/status changes (manager-only)
- Task-to-sprint linkage

## Case Management, Petition Workflow, Documents (Target)

No `Case`/`Petition`/`Document` entities exist yet — see `DATABASE.md` Part 2 and `ADMIN_WORKFLOW.md` Part 2. Nothing to test here until those ship. Today's closest equivalents worth testing now: Task lifecycle (above) and Delivery workflow (below).

## Delivery Workflow (Current)

- Delivery state transitions (drafting → internal_review → client_review → ready → delivered)
- File status tracking (note: real file generation/export is not wired up yet — don't test for actual PDF/ZIP output)

---

## Blog CMS

- Draft
- Publish
- Update
- Delete
- SEO Fields

---

## Dashboard

Verify

- Statistics
- Charts
- Notifications
- Recent Activity
- Role-based Widgets

---

## API (Target — no JSON API exists yet)

Once a real `/api/v1` layer exists (see `API_ARCHITECTURE.md` Part 2), test: Authentication, Validation, Authorization, CRUD Operations, Error Responses. **Today**, test the equivalent server-rendered Express routes and Server Actions directly (form submission, redirect behavior, session-gated access) instead.

---

## Frontend

Verify

- Responsive Layout
- Forms
- Navigation
- Loading States
- Error States
- Accessibility

---

## SEO

Verify

- Meta Tags
- Canonical URLs
- Schema
- Sitemap
- Robots
- Open Graph

---

## Performance

Check

- Lighthouse Score
- Core Web Vitals
- Image Optimization
- Bundle Size
- Lazy Loading

---

# Bug Priority

Critical

- System unusable

High

- Major functionality broken

Medium

- Feature partially affected

Low

- UI or minor issue

---

# Pre-Deployment Checklist

✓ Build Passes

✓ TypeScript Clean

✓ Lint Clean

✓ APIs Tested

✓ Forms Working

✓ Authentication Working

✓ Dashboard Working

✓ CMS Working

✓ SEO Verified

✓ Mobile Tested

✓ No Console Errors

---

# Success Criteria

No critical or high-priority issues remain before production deployment.
