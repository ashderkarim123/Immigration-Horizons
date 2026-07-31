# Phase 1 — Repository Audit & Implementation Foundation

**Date**: 2026-08-01
**Scope**: Public site (repo root, Next.js) + Admin CMS (`server/`, Express/EJS)
**Status**: Audit only — no code changes made. Do not begin Phase 2 implementation until this has been reviewed.

---

## 1. Executive Summary

The two-application architecture (Next.js public site at repo root; Express/EJS admin CMS in `server/`) is sound and consistently implemented — good separation of concerns, deliberate decoupling of email/DB writes, sensible production startup guards, and already-working task/sprint/notification/delivery tooling most projects at this stage don't have yet.

Two things need attention before any new feature work:

1. **A confirmed, exploitable stored-XSS vulnerability** in `/admin/search` — publicly-submitted lead name/email fields are rendered as raw, unescaped HTML. Any anonymous website visitor can plant script that executes in an admin's authenticated session.
2. **The role system exists but is only enforced in about half the places it should be.** `leadOps.js` (tasks/sprints/assignment/delivery) correctly gates mutations with `blockReadOnly`/`requireManager`. `index.js` (lead status/notes/delete, blog/testimonial/FAQ/media/settings CRUD) has **no role check at all** on any of those routes — only "is logged in," so a `viewer` role can currently delete leads and blog posts despite being designed as read-only.

Neither of these requires a rewrite. Both are scoped, file-level fixes. Recommendation: fix the XSS immediately, then proceed directly into Phase 2 as planned — the authorization gap it reveals is exactly what Phase 2 is scoped to close.

---

## 2. Repository Architecture Map

### 2.1 Public-site request flow
`src/app/**/page.tsx` (Server Components, static/ISR by default) → `src/lib/content/*` for copy → `src/components/*` for rendering. No API routes exist (`src/app/api/` doesn't exist). `next.config.ts` pins `turbopack.root` and externalizes `mongoose`.

### 2.2 Consultation submission flow
`consultation-form.tsx`/`contact-form.tsx` → `src/app/{consultation,contact}/actions.ts` (Server Actions, `"use server"`) → honeypot check → `isRateLimited()` (`src/lib/rate-limit.ts`, in-memory, 5/min/IP via `x-forwarded-for`) → field validation (name / email-regex / service-enum / message-length) → `deliverLead()` (`src/lib/leads.ts`) → **parallel, independent**:
- (a) `persistLead()` → `getDb()` / `src/lib/db.ts` → `Consultation.create()` (`src/lib/models/Consultation.ts`)
- (b) Resend email with `escapeHtml()`-sanitized HTML body

Failure in (a) never blocks (b) and vice versa; user-facing success/failure tracks only the email step.

### 2.3 Admin authentication flow
`GET/POST /admin/login` (`server/routes/admin/index.js`) → rate-limited (`express-rate-limit`, 10/15min) → DB user lookup (`AdminUser.findOne` + `comparePassword` bcrypt) → fallback to env-credential path (`ADMIN_USERNAME`/`ADMIN_PASSWORD` or `ADMIN_PASSWORD_HASH`, constant-time compared via `safeEqual`) → `req.session.regenerate()` (session-fixation protection) → `req.session.adminUser = {id,name,role}` set.

### 2.4 Admin authorization flow
`requireAdmin` (`server/middleware/auth.js`) — boolean `req.session.isAdmin` gate, applied once via `router.use('/admin', requireAdmin, ...)` in `index.js`, covering everything under `/admin`. On top of that, `server/utils/permissions.js` provides `blockReadOnly`/`requireManager`, applied **only** to the `leadOps.js` routes (tasks, sprints, notifications, assign, delivery). **Not applied** to any route in `index.js` (leads status/notes/delete, blog, testimonials, FAQs, media, settings). User management routes (`/admin/users*`) use ad hoc inline `currentRole` checks instead of either helper.

### 2.5 Lead-management flow
`Consultation` model (12-stage `status` enum, `owner`/`assignees[]`, UTM/attribution fields) ← forms on both frontends write via `source: 'consultation'|'contact'`. Admin: `GET /admin/leads` (filtered/paginated list) → `GET /admin/leads/:id` (detail: notes, tasks, activity, delivery, assignment) → `POST .../status`, `.../notes`, `DELETE /admin/leads/:id`, `POST .../assign` (leadOps, manager-gated). Every status/note/task/assign/delivery mutation calls `logActivity()` → `ActivityLog` (append-only, per-lead).

### 2.6 Task/sprint relationships
`Task.lead → Consultation`, `Task.sprint → Sprint` (optional), `Task.assignee → AdminUser` (+ denormalized `assigneeName`). `Sprint` is standalone (`name`/`goal`/`startDate`/`endDate`/`status: planning|active|completed`). No `Case`/`Petition` entity — tasks attach directly to the lead.

### 2.7 Delivery workflow
`DeliveryRecord.lead → Consultation` (1:1, lazily created via `getOrCreateDelivery`), `state: drafting→internal_review→client_review→ready→delivered`, `files[]` (name/url/status, no real file generation), mirrors `Consultation.deliveryStatus` on save. Export is a logged placeholder (`.../delivery/export`), not real file assembly.

### 2.8 Media-storage workflow
`middleware/upload.js` (multer, disk storage under `server/public/uploads/`, extension+MIME allowlist restricted to png/jpg/jpeg/webp/gif — **no SVG**, so no SVG-borne script execution risk, 5MB limit, filename sanitized+timestamped) → `Media` model record → served publicly via `app.use(express.static('public'))` (no auth on the file itself, by design for images).

### 2.9 Notification workflow
`utils/notify.js` (`notify`/`notifyMany`, targets by `recipientName` string so it works for both DB users and the env-credential fallback) → `Notification` model → surfaced via topbar dropdown middleware (every `/admin/*` request: unread count + last 8, queried in `index.js`'s shared middleware) and the full `/admin/notifications` list.

### 2.10 Data models and relationships

```
Consultation (lead) ──< Task >── Sprint
     │  ├──< InternalNote
     │  ├──< ActivityLog (append-only)
     │  └──1:1 DeliveryRecord
AdminUser ──< Task.assignee, Consultation.owner/assignees, Notification.recipient (by name)
BlogPost (standalone) ──< Comment (model exists, no route anywhere creates/reads it — appears unused/dead)
Testimonial, FAQ, SEOMeta, Media, Setting — standalone CMS-support collections
```

---

## 3. Confirmed Issues

### 🔴 Critical

**C1 — Stored XSS in `/admin/search`** (`server/views/admin/search.ejs:16,24`)

`section('Leads', leads, function(l){ return '<tr>...' + l.name + '...' + l.email + '...'; })` is rendered via `<%- items.map(render).join('') %>` — **unescaped** output. `l.name`/`l.email` originate from the fully public, unauthenticated consultation/contact form (`server/models/Consultation.js`, no HTML-stripping on write). A visitor submitting a crafted `name` (e.g. an `<img onerror=...>` payload that POSTs to `/admin/users` to create a `super_admin` account) plants script that executes in **any admin's** authenticated session the next time they search for something matching that lead — a routine admin action. Same pattern also reflects Blog/Testimonial/FAQ fields (lines 23/25/26) — lower severity since those are admin-authored, but still a persistent-XSS path between differently-privileged admin accounts.

*Confirmed by direct read of the template; not theoretical.*

### 🟠 High

**H1 — Missing role/ownership enforcement on `index.js` mutation routes**

None of these check `blockReadOnly`/`requireManager` or any role at all — only `requireAdmin` (logged in as *anyone*):
- `POST /admin/leads/:id/status`, `POST /admin/leads/:id/notes`, **`DELETE /admin/leads/:id`**
- `POST/PUT/DELETE /admin/blog*`, `POST/PUT/DELETE /admin/testimonials*`, `POST/PUT/DELETE /admin/faqs*`
- `POST /admin/media/upload`, `DELETE /admin/media/:id`
- `POST /admin/settings`

Contrast with `leadOps.js`, where equivalent-risk actions (create task, create sprint, delete task/sprint) *are* correctly gated. This is the exact gap Phase 2 is scoped to close — the role enum and `MANAGER_ROLES`/`READ_ONLY_ROLES` split already exist and work in one file; they're simply not applied in the other. **A `viewer`-role account today can permanently delete any lead or blog post.**

*Confirmed by reading every route in `index.js` and comparing against `permissions.js`'s exports.*

**H2 — No CSRF protection** (already documented in the repo's own `SECURITY.md`, confirmed here)

`sameSite: 'lax'` mitigates classic cross-site auto-submit POST CSRF in modern browsers but doesn't eliminate it (subdomain-scoped attacks, older browsers, any future proxy misconfiguration). Given H1's broad unauthenticated-by-role write surface, closing H1 first reduces CSRF's blast radius more cheaply than adding tokens everywhere immediately.

### 🟡 Medium

**M1 — CSV formula injection** (`index.js:449-460`, `/admin/leads/export/csv`)

`l.name`, `l.email`, `l.message`, `l.country`, `l.occupation` are written into CSV cells with only quote-doubling (`replace(/"/g,'""')`) — no check for a leading `=`, `+`, `-`, or `@`. Since these fields originate from an anonymous public form, a submitted name/message like `=HYPERLINK("http://evil","click")` executes as a formula when an admin opens the export in Excel/Sheets.

*Confirmed — no sanitization present in the export code.*

**M2 — Fail-open role default**

`req.session.adminUser?.role || 'super_admin'` (repeated in `index.js`'s shared middleware, `/admin/users*` inline checks) defaults to the **highest** privilege when role is missing, not the lowest. Not currently triggerable in normal use (`finishLogin` always sets `adminUser` alongside `isAdmin`), but it's a latent privilege-escalation-by-default pattern that Phase 2's RBAC work should replace with fail-closed/deny-by-default.

**M3 — Missing indexes on hot queries**

`Consultation` has no index on `status`, `email`, `createdAt`, or `owner` despite every leads-list/filter/sort/CSV-export query hitting these fields. `Notification` has no compound index on `(recipientName, read)` despite that exact query running on **every single `/admin/*` page load** (the topbar unread-count middleware). At current data volume this is invisible; it won't stay that way.

**M4 — Unbounded queries**

`/admin/leads/export/csv` (no `.limit()`), `/admin/tasks`, `/admin/sprints` GET routes (no pagination) — fine at today's scale, will degrade as data grows.

**M5 — Rate-limit key is spoofable via client-supplied header**

`src/lib/rate-limit.ts` trusts `x-forwarded-for`/`x-real-ip` verbatim. Safe only if the production reverse proxy (nginx, per the repo's `DEPLOYMENT.md`) is configured to strip/overwrite client-supplied values before setting its own — that's an infrastructure responsibility this codebase can't itself verify (see Section 4).

### 🔵 Low

- **L1 — Broken (not insecure) file-link rendering** (`leads/detail.ejs:182`) — the delivery-files table builds an `<a>` tag inside `<%= %>` (escaped), so it renders as literal text `<a href="...">`, not a clickable link. Functional bug, not a security issue.
- **L2 — No automated tests, no CI.** Confirmed: no `*.test.*`/`*.spec.*` files anywhere, no test framework in either `package.json`, no `.github/workflows`.
- **L3 — Console-only logging**, no structured/centralized log output in either app.
- **L4 — `Comment` model appears unused** — schema exists (`server/models/Comment.js`), no route anywhere creates, lists, or moderates it. Verify whether this is a planned-but-unbuilt feature or dead code before extending it.
- **L5 — No duplicate-submission idempotency key** on the public forms — mitigated in practice by the 5/min per-IP rate limit and POST-redirect-GET pattern on the admin side, but worth a real submission ID if Phase 6 revisits this.

---

## 4. Potential Risks Requiring Verification (cannot confirm from repo alone)

- **Production `X-Forwarded-For` handling**: whether nginx actually strips client-supplied values (affects M5's real-world severity). Infra config, not in this repo.
- **MongoDB Atlas Network Access allowlist** and DB user privilege level (least-privilege vs. cluster admin) — referenced in the repo's `DEPLOYMENT.md` checklist but not verifiable from code.
- **Whether `SESSION_SECRET`/`ADMIN_PASSWORD` have actually been rotated in the live production `.env`** — the startup guard only checks against known placeholder strings, not general strength.
- **CSP feasibility**: `contentSecurityPolicy: false` is currently required because admin views use inline `<script>`/`<style>` throughout — fixing C1 doesn't remove the need to eventually assess whether a CSP could be introduced as defense-in-depth (would require auditing every inline script, a larger effort not scoped here).

---

## 5. Prioritized Roadmap

The originally proposed Phase 2–8 ordering is sound; no reordering recommended. One addition: **Phase 1.5 (immediate, before Phase 2 proper)** — patch C1 (stored XSS) as a standalone, minimal-risk fix, since it's a live critical vulnerability with a near-zero-risk single-file patch, and shouldn't wait behind the broader RBAC rollout.

Phase 2 (Authorization) should explicitly include closing H1 (it's the same underlying gap Phase 2 already targets) and fixing M2's fail-open default as part of the same work.

---

## 6. Proposed Phase 2 Implementation

**Goal**: capability-based authorization, enforced in route handlers/middleware, using the roles that already exist (`super_admin, admin, editor, pm, petition_writer, business_plan_specialist, recommendation_letter_specialist, uscis_forms_specialist, evidence_collector, reviewer, viewer`).

**Approach**: extend `server/utils/permissions.js` (already the established pattern — don't introduce a parallel system) from its current two-bucket `MANAGER_ROLES`/`READ_ONLY_ROLES` split into a capability map:

```js
// server/utils/permissions.js — additive extension, not a rewrite
const CAPABILITIES = {
  'users.manage':        ['super_admin', 'admin'],
  'settings.manage':     ['super_admin', 'admin'],
  'leads.view':          ['super_admin','admin','pm','petition_writer','business_plan_specialist',
                           'recommendation_letter_specialist','uscis_forms_specialist','evidence_collector','reviewer','viewer'],
  'leads.assign':        ['super_admin', 'admin', 'pm'],
  'leads.edit':          ['super_admin', 'admin', 'pm' /* + task specialists for their own assigned work — see Q1 */],
  'leads.delete':        ['super_admin', 'admin'],
  'notes.create':        [/* everyone except viewer */],
  'tasks.manage':        [/* existing blockReadOnly set */],
  'sprints.manage':      [/* existing requireManager set */],
  'deliveries.manage':   [/* existing blockReadOnly set */],
  'blog.manage':         ['super_admin', 'admin', 'editor'],
  'faqs.manage':         ['super_admin', 'admin', 'editor'],
  'testimonials.manage': ['super_admin', 'admin', 'editor'],
  'media.manage':        ['super_admin', 'admin', 'editor' /* + task roles, upload only */],
  'csv.export':          ['super_admin', 'admin', 'pm'],
  'reports.view':        ['super_admin', 'admin', 'pm'],
};

function can(req, capability) {
  const role = req.session?.adminUser?.role;
  if (!role) return false; // fail CLOSED — replaces the `|| 'super_admin'` fail-open default (M2)
  return (CAPABILITIES[capability] || []).includes(role);
}

function requireCapability(capability) {
  return (req, res, next) => {
    if (!can(req, capability)) return res.status(403).send(`Requires: ${capability}`);
    next();
  };
}

module.exports = { /* ...existing exports */, CAPABILITIES, can, requireCapability };
```

This is deliberately additive: `blockReadOnly`/`requireManager` keep working unchanged in `leadOps.js`; `requireCapability(...)` gets added to the routes in `index.js` that currently have nothing (closing H1), and `/admin/users*`'s inline checks get replaced with the same helper (removing the fail-open default, M2).

---

## 7. File-by-File Change Plan

| File | Change | Risk |
|---|---|---|
| `server/utils/permissions.js` | Add `CAPABILITIES` map, `can()`, `requireCapability()` — additive, existing exports untouched | Low |
| `server/routes/admin/index.js` | Add `requireCapability(...)` to: leads status/notes/delete, blog POST/PUT/DELETE/toggle-publish, testimonials POST/PUT/DELETE, faqs POST/PUT/DELETE, media upload/delete, settings POST. Replace `/admin/users*` inline `currentRole` checks with `requireCapability('users.manage')` / a delete-specific capability | Medium — must verify no currently-working workflow silently starts 403'ing for a role that should still have access |
| `server/views/admin/search.ejs` | **Immediate, separate from Phase 2**: change the `<%- items.map(render).join('') %>` pattern to build rows with `<%=`-escaped interpolation, or add an `escapeHtml()` helper applied inside each `render` function before returning the string | Low — visual only, no behavior change beyond no-longer-vulnerable |
| `server/routes/admin/index.js` (CSV export) | Prefix any cell value starting with `=`, `+`, `-`, `@` with a leading `'` or space per OWASP CSV-injection guidance | Low |
| `server/models/Consultation.js` | Add `index: true` to `status`, `email`, `createdAt`, `owner` (or a compound index matching the common filter+sort combination) | Low, but requires a migration step (background index build) |
| `server/models/admin/Notification.js` | Add compound index `{ recipientName: 1, read: 1 }` | Low, same index-build caveat |
| `server/views/admin/{leads,blog,testimonials,faqs,media,settings}/index.ejs` | Conditionally hide now-restricted action buttons (delete/edit) for roles lacking the capability — UI-level, in addition to (not instead of) the server-side check | Low |

---

## 8. Test Plan

Since there are currently zero automated tests (L2), Phase 2 is also the right moment to add the first ones rather than verifying by hand only:

1. **Authorization tests** (new — recommend `supertest` + an in-memory Mongo, e.g. `mongodb-memory-server`, since neither is installed yet and both are minimal, well-maintained additions): for each of the 11 roles, assert `can(role, capability)` matches the intended matrix above — this is the core Phase 2 deliverable and should be the first test written.
2. **Route-level tests**: for each newly-gated route, assert a `viewer` session gets 403 and a `super_admin` session succeeds, for at least: lead delete, lead status change, blog delete, testimonial delete, settings update, user create/delete.
3. **Regression check (manual, before merging)**: log in as each existing role once and confirm every workflow that role *should* still be able to do still works — the actual risk in H1's fix is a false-positive "too strict" regression, more likely here than a missed gap, precisely because nothing was gated before.
4. **XSS fix verification**: submit a consultation form with `name = <script>alert(1)</script>`, search for it in `/admin/search`, confirm the rendered page shows the literal text, not an executed script (view source / check for `&lt;script&gt;`).
5. **CSV injection verification**: submit a lead with `name = =1+1`, export CSV, open in a spreadsheet app, confirm it's treated as text, not a formula.

---

## 9. Migration Requirements

- **Adding indexes to `Consultation`/`Notification`**: on MongoDB Atlas, `createIndex` runs as a background build by default in modern MongoDB — non-blocking, but **take the Part 8 `mongodump` backup first** per the existing `DEPLOYMENT.md` discipline, and run it during low-traffic hours as a precaution given production is live.
- **No schema-shape changes, no data migration needed** for the Phase 2 authorization work itself — it only adds enforcement logic and a capability map, touching no stored documents.
- **Existing `AdminUser` role data is untouched** — the capability map is additive over the existing 11-value enum; no user record needs to change.
- **Rollback**: every change in the file-by-file plan is a revertible code change (`git revert`) with no destructive data migration attached — the lowest-risk kind of rollback.

---

## 10. Questions / Blockers That Cannot Be Resolved From the Repository

1. **`leads.edit`/`media.manage` capability boundaries**: should `petition_writer`/`business_plan_specialist`/etc. be able to edit *any* lead's status/notes, or only leads they're assigned to (`Consultation.assignees`)? The repo doesn't currently express per-user ownership restriction beyond the manager/read-only split — this is a product decision, not something inferable from code.
2. **Confirm production `X-Forwarded-For` handling** (M5) with whoever manages the nginx config — outside this repo.
3. **Confirm current MongoDB Atlas Network Access + DB user privilege level** — outside this repo.
4. **`Comment` model (L4)**: intentional unbuilt feature, or safe to remove? Needs the product owner's call.
5. **CSP feasibility timeline**: worth a dedicated future pass (inventory every inline `<script>`/`<style>` in `server/views/`) — out of scope for Phase 2, flagged so it doesn't get silently dropped.

---

## 11. Recommended Immediate Task (before Phase 2 proper)

**Fix C1 — stored XSS in `/admin/search`**

- **Why first**: it's the only *confirmed, exploitable, critical* finding; the fix is a single file, ~10-line change with no schema/route/behavior changes beyond removing the vulnerability; zero dependency on Phase 2's broader authorization work.
- **Files**: `server/views/admin/search.ejs` only.
- **Database impact**: none.
- **Security impact**: eliminates the confirmed stored-XSS path; no new surface introduced.
- **Testing**: manual — submit a lead with a `<script>`/`<img onerror>` payload in `name`, search for it, confirm it renders as inert text (see Test Plan item 4).
- **Rollback**: single-file git revert.
- **Dependencies**: none — can ship before, independent of, or alongside Phase 2.
- **Acceptance criteria**: all four `section(...)` calls in `search.ejs` render lead/blog/testimonial/FAQ fields with HTML-escaped output; no `<%- %>` remains around any value derived from a Mongo document field.
