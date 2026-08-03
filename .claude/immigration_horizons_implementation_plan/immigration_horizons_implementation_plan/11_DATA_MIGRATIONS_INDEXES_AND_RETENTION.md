# 11 — Data Migrations, Indexes, and Retention

## Purpose

Introduce new schemas safely, improve query performance, and define how data evolves without risking production records.

## Migration principles

- Additive changes first
- Optional fields before required fields
- Backfill in controlled scripts
- Idempotent migrations
- Dry-run support
- Environment guards
- Backup before production changes
- No `syncIndexes()` in production
- No destructive migration without rollback plan

## Expected schema changes

### Consultation

Add optional:

- `clientUser`
- `convertedCase`
- onboarding metadata

### New collections

- `ClientUser`
- `PortalInvitation`
- `ClientCase`
- `CaseWorkspace`
- `WorkspaceMember`
- `ConsultationInteraction`
- `InteractionHistory`
- `DocumentCategory`
- `CaseDocument`
- `DocumentVersion`
- `DocumentRequest`
- `WorkspaceChannel`
- `ChannelMember`
- `WorkspaceMessage`
- `MessageRevision`
- `ChannelReadState`

## Likely indexes

Review actual queries before finalizing.

```text
ClientUser.normalizedEmail unique
PortalInvitation.tokenHash unique/selective
PortalInvitation.expiresAt TTL
ClientCase.caseNumber unique
ClientCase.primaryClient + status
ClientCase.projectManager + status
WorkspaceMember.workspace + identity unique
WorkspaceMember.workspace + status
ConsultationInteraction.clientUser + status + createdAt
ConsultationInteraction.assignedTo + status + scheduledFor
DocumentCategory.case + order
CaseDocument.case + category + status
DocumentRequest.case + status + dueDate
WorkspaceChannel.workspace + order
WorkspaceMessage.channel + createdAt
ChannelReadState.channel + workspaceMember unique
Notification recipient + readAt + createdAt
```

## Index deployment script

Provide a dedicated script that:

- Lists intended indexes
- Supports dry run
- Refuses unsafe environments
- Calls `createIndexes()` only
- Logs success/failure
- Never drops indexes

## Backfill examples

- Normalize existing consultation emails.
- Link consultations to existing client accounts only through verified matching rules.
- Add missing display snapshots where required.
- Convert legacy notification recipient names to immutable IDs where unambiguous; preserve unresolved records.

## Retention categories

Define policies for:

- Expired invitations
- Password-reset tokens
- audit logs
- chat messages
- archived documents
- deleted accounts
- closed cases
- analytics attribution
- temporary uploads/quarantine

Do not implement automatic deletion until policy is approved.

## Acceptance criteria

- Every migration is idempotent.
- Production connection is guarded.
- Backups and rollback are documented.
- Indexes match real query shapes.
- No migration silently discards unresolved data.

## Claude Code handoff

Create migration and index scripts alongside each module. Do not run them against production. Include dry-run output and verification commands in the final report.
