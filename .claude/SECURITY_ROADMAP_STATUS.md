# Admin CMS Security & Operations Roadmap — Status

Tracks progress against the 8-phase roadmap defined in `PHASE_1_AUDIT.md` Section 5 (Phase 2 onward — leads/tasks/sprints/deliveries/blog/FAQs/testimonials/media/CSV/reports authorization, lead operations, document delivery, analytics, forms, quality/deployment, public-site redesign). Update this file's "Completed" section whenever a phase lands; don't let it drift from what's actually merged.

---

## Completed

### Phase 1 — Repository audit (`PHASE_1_AUDIT.md`)
Full architecture map across both apps; findings classified Critical → Low; Phase 2–8 roadmap proposed. No code changes.

### Phase 1.5 — Stored XSS fix
`server/views/admin/search.ejs` built HTML rows by string-concatenating MongoDB fields (lead name/email — publicly submitted — plus blog/testimonial/FAQ fields) and rendered them unescaped. Rewritten as explicit per-category EJS loops with escaped output. Regression test added (`search-xss.test.js`). Scanned the rest of `views/` — no other instance of the pattern.

### Phase 2 — Capability-based authorization (`PHASE_2_AUTHORIZATION.md`)
- Centralized `CAPABILITIES` map (16 capabilities × 11 roles) + fail-closed `can()`/`requireCapability()` in `utils/permissions.js`.
- 20 mutation routes that previously had no role check at all (leads status/notes/delete, blog/testimonials/FAQs/media/settings CRUD) are now gated.
- Ownership-scoped task access for specialists/reviewer (`Task.assignee`), replacing blanket non-viewer access.
- `/admin/users` centralized; added self-delete, last-super-admin, and privilege-escalation (admin minting a super_admin) guards that didn't exist before.
- Three fail-open `|| 'super_admin'` defaults removed (audit finding M2).
- CSV formula-injection fix via reusable `csvCell()` (audit finding M1).
- 12 EJS templates updated to hide unauthorized controls via a centralized `can()`/`canManageTask()` helper.
- 47 new tests (permissions matrix, route guards, CSV escaping); all passing; server boots; lint clean.

**Documented, deliberately deferred within Phase 2** (see `PHASE_2_AUTHORIZATION.md` §13):
- `DeliveryRecord` has no assignee/ownership field, so `deliveries.manage` stays role-level (managers + all specialists + reviewer) rather than scoped to "their" delivery. Real fix needs a schema addition — natural fit for Phase 4.
- `editor` lost the task/delivery access it had *by accident* pre-Phase-2 (its role is CMS-only per the brief) — intentional, not a regression to chase.
- No DB-backed integration tests yet (route-guard tests exercise the real authorization functions but not a real Express+Mongo request end-to-end) — flagged as the top follow-up.

---

## Remaining / Future Work

### Phase 3 — Lead operations
Builds directly on Phase 2's `leads.edit`/`leads.assign` capabilities, already in place. Scope: clear lead ownership, status-transition history (today's `ActivityLog` covers this partially), assignment history, task/sprint visibility on the lead detail page (exists, unscoped by "mine only" view), recent activity, pending-deadline/overdue surfacing (no query for this yet), internal-note improvements, search/filter improvements, notification-behavior refinement.

### Phase 4 — Delivery and documents
Turn `DeliveryRecord` (today: state + a bare `files[]` array, no real file generation) into an actual document-delivery system: real file records in MongoDB, a storage-provider abstraction (local for dev, external — S3/Cloudinary-class — for production), file access authorization, secure downloads, type/size validation (multer patterns already exist for media uploads and can be reused), version history, uploaded-by info, delivery status history, client delivery date, internal review status, download audit records.
**Blocked, per the original brief**, on identifying the actual deployment environment before implementing external storage — don't guess a provider.
**Should also add** the `DeliveryRecord` ownership field flagged as Phase 2's known limitation, so delivery access can finally be scoped the same way task access already is.

### Phase 5 — Analytics and conversion tracking
Public-site scope: configurable GA/GTM/ad-pixel integration, consent-aware loading, event tracking (consultation/contact submit, WhatsApp/phone/email clicks, service-page CTAs), attribution capture.
**Partially ready already** — `Consultation`/the site's lead model already stores `utmSource`, `utmMedium`, `utmCampaign`, `utmTerm`, `utmContent`, `gclid`, `fbclid`, `landingPage`, `referrer` (see `DATABASE.md`). What's missing is the actual tracking-pixel/consent/event-firing layer on the public site and wiring those fields from real ad-click traffic, not the storage schema.

### Phase 6 — Forms and notifications
Shared validation schema, normalized contact info, spam protection beyond the honeypot, duplicate-submission handling with real submission IDs, failure logging, admin notification creation, lead-source attribution, clear success/error states.
**Partially done already**: honeypot + in-memory rate limiting exist (`src/lib/rate-limit.ts`), Resend email delivery exists and is decoupled from DB writes, the `Notification` model and admin notification creation already work, `leadSource` is already a real field. Remaining: a real submission-ID/idempotency mechanism, a shared (likely Zod) validation schema instead of the current inline regex/length checks, and stronger spam protection than a single honeypot field if abuse becomes a real problem.

### Phase 7 — Quality and deployment
Unit/integration/form-submission/upload-validation tests (authorization tests now exist from Phase 2 — the gap is everything else). Database indexes (audit finding M3 — `Consultation.status/email/createdAt/owner`, `Notification.(recipientName,read)` — still not added). Structured logging (still console-only, audit finding L3). Health endpoints (don't exist). Backup/recovery documentation (the repo's own `DEPLOYMENT.md` already covers `mongodump`/restore — verify it's sufficient before treating this as a gap).

### Phase 8 — Public-site redesign
Explicitly gated on the operational foundations (Phases 2–7) being stable first, per the original brief. Visual hierarchy, conversion paths, spacing/card/button standardization, typography, mobile nav, trust sections, testimonial presentation, CTA improvements, accessibility — while preserving existing SEO URLs and structured data.

---

## Suggested order for what's next

1. **DB-backed integration tests** (Phase 2's own flagged follow-up) — before building more authorization-dependent features on top of Phase 2, worth confirming the real Express+Mongo request path behaves as the unit/route-guard tests predict. Needs a test-database decision (`mongodb-memory-server` vs. a dedicated test DB) that wasn't made in Phase 2.
2. **Phase 3 (Lead operations)** — the next phase in original sequence, and the one with the fewest external dependencies/decisions blocking it.
3. **Database indexes** (Phase 7 item, but cheap and low-risk to pull forward — see `PHASE_1_AUDIT.md` M3) — worth doing opportunistically whenever lead-list/notification-count performance is touched again, rather than waiting for a dedicated "Phase 7" pass.
4. **Phase 4 (Delivery/documents)** — once the production deployment environment is confirmed (the explicit blocker) and after deciding how to add ownership data to `DeliveryRecord`.

Not recommending Phase 5/6/8 next — they're either blocked on decisions outside this repo (ad platform choice, spam-volume data to justify stronger protection) or explicitly sequenced last (public-site redesign).
