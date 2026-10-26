# Phase 15 — CRM lead pipeline: audit, plan, acceptance, data safety

**Original baseline:** `main@70b40a059a245a1a025c7970279f40e1be69e13a` (2026-10-12), original branch `phase-15/crm-pipeline`. **Recovery baseline:** `main@49228603a0e7d0bf60984dbce4561222edfac659` (2026-10-14), branch `phase-15/crm-pipeline-recovery-20261026` (2026-10-26). **Release policy:** never merge to `main`, deploy, access production MongoDB, or apply indexes in this phase.

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

## Recovery acceptance and release evidence (2026-10-26)

| Gate | Acceptance criteria | Proof |
| --- | --- | --- |
| Compatibility | Keep old `status`, `source`, `leadSource`, `convertedCase` behavior; no required backfill or new collection | Schema diff, stage projection tests |
| Security | Anonymous denied, read-only viewer cannot write, read/mutation/duplicates/funnel all respect live case membership | Integration tests, UI read-only state |
| Pipeline | Ten stages, exact scoped counts, bounded cards with explicit truncation, immutable old rows until edit | Board test and browser journey |
| Updates | Lost requires reason, leaving Lost clears reason, quote uses validated minor units, follow-up timezone explicit; no case/status/mail/payment side effect | Validation and persistence tests |
| Funnel | UTC lead-created cohort, inclusive end day, validated <=366-day range, source and stage breakdown and as-of-now conversion fraction | Funnel tests and Staff UI |
| Quality | Green root/server/Angular/Playwright jobs on the final SHA; document any unrelated baseline failure | GitHub Actions run |
| Release | No merging, deployment, production credentials, production DB reads/writes or index creation | Branch-only code commits |

**Known CI baseline:** `main` run 38520166491 failed in Playwright calendar (a dynamic fixture day held five items while test hardcoded four); branch relaxes the count while retaining event assertions. Original Phase 15 branch CI failed because Angular navigation test expected the old list without CRM. The recovery branch repairs both test expectations; neither changes live behavior.

**Operational checklist before release:** Verify live/staging backup and Atlas backup policy, run both index script dry-runs with production values only under separate approval, confirm MongoDB shared `Consultation` contract, run scoped-role and keyboard QA on staging, assess aggregate query cost on realistic volumes, approve index additions only if measured, explicitly approve merging and deployment. Existing `autoIndex=false` remains unchanged. Roll back application routes/UI only; never delete rows or drop CRM fields to roll back. CRM quotes are internal estimates, not invoices; follow-up dates do not send reminders without a separate scheduler.
