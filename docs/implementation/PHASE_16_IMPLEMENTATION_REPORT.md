# Phase 16 — implementation report (code gates, first batch)

**Date:** 2026-10-26. **Branch:** `phase-16/seo-ga4-implementation`, cut from `main@6834fd4`, with the plan branch merged in. **Plan:** `PHASE_16_SEO_GA4_GTM_MEASUREMENT_PLAN.md`; event contract: `PHASE_16_GA4_EVENT_DICTIONARY.md`.

This batch implements what can be built and proven **without** Google-account access, a consent decision or a deployment: plan gates A (event contract), D (accepted-lead semantics and CTAs) and the code half of C (attribution parity). Gates B, E, F and G need the owner; they are listed under "Blocked" with the exact decision each one needs.

## 16A — what is deployed today (read-only audit, 26 Oct 2026)

Public HTML only; no GTM, GA4 or Search Console account was accessed.

| Page | `gtm.js` | direct `gtag/js` | Container / property |
|---|---|---|---|
| `/`, `/contact`, `/consultation`, `/services/eb2-niw` | loads | loads | `GTM-M9KC3GDW` / `G-XYD4F5BE1F` |
| `app.` portal and staff sign-in, `admin.` sign-in | none | none | none |

- **Both transports are live on the marketing pages.** The code defaults to `direct` GA4 and still loads the GTM container "for other tags". If that container also holds a GA4 tag or GA4 event tags, every event is counted twice. **This cannot be seen from the site; the owner must inspect the container** (checklist item 1 of the dictionary). Until then the safe state is unchanged: direct GA4 owns GA4, and GTM must contain no GA4 tags.
- Private hosts send nothing, and `robots.txt` disallows `/portal`, `/staff`, `/api/` and `/admin`. `www` redirects (308) to the apex and keeps the query string, so campaign parameters survive. The sitemap lists 23 URLs.

## Defects found in the existing implementation, and fixed here

1. **Consultation leads were never counted.** `submitConsultation` ended in a server `redirect()` to the portal, so the page left before its analytics hook saw a success, and portal pages are deliberately untagged. The action now returns `{ accepted: true, redirectTo }`; the form reports the lead, then follows `redirectTo` 400 ms later (and shows a **Continue** link, so it also works without JavaScript).
2. **A bot was counted as a lead.** The honeypot answers `success` so the bot is satisfied, and the old hook fired `generate_lead` on any success. A lead now needs the server's explicit `accepted: true`; the honeypot never sets it.
3. **Double counting on re-render.** The hook now remembers the last response it reported.
4. **Contact leads lost their campaign.** The consultation form carried UTM and click ids; the contact form did not. Contact now reads them from its own URL in the browser, which keeps `/contact` a static page.

## What changed

- `src/lib/analytics.ts`: `event_version` (`"1"`) on every event; allowlisted `page_type`, `cta_placement`, `cta_id`, `link_type`, `error_category` (anything outside a vocabulary is dropped, so a URL, phone number, email or free text cannot ride along); new `lead_form_submit_attempt`; pure helpers `pageTypeForPath`, `linkTypeForEvent`, `formOutcomeEvent`.
- `src/lib/tracking.ts` (new): the one campaign-parameter allowlist, shared by the consultation page, the contact form and both actions. Values are trimmed, stripped of control characters and capped at 150 characters. It reads the page's own query string and stores **nothing** in the browser.
- `click-tracker.tsx`: records placement (`hero`, `header`, `footer`, `floating`, `content`, derived from the page landmark or a `data-cta-placement` attribute), page type and link type. It never sends link text, a destination or a number. The home and service heroes and the WhatsApp button carry explicit placements.
- `use-form-tracking.ts`, both forms and both actions as described above; `FormState` gains `accepted`, `errorCategory` and `redirectTo`.

## Verification

| Check | Result |
|---|---|
| New unit tests | `analytics` (15), `tracking` (3), `lead-form-semantics` (2: the honeypot on both actions is not accepted and sends the bot nowhere) |
| New browser spec `e2e/analytics-leads.spec.ts` | 7/7, run twice: one attempt then exactly one `generate_lead` for contact with no personal data or campaign values in any event; a validation failure is a `form_error` and never a lead; a honeypot hit is not a lead; an accepted consultation is reported **once, before** the navigation to the portal; a header CTA records placement and type, not text; the WhatsApp button records intent with no number; the client portal records nothing |
| Lint, `tsc --noEmit` | clean |
| Root suite | 490/490 (480 before this batch, plus the 10 new unit tests) |
| Full browser suite | 24 of 25 on the first full run. The one failure, `calendar.spec.ts`, was an `ECONNRESET` from the local server on its very last request (after every assertion before it had passed), in a spec this batch does not touch; it passed 2/2 when run alone. Treat as a flake, not a regression, but watch it in CI. |

The browser spec reads what the app **queues** on `window.dataLayer` (the Google tags are production-only), so it proves the application's contract. It does not prove what Google receives; that is Tag Assistant and DebugView work for the owner (plan section 5).

## Blocked, and the decision each needs

| Gate | Needs | Why I did not proceed |
|---|---|---|
| A (finish) | Owner reads the GTM container: does it contain a GA4 tag? | Decides whether direct GA4 or GTM owns the events. Wrong choice doubles every count. |
| B consent | A decision on a consent approach and legal review | A banner changes what every visitor sees, and Consent Mode defaults change what is measured. Not something to ship unreviewed. |
| C multi-page attribution | Gate B | Keeping a visitor's first campaign touch across pages means browser storage, which needs consent. Today a lead carries only the parameters on the page it was submitted from. |
| E GA4, Search Console, Ads setup | Owner's Google access | Custom dimensions, the `generate_lead` key event and linking happen in Google's consoles. The dimensions to create are listed in the dictionary. |
| F, G SEO inspection, dashboards | Search Console access, ongoing | Needs the live property. |

## Rollback

Revert the branch commits. No database change was made and none is needed: `Consultation` already stores the UTM and click-id fields, and the contact form now fills the same ones. Nothing was deployed and no GTM change was made.

## Next

Merge this branch after review, then (separately) the owner's GTM container check, which unblocks choosing the single transport and the consent design.
