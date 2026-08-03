# Immigration Horizons — Structured Implementation Plan

**Project:** Immigration Horizons  
**Prepared:** 2026-08-04  
**Architecture:** Next.js public/client application + Express/EJS admin application + MongoDB

This package breaks the implementation roadmap into independent functional modules. Each module contains:

- Purpose and business outcome
- Current baseline
- Scope and exclusions
- Dependencies
- Proposed data models
- Permissions and row-level authorization
- Routes and user journeys
- Security requirements
- Implementation sequence
- Test plan
- Migration and rollout notes
- Acceptance criteria
- A Claude Code handoff prompt

## Recommended reading order

1. `00_MASTER_ROADMAP.md`
2. `01_ARCHITECTURE_AND_SHARED_DOMAIN.md`
3. `02_CLIENT_AUTHENTICATION_AND_ONBOARDING.md`
4. `03_CLIENT_CASES_AND_WORKSPACES.md`
5. `04_CONSULTATION_AND_QUERY_TRACKING.md`
6. `05_DOCUMENT_MANAGEMENT.md`
7. `06_TEAM_COLLABORATION_AND_CHAT.md`
8. `07_NOTIFICATIONS_AND_REALTIME.md`
9. `08_ADMIN_CASE_OPERATIONS.md`
10. `09_CLIENT_PORTAL_EXPERIENCE.md`
11. `10_SECURITY_PRIVACY_AND_AUDIT.md`
12. `11_DATA_MIGRATIONS_INDEXES_AND_RETENTION.md`
13. `12_TESTING_QA_AND_ACCEPTANCE.md`
14. `13_DEPLOYMENT_OBSERVABILITY_AND_BACKUPS.md`
15. `14_ANALYTICS_ATTRIBUTION_AND_PUBLIC_FORMS.md`
16. `15_IMPLEMENTATION_SEQUENCE_AND_CLAUDE_HANDOFF.md`

## Non-negotiable architecture rules

- Keep the public/client application and admin CMS as separate applications.
- Do not merge clients into `AdminUser`.
- A consultation is a lead, not automatically a case.
- A case workspace is the row-level authorization boundary.
- Client files must never be stored in a public static directory.
- Internal messages, notes, and review comments must never leak to client APIs.
- Every mutating action requires both global capability checks and record-level checks.
- Build durable database-backed functionality before adding real-time delivery.
- Complete and verify one module before beginning the next dependent module.

## Current baseline

The repository already contains:

- Public consultation and contact forms
- MongoDB consultation persistence
- Resend email delivery
- Admin authentication
- Capability-based admin authorization
- Leads, tasks, sprints, notifications, activity logs, and delivery tracking
- Stored-XSS remediation for admin search
- Initial authorization tests and lead operations work may exist in local commits

Before implementing any module, Claude Code must inspect the current git history and avoid duplicating completed work.
