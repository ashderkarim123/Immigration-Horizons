# 15 — Implementation Sequence and Claude Code Handoff

## How to use this package

Give Claude Code one module at a time. Before every module, require it to:

1. Read the relevant module file.
2. Read `00_MASTER_ROADMAP.md`.
3. Inspect `git status` and recent commits.
4. Inspect existing implementation before changing code.
5. Identify completed or overlapping work.
6. Produce a file-level plan.
7. Implement only the current module.
8. Run tests and builds.
9. Commit locally.
10. Stop and report.

## Recommended implementation order

### Cycle 1

- `01_ARCHITECTURE_AND_SHARED_DOMAIN.md`
- `02_CLIENT_AUTHENTICATION_AND_ONBOARDING.md`

Expected outcome:

- Client account activation/login
- Consultation linking
- basic dashboard

### Cycle 2

- `03_CLIENT_CASES_AND_WORKSPACES.md`

Expected outcome:

- Explicit consultation-to-case conversion
- workspace membership
- row-level authorization

### Cycle 3

- `04_CONSULTATION_AND_QUERY_TRACKING.md`

Expected outcome:

- scheduled consultations
- answered/unanswered tracking
- staff queues

### Cycle 4

- `05_DOCUMENT_MANAGEMENT.md`

Expected outcome:

- private document center
- categories
- requests
- review and replacement

### Cycle 5

- `06_TEAM_COLLABORATION_AND_CHAT.md`

Expected outcome:

- channels
- messages
- internal/client separation
- unread state

### Cycle 6

- `07_NOTIFICATIONS_AND_REALTIME.md`

Expected outcome:

- durable notifications
- optional live updates

### Continuous tracks

Apply throughout:

- `10_SECURITY_PRIVACY_AND_AUDIT.md`
- `11_DATA_MIGRATIONS_INDEXES_AND_RETENTION.md`
- `12_TESTING_QA_AND_ACCEPTANCE.md`
- `13_DEPLOYMENT_OBSERVABILITY_AND_BACKUPS.md`

### Later product completion

- `08_ADMIN_CASE_OPERATIONS.md`
- `09_CLIENT_PORTAL_EXPERIENCE.md`
- `14_ANALYTICS_ATTRIBUTION_AND_PUBLIC_FORMS.md`

## Standard Claude Code prompt template

```text
Continue the Immigration Horizons implementation.

Read:
- 00_MASTER_ROADMAP.md
- <CURRENT_MODULE_FILE>.md
- relevant prior module files
- current git log and git status

Rules:
- Preserve the Next.js + Express/EJS architecture.
- Do not redo completed work.
- Implement only this module.
- Keep clients separate from AdminUser.
- Enforce global capability plus row-level membership.
- Add database-backed tests.
- Add safe indexes/migrations.
- Run all relevant tests/builds.
- Commit locally in logical commits.
- Do not push.

Before editing, return:
1. Current state
2. Existing overlapping implementation
3. Files likely to change
4. Data-model changes
5. Authorization changes
6. Test plan
7. Migration/rollback plan

Then implement without waiting unless a destructive or genuinely unresolvable blocker exists.

Final report:
1. Git status
2. Commits created
3. Files changed
4. Models/indexes
5. Routes/screens
6. Authorization behavior
7. Tests and results
8. Build results
9. Migrations
10. Environment variables
11. Security checks
12. Known limitations
13. Recommended next module
```

## Commit guidance

Suggested commit pattern:

```text
docs(architecture): define portal and case boundaries
feat(portal): add client activation and sessions
feat(cases): add case workspace and membership
feat(consultations): add query scheduling and answers
feat(documents): add private case document workflow
feat(collaboration): add channels and messages
feat(notifications): add client and workspace notifications
test(portal): add access and security integration tests
docs(deployment): add portal and storage runbooks
```

Follow repository conventions when different.

## Completion rule

Do not begin a dependent module until the previous module's:

- integration tests pass
- authorization tests pass
- schema/index plan is documented
- build checks pass
- local commit exists
- unresolved risks are recorded
