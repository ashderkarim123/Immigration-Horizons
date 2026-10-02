# Immigration Horizons — Phase 04: Case-Native Tasks, Deadlines & Operational Work Management

**Execution branch:** `architecture/angular-enterprise-platform`  
**Verified Phase 03 closure baseline:** `062570a94c1accdf765beecbffee024d69cd773c`  
**Architecture reference:** `docs/architecture/ADR-017-case-native-tasks-and-deadlines.md`

## 1. Purpose

Implement the next real enterprise capability after Phase 03: case-native task management and deadline operations.

Do not reopen completed Phase 03 work. The original Angular roadmap numbering has drifted because dashboard, client/case reads, and canonical case mutations were pulled forward into earlier execution phases. This Phase 04 therefore targets the next genuine architectural gap: tasks remain lead-scoped (`Task.lead -> Consultation`) instead of being first-class case work.

Phase 04 must make tasks usable inside the immigration case workspace without breaking existing lead/task workflows.

## 2. Hard safety rules

- Work only on `architecture/angular-enterprise-platform`.
- Do not deploy production.
- Do not run production migrations or production indexes.
- Do not rewrite, squash, amend, rebase, reset, or force-push Phase 01–03 history.
- Preserve existing lead tasks and admin/EJS workflows.
- Do not weaken Phase 03 auth, row-level access, trusted-origin, DTO, or existence-concealment controls.
- Do not use dependency bypass flags such as `--force` or `--legacy-peer-deps`.
- Do not skip tests merely to get CI green.

## 3. Mandatory preflight

```bash
git fetch origin --prune
git switch architecture/angular-enterprise-platform
git pull --ff-only origin architecture/angular-enterprise-platform

git status --short
git branch --show-current
git rev-parse HEAD
git log --graph --decorate --oneline -25

git diff
git diff --cached

node -v
npm -v
```

Use Node 22.

Expected Phase 03 baseline ancestry must include:

```text
062570a94c1accdf765beecbffee024d69cd773c
```

If newer legitimate documentation commits exist, inspect and preserve them rather than resetting them.

## 4. Required reading

Read before implementation:

```text
CLAUDE.md
AGENTS.md

.claude/DESIGN_SYSTEM.md
.claude/API_ARCHITECTURE.md
.claude/DATABASE.md
.claude/TESTING.md
.claude/SECURITY.md

docs/architecture/ADR-002-case-workspace-domain.md
docs/architecture/ADR-007-admin-case-operations.md
docs/architecture/ADR-009-employee-saas-shell.md
docs/architecture/ADR-010-staff-case-operations.md
docs/architecture/ADR-012-security-privacy-and-audit.md
docs/architecture/ADR-014-migrations-and-retention.md
docs/architecture/ADR-015-angular-enterprise-platform.md
docs/architecture/ADR-016-authentication-boundaries.md
docs/architecture/ADR-017-case-native-tasks-and-deadlines.md

docs/implementation/ANGULAR_ENTERPRISE_PLATFORM_ROADMAP.md
docs/implementation/PHASE_02_WORKING_CORE_PROMPT.md
docs/implementation/PHASE_03_CORE_HARDENING_CASE_OPERATIONS_PROMPT.md
```

Inspect actual current code, including:

```text
server/models/admin/Task.js
server/models/admin/Sprint.js
server/utils/permissions.js
server/services/casePolicy.js
server/services/caseManagement.js
server/routes/api/v1/staff/tasks.js
server/routes/api/v1/staff/dashboard.js
server/routes/api/v1/staff/cases.js
server/routes/admin/index.js
server/routes/admin/leadOps.js
server/openapi/v1.yaml
scripts/migrate.ts
scripts/createIndexes.ts
enterprise-ui/projects/case-management/src/app/features/tasks/
enterprise-ui/projects/case-management/src/app/features/cases/
enterprise-ui/projects/case-management/src/app/features/dashboard/
enterprise-ui/projects/case-management/src/app/core/api/
enterprise-ui/projects/case-management/src/app/shared/
```

Code is authoritative if an older roadmap statement disagrees with the implementation.

## 5. Product goal

At completion, an authorized employee must be able to manage real operational tasks in the context of an immigration case.

The case workspace should support:

```text
Case
├── Tasks
│   ├── title
│   ├── type
│   ├── description
│   ├── assignee
│   ├── status
│   ├── priority
│   ├── due date
│   ├── dependencies
│   └── completion state
└── Deadlines
    ├── case target filing date
    └── task due dates
```

Staff should be able to:

- view authorized tasks;
- view tasks for an accessible case;
- create case tasks when authorized;
- assign only eligible employees;
- edit task details when authorized;
- change status;
- complete and reopen permitted work;
- change due date and priority;
- search/filter/paginate tasks;
- see overdue and upcoming work;
- open the related case directly;
- see case and task deadlines in an operational view.

All permission decisions remain server-side.

## 6. Domain change — make Task case-native safely

The current model requires:

```js
lead: { type: ObjectId, ref: 'Consultation', required: true }
```

Refactor backwards-compatibly.

Add:

```text
case -> ClientCase
```

Do not destructively remove `lead`.

Support mixed historical records during migration.

Valid shapes must be explicitly documented in ADR-017, including:

```text
Legacy lead task:
lead = Consultation
case = null

Transitional/converted task:
lead = Consultation
case = ClientCase

Native case task:
case = ClientCase
lead = corresponding Consultation or null according to ADR-017
```

Never allow a meaningless record with neither a legitimate lead nor case context unless the repository already has a documented non-case task concept.

## 7. Relationship integrity

If both `Task.lead` and `Task.case` exist, they must refer to the same business matter.

Where `ClientCase.consultation` exists, reject a task whose `lead` points to a different Consultation.

Do not trust relationship IDs supplied by Angular.

The backend resolves and validates case/lead consistency.

## 8. Assignment invariant

For a case task, assignment must respect case access.

An assignee must:

1. exist;
2. be active;
3. hold a role that may own relevant work;
4. have active workspace membership unless the documented policy explicitly permits organization-wide access;
5. remain authorized at read/mutation time.

Task assignment must not silently grant workspace access.

Preferred controlled failure when a user is not on the case:

```text
Add this employee to the case team before assigning the task.
```

## 9. Authorization policy

Preserve and extend existing concepts:

```text
tasks.manage
canManageTask()
cases.view
cases.view_all
workspace membership
```

Do not replace the capability system casually.

For case-linked tasks:

- elevated admins follow existing global capability rules;
- managers require task capability plus case access unless a documented `view_all` style capability applies;
- specialists/reviewers may operate on tasks assigned to them only where current ownership semantics permit, and they must still have active case access;
- removing an employee from a workspace must immediately remove access to case task details, even if an old task remains assigned;
- viewer/editor/non-operational roles fail closed according to current policy.

Never authorize solely from a `taskId`, `caseId`, `assigneeId`, route state, or Angular navigation visibility.

## 10. Existence concealment

Preserve Phase 03's case-existence protection.

Where appropriate, the externally observable behavior for these should remain consistent:

- malformed case ID;
- nonexistent case;
- inaccessible case;
- task belonging to another inaccessible case.

Do not create an object-existence oracle.

## 11. Canonical task service

Create or refactor a reusable canonical service, e.g.:

```text
server/services/taskManagement.js
```

Use repository conventions if another name is more appropriate.

It should own real business semantics such as:

```text
loadTaskContext
listTasks
createCaseTask
updateTask
changeTaskStatus
assignTask
setTaskDueDate
setTaskPriority
completeTask
reopenTask
validateTaskAssignment
```

Do not duplicate business rules separately in API routes, Angular, and EJS.

Legacy EJS/admin workflows and the new API should converge on the same service wherever Phase 04 touches task behavior.

## 12. Preserve legacy lead task behavior

Do not break existing production behavior:

- lead assignment;
- specialist ownership;
- task lists;
- sprints;
- delivery workflows;
- lead detail task panels;
- exports/reports;
- existing test fixtures.

Old Task rows with no `case` must continue to load safely.

## 13. Migration/backfill

Add a safe idempotent migration for legacy tasks only where case linkage is unambiguous.

Expected mapping pattern:

```text
Task.lead
  -> Consultation
  -> converted/linked ClientCase
  -> Task.case
```

Rules:

- if exactly one unambiguous case exists, backfill `Task.case`;
- if no case exists, leave unchanged;
- if already migrated, leave unchanged;
- if inconsistent or ambiguous, report and do not guess;
- rerunning must be safe;
- provide dry-run support;
- never execute this migration against production during Phase 04.

Use the existing migration framework.

## 14. Index strategy

Inspect current indexes before adding any.

Evaluate real query patterns such as:

```text
case + status + dueDate
case + assignee + status
assignee + status + dueDate
lead + status
```

Add only justified indexes. Avoid duplicates and redundant prefixes.

Update index dry-run tooling if required.

Do not execute production indexes.

## 15. Case activity

Important case-native task changes should be evaluated for `CaseActivity` events, including:

```text
task_created
task_assigned
task_status_changed
task_completed
task_reopened
task_due_date_changed
```

Default task operational events to staff/internal visibility unless existing product rules explicitly make them client-visible.

Use current actor snapshot/audit conventions.

Do not store full task documents or unnecessary sensitive values in activity metadata.

## 16. Notifications

Reuse existing notification infrastructure where appropriate.

Synchronous assignment/reassignment notifications are reasonable.

Do not introduce a new cron/scheduler architecture solely for due-soon reminders in this phase.

Task persistence must not fail because notification delivery fails.

## 17. Canonical API

Implement intentional contracts under `/api/v1/staff`.

Recommended shape, adapted to current route conventions:

```text
GET    /api/v1/staff/tasks
GET    /api/v1/staff/tasks/:taskId
GET    /api/v1/staff/cases/:caseId/tasks
POST   /api/v1/staff/cases/:caseId/tasks
PATCH  /api/v1/staff/tasks/:taskId
PATCH  /api/v1/staff/tasks/:taskId/status
PATCH  /api/v1/staff/tasks/:taskId/assignee
GET    /api/v1/staff/deadlines
```

Do not add hard DELETE merely for CRUD symmetry. Preserve operational history.

## 18. Global task list

Upgrade the existing staff task endpoint from its current minimal assignee/status behavior.

Support server-side filtering as justified:

```text
search
status
priority
type
assignee
case
scope
due window
overdue
page
page size
```

Default normal employee scope should remain `mine`.

Only managers with proper authorization may use broader scopes such as case/team/all.

Do not expose arbitrary employee work through a broad filter.

## 19. Explicit task DTO

Never return raw Mongoose documents.

Create explicit DTOs containing only intentional fields, e.g.:

```text
id
title
type
description
status
priority
dueDate
completedAt
assignee: { id, displayName }
case: { id, caseNumber, title }
lead: { id, displayName } when appropriate
createdAt
updatedAt
```

Do not return populated Consultation documents or internal fields.

## 20. Task detail and case integration

Task detail should show real work context:

- title;
- description;
- type;
- status;
- priority;
- assignee;
- due date;
- case;
- case number;
- dependencies where supported;
- completion state;
- created/updated timestamps.

Provide a direct link to the associated case workspace.

Do not invent fake comments, subtasks, timers, attachments, or activity models.

Existing Task attachments must be reviewed before exposure; do not assume arbitrary URLs satisfy the secure-document architecture.

## 21. Angular My Tasks

Replace the current minimal tasks table with an operational enterprise page.

Reuse Phase 03 shared components where appropriate:

```text
pagination
status badges
skeleton/loading
empty state
error state
confirm dialog
toast service
icon adapter
```

Required UX:

```text
search
status filter
priority filter
due filter
scope filter when authorized
pagination
responsive table
loading state
empty state
retryable error
```

Useful columns:

```text
Task
Case
Type
Status
Priority
Assignee
Due Date
Updated
```

Overdue work must be identifiable without relying on color alone.

## 22. Case workspace Tasks surface

Integrate tasks into the real case workspace.

The case Tasks surface should load only tasks belonging to the case and support, according to capability:

- view;
- create;
- edit;
- assign;
- status update;
- complete/reopen;
- due date update;
- priority update.

Reuse shared task components/services instead of duplicating the full global task page.

## 23. Create Task workflow

Authorized staff can create a real case task.

Core fields:

```text
title
type
priority
status or safe default
assignee
dueDate
description
```

Safe defaults:

```text
status = todo
priority = medium
```

Backend must resolve and validate:

- case;
- lead compatibility if applicable;
- creator;
- assignee eligibility;
- workspace membership;
- enum values;
- dependencies.

## 24. Status behavior

Preserve current statuses unless ADR-017 deliberately changes them:

```text
todo
in_progress
waiting
review
completed
```

Preserve current completion semantics:

```text
completed -> completedAt set
non-completed -> completedAt cleared
```

Do not invent a restrictive workflow transition graph without product requirements.

## 25. Dependencies

Task already supports dependencies.

Validate at minimum:

- dependency exists;
- task cannot depend on itself;
- dependency belongs to a compatible work context;
- inaccessible cross-case dependencies are rejected;
- obvious circular dependencies should be prevented if a bounded implementation is practical.

Do not build a general DAG workflow engine.

## 26. Deadlines read model

Do not create a new generic Deadline collection in Phase 04 unless ADR-017 proves it is required.

Use authoritative existing dates:

```text
ClientCase.targetFilingDate
Task.dueDate
```

Expose them through a staff read model, e.g. `GET /api/v1/staff/deadlines`.

Support useful filters:

```text
upcoming
overdue
date range
case
assignee where authorized
```

Each deadline DTO should identify its source:

```text
case_target_filing
task_due
```

and return enough context to navigate safely to the related case/task.

No deadline response may leak an inaccessible case.

## 27. Angular Deadlines page

Add an operational route such as:

```text
/deadlines
```

Use established route conventions.

First version should be a practical chronological view, e.g.:

```text
Overdue
Due this week
Upcoming
```

or a single filterable list/table.

Do not build the full calendar UI in this phase.

## 28. Dashboard integration

Current dashboard already contains `myOpenTasks` and `myOverdueTasks`.

Ensure those metrics remain correct after case-native migration.

Make recent/open task DTOs case-aware where appropriate.

Do not turn Phase 04 into a dashboard redesign.

## 29. OpenAPI and Angular types

Update:

```text
server/openapi/v1.yaml
```

for every new or changed task/deadline endpoint.

Define explicit schemas and nullable/required fields accurately.

Create Angular API contract types such as:

```text
TaskSummary
TaskDetail
TaskAssignee
TaskCaseRef
TaskListResponse
DeadlineItem
DeadlineListResponse
TaskMutationRequest
```

Avoid `any` in new Phase 04 code. Improve existing touched task/dashboard code where reasonable, but do not expand into a repository-wide typing cleanup.

## 30. Error handling

Use the established API error envelope and semantics.

Angular must handle:

- 400 validation;
- 401 unauthenticated;
- 403 capability denial where appropriate;
- 404 inaccessible/not-found scoped resource;
- 409 conflict;
- 500 unexpected failure.

Do not expose stack traces, Mongo errors, or internal paths.

## 31. Security requirements

Preserve:

```text
EmployeeSession authentication
mustChangePassword enforcement
trusted-origin checks
same-origin mutation strategy
CSRF handling
capability checks
workspace row-level policy
case existence concealment
SecurityEvent conventions
intentional DTOs
```

No localStorage bearer-token auth.

No direct MongoDB access from Angular.

No broad CORS changes.

## 32. Required automated tests

Add database-backed integration coverage proving at minimum:

### Legacy compatibility

- lead-only Task remains valid;
- existing lead task routes continue working;
- task without `case` does not crash new API;
- completion hook semantics remain correct.

### Case task creation

- authorized actor creates task for accessible case;
- case relation persists;
- lead relation follows ADR-017;
- invalid/malformed/inaccessible case handled safely.

### Assignment

- eligible active case member can be assigned;
- unrelated employee rejected;
- inactive employee rejected;
- removed member rejected;
- unauthorized actor cannot reassign;
- specialist cannot mutate another employee's task through ID manipulation.

### Row-level authorization

- assigned specialist with active case membership can access own case task;
- same user cannot access unrelated case task;
- removed workspace member loses access immediately;
- manager without case access does not gain access merely from task ID unless explicit organization-wide permission applies.

### Mutation

- valid update works;
- completion stamps `completedAt`;
- reopening clears `completedAt`;
- invalid status rejected;
- invalid priority rejected;
- invalid assignee rejected;
- cross-case dependency rejected.

### DTO safety

Reject leakage of sensitive fields such as:

```text
password
passwordHash
token
tokenHash
secret
storageKey
privatePath
```

### Deadlines

- accessible task due date appears;
- inaccessible task does not appear;
- accessible case target filing date appears;
- overdue classification is correct;
- date range filtering is correct.

### Angular

Add focused tests for:

```text
task loading
filters
pagination
empty state
error state
mutation success
mutation failure
deadline rendering
capability-aware controls
```

Test observable behavior, not only implementation details.

## 33. Migration tests

Prove:

```text
lead with one unambiguous converted case -> case backfilled
lead without case -> unchanged
already migrated task -> unchanged
rerun -> idempotent
ambiguous/inconsistent relation -> reported and untouched
```

Do not rely on production data.

## 34. UI quality

Reuse the enterprise design system.

Do not add another CSS/component/icon framework unless explicitly approved.

Maintain:

- keyboard accessibility;
- visible focus;
- semantic controls;
- form labels;
- responsive layouts/tables;
- accessible errors;
- no mock operational data.

## 35. Out of scope

Do not implement in Phase 04:

```text
full calendar
USCIS tracking
smart forms
petition drafting
filing packet builder
evidence template engine
document-management rewrite
chat rewrite
Socket.IO/real-time
AI task generation
AI workflow automation
time tracking
billing/payments
client task management
production deployment
production migration execution
production index execution
legacy route retirement
```

## 36. Documentation deliverables

The Phase 04 implementation must leave these docs current:

```text
docs/architecture/ADR-017-case-native-tasks-and-deadlines.md
docs/implementation/PHASE_04_CASE_TASKS_DEADLINES_PROMPT.md
docs/implementation/PHASE_04_CASE_TASKS_DEADLINES_REPORT.md
```

The final report must include:

- starting SHA;
- ending SHA;
- commits;
- schema changes;
- migration behavior;
- indexes;
- API endpoints;
- authorization rules;
- Angular surfaces;
- test counts;
- build results;
- GitHub Actions run/result;
- known limitations;
- production impact;
- rollback plan;
- recommended Phase 05 scope.

## 37. Full local verification

Use Node 22.

### Root

```bash
npm ci --no-audit --no-fund
npm run lint
npx tsc --noEmit

SITE_URL=https://app.example.invalid \
NEXT_PUBLIC_SITE_URL=https://example.invalid \
npm run build

TEST_MONGODB_URI=mongodb://127.0.0.1:27017/ih-ci-root \
npm test
```

### Server

```bash
cd server
npm ci --no-audit --no-fund

TEST_MONGODB_URI=mongodb://127.0.0.1:27017/ih-ci-server \
LOGIN_RATE_LIMIT=1000 \
npm test

cd ..
```

### Angular

```bash
cd enterprise-ui
npm ci --no-audit --no-fund
npm test
npx ng build case-management
npx ng build admin-console
cd ..
```

Then:

```bash
git diff --check
git status --short
```

## 38. Manual QA

Manually verify at minimum:

```text
employee login
My Tasks
filters and pagination
case -> Tasks
create case task
assign eligible case member
reject unrelated assignee
status update
complete task
reopen task
change priority
change due date
unauthorized task access
Deadlines page
overdue display
upcoming display
dashboard task counts
refresh/back navigation
responsive behavior
```

Verify no meaningful browser console errors and no raw model leakage in API responses.

## 39. Git discipline

Suggested focused commits:

```text
docs(phase-04): define case-native task architecture
feat(tasks): add backwards-compatible case task domain
feat(api): add canonical case task and deadline operations
feat(angular): add operational task and deadline workflows
test(phase-04): cover task authorization and migration
docs(phase-04): record implementation and verification
```

Do not force push.

Do not commit secrets, test DB files, generated junk, or unrelated user work.

## 40. Completion gate

Do **not** mark Phase 04 complete unless all are true:

- Phase 03 ancestry preserved;
- ADR-017 followed;
- legacy lead tasks remain compatible;
- Task supports safe case-native relationship;
- case/lead invariant enforced;
- migration is dry-run capable and idempotent;
- no production migration executed;
- workspace membership enforced;
- assignee eligibility enforced;
- canonical task service exists;
- explicit task/deadline DTOs exist;
- canonical API implemented;
- OpenAPI updated;
- Angular My Tasks operational;
- Angular case Tasks surface operational;
- Angular Deadlines operational;
- dashboard metrics remain correct;
- root tests pass;
- server tests pass;
- Angular tests pass;
- ESLint passes;
- TypeScript passes;
- Next.js build passes;
- Angular case-management build passes;
- Angular admin-console build passes;
- `git diff --check` passes;
- no accidental artifacts remain;
- remote GitHub Actions CI is green.

Local success alone is not completion.

## 41. Push and closure

When all local gates are green:

```bash
git status
git diff --check
git log --oneline --decorate -15
```

Push normally only to:

```bash
git push origin architecture/angular-enterprise-platform
```

A suitable Phase 04 feature/closure commit is:

```text
feat(phase-04): add case-native tasks and deadlines
```

After push, inspect GitHub Actions.

If remote CI is red, Phase 04 is not complete. Fix the failure in a new commit and push normally; do not rewrite previous commits.

## 42. Stop condition

When Phase 04 is green, stop and report:

```text
starting SHA
ending SHA
commits
schema changes
migration behavior
indexes
API endpoints
authorization model
Angular functionality
root test result
server test result
Angular test result
build results
GitHub Actions run/result
known limitations
production impact
recommended Phase 05 scope
```

Do not begin Phase 05 automatically.
