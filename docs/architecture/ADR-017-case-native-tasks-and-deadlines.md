# ADR-017 — Case-Native Tasks and Deadlines

**Status:** Accepted for Phase 04 implementation  
**Date:** 2026-09-07  
**Branch:** `architecture/angular-enterprise-platform`  
**Phase:** Execution Phase 04 — Case-Native Tasks + Deadlines  
**Baseline:** `062570a94c1accdf765beecbffee024d69cd773c`

---

## 1. Context

Immigration Horizons is migrating staff case-management workflows to the Angular enterprise application while preserving the existing Next.js public site, Express backend/CMS, MongoDB data, and production behavior.

Phases 02 and 03 pulled forward several capabilities that the original Angular roadmap placed later, including:

- staff authentication and session bootstrap;
- Angular dashboard;
- client directory and detail;
- case directory and detail;
- case team and activity reads;
- canonical case mutations;
- stage changes;
- project-manager reassignment;
- workspace membership changes;
- case archiving;
- client-visible case updates.

The next important domain gap is task ownership and deadline handling.

The current task model is lead-centric:

```text
Task.lead -> Consultation
```

`Task.lead` is required. This means work remains attached to a lead even after the lead has become a formal `ClientCase`. That does not match the target enterprise model where the case workspace is the primary operating context.

The platform must make tasks case-native without breaking existing lead tasks, lead assignment workflows, sprints, delivery workflows, reports, or historical data.

---

## 2. Decision summary

Phase 04 will introduce a backwards-compatible optional `Task.case` relationship to `ClientCase` while preserving `Task.lead` during migration.

The canonical work-context rules are:

### Legacy lead task

```text
lead = Consultation
case = null
```

This remains valid.

### Transitional converted-case task

```text
lead = Consultation
case = ClientCase
```

This is the preferred representation when a task originated from a consultation that has been converted into a case.

### Native case task

A new case task will use:

```text
case = ClientCase
lead = ClientCase.consultation when one exists
```

If the case has no consultation relationship, `lead` may be null.

Therefore, after Phase 04, `lead` is no longer universally required.

At least one work context must exist:

```text
Task.case != null OR Task.lead != null
```

A task with neither a case nor lead is invalid unless a later ADR deliberately introduces organization-level tasks.

No such organization-level task type is introduced in Phase 04.

---

## 3. Relationship invariant

If both `Task.case` and `Task.lead` exist, they must describe the same business matter.

Where the case has a consultation reference:

```text
ClientCase.consultation
```

then:

```text
Task.lead == ClientCase.consultation
```

must hold.

The API and canonical task service must reject a request that attempts to combine a case with an unrelated consultation.

Angular-supplied IDs are never trusted to establish the relationship.

The backend resolves the case and derives or validates the lead relationship.

---

## 4. Why `lead` remains during migration

Removing `Task.lead` immediately would create unnecessary production risk.

Existing functionality already depends on lead-scoped tasks, including:

- lead detail pages;
- assignment workflows;
- specialist work queues;
- sprints;
- delivery flows;
- exports and reports;
- historical task records;
- existing integration tests.

Phase 04 therefore uses an additive schema change.

No destructive migration is required.

Existing Task records remain readable and valid.

Legacy EJS code must tolerate tasks with or without `case`.

---

## 5. Canonical ownership of task behavior

Task business rules must live in a reusable server-side application service rather than Angular or route handlers.

Phase 04 should create or extract a service equivalent to:

```text
server/services/taskManagement.js
```

The service should own real semantics for operations such as:

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

The exact function names may follow repository conventions.

Legacy EJS routes and `/api/v1` routes should converge on these rules wherever Phase 04 touches task behavior.

Angular must never become a separate source of task-domain truth.

---

## 6. Authorization model

Task authorization remains layered.

A case-linked task requires both appropriate task authority and case access.

The existing capability and ownership concepts remain authoritative:

```text
tasks.manage
canManageTask()
cases.view
cases.view_all
workspace membership
```

### Elevated administrators

A `super_admin` or another actor with an explicit organization-wide case capability may operate according to the existing capability matrix.

No implicit bypass is introduced.

### Project managers / managers

A manager must have the relevant task capability and case access unless an existing explicit organization-wide capability authorizes otherwise.

### Specialists / reviewers

Existing ownership-scoped semantics remain in force.

A specialist or reviewer may manage a task assigned to them only when:

1. the existing role/task policy permits it; and
2. they retain active access to the associated case.

An old assignment must not preserve case access after the employee is removed from the workspace.

### Other roles

Viewer, editor, missing/unknown roles, and other non-operational actors fail closed according to the existing capability map.

### Security rule

No endpoint may authorize from any one of these values alone:

```text
taskId
caseId
assigneeId
Angular route state
```

---

## 7. Assignment invariant

Task assignment must not grant case access.

For an employee to be assigned a case task, the backend must verify:

1. the employee exists;
2. the employee is active;
3. the employee is eligible for task assignment under existing role rules;
4. the employee has active membership in the case workspace, unless an explicit architecture rule already allows organization-wide assignment without membership.

The safe default is to require active workspace membership.

If the employee is not on the case team, assignment must fail with a controlled validation response directing the manager to add the employee to the case first.

Phase 04 must not silently create a workspace membership as a side effect of task assignment.

The case team remains the source of truth for case access.

---

## 8. Case existence concealment

Phase 03 established that case-scoped APIs should not become existence oracles.

For task operations scoped to a case, the external behavior should conceal distinctions among cases that the actor is not permitted to know about.

Where appropriate, the same safe not-found response should cover:

- malformed case ID;
- nonexistent case;
- inaccessible case;
- task belonging to an inaccessible case.

The implementation must preserve existing case-policy behavior rather than returning a revealing `403` simply because an inaccessible record exists.

---

## 9. Task lifecycle

The existing task statuses remain authoritative for Phase 04:

```text
todo
in_progress
waiting
review
completed
```

The existing completion semantics also remain:

```text
status = completed     -> completedAt is set
status != completed    -> completedAt is null
```

Phase 04 does not introduce a new restrictive transition graph unless repository inspection finds a previously defined product rule.

The backend validates destination status values.

---

## 10. Task dependencies

The existing `dependencies: [Task]` relationship remains supported.

Phase 04 does not turn task dependencies into a workflow engine.

For case-native tasks, validation should ensure:

- a task cannot depend on itself;
- referenced dependency tasks exist;
- cross-case dependencies are rejected unless a future explicit architecture rule permits them;
- inaccessible case data is never exposed through dependency resolution.

Circular-dependency detection may be implemented if it remains bounded and testable, but full DAG orchestration is out of scope.

---

## 11. Deadlines decision

Phase 04 will not create a new generic `Deadline` collection.

The first enterprise deadline read model will be derived from authoritative dates that already exist:

```text
ClientCase.targetFilingDate
Task.dueDate
```

This avoids creating a second source of truth.

The API may expose a normalized deadline DTO with a source type such as:

```text
case_target_filing
task_due
```

A later calendar/deadline ADR may introduce richer domain concepts for:

- RFE deadlines;
- NOID deadlines;
- evidence deadlines;
- query-response deadlines;
- appointments;
- USCIS events;
- reminders;
- recurring calendar items.

Those concepts are deliberately not modeled in Phase 04.

---

## 12. Deadline authorization

A deadline is not independently authorizable.

Authorization derives from its source object.

A task due date may be returned only if the actor may access that task and its case context.

A case target filing date may be returned only if the actor may access that case.

The deadlines endpoint must never widen case or task access.

---

## 13. API ownership

The canonical task and deadline contract lives under:

```text
/api/v1/staff
```

Recommended task endpoints include:

```text
GET    /api/v1/staff/tasks
GET    /api/v1/staff/tasks/:taskId
GET    /api/v1/staff/cases/:caseId/tasks
POST   /api/v1/staff/cases/:caseId/tasks
PATCH  /api/v1/staff/tasks/:taskId
PATCH  /api/v1/staff/tasks/:taskId/status
PATCH  /api/v1/staff/tasks/:taskId/assignee
```

The exact transport shape may be consolidated where a validated PATCH contract is clearer.

Phase 04 does not add hard task deletion.

Work history should be preserved.

A deadline read endpoint may be added as:

```text
GET /api/v1/staff/deadlines
```

with authorization-aware date-range and operational filters.

---

## 14. DTO policy

Raw Mongoose documents must never become the Angular contract.

The API must map tasks to explicit DTOs.

A task summary/detail contract may expose intentional fields such as:

```text
id
title
type
description
status
priority
dueDate
completedAt
assignee
case
lead
createdAt
updatedAt
```

Nested references must also be intentional DTOs.

For example:

```text
assignee:
  id
  displayName

case:
  id
  caseNumber
  title

lead:
  id
  displayName
```

No raw populated `AdminUser`, `Consultation`, `ClientCase`, or Task object should be spread into JSON.

Sensitive fields remain prohibited.

---

## 15. Migration and backfill

Phase 04 will add an idempotent migration/backfill for legacy lead tasks where case linkage can be derived with certainty.

Safe mapping:

```text
Task.lead
    -> Consultation
    -> convertedCase / matching ClientCase.consultation
    -> Task.case
```

Rules:

### Unambiguous converted lead

If the lead maps to exactly one real case, populate `Task.case`.

### Lead without converted case

Leave `Task.case = null`.

### Already linked task

Leave unchanged after verifying the relationship.

### Inconsistent or ambiguous data

Report it and make no change.

Never guess.

The migration must be:

- dry-run capable;
- idempotent;
- safe to rerun;
- bounded in reporting;
- integrated with the existing migration framework.

Phase 04 must not execute this migration against production.

---

## 16. Index strategy

Indexes should be based on actual queries introduced by Phase 04.

Candidate patterns include:

```text
case + status + dueDate
case + assignee + status
assignee + status + dueDate
lead + status
```

These are not automatically required.

Implementation must inspect existing indexes first and avoid duplicate or prefix-redundant indexes.

Any required index additions must be represented in the existing index tooling and dry-run verification.

No production index execution occurs in Phase 04.

---

## 17. Case activity and audit

Important task changes on a case are legitimate internal case events.

Phase 04 may add `CaseActivity` event types such as:

```text
task_created
task_assigned
task_status_changed
task_completed
task_reopened
task_due_date_changed
```

These events should use established actor snapshots and auditing conventions.

Task activity is internal by default.

No task event becomes client-visible merely because it exists in `CaseActivity`.

Metadata should be minimal and intentional.

Do not persist whole task documents inside activity metadata.

---

## 18. Notifications

Existing notification services should be reused where appropriate.

Assignment and reassignment are reasonable synchronous notification triggers.

Core task persistence must not depend on notification delivery succeeding.

Phase 04 does not introduce a new scheduler solely for due-soon or overdue reminders.

Scheduled reminders belong to the later calendar/reminder phase unless existing infrastructure already provides a suitable mechanism without new architecture.

---

## 19. Angular application decision

The Angular case-management application will expose two task contexts:

### Global operational task view

A real `My Tasks`/task directory with server-side filters, pagination, loading, empty, error and responsive states.

The default scope for normal employees is their own assigned work.

Broader scopes are exposed only where server authorization explicitly permits them.

### Case workspace task view

A case Tasks panel/tab loads only tasks belonging to the selected authorized case.

The panel may expose create/edit/assign/status/due-date/priority controls according to capabilities.

The global and case task views must share DTOs and reusable Angular services/components rather than implement separate business rules.

---

## 20. Angular deadlines decision

Phase 04 adds a simple operational deadlines surface rather than a calendar grid.

It may group or filter items as:

```text
Overdue
Due this week
Upcoming
```

or present one chronological filterable list.

The page consumes the canonical deadline read model.

A full calendar is deliberately deferred.

---

## 21. OpenAPI and Angular typing

Every new or changed task/deadline endpoint must be documented in the v1 OpenAPI contract.

Angular should use explicit API contract types for Phase 04, for example:

```text
TaskSummary
TaskDetail
TaskAssignee
TaskCaseRef
TaskListResponse
TaskMutationRequest
DeadlineItem
DeadlineListResponse
```

New task/deadline code should not use `any` as the default contract type.

Angular types represent API DTOs, not MongoDB models.

---

## 22. Security boundaries preserved

Phase 04 must not weaken any Phase 03 security control.

The following remain mandatory:

```text
EmployeeSession authentication
mustChangePassword enforcement
trusted-origin checks
same-origin mutation strategy
CSRF protections
capability checks
workspace row-level policy
case existence concealment
SecurityEvent conventions
explicit DTO mapping
```

Angular never connects directly to MongoDB.

No localStorage bearer-token authentication is introduced.

No broad CORS policy is introduced.

---

## 23. Compatibility requirements

Phase 04 must preserve existing behavior for:

- lead-only tasks;
- lead assignment workflows;
- specialist ownership rules;
- sprints;
- delivery workflows;
- existing reports/exports;
- existing admin CMS task surfaces;
- existing test fixtures.

Mixed datasets are expected during migration.

Every touched read path must tolerate both:

```text
Task.case = null
Task.case != null
```

---

## 24. Consequences

### Positive

- Cases become the primary operating context for new enterprise work.
- Existing lead task history remains valid.
- Angular receives one canonical task contract.
- Workspace membership remains the source of truth for case access.
- Task assignment cannot silently expand permissions.
- Deadlines become operationally useful without introducing a premature calendar schema.
- Later evidence, petition, filing, search and reporting phases can reference real case-native work.

### Costs

- The system temporarily supports two task contexts: lead-only and case-linked.
- API/service code must handle mixed records carefully.
- Migration/backfill logic is required.
- Legacy EJS and Angular surfaces must coexist during transition.

These costs are preferable to a destructive migration or a second task system.

---

## 25. Rejected alternatives

### A. Replace `Task.lead` with `Task.case` immediately

Rejected because it would break existing production behavior and historical records.

### B. Create a second `CaseTask` collection

Rejected because it would duplicate task semantics, split reporting/history, and force the platform to maintain two workflow engines.

### C. Make task assignment automatically add workspace membership

Rejected because assignment would become a hidden authorization mutation and weaken the case-team source of truth.

### D. Create a generic Deadline collection now

Rejected because Phase 04 only needs dates already owned by `ClientCase` and `Task`. A generic deadline model would introduce overlapping sources of truth before richer deadline requirements are defined.

### E. Authorize specialists from task assignment alone

Rejected because an old/stale task assignment must not preserve case access after workspace removal.

---

## 26. Phase 04 implementation gate

Phase 04 must not be marked complete until all of the following are true:

- `Task.case` is implemented backwards-compatibly;
- at least one of `Task.case` or `Task.lead` is required by application/domain validation;
- case/lead relationship integrity is enforced;
- existing lead-only tasks remain valid;
- task assignment requires valid employee eligibility and case access/membership;
- task authorization remains server-side;
- removed workspace members lose case-task access immediately;
- canonical task-domain service exists;
- canonical task APIs use explicit DTOs;
- case task APIs preserve existence concealment;
- dry-run/idempotent backfill exists and is tested;
- no production migration is executed;
- deadline read model derives from authoritative dates;
- deadlines do not widen access;
- Angular global task view is operational;
- Angular case Tasks surface is operational;
- Angular deadlines surface is operational;
- OpenAPI is updated;
- Angular API types are explicit;
- root tests pass;
- server tests pass;
- Angular tests pass;
- ESLint passes;
- TypeScript passes;
- Next.js build passes;
- Angular case-management build passes;
- Angular admin-console build passes;
- GitHub Actions is green after push.

Local success alone is not sufficient.

---

## 27. Out of scope

Phase 04 does not include:

- full calendar UI;
- RFE/NOID calendar semantics;
- USCIS tracking;
- smart forms;
- evidence template engine;
- petition drafting workflow;
- filing packet builder;
- document-management rewrite;
- chat rewrite;
- Socket.IO expansion;
- AI task generation;
- workflow automation engine;
- time tracking;
- billing/payments;
- production deployment;
- production data migration;
- production index execution;
- retirement of legacy EJS/Next staff routes.

---

## 28. Follow-on architecture

After Phase 04, later modules can build on these semantics:

```text
Case
 ├── Tasks
 ├── Task due dates
 ├── Target filing date
 ├── Evidence
 ├── Documents
 ├── Petition work
 ├── Filing packet
 └── USCIS tracking
```

A later dedicated Calendar/Deadlines ADR may normalize additional deadline sources while preserving their authoritative domain owners.

Phase 04 deliberately establishes the minimum safe task/deadline foundation first.
