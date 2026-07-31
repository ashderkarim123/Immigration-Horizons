# Phase 2 — Capability-Based Authorization

**Scope**: `server/` (admin CMS) only. No public-site, document-delivery, or analytics work included.
**Status**: Implemented. Not committed/pushed.

---

## 1. Route Authorization Inventory

Confirmed against the current code (not just the Phase 1 audit) before editing.

| Method | Path | Before | After | Mutation | Capability |
|---|---|---|---|---|---|
| POST | `/admin/leads/:id/status` | `requireAdmin` only | + `requireCapability` | write | `leads.edit` |
| POST | `/admin/leads/:id/notes` | `requireAdmin` only | + `requireCapability` | write | `notes.create` |
| DELETE | `/admin/leads/:id` | `requireAdmin` only | + `requireCapability` | delete | `leads.delete` |
| GET | `/admin/leads/export/csv` | `requireAdmin` only | + `requireCapability` | export | `csv.export` |
| POST | `/admin/leads/:id/assign` | `requireManager` | `requireCapability` (same role set) | write | `leads.assign` |
| POST | `/admin/leads/:leadId/tasks` | `blockReadOnly` | `requireCapability` (narrowed) | write | `tasks.manage` |
| PUT | `/admin/tasks/:id` | `blockReadOnly` | inline `canManageTask()` (ownership-aware) | write | `tasks.manage` **or** task owner |
| POST | `/admin/tasks/:id/status` | `blockReadOnly` | inline `canManageTask()` | write | `tasks.manage` **or** task owner |
| POST | `/admin/tasks/:id/sprint` | `blockReadOnly` | inline `canManageTask()` | write | `tasks.manage` **or** task owner |
| DELETE | `/admin/tasks/:id` | `requireManager` | `requireCapability` (same role set) | delete | `tasks.manage` |
| POST | `/admin/sprints` | `requireManager` | `requireCapability` (same role set) | write | `sprints.manage` |
| POST | `/admin/sprints/:id/status` | `requireManager` | `requireCapability` (same role set) | write | `sprints.manage` |
| DELETE | `/admin/sprints/:id` | `requireManager` | `requireCapability` (same role set) | delete | `sprints.manage` |
| POST | `/admin/leads/:id/delivery` | `blockReadOnly` | `requireCapability` (narrowed: -editor) | write | `deliveries.manage` |
| POST | `/admin/leads/:id/delivery/files` | `blockReadOnly` | `requireCapability` (narrowed: -editor) | write | `deliveries.manage` |
| POST | `/admin/leads/:id/delivery/export` | `blockReadOnly` | `requireCapability` (narrowed: -editor) | write | `deliveries.manage` |
| POST | `/admin/blog` | `requireAdmin` only | `requireCapability` | write | `blog.manage` |
| PUT | `/admin/blog/:id` | `requireAdmin` only | `requireCapability` | write | `blog.manage` |
| DELETE | `/admin/blog/:id` | `requireAdmin` only | + `requireCapability` | delete | `blog.manage` |
| POST | `/admin/blog/:id/toggle-publish` | `requireAdmin` only | + `requireCapability` | publish | `blog.manage` |
| POST | `/admin/testimonials` | `requireAdmin` only | + `requireCapability` | write | `testimonials.manage` |
| PUT | `/admin/testimonials/:id` | `requireAdmin` only | + `requireCapability` | write | `testimonials.manage` |
| DELETE | `/admin/testimonials/:id` | `requireAdmin` only | + `requireCapability` | delete | `testimonials.manage` |
| POST | `/admin/faqs` | `requireAdmin` only | + `requireCapability` | write | `faqs.manage` |
| PUT | `/admin/faqs/:id` | `requireAdmin` only | + `requireCapability` | write | `faqs.manage` |
| DELETE | `/admin/faqs/:id` | `requireAdmin` only | + `requireCapability` | delete | `faqs.manage` |
| POST | `/admin/media/upload` | `requireAdmin` only | + `requireCapability` | upload | `media.manage` |
| DELETE | `/admin/media/:id` | `requireAdmin` only | + `requireCapability` | delete | `media.manage` |
| POST | `/admin/media/:id/alt` | `requireAdmin` only | + `requireCapability` | write | `media.manage` |
| POST | `/admin/settings` | `requireAdmin` only | + `requireCapability` | write | `settings.manage` |
| GET | `/admin/users` | inline `currentRole` check, fail-open default | `requireCapability` | read (sensitive) | `users.manage` |
| GET | `/admin/users/new` | inline `currentRole` check, fail-open default | `requireCapability` | read (sensitive) | `users.manage` |
| POST | `/admin/users` | inline `currentRole` check, fail-open default | `requireCapability` + role-escalation guard | create | `users.manage` |
| DELETE | `/admin/users/:id` | inline `currentRole !== 'super_admin'` | `requireCapability` + self-delete + last-super-admin guards | delete | `users.delete` |

Routes intentionally left unchanged (correctly self-scoped already, no role check needed):
- `GET/POST /admin/notifications*` — scoped to `recipientName = req.session.adminUser.name`, inherently per-user.
- `GET /admin/login`, `POST /admin/login`, `POST /admin/logout` — pre-authentication by definition.
- All `GET` list/view routes for blog/testimonials/FAQs/media/settings/leads/tasks/sprints/delivery — viewable by any authenticated admin (including `viewer`), matching the "viewer can browse permitted pages" requirement. Only mutations are capability-gated.

---

## 2. Final Capability Matrix

```
                        super_ admin editor pm  petition_ business_ recommend_ uscis_ evidence_ reviewer viewer
                        admin                   writer    plan_spec letter_spec forms  collector
users.manage              ✓     ✓     ·    ·      ·         ·          ·         ·       ·         ·      ·
users.delete               ✓     ·     ·    ·      ·         ·          ·         ·       ·         ·      ·
settings.manage             ✓     ✓     ·    ·      ·         ·          ·         ·       ·         ·      ·
leads.view                  ✓     ✓     ✓    ✓      ✓         ✓          ✓         ✓       ✓         ✓      ✓
leads.assign                ✓     ✓     ·    ✓      ·         ·          ·         ·       ·         ·      ·
leads.edit                  ✓     ✓     ·    ✓      ·         ·          ·         ·       ·         ·      ·
leads.delete                 ✓     ✓     ·    ·      ·         ·          ·         ·       ·         ·      ·
notes.create                  ✓     ✓     ·    ✓      ✓         ✓          ✓         ✓       ✓         ✓      ·
tasks.manage (broad)           ✓     ✓     ·    ✓      ·         ·          ·         ·       ·         ·      ·
  + task-owner override        (specialists/reviewer can manage only a task where Task.assignee === them)
sprints.manage                  ✓     ✓     ·    ✓      ·         ·          ·         ·       ·         ·      ·
deliveries.manage                ✓     ✓     ·    ✓      ✓         ✓          ✓         ✓       ✓         ✓      ·
blog.manage                       ✓     ✓     ✓    ·      ·         ·          ·         ·       ·         ·      ·
faqs.manage                        ✓     ✓     ✓    ·      ·         ·          ·         ·       ·         ·      ·
testimonials.manage                 ✓     ✓     ✓    ·      ·         ·          ·         ·       ·         ·      ·
media.manage                         ✓     ✓     ✓    ·      ·         ·          ·         ·       ·         ·      ·
csv.export                            ✓     ✓     ·    ✓      ·         ·          ·         ·       ·         ·      ·
reports.view (unused today)            ✓     ✓     ·    ✓      ·         ·          ·         ·       ·         ·      ·
```

`super_admin` bypasses the array for every *known* capability (true source: `can()` in `permissions.js`), but is denied like everyone else for an unknown/misspelled capability name — see the ordering comment in `can()`.

---

## 3. Files Changed

- `server/utils/permissions.js` — capability map, `can()`, `requireCapability()`, `isTaskOwner()`, `canManageTask()`; fail-closed `getRole()`; `blockReadOnly`/`requireManager` kept (still exported, now fail-closed on missing role too).
- `server/utils/csv.js` — new, `csvCell()` reusable CSV-injection-safe cell formatter.
- `server/routes/admin/index.js` — capability middleware added to leads/blog/testimonials/faqs/media/settings/users routes; shared middleware now exposes `res.locals.can`/`currentRole`/`canManageTask` and no longer fabricates a `super_admin` fallback; CSV export rewritten through `csvCell()`; users routes centralized + self-delete/last-super-admin/privilege-escalation guards added.
- `server/routes/admin/leadOps.js` — task creation/deletion and sprint routes migrated to named capabilities (same role sets, zero behavior change); task update/status/sprint-link routes now use ownership-aware `canManageTask()`; delivery routes migrated from `blockReadOnly` to `deliveries.manage` (narrows out `editor`).
- `server/views/admin/{leads,blog,testimonials,faqs,media,settings,users,tasks,sprints,partials/sidebar}/*.ejs` — mutation controls conditionally hidden via `can()`/`canManageTask()`; inline role-array checks replaced with the centralized helper.
- `server/test/permissions-can.test.js`, `server/test/route-guards.test.js`, `server/test/csv-cell.test.js` — new.
- `server/package.json` — added `supertest` as a devDependency (test-only; 0 vulnerabilities per `npm audit`).

---

## 4. Fail-Closed Behavior — Explanation

Three places used to default a missing/absent role to the highest privilege:
1. `utils/permissions.js`'s `getRole()` — `... || 'super_admin'`.
2. `routes/admin/index.js`'s shared middleware — `res.locals.adminUser = req.session.adminUser || { name:'Admin', role:'super_admin' }`.
3. `routes/admin/index.js`'s three `/admin/users*` routes — `req.session.adminUser?.role || 'super_admin'`.

All three now resolve a missing role to `null`, not `'super_admin'`. `can()` treats `null` (and any role string not present in a capability's array) as denied — never as elevated. This was never triggerable through the current login routes (`finishLogin` always sets `isAdmin` and `adminUser` together), so no real session's behavior changes — it removes a latent "one future bug away from full privilege escalation" pattern, per the Phase 1 audit's M2 finding.

`can()`'s own fail-closed rules (all covered by `permissions-can.test.js`):
- No role on the session → `false`.
- Role present but not a string in any known role list → `false`.
- Capability name not a key in `CAPABILITIES` → `false`, for every role including `super_admin`.
- `super_admin` + a real capability → `true` (explicit bypass, but only after the unknown-capability check, so a typo in a route's `requireCapability('...')` call can never accidentally look like it "worked" for the super admin while blocking everyone else).

---

## 5. Routes Newly Protected

Every route in Section 1's table marked "before: `requireAdmin` only" — 20 routes across leads, blog, testimonials, FAQs, media, settings, and users had **zero** role check before this phase (H1 from the Phase 1 audit). All 20 now require an explicit capability.

## 6. Existing Routes Whose Authorization Was Preserved

- `requireManager`-gated routes (`leads.assign`, `sprints.manage`, `tasks.manage` delete) — migrated to the equivalent named capability with an **identical role set** (`super_admin, admin, pm`), verified by inspection before migrating (zero behavior change, confirmed by the route-guard tests).
- `blockReadOnly`-gated task-creation route — migrated to `tasks.manage`, a **narrower** set than before (see Section 7, "known, intentional narrowing").
- Notification routes — untouched; already correctly self-scoped by recipient identity, no role check needed.

## 7. UI Changes

Every EJS template listed in Section 3 had its mutation controls (buttons, forms, nav links) wrapped in `<% if (can('...')) { %>` / `<% if (canManageTask(t)) { %>`, replacing three places that previously duplicated a raw `['super_admin','admin','pm'].includes(adminUser.role)` array inline (`leads/detail.ejs`, `tasks/index.ejs`, `sprints/index.ejs`) with the single centralized helper. Hiding a control never replaces the server-side check — every route above still enforces its capability independent of what the UI shows (verified in Section 12).

## 8. CSV Injection Fix

`server/utils/csv.js`'s `csvCell()` — one reusable function, applied to every exported field (name, email, phone, country, occupation, service, message, status, source, lead source, UTM fields, date). Null/undefined → `""`; embedded quotes doubled; a leading `=`, `+`, `-`, `@`, tab, or carriage return gets a neutralizing leading `'`. Covered by `csv-cell.test.js` (8 cases, including "a formula character *not* in the leading position must be left alone" — e.g. `email+tag@example.com` must not be mangled).

## 9. Tests Added

48 tests total, all passing (`npm test` in `server/`, zero new production dependencies — `supertest` is dev-only):
- `permissions-can.test.js` (18 tests) — full 11-role × 16-capability matrix, missing/null/unknown role, missing/unknown capability (including proving `super_admin` is *not* exempt from the unknown-capability case), `requireCapability()` middleware behavior, and the full `isTaskOwner`/`canManageTask` ownership logic.
- `route-guards.test.js` (21 tests) — every scenario explicitly requested in Step 9, run through the real `requireCapability`/`canManageTask` functions mounted on dummy routes shaped like the real ones (method+path+capability match `routes/admin/*.js` exactly).
- `csv-cell.test.js` (8 tests) — the injection fix.
- `search-xss.test.js` (7 tests, from Phase 1.5) — reran to confirm no regression.

## 10. Commands Run

```
npm install --no-save supertest        # verified installable before committing to the approach
npm audit fix                           # (accidentally pruned the --no-save install; reinstalled below)
npm install --save-dev supertest        # 0 vulnerabilities
node --check routes/admin/index.js routes/admin/leadOps.js utils/permissions.js utils/csv.js
node --test                             # 48/48 passing
npm test                                # same, via package.json script
node server.js & curl /admin/login /admin   # 200, 302 (redirect to login — correct, unauthenticated)
npm run lint   (repo root)              # clean
```

## 11. Build/Lint/Test Results

- **Tests**: 48/48 passing.
- **Lint** (root ESLint; `server/` has no lint tooling of its own, unchanged from Phase 1): clean, no warnings.
- **Server boot**: starts successfully, serves `/admin/login` (200) and redirects unauthenticated `/admin` (302) as expected.

## 12. Manual Verification Checklist

Automated `route-guards.test.js` exercises the exact production authorization functions for every scenario in Step 9 of the request (viewer/editor/pm/admin/super_admin/specialist/missing-role, across leads/blog/settings/users/tasks). What it does **not** cover — and what a manual pass (or the DB-backed follow-up in Section 13) should still confirm — is the full page-render path: logging in as each real role, confirming the EJS conditionals actually hide the controls (not just that the route 403s), and clicking through a real lead's task/delivery workflow end to end. I did not have real per-role user accounts to click through in this sandboxed session; recommend this pass before the next production deploy.

## 13. Known Limitations

- **Delivery ownership is role-level, not per-task-type.** `DeliveryRecord` has no field recording which specialist "owns" a given delivery action, unlike `Task.assignee`. Per the phase brief's explicit instruction not to invent an unreliable ownership check, `deliveries.manage` is granted broadly to every role that legitimately does delivery-adjacent work (managers, all 5 specialists, reviewer) rather than scoped to "their" delivery — this is a **preserved, documented gap**, not an oversight. Closing it requires adding real ownership data to `DeliveryRecord` first (e.g., linking it to a `Task` or adding a `responsibleRole`/`responsibleUser` field) — recommended as part of Phase 4 (document delivery) when that model is revisited anyway.
- **`editor` lost broad task/delivery access it had before this phase** (previously any non-viewer role, including editor, could touch tasks and deliveries via `blockReadOnly`). This is an intentional, spec-directed narrowing — editor's role bucket in the brief is CMS-only — not a bug. Flagging because it's the one behavior change in this phase that isn't purely additive.
- **`reviewer`'s delivery capability isn't narrowed to "review-related" states specifically** (e.g., only setting `internal_review`) — the `DeliveryRecord.state` enum has no tagging for which role should be allowed to set which state, so reviewer gets the same broad `deliveries.manage` as specialists. Same root cause and same recommended fix as the point above.
- **No PUT/edit route exists for `AdminUser` today** (only create + delete) — "lower-privileged admin modifying a higher-privileged account" only had a real code path to guard (user creation, where `admin` could previously mint a `super_admin`), which is now fixed; there's no existing edit route to add the same guard to.

## 14. Recommended Next Phase

Per the brief's own Phase 3 (Lead operations) — status transitions, assignment history, and search/filter improvements are natural next steps that build directly on the `leads.edit`/`leads.assign` capabilities now in place. Before that, two smaller, high-value follow-ups worth doing first:
1. **DB-backed integration tests** (real Consultation/Task/AdminUser documents via `mongodb-memory-server` or a dedicated test database) — the route-guard tests here prove the authorization *logic* is correct against the real functions, but don't exercise a real request through the real Express app + real Mongoose calls end-to-end. This is the explicit follow-up flagged in Section 12/13.
2. **`DeliveryRecord` ownership data** (Section 13) — unblocks scoping specialist/reviewer delivery access the same way task access is already scoped, closing the one deliberately-deferred gap in this phase.
