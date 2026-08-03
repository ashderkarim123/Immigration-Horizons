# 00 — Master Roadmap

## 1. Product vision

Transform Immigration Horizons from a public lead-capture site plus internal admin CMS into a secure immigration case-management and collaboration platform.

The completed platform should support:

- Public consultation intake
- Client activation and login
- Consultation and query tracking
- Lead-to-case conversion
- Case workspaces and controlled membership
- Client and employee messaging
- Secure document collection, review, categorization, and versioning
- Case updates and notifications
- Internal-only collaboration
- Operational dashboards
- Auditing, security controls, deployment, and recovery procedures

## 2. Domain boundaries

### Consultation

A public inquiry, consultation request, or lead. It may exist without an authenticated client and without an active case.

### ClientUser

An authenticated client portal account. It may be linked to multiple consultations and multiple cases.

### ClientCase

An accepted immigration matter or project. Cases are created explicitly by authorized staff.

### CaseWorkspace

The collaboration and authorization container for one case. Membership controls access to case messages, documents, queries, and client-visible updates.

### AdminUser

An internal Immigration Horizons employee or administrator. Internal roles and capabilities remain separate from clients.

## 3. Delivery phases

### Phase 0 — Repository verification

- Review local commits and worktree
- Confirm completed authorization and lead operations
- Run current tests and builds
- Document gaps before new feature work

### Phase 1 — Architecture and shared domain

- Add architecture decision records
- Define shared IDs, actor types, authorization policies, error shapes, and model ownership
- Prepare safe app/test bootstrapping

### Phase 2 — Client authentication and onboarding

- Add `ClientUser`
- Add invitations, activation, login, logout, forgot/reset password
- Link consultations to clients
- Redirect submitters to activation/login guidance
- Add a basic client dashboard

### Phase 3 — Cases, workspaces, and membership

- Add `ClientCase`
- Add explicit lead-to-case conversion
- Add workspaces and members
- Add row-level access policies
- Add basic case pages for admin and client

### Phase 4 — Consultation/query scheduling and tracking

- Add client questions and scheduled consultation records
- Track status, assignment, scheduling, answers, no-shows, and history
- Add unanswered and overdue queues

### Phase 5 — Secure document center

- Add private storage abstraction
- Add ordered categories and templates
- Add requests, uploads, review states, replacements, and versions
- Add download authorization and auditing

### Phase 6 — Team collaboration and chat

- Add channels
- Separate client-visible and internal channels
- Add messages, replies, mentions, attachments, edits, deletion, and read state

### Phase 7 — Notifications and real-time delivery

- Add durable notifications by immutable user ID
- Add unread indicators and preferences
- Add Socket.IO or an equivalent only after durable APIs are complete

### Phase 8 — Admin case operations

- Add case queues, assignments, document review, query handling, member management, and client updates

### Phase 9 — Client portal experience

- Complete dashboard, case timeline, messages, documents, consultations, profile, and security screens

### Phase 10 — Security, compliance, audit, and retention

- CSRF
- Row-level test coverage
- secure sessions
- file quarantine
- audit logging
- retention and deletion policies
- incident and access-review procedures

### Phase 11 — Deployment and observability

- Environment validation
- private storage provider
- shared sessions
- logs and alerts
- backups and restore drills
- health checks and deployment runbooks

### Phase 12 — Analytics and growth integration

- Consent-aware analytics
- UTM and ad click capture
- portal funnel events
- conversion events that never block form submission

## 4. Dependency graph

```text
Architecture/Foundation
    ├── Client Authentication
    │      └── Cases & Workspaces
    │             ├── Query Tracking
    │             ├── Document Center
    │             └── Collaboration & Chat
    │                    └── Real-time Delivery
    ├── Security & Audit (continuous)
    ├── Testing & QA (continuous)
    └── Deployment & Observability (continuous)
```

## 5. Release strategy

### Release 1 — Secure portal foundation

- Client account activation/login
- Consultation linking
- Case conversion
- Workspace membership
- Basic dashboards

### Release 2 — Consultation operations

- Scheduled queries
- Answered/unanswered tracking
- Client-visible responses
- Staff queues

### Release 3 — Secure document workflow

- Private uploads
- Ordered categories
- Review and replacement
- Version history

### Release 4 — Case collaboration

- Channels
- Internal/client-visible messages
- Threads, mentions, unread state

### Release 5 — Real-time and production hardening

- Live events
- notification preferences
- scaling support
- full security and deployment review

## 6. Global acceptance rules

Every release must:

- Preserve existing public forms and admin workflows
- Fail closed on missing roles or membership
- Keep internal content out of client responses
- Include database-backed integration tests
- Add indexes intentionally
- Include rollback notes
- Run public and admin build checks
- Create local commits only unless explicitly instructed to push
