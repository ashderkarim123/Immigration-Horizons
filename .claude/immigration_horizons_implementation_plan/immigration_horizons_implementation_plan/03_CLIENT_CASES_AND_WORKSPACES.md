# 03 — Client Cases, Workspaces, and Membership

## Purpose

Create a formal case layer between leads and operational work, and use workspace membership as the primary row-level authorization boundary.

## Dependencies

- Client authentication
- Existing lead operations
- Existing AdminUser and capability system
- Activity logging
- Notifications

## Data models

### ClientCase

Fields:

- `caseNumber`
- `title`
- `caseType`
- `status`
- `consultation`
- `primaryClient`
- `additionalClients`
- `projectManager`
- `createdBy`
- `openedAt`
- `targetFilingDate`
- `filedAt`
- `closedAt`
- `priority`
- `currentStage`
- `description`
- `archivedAt`
- timestamps

Suggested statuses:

- `intake`
- `strategy`
- `document_collection`
- `drafting`
- `review`
- `client_review`
- `ready_to_file`
- `filed`
- `uscis_pending`
- `approved`
- `denied`
- `closed`
- `archived`

Keep case stages centralized and configurable enough for multiple services.

### CaseWorkspace

Fields:

- `case`
- `name`
- `status`
- `settings`
- `createdBy`
- timestamps

### WorkspaceMember

Fields:

- `workspace`
- `memberType`: `client` or `employee`
- `clientUser`
- `adminUser`
- `workspaceRole`
- `status`
- `joinedAt`
- `invitedBy`
- `removedAt`
- timestamps

Enforce exactly one identity field according to `memberType`.

## Case conversion workflow

Manager action: `Convert consultation to case`

Inputs:

- Case type
- Title
- Primary client
- Additional clients if applicable
- Project manager
- Initial employees
- Target filing date
- Priority

Transaction steps:

1. Verify capability.
2. Verify consultation exists.
3. Verify consultation is not already converted.
4. Verify client linkage or create a controlled invitation.
5. Create case.
6. Create primary workspace.
7. Create client membership.
8. Create employee memberships.
9. Create default channels.
10. Create default document categories.
11. Link consultation to case.
12. Log activity.
13. Notify client and team.

Use MongoDB transactions when supported. Otherwise use idempotency and compensating cleanup.

## Authorization policies

### Client

Can access only cases where they have active workspace membership.

### Employee

Requires both:

- Relevant global capability
- Active workspace membership

### Elevated manager/admin

May receive an explicit organization-wide capability. Do not infer organization-wide access from a generic employee role.

## Suggested capabilities

- `cases.view`
- `cases.create`
- `cases.manage`
- `cases.assign`
- `cases.archive`
- `workspace.members.manage`

## Routes

Admin:

- `GET /admin/cases`
- `GET /admin/cases/:id`
- `POST /admin/leads/:id/convert-to-case`
- `POST /admin/cases/:id/members`
- `DELETE /admin/cases/:id/members/:memberId`
- `POST /admin/cases/:id/manager`
- `POST /admin/cases/:id/stage`
- `POST /admin/cases/:id/archive`

Client:

- `GET /portal/cases`
- `GET /portal/cases/:id`
- `GET /portal/cases/:id/team`

## UI requirements

Admin case detail:

- Case summary
- Primary client
- Project manager
- Members
- Current stage
- deadlines
- consultations/queries
- document status
- recent activity
- channel summary

Client case overview:

- Case title and type
- Current client-visible stage
- Team members intended for client display
- outstanding requests
- next scheduled consultation
- recent updates

## Security requirements

- Never authorize from case ID alone.
- Removed members lose access immediately.
- Archived memberships fail closed.
- Client APIs must not expose internal member metadata.
- Case conversion must be idempotent.
- Membership changes must be audited.

## Tests

- Manager converts a consultation once.
- Duplicate conversion is rejected safely.
- Client sees own case.
- Client cannot see another case.
- Assigned employee sees case.
- Unassigned employee is denied.
- Removed employee loses access.
- Missing membership fails closed.
- Membership creation validates active users.

## Acceptance criteria

- Cases are separate from consultations.
- Every case has a workspace.
- Every case client and employee has an explicit membership.
- Row-level policy helpers are centralized.
- Conversion creates all required records safely.
- Existing tasks and lead records remain compatible.

## Claude Code handoff

Implement case, workspace, and membership foundations plus explicit consultation conversion. Do not begin document uploads or chat. Add row-level policy tests before creating broader case functionality.
