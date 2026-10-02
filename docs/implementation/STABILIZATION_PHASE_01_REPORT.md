# Stabilization Phase 01 — Report

**Branch:** `stabilization/batch-c-tasks` (builds on `main` @ `f21c6a9`)
**Audit baseline:** `main` @ `26ed89725651b079e505540c2cffe474b0379d5f`
**Implementation HEAD:** `19fc765951c601ccaa6522dd2c7724ac1928b9da`
**CI for that exact SHA:** [run 37057128726](https://github.com/ashderkarim123/Immigration-Horizons/actions/runs/37057128726) — all four jobs `success`
(Lint · types · build, Tests (Next.js app), Tests (admin CMS), Enterprise UI (Angular)).
The commit that adds this report is docs-only on top of that SHA.

Tests on the final tree: server **637**, root **430**, Angular **136**; `tsc --noEmit`, `npm run lint`, and `ng build case-management` clean.

## 1. Commits

| SHA | What | State |
|---|---|---|
| `eea1a5b` | Batch A — Angular/Express contract repair | merged to `main` (`ba4feec`), deployed |
| `0e18990` | Batch B — Evidence workspace integrity + staff workflow | merged to `main` (`ba4feec`), deployed |
| `7fec5a8` | Admin Users: reset password, editable sign-in email, parameterised seed script (requested separately) | merged to `main` (`f21c6a9`), deployed |
| `fc0dffe` | Batches C + D — Tasks parity, global Messages inbox | **not merged** |
| `19fc765` | Batch E — Petition assignee picker | **not merged** |

## 2. Audit findings confirmed, and defects found beyond the audit

Every audit item 3.1–3.9 was re-checked against the code and was still present.

**Confirmed from the audit (all fixed):** first-login password contract (3.1); Cases and Clients contracts (3.2, 3.7);
role-name permission inference (3.3); Team, Activity and mutation-refresh disconnects (3.4–3.6); Evidence workspace
integrity and surface (3.8, 3.9); Tasks UI behind the domain (3.10); no global chat surface (3.11).

**Found while fixing them (not in the audit):**

- Add-member offered `lead` / `viewer`, which are not workspace roles (a Mongoose 500). Now 422 and the picker offers valid roles only.
- Error messages were read from the wrong place in the response envelope, so users always saw the generic fallback.
- Overview tab rendered fields the API never returns (Recent Documents, Actual Filing Date, client status).
- Dashboard API returned raw `_id` documents and the template used a root-relative `href` that breaks under `/staff/`.
- Evidence: provisioning wrote `createdBy` from the template (empty for seeded templates), so even with a workspace it failed validation.
- Evidence: linked-document names read a non-existent `name` field (the model has `displayName`).
- Evidence mutations had no trusted-Origin check; the tab's modals were unstyled (encapsulated styles did not reach the child).
- **Migration 004 (evidence template seed) was written but never registered in `scripts/migrate.ts`.** Production would have no templates.
- `CaseActivity` had none of the `task_*` types, so creating, assigning or moving any case task threw.
- `tasks.view_all` was never defined in the capability map, so `can()` returned false for everyone (even Super Admin) and the "All Tasks" scope always returned 403. (This also made `scope=all` on Deadlines a no-op.)
- A task assignee kept edit rights after being removed from the case.
- Task input (type / priority / due date) was unvalidated: bad values were 500s.
- Petition tab's assignee picker bound `emp._id` while the API returns `id`, so section assignment could never work; its spec fixture had the same wrong shape.
- Admin Users: the one-time temporary password was never rendered, there was no Reset button, Edit was the create form, and the sign-in email could not be changed. The old seed script double-hashed the password on create.

**Hypothesis I tested and discarded:** that `templateVersion` is stored as a double so the partial unique index never applied. It is stored as an int and the index works; the change was reverted and a test now guards it.

## 3. Tests added

- Server integration: `staff-angular-contracts` (8), `evidence` (11), `staff-tasks` (13), `staff-inbox` (6), `admin-users` (9); migration 004 (2, root).
- Angular specs with DTO-shaped fixtures: setup-password, cases, clients, case detail (PM / admin / reviewer / viewer, team, activity, mutations, deep links), dashboard, evidence tab, tasks tab, Tasks page, Messages page, navigation, chat deep link, petition assignee picker.
- Drift guards: capability contract and case-schema contract (regenerated / extended), and a test that fails if the Angular task option lists drift from `Task`.

## 4. What shipped, by batch

- **A** — one DTO type per response; the UI now uses the server's `actions` flags, `/members`, `/activity`, and reloads canonical state after every mutation.
- **B** — evidence resolves the primary `CaseWorkspace` explicitly; outcome-based errors; template discovery and eligible-document endpoints; Angular provision / custom / status / link / unlink.
- **C** — `services/taskDto.js` is the single permission function behind both the `actions` flags and the mutation checks; create / edit / assign / status in Angular (case tab extracted, global page upgraded, shared dialog).
- **D** — `GET /staff/inbox` (unread first, filters, search, per-channel authorization reusing the Chat policy); Messages page; sidebar entry gated on `channels.view`; deep link to the case Chat tab for a channel.
- **E** — contract scan of the remaining Angular code for assumed field shapes; one defect found and fixed (above). `any` remains only in Deadlines and sign-in typing, which match their API.

## 5. Remaining limitations (explicit)

- **Two-session browser QA was not performed.** It needs the client portal, Express API and Angular app running together against a database. The checklist in §7 is executable as written.
- **Batch E is a contract audit, not an end-to-end run.** Documents, Smart Forms, Petition and Filing Packets were not exercised in a browser; their existing integration suites pass.
- **Notifications (audit 3.12) were not audited or changed.** The Messages inbox covers chat; document uploads, form submissions, petition and packet transitions, and approaching deadlines were not reviewed for notification behaviour.
- Global Tasks page edits and assigns existing tasks; **creating a task** is from a case's Tasks tab (a global create needs a case picker).
- Inbox: considers the 300 most recently active conversations; unread counts exist only where the actor is a workspace member (org-wide admins who are not members see 0).
- `tasks.view_all` is now granted to manager roles. "All tasks" is still limited to the actor's own cases unless they hold `cases.view_all`. This also makes the Deadlines `scope=all` start working for them.
- `case-detail.component.scss` is 448 bytes over its Angular budget (pre-existing warning, not caused by this work).
- Admin CMS security events for role / email edits reuse existing event types (the event-type list is a cross-app contract); no dedicated "role changed" event yet.

## 6. Production requirements and actions NOT performed

- **Migration 004** must be run before evidence checklists can be provisioned. Not applied by this work:
  `npm run db:migrate -- --only 004-seed-evidence-templates` (dry run), then the same with `--apply --i-have-a-backup` after a backup.
- No index builds, backfills, nginx changes or direct database edits were made by this work.
- Batches C, D, E are on `stabilization/batch-c-tasks` and are **not merged or deployed**. `main` is deployment-connected, so merging is a release action.
- The `info@immigrationhorizons.com` Super Admin was not created by this work (the seed script is provided; it must be run against the live database by its owner).

## 7. Two-session QA checklist (to run before sign-off)

Client session (portal) + PM session (staff app):

1. Client opens the case → client sends a chat message.
2. PM sees it under **Messages** (unread, correct case and channel) and in the case Chat tab; PM replies; client sees the reply.
3. Client uploads a requested document → PM sees it in Documents and reviews it.
4. Client submits a Smart Form → PM returns it with a note → client sees the returned state and note → client resubmits → PM approves.
5. PM creates a task, assigns it to a specialist, and the specialist (own session) moves it to In Progress then Completed; the specialist cannot reassign it or edit a colleague's task.
6. PM provisions the evidence checklist (needs migration 004), adds a custom requirement, links an uploaded document, sets a requirement to Waived with a reason.
7. Petition dependencies reflect the evidence / form / document / task state; the petition proceeds through its intended workflow; the filing packet consumes the finalized petition.

Reviewer / specialist session:

8. Action buttons match the role (server `actions` flags); a forced request to a forbidden action is refused with 403/404.
9. Remove a member from the case → their next request to that case's tasks, evidence and chat is refused immediately.

## 8. Rollback notes

All changes are additive. To roll back, revert the relevant merge or commit; no data migration needs reversing.
`CaseActivity` rows written with the new `task_*` types remain readable after a rollback (they only fail validation if re-saved).
Migration 004 only inserts two templates and is idempotent; delete the two `evidence_templates` rows to undo it.

## 9. Is Phase 11 (USCIS Tracking) unblocked?

**Not yet.** The contract-level defects that made built features unusable are fixed and covered by tests, but the audit's own exit
standard is a real employee completing the case-preparation path without contract failures. That needs: migration 004 applied,
the §7 two-session run passed, and a decision on the notification gap (§5). Once those three are done, Phase 11 can start.
