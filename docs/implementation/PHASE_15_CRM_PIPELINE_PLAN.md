# Phase 15 — CRM lead pipeline: audit, plan, acceptance, data safety

**Baseline:** `main@70b40a059a245a1a025c7970279f40e1be69e13a` (2026-10-12); implementation branch `phase-15/crm-pipeline`. **Release policy:** never merge to `main`, deploy, access production MongoDB, or apply indexes in this phase.

## Domain audit (2026-10-13)

- **Authoritative lead:** `consultations` / `server/models/Consultation.js`. Public Next.js writes form submissions using its own `src/lib/models/Consultation.ts`; both share the collection. `source` means **form source**, not marketing source. `leadSource` and UTM attributes record acquisition. Do not rename or reinterpret either.
- **Operational status:** `Consultation.status` is a 13-value backwards-compatible petition/delivery workflow enum (including old `consultation_scheduled`). Legacy EJS, Angular Intake, assignment, delivery and reports use this. **Never rewrite existing values into CRM stages.**
- **Existing controls:** canonical Staff API at `/api/v1/staff`, `leads.view/edit/assign`, `leadScope(req)` (converted leads only through live case membership), origin checks on mutations, staff sessions, ActivityLog, consultation-to-case conversion, Task and notifications. Reuse; do not create a parallel write path in Next.js.
- **Existing screens:** Angular `/intake` lists and edits operational lead status; `/consultations` is for client interactions, not the sales funnel. The case-pipeline report at `/reports/pipeline` reports **cases**, not leads. Preserve both.
- **Gaps:** CRM-specific stage, Kanban board, loss reason, quotation/proposal record, next follow-up, duplicate identification, and sales funnel. Automatic rules and provider lead ingestion do not exist. No required backfill is safe without a semantics audit.
- **Identity:** matching email is only a *duplicate suggestion*, not permission to merge records or reveal an inaccessible converted case.

## Stage decision — exactly 10 CRM stages

`new` → `assigned` → `contacted` → `qualified` → `consultation_scheduled` → `proposal_sent` → `decision_pending` → `won` / `lost` → `client_created`.

The target documentation names New, Assigned, Contacted, Qualified, Consultation Scheduled, Proposal Sent, Won, Lost, Client Created; the newer lifecycle also names Decision Pending. Together they are ten discrete stages. This is **not** a replacement for `Consultation.status`: CRM is a separate, independently editable field. Historical rows with no CRM field get a **read-time projection**, never a destructive rewrite.

| Existing operational status (when `crmStage` absent) | Projected CRM stage |
| --- | --- |
| `new` | `new` |
| `assigned` | `assigned` |
| `contacted` | `contacted` |
| `qualified` | `qualified` |
| `consultation_scheduled` | `consultation_scheduled` |
| Any other operational status with `convertedCase` | `client_created` |
| `tasks_created`, `in_progress`, `waiting_on_client`, `internal_review`, `ready_for_filing`, `submitted`, `delivered`, `closed` without conversion | `decision_pending` |

Read-time projected `client_created` for a converted record takes precedence if no explicit CRM stage exists. No `closed` record is automatically classified as lost. A later explicit CRM edit does not mutate operational status or conversion references.

## Implementation gates

**Gate A — safe CRM data and API**
1. Add optional `crmStage`, `crmLostReason`, `crmNextFollowUpAt`, `crmQuote` to the Express schema only (Next.js does not write these). Reuse existing collection, no new collection or destructive migration.
2. Add one Staff CRM router behind existing staff auth. `leads.view` gates reads, `leads.edit` gates writes, `trustedOriginMiddleware` guards every write; `leadScope(req)` is applied for reads **and** mutation target lookup.
3. Board reports precise counts per stage even for pre-CRM rows, with bounded samples, and exposes `truncated` instead of implying all cards loaded. Leads link to their existing Intake detail.
4. Validate all status, reason, quote, and timestamp updates server-side; require reason for `lost`; require a linked converted case for `client_created`. Never automatically create a case or bill a client.
5. Duplicate suggestions are per-role/per-row authorized, normalized email comparisons only, no merge or deletion. A converted case outside current case scope must not leak.

**Gate B — Angular CRM UI**
6. Add a distinct `/crm` staff route with ten-stage board, counts, lead links, and a keyboard-friendly stage editor; surface loss reason, follow-up and proposed quote fields without replacing existing Intake workflow.
7. Do not auto-advance operational `status` when CRM stages change. Do not send a proposal, message or invoice on a quote field change.

**Gate C — verification**
8. Automated tests for read permissions, mutation permissions, origin verification, row-level converted-case concealment, default projection, invalid loss reasons/quotes/dates, quote/follow-up persistence, and no operational-status mutation.
9. Run CI (root, server, Angular, browser), and add production-release checklist. If no executable test environment is available, disclose unverified gates honestly; do not deploy.

## Data migration/index safeguards

- **Migration strategy: none required for the initial cut.** New fields are optional. Existing records remain byte-for-byte unchanged until a staff user explicitly edits CRM attributes.
- **No indexes applied to production.** Initial board uses existing `consultations` indexes and bounded results; profile usage before deciding on `crmStage` or `crmNextFollowUpAt` indexes. Before any future index addition: enumerate duplicate conflicts, dry-run both `scripts/createIndexes.ts` and `server/scripts/createIndexes.js`, confirm backups/Atlas status, and obtain separate operator authorization. Never set `autoIndex=true` in production.
- **Rollback:** revert the feature branch commit / turn off the new Staff UI route before merging; leaving optional CRM fields in MongoDB is harmless to older code. Never drop `consultations`, delete rows, or overwrite `status`.
- **Privacy:** no bulk email disclosures; duplicate suggestions do not expose records outside `leadScope`. Logging uses IDs/action labels, not note contents or personal data.

## Deferred / production-dependent

- Automatic lead routing and assignment rules (requires fairness, ownership and team workload policy); scheduled email/SMS/WhatsApp follow-up sends (provider consent and credentials); provider-side social/Upwork lead ingestion; proposal document/PDF sending and approvals; payment/invoicing (Phase 19).
- Follow-up is an operator-visible due date; it is **not** a claim that a background reminder will fire until a scheduler and tests exist.
- Production migration, enablement and human UAT are separate approvals.
