# Client-first workspace: audit, gap analysis and Phase 2 report

Date: 2026-10-12. Branch: `feature/client-first-workspace` (stacked on `feature/mail-alerts-client-links`).

This document answers the master brief "Complete Case Management & Staff Portal". It has three parts: what the platform already
has, where it falls short of the brief, and what this change delivers (the brief's Phase 1 audit and Phase 2 dashboard fix).

## 1. What exists today

The platform is three applications over one MongoDB database:

| Part | Technology | Purpose |
|---|---|---|
| Public site and client portal | Next.js (`src/`) | Marketing site, consultation and contact forms, client portal (`/portal`) |
| Staff portal | Angular (`enterprise-ui/projects/case-management`) | Daily case work, served at `/staff` |
| Admin | Express + EJS (`server/`), plus an Angular Admin Console that is built but not yet served | CMS, employees, settings |
| APIs | Express (`server/routes/api/v1`) | `/staff` (employee session) and `/admin` (CMS session) |

The brief asks for a relational data model. The platform uses MongoDB with explicit references and unique indexes, and it is
kept: changing the database would rebuild working features for no user-visible gain.

Modules that already work end to end, with server-side permission checks and tests:

- **Leads and consultations.** Website forms create a lead with source, campaign and UTM fields. Staff have a Lead intake page
  (owner, assignees, notes, tasks, delivery) and a Consultations page (questions, scheduling, response deadlines). A lead
  converts to a client account and a case once, enforced by a unique index.
- **Clients.** One account per client, a client list and a client page with their cases and, since the mail change, their
  emails and quick actions.
- **Cases.** Thirteen service types, a thirteen-stage pipeline, a project manager, case team members with per-case roles,
  priority, target filing date, archive, and an activity timeline.
- **Tasks.** Per case or per lead, with assignee, priority, status, due date, dependencies and sprints; "my tasks" and
  team-wide views; a planning page.
- **Documents.** Categories, document requests to the client, upload, versions, review, download logging.
- **Evidence checklist, Smart Forms, petition drafting with versions and review, filing packets, USCIS receipt tracking.**
- **Messages.** Case channels shared with the client or staff-only, unread counts.
- **Shared mailbox.** The firm's Outlook mailbox inside the Staff portal, linked to cases and clients, with new-mail alerts.
- **Calendar and deadlines, global search, operational reports with CSV export, in-app notifications and email digests.**
- **Client portal.** Cases, documents and requests, forms, messages, consultations, notifications, profile and security.
- **Security.** Capability-based roles (twelve), per-case membership, trusted-origin checks, rate limits, audit and security
  event logs, case concealment (an inaccessible case answers 404).

## 2. Gap analysis against the brief

Status: **Done** (met before this change), **Now** (delivered by this change), **Partial**, **Missing**.

| # | Brief section | Status | Detail |
|---|---|---|---|
| 2 | Client-first display | **Now** | Every Staff screen led with the case number. Fixed across the dashboard, case list, tasks, deadlines, work queues, calendar, messages, search, tracking, planning and reports. Notification titles and emails still name the case by number (see section 5). |
| 3A | Overview cards, clickable | **Now** | Eight requested cards, each opening the records it counts. |
| 3B | My tasks with quick actions | **Now** | Client, task, service, due date, priority; change status or mark complete in place. Adding a note from the dashboard is not included. |
| 3C | My clients and active cases | **Now** | Client-led table with stage, next action, what is pending, deadline and owner; filter as you type. Saved views are not included; full sort and filters are on Cases. |
| 3D | Recent activity | **Now** | Case timeline across the employee's cases, each entry linked. |
| 3E | Attention required | **Now** | The existing work queues, shown as a list naming the clients affected. |
| 3F | Personalized dashboard | **Done** | Counts already followed the employee's case membership; administrators see the firm. |
| 4 | Navigation | **Partial** | **Now:** grouped menu (Workspace, Clients and leads, Case work, Communication, Operations) that reaches Leads, Consultations, Notifications and Team planning directly. Already present: collapsible sidebar, global search, quick create, responsive layout. **Missing:** breadcrumbs, recently viewed, pinned clients. |
| 5 | CRM funnel | **Partial** | Leads, sources, owner, notes, tasks, consultations and one-step conversion exist. **Missing:** Kanban pipeline with the ten named stages, quotations, loss reasons, automatic assignment rules, duplicate detection, funnel analytics. WhatsApp, social and Upwork capture need provider accounts and are not built. |
| 6 | Client management | **Partial** | Profile shows contact, cases, emails. **Missing:** documents, tasks, questionnaires, billing and a unified timeline on the client page (they live on each case), related contacts and family members, secondary staff, client archive. |
| 7 | Case management | **Partial** | Pipeline, team, tasks, documents, forms, petition, packet, tracking and timeline exist. Review gates exist for forms, petitions and packets. **Missing:** administrator-configurable workflows per service, stage gates that block progress, task templates generated per stage, the extra service types (EB-3, H-1B, L-1, E-2, F-1, J-1, B-1/B-2, K-1, family), attorney-review escalation as a named step. |
| 8 | Tasks | **Partial** | List views, due filters (now including due today), dependencies, sprints. **Missing:** Kanban board, subtasks, templates, recurring tasks, bulk actions, task comments. Task due dates appear on the calendar. |
| 9 | Documents, questionnaires, forms | **Done / Partial** | Documents and requests are complete. Smart Forms cover questionnaires and form preparation. No in-browser file preview. No USCIS e-filing, by design. |
| 10 | Admin portal | **Partial** | Employees, roles and settings exist in the legacy admin; the Angular Admin Console is built but not served. Reports exist in the Staff portal. **Missing:** revenue figures, drill-down charts, case assignment rules. Roles differ from the brief's seven names: the platform has twelve, organised around preparation specialists. |
| 11 | Client portal | **Done / Partial** | Everything listed except invoices and payments. |
| 12 | Communications | **Partial** | Case messaging, shared mailbox, notifications, reminders. **Missing:** message templates, WhatsApp and SMS. |
| 13 | Reporting | **Partial** | Case, deadline, review-queue and workload reports with export. **Missing:** CRM funnel and financial reports. |
| 14 | Design system | **Partial** | Shared tokens and components in the Staff app. The client portal and legacy admin use their own styles. |
| 15 | Technical | **Done** | Server-side authorization, pagination, validation, audit, rate limits, tests. Indexes are declared but applied by a separate, deliberate step. |
| — | Billing and invoices | **Missing** | No model, API or screen exists. This is the largest absent module. |

## 3. What this change delivers

### Client-first everywhere

A case is now named the same way on every Staff screen: the client's name first, then the service and matter, with the case
number as a small "Ref". One server helper (`server/services/caseRef.js`) adds `clientName` and `caseType` to every case
reference, and one component (`shared/case-label.component.ts`) renders it.

This does not widen access. A case already shows its primary client to everyone who can open it, and the name is added only to
references to cases the employee can already see. The link into client records appears only for someone with `clients.view`.

The case list can now be searched by client name (part of a name, a full name, or an email).

### Dashboard

`GET /api/v1/staff/dashboard` now returns, from live data:

- cards: active clients, active cases, tasks due today, overdue tasks, cases awaiting client documents, cases awaiting internal
  review, upcoming deadlines, cases newly assigned in the last seven days, plus the existing consultation, conversation and
  USCIS cards;
- `myTasks`: the employee's open tasks, dated first, each with its client and the server's own permission flags;
- `clientCases`: the twelve most recently active cases by client, with stage, manager, next open task and what is pending;
- `recentActivity`: the case timeline for those cases, without housekeeping entries;
- `workQueues`: unchanged, with client names.

One client with several matters is counted once and each matter is listed under that client.

### Navigation

The flat menu is grouped by purpose. Leads, Consultations, Notifications and Team planning were reachable only from small links
on the dashboard; they are now menu entries, shown by capability. Existing entries keep their names and addresses.

## 4. Verification

- Server: new `staff-client-first.integration.test.js` (6 tests): dashboard fields, row scope for a manager, a specialist and an
  administrator, one client with two matters, client-name search, client names on tasks, deadlines, queues and search.
- Staff app: dashboard, navigation and case-label specs rewritten or added; existing specs updated where they expected a case
  number as the headline.
- Browser: `e2e/client-first.spec.ts` signs in as a Project Manager, recognises the case by client on the dashboard, opens it,
  and finds it in Cases by client name.

Acceptance scenarios from the brief:

| Scenario | Status |
|---|---|
| 1 Staff login shows a personalized, client-first dashboard | Met by this change |
| 2 Find a client by name, open the profile, reach the next task | Met: global search and Cases search by client; the client page lists cases; each case row links to its tasks |
| 3 Lead to client without re-entry | Met before this change (single conversion); pipeline stages are not the brief's ten |
| 4 Create a case for an existing client | Met; tasks are not generated from a service template |
| 5 Document request, client upload, staff sees it | Met; the dashboard now shows cases waiting on the client |
| 6 Task completion advances the workflow | Not met: stages are changed by a person, with no automatic gate |
| 7 Manager review with corrections and approval | Met for forms, petitions and filing packets |
| 8 Permission enforcement in UI and API | Met |
| 9 Reports filtered by date and employee | Met for operational reports; no CRM or financial reports |
| 10 Persistence after refresh | Met |

## 5. Limits of this change

- Notification titles, notification emails and the client portal still refer to a case by its number.
- The dashboard client table shows twelve cases and filters within them; saved views are not built.
- "Due today" uses the UTC day, the same as the existing work queues.
- No database index was added. The new queries use existing indexes; `recentActivity` for an administrator sorts all case
  activity by date and would benefit from a `{ createdAt: -1 }` index on `case_activities` as volume grows.

## 6. Recommended order for the remaining work

1. **CRM pipeline** (brief Phase 3): the ten stages as a board, loss reasons, quotations, follow-up reminders, duplicate
   detection, funnel report. Needs a decision on how the thirteen existing lead statuses map to the ten stages.
2. **Client profile tabs** (Phase 4): documents, tasks, forms and a unified timeline across the client's cases.
3. **Service workflows** (Phase 4): task templates per service and stage, stage gates, the additional service types.
4. **Task board**: Kanban view, subtasks, templates, comments.
5. **Billing**: quotations, invoices, payments, client-portal view, financial reports. Needs a decision on the payment provider.
6. **Client-first notifications and emails.**
7. **Admin Console release** (already built; needs packaging and routing) and administrator dashboards.
