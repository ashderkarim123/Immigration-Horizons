# 05 — Navigation and conversion journey

Conversion goals in priority order (brief §4): 1 free consultation · 2 WhatsApp · 3 EB-2 NIW / EB-1 preparation
inquiry · 4 RFE/NOID inquiry · 5 secondary visa inquiry. Every path below ends at `/consultation` (with `?service=`
prefill) or at WhatsApp. Existing GA4/GTM `data-cta-placement` / `data-cta-id` attributes are kept on every CTA.

## 1. Journey map

```
                         ┌──────────────── Header: "Book a free consultation" (every page) ────────────────┐
                         │                                                                                  │
 Home ─ hero ──────── Book a free consultation ───────────────────────────────────────────────▶ /consultation
   │    └── Got an RFE or NOID? ──▶ /services/rfe-response ──▶ hero CTA / WhatsApp ───────────▶ /consultation?service=rfe-response
   ├─ proof strip ──▶ Fiverr profile (external, verifies) ──▶ back ──▶ CTA
   ├─ core services ──▶ /services/<eb2-niw|eb1a|eb1b|eb1c> ──▶ package panel CTA / inline CTA / closing CTA ─▶ /consultation?service=<slug>
   │                └──▶ /services/<rfe|noid-response> ──▶ WhatsApp (urgent) or consultation
   ├─ package module ──▶ CTA, or "compare" ──▶ /services (directory)
   ├─ who we help ──▶ /for/<audience> ──▶ recommended path cards ──▶ service page ──▶ consultation
   │                └──▶ "student or investor?" ──▶ #other-visas ──▶ /services/<e2|f1|f2|j1|b1-b2-visa> ──▶ consultation
   ├─ NIW explainer ──▶ /services/eb2-niw (guide) ──▶ as above
   ├─ founder ──▶ /about ──▶ closing CTA
   ├─ reviews ──▶ /reviews ──▶ filter ──▶ service page or CTA
   ├─ FAQ ──▶ /faqs ──▶ CTA
   └─ final CTA ──▶ /consultation  |  WhatsApp
```

Mobile: the same map, with WhatsApp available at every scroll position through the floating button (the hero keeps
two CTAs only), and the header CTA inside the menu panel.

## 2. CTA hierarchy per page family

| Family | Primary (one label everywhere) | Secondary | Tertiary |
| --- | --- | --- | --- |
| Home | Book a free consultation (hero, package, final) | Got an RFE or NOID? (hero) | Service / audience / review links |
| Core petition pages | Book a free consultation (hero, inline, TOC rail, closing) | What's in the package (hero anchor) | RFE/NOID links, related services |
| RFE / NOID pages | Book a free consultation | Chat on WhatsApp (hero) | Link to the other notice type |
| Supporting services | Book a free consultation | Part of a full package? (links) | — |
| Secondary visas | Book a free consultation | Chat on WhatsApp (closing only) | Thinking long term? (O-1, E-2) |
| Audience pages | Book a free consultation | Recommended path cards | Reviews |
| Reviews / About / FAQ / Resources | Book a free consultation (closing) | WhatsApp (closing) | — |
| Consultation | Submit | WhatsApp rail | — |

Rules: one primary per viewport; never two filled buttons side by side; the secondary is always an outline/ghost; a
section never has more than one CTA block; CTAs recur roughly every 2–3 screens on long pages (hero, mid, close).

## 3. Navigation structure

Header: Home · Services (mega: Green card petitions / RFE, NOID & support / Other US visas (quiet) / consultation
feature) · Who we help (Phase 5+) · Reviews · About · Resources · Contact · [CTA]. "Blog" leaves the top bar (it stays
in Resources and the footer) to keep seven items at 1024 px without wrapping; the Phase 1 report shows the current
seven-item bar already fits, and "Who we help" + "Reviews" replace "Blog".

Footer: Green card petitions · RFE, NOID & support · Other US visas · Company (Who we help, About, Client reviews,
Resources, Blog, FAQs, Contact, Client portal) · legal bar. All link lists derive from `navigation.ts` and the
publication gate, so unbuilt pages never appear.

## 4. Accessibility of the journey

- Every CTA is a real `<a>` or `<button>` with visible text; icon-only controls carry `aria-label`.
- Focus order verified on both prototypes: logo → nav → (mega links when open) → CTA → page content in reading order.
- Mega and mobile panels expose `aria-expanded`/`aria-controls`; Escape closes the mega panel.
- Minimum 44 px targets; chips and text links have ≥ 10 px vertical padding.
- Colour is never the only signal: badges carry text, external links carry "↗", current nav item is bold as well as
  coloured.
