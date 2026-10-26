# Phase 16 — Public Website SEO, GA4/GTM Measurement, Traffic Attribution & Conversion Analytics

**Date:** 2026-10-26
**Baseline:** `main@49228603a0e7d0bf60984dbce4561222edfac659`
**Planning branch:** `phase-16/seo-ga4-attribution-plan-20261026`
**Priority:** Next main phase after Phase 15 CRM (the previously tentative Phase 16 Client Profiles work is deferred/renumbered).
**Scope:** Public marketing website `immigrationhorizons.com`, existing GA4 property, GTM container, Search Console property, and later authorized aggregate lead measurement. **Never include the client portal, Staff case management, or Admin CMS in third-party behavioral tracking.**
**Status:** Plan and event contract only. Implementation, GTM publishing, OAuth authorization, property edits, deployment, account configuration and production access require separately reviewed work.

## 1. Outcome and definitions

Build an accurate, consent-aware measurement system that shows:
- **Acquisition:** direct, organic search, paid search, paid/organic social, referral, email, campaign, geography at permitted aggregate granularity, device and landing page.
- **Behavior:** public page visits, service-page engagement, scroll and outbound download interactions, consultation CTAs, contact intents, start/attempt/error/success of forms.
- **Outcomes:** server-accepted enquiries, channel-to-lead conversion, first/last eligible acquisition touch stored in CRM, and later separately authorized qualified/converted-lead aggregates.
- **SEO:** Google Search Console queries, impressions, clicks, CTR, average position, indexed/excluded pages, sitemap status, canonical consistency, Core Web Vitals and high-value landing-page performance.
- **Reporting:** GA4 Acquisition and Landing Page reports, Lead Key Events, funnel exploration, Search Console organic-search reports, approved campaign comparisons, a weekly measurement QA dashboard and optional Looker Studio/BigQuery.

Traffic acquisition is **not** an event per channel. Use GA4 `Session default channel group`, `Session source/medium`, `First user source/medium`, campaign dimensions, landing pages and UTM/auto-tagging. Events describe actions that occur once a visitor is on site. Google Search Console queries come from GSC linked reports rather than manufacturing keyword parameters in website events.

## 2. Audited existing code and high-risk gaps

- `src/components/analytics/site-analytics.tsx` mounts GTM and optional direct GA4 on the marketing layout only; both IDs default from `src/lib/analytics.ts`. Client, Staff and Admin surfaces are deliberately excluded.
- `src/lib/analytics.ts` `trackEvent()` pushes the event to both `window.dataLayer` and `window.gtag`. If the GTM container also sends GA4 custom events, duplicate hits result. **Do not change the production GA4 mode before inspecting GTM live/preview configuration.** Once GTM owns GA4, disable direct GA4 using the existing deploy-supported `NEXT_PUBLIC_GA_MEASUREMENT_ID=off` setting; alternatively keep direct as single owner and suppress GA4 GTM event tags.
- `src/components/analytics/click-tracker.tsx` delegates click tracking site-wide for WhatsApp, mailto, tel and consultation links, but sends `link_text` drawn from link labels. This can include phone numbers and email addresses. Remove free-form labels; use allowlisted `cta_id`/`placement`/`link_type` only.
- `src/components/analytics/use-form-tracking.ts` fires `generate_lead` on successful returned FormState for contact, but `src/app/(site)/consultation/actions.ts` redirects on success. The consultation success hook cannot reliably fire. Preserve the successful redirect and implement an accepted-submission acknowledgment architecture that can emit one consented, deduplicated event without losing it on navigation.
- The consultation page currently copies UTM/click IDs directly from **that page's** URL. Other marketing landing pages do not supply a first-/last-touch attribution snapshot to the form. `src/app/(site)/contact/actions.ts` currently calls `deliverLead` without tracking.
- `src/lib/leads.ts` writes some `utm*`, `gclid`, `fbclid` fields into `Consultation` when supplied but does not fully populate landing/referrer or handle a multi-page visitor journey. Existing MongoDB lead persistence and independent mail delivery must not regress.
- `src/app/robots.ts`, `src/app/sitemap.ts` and per-page metadata/JSON-LD already implement SEO foundations; do not replace them wholesale.
- `docs/seo/SEO_AUDIT_2026-09.md` is a historic baseline, not verified as current. PR [#9](https://github.com/ashderkarim123/Immigration-Horizons/pull/9) is **still draft/open, unmerged** and offers a read-only GSC/GA4/GTM reporting implementation and an October audit. Re-audit its changes against current `main` before borrowing code, OAuth scopes or routes. Never merge the older diverged PR by assumption.
- CMS analytics identifiers are configuration records; the public Next.js tag build uses build-time IDs. Do not imply that editing an Admin CMS setting automatically updates the live site's JS.

## 3. Non-negotiable security and privacy rules

1. Collect **no** names, email addresses, telephone numbers, messages, case numbers, document titles, USCIS/immigration status, eligibility scores, exact geolocation, account/portal URLs, authentication tokens, raw form field values, or personal/unique URL parameters in GA4, GTM or ad pixels. Do not hash PII as an ad-workaround without a separately approved, consented legal design.
2. Strip or strictly allowlist page URLs and parameters sent as `page_location`; reject unexpected query strings; do not record `link_text` or `search_term` free text unless normalized/redacted and approved. In particular, do not send private subdomain paths or login/portal redirects to GA4.
3. Website consent requirements are jurisdiction- and purpose-dependent. Select and document a CMP/consent approach, conduct legal review, and implement Consent Mode v2 with `analytics_storage`, `ad_storage`, `ad_user_data` and `ad_personalization` defaults **before tags fire**, with update/revocation and purpose-specific handling. Respect refusal; verify storage and network behavior. If basic mode is selected, no Google tag transmission before applicable consent.
4. Do not create personalized advertising audiences based on immigration status, case/service eligibility or potentially sensitive visitor attributes; seek a separate ads-policy review before remarketing, enhanced conversions, server-side tagging or offline CRM uploads.
5. No client/staff/admin action, private form contents or legal-case workflow should be sent to GA4. Aggregate operational reporting may be separate and access-controlled.
6. Tracking failure must never prevent form submission, lead persistence, client invitation or redirect. No secrets in `NEXT_PUBLIC_*`, HTML, GTM `dataLayer` or committed files.

## 4. Implementation gates

### Gate A — Establish one source of truth for tags and events

- Export/review (read-only first) the current GTM container version, tags, triggers, variables, GA4 property IDs, consent settings, Google Ads conversion/linker tags, existing GA4 custom events, enhanced measurement switches, cross-domain settings and any third-party pixels. Record each real firing owner.
- Choose **one** GA4 firing transport (prefer GTM once its Google tag is verified), and one `page_view` owner. Explicitly handle Next.js client transitions when they do not trigger page reload; disable overlapping automatic history pageviews or manual equivalents.
- Refactor `trackEvent` into a **typed, sanitized, single-destination `dataLayer` contract** when GTM is the owner; ensure one action cannot produce two GA4 events.
- Add event schema versioning, allowlisted parameters and deterministic element IDs. Block GA4 in local/test/preview and enforce the marketing-host-only boundary.
- Deliver automated checks proving exactly one page_view for navigation and exactly one GA4 outgoing event per qualified action in a mock/preview environment.

### Gate B — Consent-aware measurement

- Adopt a consent management interface with accept/reject/customize/reopen choices and accessible controls. Set deny defaults before GTM bootstrap where required, apply consent updates, persist only permitted preferences, honor revocation and document retention.
- For GTM, use **Consent Initialization**/consent APIs rather than late, asynchronous event-order assumptions. Enable basic vs advanced mode only after legal/product approval.
- Test refusal/grant/revocation in both desktop and mobile browsers; verify that GA4 and ads tags respect their own consent needs independently. Record what happens with scripts/ad blockers disabled or failed.

### Gate C — Acquisition attribution and campaign taxonomy

- GA4: audit stream URL, enhanced measurement, data redaction, referral exclusion/unwanted referrals, Search Console/Ads links, host traffic separation, Google Ads auto-tagging and relevant channel definitions.
- Establish lowercase UTM rules: `utm_source`, `utm_medium`, `utm_campaign`; optional `utm_id`, `utm_source_platform`, `utm_content`, `utm_term`. Use `google / cpc` or Ads auto-tagging consistently; `facebook / paid_social`, `instagram / paid_social`, `newsletter / email`, `partner / referral`. Do not overwrite auto-tagged metadata with conflicting manual guesses.
- Capture attribution across **all public entry pages**, not only `/consultation`. Use consented, limited-lifetime first-party storage to preserve eligible first/latest touch across internal navigation. Allowlist/limit lengths, drop PII, and transmit fields only with valid consent and backend validation.
- On successful enquiry, copy approved campaign dimensions, sanitized original landing **path** and referral **domain** (no query/PII), timestamps and acquisition source into an additive optional lead-attribution snapshot. Cover consultation and contact routes. Review whether click IDs (`gclid`, `gbraid`, `wbraid`, `fbclid` etc.) require separate purpose/consent; do not send them as custom GA4 event parameters.
- Classify `Direct` only in GA4 traffic reports, not by assigning an invented `utm_source=direct` to untagged sessions. Test direct, Google organic, Google Ads (auto-tag), Meta paid, email, referral and repeat visitor behavior.

### Gate D — Public user actions and successful leads

- Implement exact event dictionary in the sibling event file; prefer GA4 recommended `generate_lead` and Enhanced Measurement automatic events when reliable; avoid duplicate `form_start`/`form_submit`/`scroll`/`file_download`.
- Add stable CTA identifiers and placement for the public header/footer/hero/service pages/blog/FAQ/contact/WhatsApp floating action buttons. Measure link intent separately from completed lead.
- Consultation: instrument `form_view`, `form_start` or enhanced equivalent, `lead_form_submit_attempt`, validation outcomes, and exactly one `generate_lead` **after a real accepted outcome**. Do not count a honeypot success as conversion. Preserve current redirect and protect against double-clicks, refreshes and replayed redirects.
- Contact: match the same accepted-outcome semantics and attribution snapshot.
- Split `generate_lead` by safe `form_name` of `consultation` or `contact`; evaluate form-specific key-event creation if desired, but **never** count one form acceptance twice or let `form_submit` and `generate_lead` both be primary conversions.
- Track WhatsApp/phone/email clicks as **secondary intent events**, not verified conversations/calls or sales.
- For long content use enhanced `scroll` unless a defined, validated custom content-depth need is proven. Only track video/search/download events if those elements actually exist on public pages.
- Do not export staff lead stages, client accounts or cases as offline GA4 lead events without a separately approved privacy-preserving identity/linkage strategy. When authorized later, use Google's `qualify_lead`, `working_lead`, `close_convert_lead` and `close_unconvert_lead` naming and enforce idempotency.

### Gate E — GA4, GTM, Search Console and Ads setup

- Configure GA4 event-specific custom dimensions for **only** useful low-cardinality parameters: `form_name`, `cta_id`, `cta_placement`, `page_type`, `link_type`, `event_version`. Avoid high-cardinality raw IDs.
- Mark primary `generate_lead` (server-accepted enquiry) as a **GA4 key event** with an explicit counting method. Make click/attempt/engagement events secondary, unless approved separately. Where necessary, create an *independently named* key event for a specific form type without replaying the hit.
- Link GA4 ↔ Search Console to show Queries and Google Organic Search Traffic/Landing Pages reports; audit Search Console ownership, property/stream match and URL host mapping.
- Link Google Ads ↔ GA4 only for ads accounts used; decide whether to import GA4 lead key events or use Ads conversion tags as the bidding source, with a **single primary** conversion action to avoid double counting. Preserve GCLID/WBRAID/GBRAID according to consent and auto-tagging policy.
- Meta/LinkedIn integrations are optional separate vendor approvals. No automatic pixel or remarketing tags merely because GTM exists.
- If read-only reporting is desired in the Admin app, rebase/reimplement only vetted parts of draft PR #9; enforce operator-only access, least-privilege OAuth scopes, encrypted tokens, no public tokens and no client-record lookups.

### Gate F — Technical SEO and Search Console operations

- Re-run current route/sitemap crawl against deployed marketing host and production build; classify each page by indexable/noindex, canonical URL, robots response, title, description, H1, JSON-LD, OG image, internal linking, broken links, redirects and duplicate paths.
- Review GSC Page Indexing, XML sitemap, Core Web Vitals, structured results, manual actions/security reports, search-query/landing-page performance and crawl anomalies.
- Check `www`↔apex redirects and preserve campaign query params/click IDs only as needed for analytics (do not expose PII), plus host isolation of `app.*` and `admin.*`.
- Review content freshness, title/meta quality, images and LCP/INP/CLS; prioritize service landing pages and helpful guides. Validate current SEO against the September audit and unmerged October draft rather than applying stale suggestions blindly.
- Avoid assertions of guaranteed rankings, CTR gains or indexing; SEO results depend on Google.

### Gate G — Dashboards and measurement governance

Create GA4 saved comparisons/Explore and optionally Looker Studio (or approved read-only Admin panel):
1. Executive overview: users/sessions, new users, engaged sessions, key-event leads, leads per session and acquisition channel.
2. Acquisition: Session default channel group, Session source/medium/campaign, first-user channel, paid vs organic vs direct vs referral/social/email, permitted country/device.
3. Content/SEO: GSC queries, clicks, impressions, CTR, average position, GA4 landing pages and engaged sessions, organic key events by landing page.
4. Lead funnel: consultation page view → form start → attempt → accepted enquiry; contact parallel funnel; abandonment is an estimated difference, not an absolute individual outcome.
5. CTA and engagement: clicks by stable placement/type, internal vs outbound intent, scroll or download when enabled.
6. Campaign performance: UTMs/click attribution and Google Ads spend/cost/key-event outcome *when an authorized cost integration is available*; do not invent ROI or claim revenue before billing integration.
7. Data quality: duplicate event ratio, (not set)/unassigned source, self-referrals, withheld consent, failed network tags, invalid UTMs and unexpected traffic on private hosts.

## 5. Release gates and measurable acceptance criteria

- [ ] Tag Assistant Preview and GA4 DebugView show **one** expected tag/event per site navigation and user interaction. GA4 Realtime reflects test traffic; production reports checked after processing.
- [ ] Private `/portal`, `/staff`, `/admin` and `/api` content never emits public analytics, including unauthorized redirects.
- [ ] No PII or user-supplied free text in event parameters, `page_location` or campaign fields; automated parameter/redaction tests pass.
- [ ] Consent is initialized before tags; denial/grant/change/revocation workflows pass region-specific agreed policy, including verification of cookies/network tags.
- [ ] Test seven traffic scenarios: clean direct; Google organic; Google Ads auto-tagged click; Meta paid-social UTM; newsletter UTM; referral; multi-page campaign click followed by a later enquiry. Observe channel attribution in GA4 where instrumentation/processing allow.
- [ ] Every accepted consultation/contact lead creates **one** `generate_lead`; failed validation, spam honeypot, denied consent, client/server retry and repeat navigation do not create misleading successful conversions.
- [ ] Link-intent events (`click_whatsapp`, `click_phone`, `click_email`, `cta_consultation_click`) use safe stable identifiers and do not masquerade as actual conversations/leads.
- [ ] Campaign attribution saved consistently (with applicable consent) on both lead types; optional new fields/backfill are non-destructive; existing lead, mail and onboarding behavior unchanged.
- [ ] GA4 Key Events, GSC link/reports, Ads link (if used), custom dimensions, report comparisons and dashboard validated with access-controlled account screenshots or owner-reviewed checklists.
- [ ] Indexable sitemap routes return expected canonical/metadata and private hosts noindex/disallow; CWV baseline recorded and accessibility/performance regression checked.
- [ ] CI passes root lint/types/build/tests and existing server/Angular/browser suites; synthetic GA4 mock/Tag Assistant browser tests pass; note any baseline failures.
- [ ] GTM workspace version documented; no GTM publishing, secrets, production deployment or database migration without explicit release approval.
- [ ] Establish governance: owner for tags, release checklist, changelog, named primary key event, data retention, event schema version and rollback.

## 6. Database, migration and rollback safeguards

**No production database migration is needed to write this plan or to start front-end instrumentation.**

If lead-attribution fields are added, make them optional on the existing shared `Consultation` documents and mirror compatible fields in the Express and Next Mongoose schemas. No historical backfill, no replacing `source` (form type) or `leadSource` (CRM marketing label), no overwriting `status`/`convertedCase`, and no new unique indexes without a measured need. Review validation, max sizes and data retention; staging test against a disposable MongoDB instance. Separate production authorization is required for indexes, backups, migration or data changes.

**Rollback:** revert branch/code change, restore the previous GTM published version, disable measurement via feature/env configuration after making sure the direct-vs-GTM setting cannot create duplicates, and verify no private routes/PII are exposed. Do not delete or rewrite leads as a tracking rollback. Changes to GA4 property configuration require a documented operator rollback.

## 7. Suggested implementation sequence, branch discipline and handoff

1. Phase 16A: audit deployed/preview tags and GTM container; choose single transport + consent design.
2. Phase 16B: implement sanitized event helper and opt-in consent management; add unit/security tests.
3. Phase 16C: implement public-path acquisition snapshot and validated lead attribution fields (both form types).
4. Phase 16D: fix consultation accepted-conversion redirect and form double-counting; instrument CTAs.
5. Phase 16E: configure GA4 custom dimensions, Key Events, GSC and Ads linking with owner; verify Preview/DebugView.
6. Phase 16F: current SEO inspection, remediation, dashboard/exploration creation and QA.
7. Phase 16G: stage/canary validation, obtain owner approval, publish GTM and deploy in separately approved steps, then observe/reconcile.

All implementation must use a **new branch** from a freshly fetched `main`, not alter the active Phase 15 CRM branch, and never merge or deploy without authorization. Do not automatically import or publish the historical draft PR #9. Existing Phase 15 CRM events provide a *potential later* offline outcome source, but not permission to send sensitive data to Google.

## 8. Supporting Google documentation (re-check when implementing)

- GA4 recommended events: https://support.google.com/analytics/answer/9267735
- GA4 Key Events: https://support.google.com/analytics/answer/9267568
- GA4 campaigns and UTMs: https://support.google.com/analytics/answer/10917952
- Search Console link: https://support.google.com/analytics/answer/10737381
- GTM Preview/Tag Assistant: https://support.google.com/tagmanager/answer/6107056
- Consent Mode v2: https://developers.google.com/tag-platform/security/guides/consent
- Analytics PII restrictions: https://support.google.com/analytics/answer/6366371

**Clarification:** “track everything” means thorough *permissioned* measurement of defined public behaviors; ad blockers, denied consent, browser limitations and attribution gaps mean no analytics tool can truthfully guarantee 100% tracking.
