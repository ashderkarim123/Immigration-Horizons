# Phase 16 — Public GA4/GTM Event Dictionary & Attribution Test Matrix

**Date:** 2026-10-26
**Owner:** Website/Growth, with privacy/security review
**Canonical transport decision:** pending read-only GTM audit. Exactly one GA4 event sender per website action. One typed `dataLayer` event is the preferred application-to-GTM contract after successful GTM ownership validation.

## Vocabulary and event-owner policy

1. **GA4 automatically collected:** `first_visit`, `session_start`, `user_engagement`, and `page_view` if enabled. GA4 Enhanced Measurement may also send `scroll`, outbound `click`, `file_download`, `view_search_results`, `form_start`, `form_submit` and video events. **Confirm which are on and actually fire** before adding manual alternatives.
2. **Application-owned data-layer events** have a single documented trigger and do not contain raw text or identities. GTM custom-event triggers translate them into GA4 events once. Do not also call `gtag('event', ...)` when GTM is the owner.
3. `generate_lead` is emitted **once when the server has genuinely accepted the enquiry** (persisted and/or successfully delivered according to the existing server contract), never just on button press or a client redirect, and never for fake honeypot outcomes.
4. GA4 traffic source, source/medium, campaign, channel group and first-user attribution are reporting dimensions, **not events** named `direct_visit` or `organic_visit`. Do not guess channels client-side.
5. Secondary intent events do not claim a call, WhatsApp conversation, engagement contract or completed sale.

## Tracking matrix

| Event | Trigger / intent | Context parameters (allowlist only) | GA4 owner | Key event? |
|---|---|---|---|---|
| `page_view` | Marketing page load, Next client route change | Normalized public page path/title, no arbitrary query | GA4 automatic OR controlled GTM, exactly one | No |
| `session_start` / `first_visit` | GA4 session/first visit | GA4 built-in only | GA4 | No |
| `scroll` | Enhanced measurement depth (default threshold) | GA4 built-in only | GA4 Enhanced Measurement | No |
| `click` / `file_download` | Supported outbound/download interactions | Built-in safe parameters; audit URL redaction | GA4 Enhanced Measurement | No |
| `view_search_results` | Only if public, non-sensitive site-search exists | Sanitized search classification, never raw sensitive query | Enhanced Measurement if available | No |
| `form_start` | Visitor begins either public lead form | `form_name`: consultation/contact (check Enhanced Measurement) | GA4 Enhanced Measurement **or** custom, not both | No |
| `lead_form_view` | Lead form is visibly presented (optional if page view sufficient) | `form_name`; `page_type` | App via GTM | No |
| `lead_form_submit_attempt` | Deliberate public submit action | `form_name`; `page_type` | App via GTM | No |
| `form_error` | Server rejects validation/rate limit; no accepted lead | `form_name`; `error_category`, optional field **names** from predefined list only | App via GTM | No |
| `generate_lead` | Server accepts consultation or contact enquiry exactly once | `form_name`, `event_version`. No client ID, case, contact info, message or raw campaign fields | App via GTM/approved consented transport | **Yes — primary** |
| `thank_you_view` | The thank-you page after an **accepted** contact or consultation form was viewed (ADR-033). A view, not a conversion: a refresh or a direct visit can repeat it, and neither can ever count as a lead | `form_name`; `page_type`; `event_version` | App via GTM or direct GA4 (one owner) | No |
| `sign_up` | The consultation submission **created a client-portal account**, reported once with the lead and before the page leaves (ADR-033). GA4 recommended event | `method=consultation_form`; `event_version` | App via GTM or direct GA4 (one owner) | Optional: owner decides |
| `cta_consultation_click` | Clicks navigational CTA to free consultation | `cta_id`; `cta_placement`; `page_type` | App via GTM | No |
| `click_whatsapp` | Intent to open a WhatsApp chat | `cta_placement`; `page_type`; `link_type=whatsapp` | App via GTM | No (secondary intent) |
| `click_phone` | Intent to dial | `cta_placement`; `page_type`; `link_type=phone` | App via GTM | No (secondary intent) |
| `click_email` | Intent to open an email app | `cta_placement`; `page_type`; `link_type=email` | App via GTM | No (secondary intent) |
| `view_service` | Optional meaningful service view, only when distinct from page view | `page_type=service`; approved `service_slug` taxonomy if privacy-approved | App via GTM | No |
| `qualify_lead` / `working_lead` | Later **approved** CRM outcome change | Only approved, de-identified measurement after privacy/legal design | **Deferred** | Deferred |
| `close_convert_lead` / `close_unconvert_lead` | Later **approved** CRM close state | No sensitive case or identity info; offline linkage review required | **Deferred** | Deferred |
| `purchase` | Actual payment after future billing integration | Future payments only, not quote views | **Out of scope** | No |

### Recommended low-cardinality custom dimensions

`form_name` (consultation/contact), `page_type` (home/service/blog/about/contact/consultation/resource/other), `cta_id` (stable vocabulary), `cta_placement` (hero/header/footer/service_card/floating/contact_panel/etc.), `link_type` (whatsapp/phone/email), `event_version`. Register only approved parameters in GA4; do not register generated object IDs or one-off strings.

**Remove:** `link_text` derived from real phone numbers/email addresses; arbitrary href values; free-form form values; case-related URLs; raw `referrer` query parameters; hidden field values; tokens. `service_slug` is optional only if privacy review allows it. Read GA4 automatic page location carefully—query stripping must apply there as well as to custom events.

## UTM source/medium/campaign conventions

| Channel intended | Example entry | How GA4 determines it |
|---|---|---|
| Direct | `https://immigrationhorizons.com/` from an untagged direct entry | No campaign/referrer; report as Direct when GA4 classifies it |
| Google organic | Google organic search result | Referrer / GA4 Organic Search and connected GSC |
| Google Ads Search | Ads auto-tagging (`gclid`, `gbraid`, `wbraid` as supported) | Google Ads linkage / auto-tagging; manual UTM must not conflict |
| Meta paid social | `?utm_source=facebook&utm_medium=paid_social&utm_campaign=niw_awareness` | Paid Social according to channel rules |
| Instagram paid social | `?utm_source=instagram&utm_medium=paid_social&utm_campaign=eb1a_guide` | Paid Social according to channel rules |
| Newsletter | `?utm_source=newsletter&utm_medium=email&utm_campaign=october_guides` | Email |
| Referral partner | `?utm_source=partner_name&utm_medium=referral&utm_campaign=resource_partner` | Referral |
| Organic social | Unpaid social link with consistent organic social medium | GA4 Organic Social when tagged/classified correctly |

UTMs are case-sensitive. Lowercase source/medium/campaign strings. Ad-platform spend appears only when a real platform cost integration is connected. Do not advertise "100% tracking" or treat unknown traffic as direct by manual assignment.

## QA scenarios

| Scenario | Expected result |
|---|---|
| One marketing page view, then Next navigation | Exactly one `page_view` per eligible route; no double fire |
| GTM configured with GA4 plus direct GA4 enabled | CI/Tag Assistant flags duplicate risk; release blocked until one owner chosen |
| Consultation CTA click from hero | One safe `cta_consultation_click` with stable placement; not a lead |
| Click WhatsApp button showing a telephone number | One `click_whatsapp` with no number, link text or destination in GA4 |
| Contact validation error | One `form_error`; no `generate_lead` |
| Successful contact submission | Exactly one `generate_lead`; existing lead delivery stays functional |
| Successful consultation with portal redirect | One accepted `generate_lead` survives navigation, without monitoring portal pages |
| Honeypot, duplicate click or repeated success screen | No fake/double accepted conversion |
| Google Ads visitor moves from service page to consultation | Eligible campaign/landing information survives internal navigation |
| Contact form visitor enters from newsletter | Contact lead stores approved attribution (when consent permits) |
| Visitor denies/revokes analytics consent | No unauthorized client-side tags/storage; consent behavior matches approved mode |
| PII in page query or contact link labels | Parameter scrubbing prevents disclosure to GA4/GTM |
| Staff/client/admin visit | No public analytics event or private URL sent |
| Viewed funnel on GA4 | Accepted lead key events measured by Session channel, landing page and form name |
| GSC report | Verified Google organic queries/landing pages, no invented organic keyword event |
| Ad blocker/network failure | Forms, portal onboarding and site navigation still work |

## GTM publishing and GA4 operator checklist

- [ ] Inventory existing container Google tag, GA4 events, conversions, triggers, consent settings, pageview behavior and latest published version before changes.
- [ ] Confirm GA4 ID belongs to correct public property and website stream; select owner and remove duplicate transport.
- [ ] Create GTM variables for allowlisted `dataLayer` fields, custom-event triggers and one GA4 event tag per event (or a templated validated event tag with strict allowlist).
- [ ] Ensure consent checks before firing and privacy controls for URL/parameters.
- [ ] Tag Assistant Preview proves each tag fires once and no PII is exposed.
- [ ] GA4 DebugView and Realtime show expected events under consented test traffic, including accepted `generate_lead`.
- [ ] Mark accepted `generate_lead` as primary Key Event, document counting settings, and avoid duplicate imported Ads conversions.
- [ ] Link/Search Console reports and Google Ads integration if used. Capture screenshots/checklist privately, never upload client PII.
- [ ] Create internal GA4 Explore (form funnel, acquisition landing pages, organic content).
- [ ] Obtain permission to publish GTM and deploy separately; document version for rollback.

## Official reference links

- https://support.google.com/analytics/answer/9267735
- https://support.google.com/analytics/answer/10917952
- https://support.google.com/analytics/answer/10737381
- https://support.google.com/tagmanager/answer/6107056
- https://developers.google.com/tag-platform/security/guides/consent
- https://support.google.com/analytics/answer/6366371

## Portal sign-up and activation measurement (ADR-033)

- **`sign_up`** is sent by the public site when a submission creates a portal account. It is sent from the form, not the portal, because the portal is deliberately untagged (private surface; plan section 3, rule 5).
- **Portal activation** (the visitor verifying their email) is **not** a GA4 event, for the same reason. It is recorded as the `activation_completed` security event, which staff can see.
- The thank-you pages (`/contact/thank-you`, `/consultation/thank-you`) are `noindex` and outside the sitemap. A GA4 destination (URL) goal on them is possible but can be reached by a direct visit; prefer the `generate_lead` key event, which only the server's acceptance can produce.
