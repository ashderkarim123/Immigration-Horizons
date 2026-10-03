# Stabilization Phase 01 — Angular Staff Feature Parity Audit & Master Command Prompt

**Status:** Ready for implementation  
**Branch:** stabilization/angular-feature-parity-audit  
**Audit baseline:** main @ 26ed89725651b079e505540c2cffe474b0379d5f  
**Date:** 2026-10-02  
**Project:** Immigration Horizons

---

## Product target reference — read before UX or Smart Forms changes

The long-term product target is defined in:

~~~text
docs/implementation/REFERENCE_UX_AND_USCIS_AUTOFILL_PRODUCT_SPEC.md
~~~

That specification is based on the user-supplied 8am DocketWise reference screenshots and the desired workflow:

~~~text
client enters information once
+ categorized/requested document collection
-> normalized reusable immigration data
-> staff review
-> automatic population of supported official USCIS forms
-> staff form review
-> immutable approved form versions
-> filing packet
~~~

During Stabilization Phase 01:

- align the Staff/Client UX shell with that target;
- preserve and repair current Smart Forms;
- prefer stable canonical field keys for new questionnaire work;
- do not build a throwaway UI architecture that will prevent participant-aware autofill later;
- do not implement the full USCIS PDF mapping/generation engine inside stabilization unless separately approved;
- do not copy third-party branding/assets/pixel-perfect UI; use Immigration Horizons branding with equivalent workflow clarity.

---
## 1. Why this stabilization phase exists

Do not begin Phase 11 USCIS Tracking yet.

The platform has substantial backend/domain functionality, but the audit found multiple places where the Angular staff application is incomplete, disconnected from the canonical Express API, or reading/writing a different contract than the backend actually exposes.

The result is that features may exist in models, services, APIs, and automated tests while still appearing missing or broken to a real user.

This stabilization phase must convert the already-built feature set into a coherent, usable end-to-end product before new feature phases continue.

The current intended production architecture remains:

~~~text
immigrationhorizons.com
  -> Next.js public website

app.immigrationhorizons.com
  /portal/*       -> Next.js client portal
  /api/portal/*   -> Next.js portal API
  /staff/*        -> Angular employee case-management app
  /api/v1/*       -> Express canonical staff API

admin.immigrationhorizons.com
  -> Express/EJS admin CMS
~~~

Do not replace the Next.js public site, Next.js client portal, or Express API as part of this stabilization phase.

---


## 1A. P0 architecture boundary — Admin CMS and Staff Operations must be separate

This separation is mandatory.

The current code allows an active \`AdminUser\` such as a PM to authenticate at \`/admin/login\`, because the CMS login looks up the shared AdminUser collection and the \`requireAdmin\` middleware only checks whether the CMS session has \`isAdmin=true\`. That is not the intended final product boundary.

### Final surface ownership

~~~text
admin.immigrationhorizons.com
  PURPOSE: platform administration + website/CMS only

  Allowed users:
    super_admin
    admin
    editor (only the CMS areas its capabilities permit)

  Staff operational roles such as:
    pm
    petition_writer
    business_plan_specialist
    recommendation_letter_specialist
    uscis_forms_specialist
    evidence_collector
    reviewer
    viewer
  MUST NOT be able to create an authenticated Admin CMS session.

app.immigrationhorizons.com/staff/*
  PURPOSE: all immigration operations / case-management work

  Users:
    staff operations administrator
    PM / Project Manager
    specialists
    reviewer / QA
    other staff roles as permitted

  Operational modules belong here:
    dashboard
    clients
    cases
    case workspaces / team membership
    tasks
    deadlines
    evidence
    documents
    communications / channels / chat
    Smart Forms
    petition work
    filing packets
    operational queries/consultations as they are migrated
~~~

### Do not use a fake or shared "pseudo user"

Do not create a shared fake account that multiple people use to administer case work.

Introduce a real persistent staff-side elevated role, recommended name:

~~~text
operations_admin
~~~

Display label:

~~~text
Staff Operations Admin
~~~

Every person who performs staff administration must have their own account/session so assignment, case activity, security events and audit history remain attributable to a real person.

### Staff Operations Admin responsibilities

The Staff Operations Admin lives only on the Staff Portal and should be able, subject to the canonical capability matrix, to:

- create/convert operational cases where product workflow allows it;
- assign or change the Project Manager;
- manage case workspace membership;
- add/remove employees from case teams;
- create/assign/reassign tasks;
- initialize/manage case channels;
- manage restricted-channel membership;
- manage case documents/evidence/forms as appropriate;
- oversee operational queues;
- perform other case-management administration that currently leaks into the EJS Admin CMS.

Do not make normal PMs organization-wide administrators merely to achieve these actions. PM rights should remain scoped by capabilities and case membership.

### Workspace creation rule

Do not add a generic "Create Workspace" button if the domain invariant is one primary workspace per case.

The preferred workflow is:

~~~text
Create/convert Case
  -> system atomically provisions the primary CaseWorkspace
  -> system provisions required primary client / PM membership
  -> authorized staff manages additional workspace members
  -> authorized staff initializes/manages channels
~~~

Workspace identity is system-owned infrastructure. Staff should manage membership and collaboration, not manually invent detached workspaces.

### Channel workflow

The Staff Operations Admin / authorized PM may manage channels from the Staff Portal.

Use the existing WorkspaceChannel domain and canonical staff API. Do not create an Angular-only channel model.

At minimum the Staff Portal must expose, according to capability:

- initialize default case channels;
- create a channel;
- rename/update;
- reorder;
- archive;
- manage restricted-channel members;
- clearly label client-visible vs staff-only vs restricted audiences.

### Admin CMS must stop being an operations console

After staff parity is verified, the Admin CMS navigation and routes must no longer be the normal place for:

- Cases
- Clients/case operational management
- Tasks
- Case workspaces/team management
- Case documents
- Case queries/communications
- Case channels/chat
- Evidence
- Forms
- Petition work
- Filing packet work
- delivery/case-production operations that have a canonical staff equivalent

Do not duplicate or migrate MongoDB data. "Move to Staff Portal" means move the UI/route ownership to Angular + the canonical Express staff API while continuing to use the same authoritative collections/services.

During stabilization, legacy EJS operational routes may be retained temporarily as rollback code, but:

1. normal staff users must be denied CMS authentication;
2. those routes must not remain the documented day-to-day workflow;
3. once Angular parity for a module is verified, remove it from Admin CMS navigation;
4. retire or explicitly admin-only the legacy route after rollback confidence is sufficient.

### Admin CMS responsibilities after separation

The Admin CMS should converge toward:

- website content / Blog;
- SEO;
- FAQs;
- testimonials;
- services/content configuration;
- media library;
- system settings;
- CMS/platform user provisioning and role administration;
- security/audit administration where appropriate.

It must not be the ordinary case-production workspace.

### Authentication boundary implementation

Add an explicit CMS-surface authorization concept. Do not rely on the generic historical name \`AdminUser\` to mean a person may enter the CMS.

Recommended implementation:

~~~text
admin.cms.access
~~~

Grant it only to:

~~~text
super_admin
admin
editor
~~~

or an equivalently explicit, tested CMS allowlist.

The Admin CMS login flow must refuse a correct credential for an account that lacks CMS access, record a denied \`admin_cms\` security event, and create no authenticated CMS session.

A PM entering their correct staff credentials at \`admin.immigrationhorizons.com/admin/login\` must remain unauthenticated.

Do not weaken Staff Portal login: the same underlying employee identity may still authenticate at the staff surface according to the staff role matrix.

### Session separation

Keep the two surfaces independently authenticated.

~~~text
Admin CMS session/cookie
  !=
Staff EmployeeSession / ih_staff_session
~~~

A Staff Portal login must not automatically establish an Admin CMS session.

An Admin CMS login must not be treated as a Staff Portal login.

### Required tests for this boundary

Add tests proving:

- PM + correct password -> Admin CMS denied, no CMS session;
- specialist + correct password -> Admin CMS denied;
- reviewer + correct password -> Admin CMS denied;
- viewer + correct password -> Admin CMS denied;
- editor + correct password -> CMS access only to permitted CMS capabilities;
- admin -> CMS access;
- super_admin -> CMS access;
- denied CMS login records an appropriate security event without claiming bad password;
- denied CMS login does not increment bad-password lockout counters merely because the role lacks CMS access;
- PM can still log in successfully through the Staff Portal;
- Staff and Admin sessions remain independent;
- hiding an Admin sidebar item is never the authorization boundary; direct CMS route access is also denied.

This is P0 and must be completed before treating the staff/admin split as production-complete.

---


## 1B. P0/P1 UX architecture — role-based dashboards and guided workflows

Immigration Horizons is being built for clients and staff who may be non-technical and unfamiliar with case-management software.

UX is therefore a functional requirement, not decoration.

A user should not need to understand the underlying architecture, collections, case/workspace/channel terminology, or which historical application owns a feature.

The product must answer three questions immediately on every major screen:

~~~text
Where am I?
What needs my attention?
What should I do next?
~~~

### Global UX principles

Apply these consistently across Public Website, Client Portal, Staff Portal and Admin CMS:

- plain-language labels instead of internal/domain jargon where possible;
- icon + text labels, never icon-only primary navigation;
- clear page title and short explanation of the page's purpose;
- obvious primary action;
- breadcrumbs or other strong location context on deep pages;
- consistent back navigation;
- loading, empty, success and error states written for non-technical users;
- progressive disclosure: show common actions first, advanced controls second;
- avoid exposing raw enum values, Mongo IDs, API language or implementation terms;
- use human labels such as "Waiting on Client" rather than "waiting";
- destructive actions require explicit confirmation;
- mobile/tablet behavior must remain usable;
- keyboard/focus/accessibility behavior is part of acceptance;
- do not hide critical workflows only in overflow menus;
- do not force users to remember a URL to reach a normal feature;
- preserve server-authoritative permissions and hide actions the current user cannot perform.

### Public Website navigation

The public website should make the user journey obvious.

Recommended primary navigation:

~~~text
Home
Immigration Services
How It Works
Resources
About
Contact
Book Consultation
Client Login
~~~

Do not make Staff Portal or Admin CMS prominent consumer navigation destinations.

Staff and administrators should normally use their direct organizational URLs/bookmarks.

The public homepage should clearly separate:

~~~text
I need immigration help
I am an existing client
~~~

with obvious actions.

### Staff Portal navigation

The Staff Portal should become the complete operational workplace.

Recommended primary navigation:

~~~text
Dashboard
Cases
Clients
Tasks
Messages
Deadlines
~~~

Role/capability may add operational administration such as:

~~~text
Intake / Consultations
Team / Staff Operations
Operational Reports
~~~

when those modules are actually implemented.

Case-specific specialist work remains inside the case rather than overcrowding the global sidebar.

### Simplify the Case workspace

Do not present ten equal-weight tabs with no hierarchy if it overwhelms users.

Prefer a case home plus grouped workflow navigation.

Recommended mental model:

~~~text
Case Home

Communication
  Chat / Messages

Client Inputs
  Documents
  Evidence
  Forms

Case Work
  Tasks
  Petition
  Filing Packet

Management
  Team
  Activity
~~~

The exact visual implementation may use grouped tabs, a case sidebar, or a responsive secondary navigation, but the grouping must be obvious and stable.

Case Home should answer:

~~~text
Current stage
Next milestone
Project Manager
Important deadline
Open tasks
Unread messages
Documents waiting
Forms waiting
Evidence completeness
Recent activity
Primary next actions
~~~

### Role-specific Staff dashboards

Do not show the same operational dashboard to every staff role if the role's actual work differs.

Use capabilities and assignments, not duplicated apps.

#### Staff Operations Admin dashboard

Primary purpose: run the operation.

Show high-signal queues such as:

~~~text
Unassigned / newly created cases
Cases without PM
Team assignment issues
Overdue tasks
Upcoming deadlines
Unread/unhandled client communications
Documents awaiting review
Forms awaiting review
Cases blocked by missing evidence
Petitions awaiting review/finalization
Filing packets awaiting review/finalization
Operational workload by employee where authorized
~~~

Quick actions can include:

~~~text
Create / convert case
Assign PM
Add case team member
Create task
Open communications
Initialize/manage case channels
~~~

Do not expose detached manual workspace creation when Case -> primary CaseWorkspace is a system invariant.

#### PM / Project Manager dashboard

Primary purpose: manage assigned cases.

Show:

~~~text
My active cases
Cases needing attention
Today's / overdue tasks
Upcoming deadlines
Unread client messages
Documents awaiting my review
Forms awaiting my review
Evidence gaps
Petitions / packets needing action
Recently updated cases
~~~

Quick actions should lead into the correct case, not create parallel workflows.

#### Specialist dashboard

Examples: petition writer, forms specialist, evidence collector.

Primary purpose: complete assigned work.

Show:

~~~text
My assigned tasks
My assigned cases
Work waiting for me
Due soon / overdue
Returned-for-changes items
Messages on cases I belong to
Relevant documents/evidence needed to complete my work
~~~

Do not show organization-wide operational controls.

#### Reviewer / QA dashboard

Primary purpose: review and approve assigned work.

Show:

~~~text
Forms awaiting review
Petition sections awaiting review
Petitions ready to finalize when authorized
Filing packets awaiting review/finalization
Documents requiring review when authorized
Overdue review tasks
~~~

### Client Portal dashboard

The Client Portal must be action-oriented, not system-oriented.

The first view should prioritize:

~~~text
What you need to do next
~~~

Recommended dashboard hierarchy:

~~~text
Welcome / case status

Action Required
  Upload requested documents
  Complete forms
  Respond to a returned form
  Read/reply to new message
  Complete another client-visible request

Your Cases
  current status
  next milestone
  project manager
  important date if client-visible

Messages
  unread count + latest conversation

Documents
  pending requests
  recently uploaded
  review/replacement status

Forms
  to complete
  submitted
  needs changes
  approved

Recent Updates / Timeline
~~~

Avoid asking the client to understand internal staff concepts such as Workspace, ChannelReadState, EvidenceRequirement IDs, packet versions or internal review states.

### Client document UX

Document handling must be especially simple.

For a requested document, the ideal client flow is:

~~~text
Action Required
  -> "Upload Passport"
  -> choose/drop file
  -> category/request already selected
  -> optional description if needed
  -> upload
  -> clear success state
  -> visible review status
~~~

Do not make a client manually choose a category if a DocumentRequest already determines the correct category.

For general uploads:

~~~text
Upload Document
  -> choose clear human category
  -> choose/drop file
  -> optional description
  -> upload
~~~

Useful client-facing document states include:

~~~text
Requested
Uploaded
Under Review
Accepted
Replacement Needed
Rejected
~~~

If replacement is required, place the reason and the replacement action together.

Document pages should support:

- drag/drop plus normal file picker;
- clear allowed file type/size guidance;
- category grouping;
- search/filter where volume warrants it;
- obvious download;
- upload progress/disabled duplicate-submit state;
- client-visible review comments;
- replacement flow;
- no exposure of internal comments;
- no exposure of storage paths/checksums/private metadata.

### Staff document UX

Within Case -> Documents, organize around actual work:

~~~text
Needs Review
Open Requests
All Documents
Categories
Recent Uploads
~~~

High-priority document review should not be hidden in a long undifferentiated table.

### Messages UX

Global Messages should behave like an inbox for non-technical staff:

~~~text
Unread
All
Search
~~~

Each row must make the context clear:

~~~text
Client / sender
Case number + title
Channel / audience
Message preview
Time
Unread count
~~~

Inside a conversation, clearly distinguish:

~~~text
Client-visible
Staff-only
Restricted
~~~

Do not rely on technical channel names to communicate privacy.

### Admin CMS dashboard

After the Admin/Staff separation, Admin CMS should have a deliberately different dashboard.

It should focus on:

~~~text
Website content
Blog / drafts / publishing
SEO
FAQs / testimonials / services
Media
System settings
User / role administration
Security / audit administration
~~~

Do not show Cases, Tasks, Channels, Evidence, Petition or Filing Packet operational cards after their Staff Portal equivalents are production-verified.

### Consistent dashboard card behavior

Dashboard cards should be actionable.

Bad:

~~~text
Unread Messages: 7
~~~

Better:

~~~text
7 unread client messages
[Review messages]
~~~

Bad:

~~~text
Documents Awaiting Review: 4
~~~

Better:

~~~text
4 documents need review
[Review documents]
~~~

Metrics without a next action should be used only when the metric is genuinely informational.

### Empty-state guidance

For inexperienced users, an empty screen must explain the next step.

Examples:

~~~text
No tasks assigned to you.
When a PM assigns work, it will appear here.

No evidence checklist yet.
[Set up evidence checklist]

No document requests.
[Request a document]  // only when authorized

No unread messages.
You're caught up.
~~~

### Onboarding and help

Provide lightweight contextual onboarding rather than a separate technical manual as the only solution.

Consider:

- first-login orientation for Staff Portal;
- short descriptions under major page titles;
- tooltips for uncommon/legal workflow concepts;
- "What is this?" help on Evidence, Petition and Filing Packet;
- consistent terminology across Staff and Client surfaces;
- optional dismissible onboarding checklist for new staff.

Do not overload experienced users with permanent tutorial banners.

### UX acceptance testing

For every redesigned dashboard, test with the question:

~~~text
Can a first-time non-technical user identify the next action in under 10 seconds?
~~~

Manual QA must include:

- desktop;
- tablet-width;
- mobile client portal;
- keyboard navigation for primary workflows;
- screen-reader-friendly labels for primary controls;
- no inaccessible color-only status meaning;
- loading/empty/error/success state review;
- PM, specialist, reviewer, Operations Admin and Client perspectives.

This UX/UI work is part of stabilization and must not be treated as a final cosmetic polish after functionality is complete.

---

## 2. Audit summary

Use these statuses:

| Status | Meaning |
|---|---|
| GREEN | Core workflow is substantially implemented as intended |
| YELLOW | Implemented but incomplete, difficult to discover, or still needs production browser QA |
| RED | Concrete defect, contract mismatch, or major missing workflow |
| WHITE | Intentionally not implemented yet |

| Module | Audit status |
|---|---|
| Production routing/deployment | GREEN |
| Admin CMS vs Staff Portal authentication boundary | RED |
| Role-based dashboard/navigation clarity | RED/YELLOW |
| Client action-oriented dashboard/document UX | YELLOW |
| Operational modules still exposed in Admin CMS | RED |
| Existing staff login/session | GREEN |
| First-login permanent-password setup | RED |
| Dashboard | YELLOW |
| Cases directory | RED |
| Case overview | YELLOW |
| Case permission/action visibility | RED |
| Team / workspace members | RED |
| Activity timeline | RED |
| Clients directory/detail | RED |
| Tasks | YELLOW |
| Deadlines | YELLOW |
| Evidence | RED |
| Documents | GREEN/YELLOW |
| Case chat | GREEN/YELLOW |
| Global staff Messages / Communications inbox | RED / missing |
| Smart Forms | GREEN/YELLOW |
| Petition Work | GREEN/YELLOW |
| Filing Packets | GREEN/YELLOW |
| Client Portal | GREEN/YELLOW |
| Staff notifications | RED / incomplete |
| Queries/consultation workflow in Angular | RED / not migrated |
| Leads in Angular | WHITE |
| USCIS Tracking | WHITE |
| Calendar/reminders | WHITE |
| Search/reporting | WHITE |
| Angular Admin Console cutover | WHITE |

---

## 3. Critical findings that must be treated as authoritative starting hypotheses

Code is authoritative. Re-check every item below before editing, but do not ignore these findings.

### 3.1 First-login password setup contract mismatch

Angular:

enterprise-ui/projects/case-management/src/app/features/setup-password/setup-password.component.ts

currently sends approximately:

~~~text
currentPassword
newPassword
~~~

and communicates an 8-character minimum.

Express:

server/routes/api/v1/staff/account.js

requires:

~~~text
currentPassword
newPassword
confirmPassword
~~~

with a 12-character minimum.

Required repair:

- Angular must include confirmPassword.
- Angular validation and help text must match the backend minimum.
- New password and confirm password must match client-side for UX.
- Backend remains authoritative.
- Add Angular tests and server integration coverage proving a mustChangePassword employee can complete setup and continue into the staff application.

This is P0.

---

### 3.2 Cases directory contract mismatch

Relevant files:

- enterprise-ui/projects/case-management/src/app/features/cases/cases.ts
- enterprise-ui/projects/case-management/src/app/features/cases/cases.html
- server/routes/api/v1/staff/cases.js

Audit found Angular using or expecting:

~~~text
c._id
q
includeArchived
data.pagination.total
data.pagination.pages
~~~

while the canonical API uses/returns:

~~~text
id
search
archived
data.total
data.totalPages
~~~

Required repair:

- Use explicit TypeScript DTO types.
- Remove accidental _id assumptions from Angular staff contracts.
- Search must use the backend query parameter actually supported.
- Archived filter must use the backend query parameter actually supported.
- Pagination must consume total / totalPages / page / pageSize.
- Case links must navigate with id.
- Preserve scope, stage, case type, priority, archived, page and search state in URL query params.
- Add tests with fixtures matching the real Express response shape.

This is P0.

---

### 3.3 Case-detail permissions are inferred incorrectly

Relevant files:

- enterprise-ui/projects/case-management/src/app/features/cases/case-detail/case-detail.component.ts
- enterprise-ui/projects/case-management/src/app/core/auth/auth.service.ts
- server/routes/api/v1/staff/me.js
- server/routes/api/v1/staff/cases.js
- server/utils/permissions.js

The canonical staff identity response provides:

~~~text
user
role: { code, label }
capabilities[]
~~~

The case detail API also provides action flags such as:

~~~text
canManageCase
canAssignManager
canArchive
canManageMembers
canPublishClientUpdate
~~~

Do not make Angular authorization decisions by inventing or checking role arrays such as:

~~~text
case_manager
paralegal
attorney
~~~

The real role set contains values such as:

~~~text
super_admin
admin
pm
petition_writer
business_plan_specialist
recommendation_letter_specialist
uscis_forms_specialist
evidence_collector
reviewer
editor
viewer
~~~

Required repair:

- Angular visibility must use server-provided action flags and/or canonical capabilities.
- Server remains authoritative for every mutation.
- Remove role-name inference from case-detail action visibility.
- A legitimate pm must see the actions its server capabilities permit.
- Specialist/reviewer roles must see only what the server permits.
- Add Angular tests for PM, reviewer, specialist, viewer and admin behavior.

This is P0.

---

### 3.4 Team tab is disconnected from its real endpoint

Relevant files:

- server/routes/api/v1/staff/cases.js
- server/routes/api/v1/staff/case-mutations.js
- enterprise-ui/projects/case-management/src/app/features/cases/case-detail/case-detail.component.ts
- enterprise-ui/projects/case-management/src/app/features/cases/case-detail/case-detail.component.html

The server exposes:

~~~text
GET /api/v1/staff/cases/:id/members
GET /api/v1/staff/cases/:id/member-options
~~~

Member DTO fields include concepts such as:

~~~text
id
memberType
workspaceRole
status
clientVisible
joinedAt
employee
client
~~~

Do not rely on caseData.team unless the API intentionally supplies that field.

Audit also found mutation payload drift.

Project-manager mutation must use the backend's real contract, including:

~~~text
projectManagerId
~~~

Team-member mutation must use the backend's real contract, including:

~~~text
adminUserId
workspaceRole
clientVisible
~~~

Required repair:

- Load members from the canonical members endpoint.
- Load member options only when the user has the relevant action.
- Render employee/client member DTOs exactly as returned.
- Use correct mutation payload fields.
- Reload the canonical case/member state after successful mutation.
- Do not replace the full case object with a small mutation response.
- Test add/remove member, PM change, forbidden actions and removed-member behavior.

This is P0.

---

### 3.5 Activity Timeline is disconnected

Server exposes:

~~~text
GET /api/v1/staff/cases/:id/activity
~~~

Angular currently needs to consume that endpoint directly.

Required repair:

- Add explicit activity DTO types.
- Fetch/paginate activity independently from case detail.
- Show loading, empty, error and retry states.
- Do not expect caseData.activities unless the server explicitly adds it.
- Do not expose private document paths, form answers, petition text or other sensitive content in activity UI.

This is P0.

---

### 3.6 Case mutation refresh behavior is unsafe

Some mutation APIs return a compact result such as:

~~~text
outcome
caseId
stage
~~~

This is not the full case-detail DTO.

Required repair:

- Never replace the full Angular case detail state with a compact mutation response.
- After stage/PM/member/client-update/archive mutations, reload the canonical data required by the screen.
- Preserve modal/input state on recoverable error.
- Use one consistent refresh strategy.

This is P0.

---

### 3.7 Clients directory/detail contract drift

Relevant files:

- enterprise-ui/projects/case-management/src/app/features/clients/clients.component.ts
- enterprise-ui/projects/case-management/src/app/features/clients/client-detail/client-detail.component.ts
- server/routes/api/v1/staff/clients.js
- server/models/ClientUser.js

Audit found mismatches including:

~~~text
Angular q               vs API search
Angular pagination.*    vs API total / totalPages
Angular statuses        vs database status enum
Angular name            vs API displayName
Angular portalStatus    vs no such canonical field
Angular cases[]._id     vs API cases[].id
~~~

Canonical client status values are:

~~~text
pending
active
locked
disabled
~~~

Required repair:

- Align query params, response DTOs, status filters and pagination.
- Client detail must use displayName and cases[].id.
- Do not display a fabricated portalStatus.
- Keep credential and lockout secrets out of DTOs/UI.
- Add component tests with real response-shaped fixtures.

This is P0/P1.

---

### 3.8 Evidence currently has a real backend integrity defect

Relevant files:

- server/services/evidenceManagement.js
- server/routes/api/v1/staff/evidence.js
- server/models/ClientCase.js
- server/models/CaseWorkspace.js
- server/models/EvidenceRequirement.js
- enterprise-ui/projects/case-management/src/app/features/cases/case-detail/evidence-tab/

ClientCase does not own a canonical workspace field.

Evidence currently relies on clientCase.workspace in places where the authoritative workspace must be resolved through CaseWorkspace / case-management services.

EvidenceRequirement requires a workspace.

Required repair:

- Resolve the primary CaseWorkspace explicitly for every case-scoped Evidence operation.
- Never persist workspace: null for a real case requirement.
- Authorization must use the resolved workspace ID.
- Same-case document linking must remain enforced.
- Add dedicated integration tests for evidence provisioning, custom requirements, status changes, linking/unlinking and removed-member authorization.
- Add negative tests for malformed IDs, cross-case document linking, inaccessible case and missing workspace.

This is P0.

---

### 3.9 Evidence product surface is incomplete

The API/domain supports:

~~~text
provision checklist
list requirements
create custom requirement
change status
link document
unlink document
~~~

Angular currently exposes only part of that.

Required Angular parity:

- Provision checklist.
- Create custom requirement.
- Update requirement status.
- Display linked documents.
- Link an eligible same-case document.
- Unlink a document.
- Show client/staff guidance safely where appropriate.
- Navigate to document detail.
- Use capabilities/action flags rather than role-name guesses.

Template provisioning must not be hard-coded to only two options in the component.

Provide a safe server-owned list of available active templates for the case type or another explicit canonical source.

Current seed migration only establishes initial EB-2 NIW and EB-1A templates. Inspect whether that migration is registered and whether production data contains the templates before relying on it. Do not silently run production migrations from this stabilization implementation.

This is P0/P1.

---

### 3.10 Tasks domain is ahead of the UI

The backend supports meaningful task operations, but the Angular Tasks page is primarily a list/filter surface.

Required parity:

- Create case task.
- Edit title/description/type/priority/due date where the domain allows it.
- Assign/reassign when authorized.
- Change status.
- Complete/reopen only according to existing task rules.
- Case-detail Tasks tab and global Tasks page must use the same canonical task contracts.
- Preserve ownership-scoped permissions for specialist/reviewer roles.
- Do not create a second Angular-only task model.

This is P1.

---

### 3.11 Chat exists, but a global Communications surface is missing

Do not rewrite the chat domain.

Continue using:

~~~text
WorkspaceChannel
WorkspaceMessage
ChannelReadState
CaseDocument / DocumentVersion for chat attachments
~~~

Existing case chat should remain:

~~~text
Cases -> Case -> Chat
~~~

But add a discoverable staff-level Messages / Communications module.

Minimum product outcome:

~~~text
Sidebar
  -> Messages

Messages
  -> unread conversations first
  -> case number / case title
  -> channel name
  -> audience label
  -> latest message preview
  -> latest activity time
  -> unread count
  -> participant/sender display
  -> open conversation
~~~

Prefer reusing existing chat services and policies.

If an aggregation API is needed, add a canonical endpoint under /api/v1/staff rather than querying MongoDB directly from Angular.

Do not duplicate WorkspaceMessage data.

When a conversation is opened, either:

- provide a dedicated communications route that reuses the existing chat UI/state helpers, or
- navigate to the relevant case Chat tab with a stable channel-selection mechanism.

Required filters:

- unread
- all
- search by case/channel where practical

Required security:

- row-level case/channel authorization is re-derived server-side.
- restricted/internal channels never leak.
- client-visible/staff-only audience labels remain explicit.
- secure document download routes remain unchanged.

This is P1.

---

### 3.12 Notifications are incomplete

Do not build a second notification engine casually.

First audit the existing Notification domain and existing mention/reply notification behavior.

The stabilization goal is to ensure staff can discover operational events that require action.

At minimum determine and document behavior for:

- new client chat activity
- client document upload / requested document fulfillment
- Smart Form submitted / returned
- petition assignment / review transitions
- filing packet review transitions
- approaching deadline

If adding new persistent notification types would materially expand risk, it is acceptable to use the global Communications inbox plus dashboard/action queues for this stabilization phase, but the limitation must be explicit in the final report.

This is P1/P2.

---

## 4. Modules that should be preserved, not rewritten

### Documents

Documents is one of the strongest existing modules.

Preserve:

- CaseDocument
- DocumentVersion
- DocumentCategory
- DocumentRequest
- DocumentAccessLog
- private storage
- secure download streaming
- review lifecycle
- version history

Close only verified UI parity gaps such as category edit/reorder or request editing if the canonical API already supports them and they are needed for the intended workflow.

### Smart Forms

Preserve:

- SmartFormTemplate
- CaseSmartForm
- SmartFormAudit
- autosave
- submit / return / approve / lock
- revision conflict protection
- client/staff field privacy

Do not turn Smart Forms into official USCIS PDF forms during stabilization.

### Petition Work

Preserve the current case-native petition architecture and immutable version snapshots.

Do not redesign it.

### Filing Packets

Preserve the current filing-manifest architecture.

Do not introduce PDF merge, ZIP generation, official USCIS rendering, e-signature or e-filing during this stabilization cycle unless separately approved.

---

## 5. Features intentionally deferred until stabilization is complete

Do not start these while P0/P1 stabilization work is unresolved:

- Phase 11 USCIS Tracking
- full calendar/reminder engine
- global search/reporting
- Angular CMS replacement
- Angular admin-console production cutover
- legacy staff retirement
- AI features
- official USCIS PDF rendering
- binary filing packet assembly
- e-signatures
- electronic filing

---

## 6. Mandatory testing strategy

Green CI alone is currently insufficient because independent API/component tests can both pass while their contracts disagree.

Add tests that explicitly close this gap.

### 6.1 Server contract tests

For touched canonical staff APIs, verify exact response/request fields used by Angular.

At minimum cover:

- GET /staff/me
- GET /staff/cases
- GET /staff/cases/:id
- GET /staff/cases/:id/members
- GET /staff/cases/:id/activity
- member-options
- case mutations
- clients list/detail
- evidence
- tasks
- any new Messages inbox endpoint

### 6.2 Angular contract-shaped fixtures

Angular component tests must use fixtures shaped like the actual Express DTO.

Do not mock convenient imaginary fields such as:

~~~text
_id
pagination
team
activities
portalStatus
roles[]
~~~

unless the canonical API truly returns them.

### 6.3 Evidence integration tests

Create a dedicated evidence integration suite if one does not already exist.

It must prove:

- a real ClientCase plus primary CaseWorkspace can provision evidence
- workspace is persisted correctly
- PM/member authorization works
- removed member immediately loses access
- custom requirement works
- status transitions work
- waived/not-applicable reasons are enforced
- same-case document link works
- cross-case document is rejected/concealed
- unlink works
- idempotent provisioning works

### 6.4 Two-session browser QA

Before this stabilization phase is declared complete, perform or provide an executable manual QA checklist for:

Client session + PM session:

1. client opens case
2. client sends chat message
3. PM sees it from global Messages and case Chat
4. PM replies
5. client sees reply
6. client uploads/request-fulfills a document
7. PM sees and reviews it
8. client completes/submits a Smart Form
9. PM returns or approves it
10. client sees returned state/note
11. PM works a task
12. PM updates evidence and links a document
13. petition dependency sees the evidence/form/document/task state correctly
14. petition can proceed through intended workflow
15. filing packet consumes finalized petition and pinned sources

Reviewer/specialist session:

- verify role/capability-specific action visibility
- verify server denial remains authoritative
- verify removed workspace member loses access immediately

---

## 7. UI/UX acceptance criteria

The staff application should feel like one product.

Required top-level navigation after stabilization should at least include:

~~~text
Dashboard
Cases
Clients
Tasks
Deadlines
Messages
~~~

Case-scoped specialist work remains inside Case:

~~~text
Overview
Team
Tasks
Activity
Evidence
Documents
Chat
Forms
Petition
Filing Packet
~~~

Do not create top-level duplicate modules for Evidence/Petition/Packets merely for visual symmetry unless a real cross-case workflow requires it.

Every major screen must implement:

- loading
- loaded
- empty
- retryable error
- unauthorized/not-found handling where appropriate
- capability-aware action visibility
- responsive layout
- accessible labels/status text
- no raw Mongo/Mongoose/private-storage metadata

---

## 8. Implementation order

Follow this sequence unless current code proves a dependency requires a small adjustment.

### Batch A — P0 authentication and canonical DTO repair

1. enforce Admin CMS vs Staff Portal authentication separation and add Staff Operations Admin capability/role design
2. begin removing migrated operational modules from Admin CMS navigation after Staff parity is verified
3. first-login password setup
4. Cases list contract
5. Clients list/detail contract
6. case-detail permission/action flags
7. Team loading and mutation contracts
8. Activity endpoint integration
9. safe case mutation refresh behavior
10. dashboard navigation under /staff

Run tests and commit.

Suggested commit boundary:

~~~text
fix(staff-ui): align Angular core workflows with canonical staff API
~~~

### Batch B — Evidence repair

1. correct CaseWorkspace resolution
2. dedicated evidence integration tests
3. canonical evidence-template discovery
4. Angular create custom requirement
5. link/unlink documents
6. evidence capability/action UX
7. evidence/document navigation

Run tests and commit.

Suggested commit boundary:

~~~text
fix(evidence): repair case workspace integrity and complete staff workflow
~~~

### Batch C — Tasks parity

1. task create
2. task edit
3. status transitions
4. assignment
5. case/global task UX consistency
6. permission tests

Run tests and commit.

Suggested commit boundary:

~~~text
feat(tasks): complete Angular staff task operations
~~~

### Batch D — Communications

1. add global Messages route/navigation
2. add canonical inbox aggregation API if needed
3. unread-first workflow
4. open case/channel conversation
5. preserve existing chat domain/security
6. add tests

Run tests and commit.

Suggested commit boundary:

~~~text
feat(chat): add global staff communications inbox
~~~

### Batch E — UX/UI simplification + existing advanced-module production QA

Before final E2E signoff:

1. implement role-aware dashboard information architecture from Section 1B;
2. simplify Staff global navigation and Case workspace hierarchy;
3. make Client Portal action-oriented;
4. improve requested-document upload and replacement UX;
5. ensure Messages and operational counters lead to actionable queues;
6. strip migrated case operations from Admin CMS navigation after Staff parity is proven;
7. verify terminology, empty states, loading/error states, responsive behavior and accessibility;

Then audit the existing advanced modules.

Audit/fix verified defects and usability blockers in:

- Documents
- Smart Forms
- Petition
- Filing Packets
- Client Portal interoperability

Do not expand scope into deferred features.

Suggested commit boundary:

~~~text
fix(workflows): close end-to-end case preparation parity gaps
~~~

### Batch F — Stabilization report

Create:

docs/implementation/STABILIZATION_PHASE_01_REPORT.md

Report must include:

- starting SHA
- implementation commits
- final SHA
- exact CI run
- all job conclusions
- defects fixed
- remaining limitations
- browser/manual QA performed
- migrations/indexes required
- production actions NOT performed
- rollback notes
- explicit decision whether Phase 11 is now unblocked

---

## 9. Database/index/migration rules

Do not run production mutations as part of implementation.

Allowed during coding:

- local/test MongoDB
- dry-run index tooling
- dry-run migration tooling
- test fixtures
- additive schema code

Not allowed without explicit release approval:

- production migration apply
- production index apply
- production backfill
- production nginx change
- production deploy
- direct production DB edits

If evidence template data needs a production seed, document the exact dry-run and apply procedure in the report/runbook. Do not silently execute it.

Never use syncIndexes against production.

---

## 10. Git safety rules

- Work from stabilization/angular-feature-parity-audit or an additive child branch.
- Do not force push.
- Do not rebase shared history.
- Do not amend already-published commits.
- Do not use git reset --hard or git clean -fd.
- Prefer small additive commits by stabilization batch.
- Do not merge to main automatically.
- Do not deploy production automatically.
- Stop for release approval only after final CI is green.

Because main is connected to deployment automation, treat merging into main as a release action.

---

# MASTER COMMAND PROMPT

Copy the entire section below into a fresh coding session when starting implementation.

---

You are implementing **Stabilization Phase 01 — Angular Staff Feature Parity & End-to-End Contract Repair** for the Immigration Horizons repository.

Repository:

~~~text
ashderkarim123/Immigration-Horizons
~~~

Starting branch:

~~~text
stabilization/angular-feature-parity-audit
~~~

Authoritative stabilization document:

~~~text
docs/implementation/STABILIZATION_PHASE_01_FEATURE_AUDIT_AND_MASTER_PROMPT.md
~~~

## Mission

Do not build Phase 11 USCIS Tracking yet.

Audit and repair the already-implemented case-management platform so that the features that exist in backend/domain code are actually usable end-to-end from the Angular staff application and interoperable with the existing Next.js client portal.

Treat current repository code as authoritative when an old document disagrees.

The target production architecture remains:

~~~text
Public website       = Next.js
Client portal        = Next.js
Staff case app       = Angular
Canonical staff API  = Express /api/v1/staff
Admin CMS            = Express/EJS
Database             = MongoDB
~~~

Do not replace those boundaries during this task.


## UX/UI redesign requirements

Treat UX as part of functional stabilization.

Do not merely reskin the current screens.

Before declaring a module complete, redesign the information architecture for a non-technical user.

Required role dashboards:

~~~text
Staff Operations Admin
PM / Project Manager
Specialist
Reviewer / QA
Client
Admin CMS
~~~

Use the same Staff application with capability-driven content for staff roles; do not create separate duplicated applications.

Staff global navigation should remain small and clear:

~~~text
Dashboard
Cases
Clients
Tasks
Messages
Deadlines
~~~

Add other top-level items only when they represent a true cross-case workflow.

Simplify the Case workspace by grouping communication, client inputs, case work and management rather than presenting every technical module as an equal concept.

Client dashboard must lead with "Action Required" and make requested document upload, Forms and Messages obvious.

Client requested-document upload must preselect the request/category where possible.

Admin CMS visual language and navigation must clearly communicate that it is for website/system administration, not normal case operations.

Every dashboard metric that represents work should link to the relevant queue.

Add manual UX acceptance criteria from Section 1B to the final stabilization report.

## Non-negotiable engineering rules

1. Never infer authorization in Angular from invented role names.
2. Use server-provided action flags and canonical capabilities for UI visibility.
3. Server-side capability + row-level authorization remains authoritative.
4. Do not introduce duplicate case/task/document/evidence/chat/form/petition/packet models.
5. Use explicit DTO types. Remove touched uses of any where practical.
6. Do not make Angular depend on raw Mongoose fields such as _id when the API contract returns id.
7. Do not weaken trusted-origin, session, secure-download, concealment or capability checks.
8. Do not expose private storage keys, paths, checksums, password data, session tokens, internal form answers or petition text in generic DTOs/logs.
9. Do not run production deploys, indexes, migrations or backfills.
10. Do not merge to main automatically.
11. Use additive commits. No force push/rebase/reset-hard/clean.
12. Every repaired Angular workflow must be covered by tests using response fixtures shaped like the real Express DTO.
13. Add integration tests where a backend bug previously escaped because no real-domain test covered it.
14. Continue until the stabilization scope below is complete and the exact final SHA has all CI jobs green, or document a concrete blocker that cannot safely be solved from the repository.

## First action: re-audit the baseline

Before editing:

- read this stabilization document completely
- inspect current main and this branch
- inspect current CI workflow
- inspect the canonical staff OpenAPI
- inspect the exact files named in the findings
- verify whether each defect still exists
- record any finding that changed since the audit baseline

Do not blindly patch based only on prose.

## Batch A — repair P0 Angular/API contracts

### A0. Enforce Admin CMS vs Staff Operations separation

Implement the architecture boundary in Section 1A.

Required:

- add explicit CMS-access authorization such as `admin.cms.access`;
- deny PM/specialist/reviewer/viewer CMS authentication even with a correct password;
- preserve correct bad-password lockout behavior separately from role/surface denial;
- create no CMS session on a surface-authorization denial;
- keep Staff EmployeeSession authentication independent;
- introduce/confirm a real staff-side elevated operational role such as `operations_admin`, not a shared pseudo account;
- move operational authority to canonical Staff APIs and Angular;
- remove migrated operational modules from Admin CMS navigation only after their Staff Portal parity is verified;
- keep legacy route code only as a deliberate temporary rollback path, not the normal workflow;
- add route-level tests: UI hiding alone is insufficient.

### A1. First-login password setup

Align Angular with server/routes/api/v1/staff/account.js.

Required:

~~~text
currentPassword
newPassword
confirmPassword
minimum 12 characters
~~~

Add test coverage proving a mustChangePassword employee can complete setup.

### A2. Cases directory

Align Angular Cases with server/routes/api/v1/staff/cases.js.

Verify/fix:

~~~text
id vs _id
search query parameter
archived query parameter
pagination total/totalPages
case links
URL filter persistence
scope
stage
caseType
priority
~~~

Use explicit DTO types.

### A3. Clients directory/detail

Align with server/routes/api/v1/staff/clients.js and ClientUser status enum.

Verify/fix:

~~~text
search
pagination
pending/active/locked/disabled
displayName
cases[].id
remove fabricated portalStatus assumptions
~~~

### A4. Case action permissions

Use case-detail actions and/or canonical AuthService capabilities.

Remove role-name lists such as case_manager/paralegal/attorney from touched staff authorization UI.

Verify PM, admin, reviewer, specialist and viewer behavior.

### A5. Team

Consume:

~~~text
GET /staff/cases/:id/members
GET /staff/cases/:id/member-options
~~~

Align member DTO rendering.

Align mutation bodies exactly with Express:

~~~text
projectManagerId
adminUserId
workspaceRole
clientVisible
~~~

Reload canonical state after mutations.

### A6. Activity

Consume the real activity endpoint.

Implement loading/empty/error/pagination.

### A7. Mutation refresh

Never overwrite the full case state with compact mutation responses.

Use a consistent reload strategy.

### A8. Dashboard routing

Ensure navigation remains under the Angular /staff base.

Prefer Angular RouterLink over raw root-relative href for staff routes.

After Batch A:

- run server tests
- run root tests
- run Angular tests
- lint/typecheck
- build case-management
- verify staff build
- commit Batch A

## Batch B — repair and complete Evidence

The highest-priority backend defect to verify is the use of clientCase.workspace even though ClientCase does not own the authoritative workspace relationship.

Resolve the primary CaseWorkspace explicitly.

Required backend behavior:

- evidence provisioning works on a real case/workspace
- EvidenceRequirement.workspace is always correct
- PM/member authorization uses real workspace ID
- removed employee loses access
- malformed/inaccessible targets conceal safely
- same-case document links only
- custom requirement works
- status change works
- link/unlink works
- provisioning is idempotent

Create a dedicated evidence integration test suite if one is absent.

Then complete Angular Evidence parity:

- provision
- custom requirement
- status
- linked documents
- link eligible same-case document
- unlink
- guidance display as appropriate
- document navigation

Do not hard-code evidence templates in Angular.

Create/read a canonical list of active templates appropriate for the case type.

Inspect the existing template seed migration. Do not apply production migrations. Document any production seed requirement.

Run the full verification set and commit Batch B.

## Batch C — complete Task operations

Keep the existing Task model/services.

Implement staff UX for:

- create case task
- edit allowed fields
- assign/reassign when permitted
- status transitions
- completion
- global task list consistency
- case task consistency

Specialists/reviewers with ownership-scoped permissions must not gain blanket task management.

Add tests and commit Batch C.

## Batch D — make Chat discoverable as a global module

Do not rewrite chat.

Keep:

~~~text
WorkspaceChannel
WorkspaceMessage
ChannelReadState
existing attachment rules
existing case Chat tab
~~~

Add top-level Angular navigation:

~~~text
Messages
~~~

Build a global staff communications inbox using canonical API aggregation.

Minimum row:

~~~text
case number
case title
channel
audience
latest sender
latest message preview
latest activity time
unread count
~~~

Unread first.

Allow opening the correct case/channel conversation.

Preserve restricted/internal-channel concealment.

Add API and Angular tests.

Commit Batch D.

## Batch E — end-to-end parity verification

Audit the already-developed modules without redesigning them:

- Documents
- Smart Forms
- Petition Work
- Filing Packets
- Client Portal interoperability

Fix only real defects discovered during end-to-end testing.

Do not add:

- USCIS tracking
- PDF packet merge
- ZIP assembly
- official USCIS form rendering
- e-signature
- e-filing
- AI
- Angular admin cutover

Perform the two-session workflow from the stabilization document.

Create regression tests for every defect found.

## Definition of done

Stabilization Phase 01 is complete only when:

1. PM/specialist/reviewer/viewer cannot authenticate to Admin CMS; admin/editor/super_admin access follows explicit CMS capability
2. Staff Operations Admin can administer case operations from the Staff Portal with an individually attributable account
3. Admin CMS no longer serves as the documented normal case-operations workspace
4. Staff Operations Admin, PM, Specialist and Reviewer dashboards prioritize their own actionable work
5. Client dashboard clearly shows Action Required, cases, messages, documents and forms
6. requested client document upload preselects its request/category where applicable and replacement actions are obvious
7. first-login staff password setup works
8. Cases list/search/filter/pagination/navigation works
9. Clients list/detail works
10. PM sees case actions permitted by the server
11. Team loads real members and add/remove/PM change works
12. Activity timeline loads real CaseActivity
13. case mutations do not corrupt local case state
14. Evidence works on a real CaseWorkspace and has integration coverage
15. Evidence custom/link/unlink workflow is usable
16. Tasks can be operated, not merely listed
17. staff has a discoverable global Messages inbox
18. case Chat remains interoperable with Client Portal Chat
19. Documents, Forms, Petition and Filing Packet core flows pass regression verification
20. removed workspace members lose access immediately
21. Angular tests use canonical DTO-shaped fixtures for touched workflows
22. role-specific dashboards and Client action-oriented UX pass the manual UX acceptance criteria
23. root tests are green
24. server tests are green
25. Angular case-management tests are green
26. lint/typecheck/build are green
27. final GitHub CI for the exact final SHA has all required jobs successful

## Final report

Create:

~~~text
docs/implementation/STABILIZATION_PHASE_01_REPORT.md
~~~

Include:

- baseline SHA
- final SHA
- commits
- audit defects confirmed
- defects fixed
- tests added
- manual/browser QA results
- remaining limitations
- production migration/index/seed requirements
- production actions not performed
- rollback notes
- whether Phase 11 USCIS Tracking is now unblocked

Stop after the exact final SHA is green and request explicit release/merge approval.

Do not merge main or deploy production as part of this implementation command.

---

## 11. Expected outcome

After this stabilization phase, the staff product should no longer be judged by whether a model or route exists.

It should be judged by whether a real employee can:

~~~text
sign in
open their cases
manage the case team
see activity
work tasks
manage evidence
handle documents
communicate with the client
review forms
prepare petition work
assemble the filing manifest
and move between those workflows without contract failures
~~~

Only after that standard is met should Phase 11 USCIS Tracking begin.
