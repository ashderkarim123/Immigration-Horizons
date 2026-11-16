# 07 — Open Horizons branding for the Beyond Border-led website

**Objective:** Recreate the **level of design polish and page architecture** seen at Beyond Border while keeping **every visual brand element original to Immigration Horizons**. Do not recreate Beyond Border's branding, page screenshots, copy, trademark, team photography, ratings, or legal positioning.

**Approved master:** Owner-provided `logo files.zip`, containing `Open_Horizons_Brand_Kit` and **Open Horizons Brand Guide v1.0 (12 October 2026)**. The business name remains **Immigration Horizons**; *Open Horizons* is the identity direction.

**Relationship to references:** [00 — Competitor-led experience blueprint](00-competitor-led-experience-blueprint.md) defines the site inspiration. Beyond Border dominates the layout and structural design; Deel informs conversion; Self Petition USA informs service-product clarity. **This document alone controls our visual branding.**

## 1. Mandatory logo assets — originals, not a recreation

All relative paths below are inside `logo files/Open_Horizons_Brand_Kit/` in the owner's ZIP.

| Context | Use this original asset | Usage |
| --- | --- | --- |
| Website desktop and mobile header | `logos/open-horizons-horizontal-full.svg` | Display width 280px desktop / 220px mobile (minimum 200px if space allows) |
| Dark footer or deep-forest CTA region | `logos/open-horizons-horizontal-reverse.svg` | White lettering and doors with terracotta sun, **not** the dark full-color file |
| About / press / large document cover | `logos/open-horizons-stacked-full.svg` | Only where a stacked lockup fits |
| Compact mark in known brand context | `logos/open-horizons-symbol-full.svg` | Do not substitute it for the full wordmark in the main header |
| Favicon / app icon | `favicons/favicon.svg`, `favicons/favicon.ico`, corresponding `png` assets | Use the supplied optimized micro-icon, not a scaled large logo |
| Open Graph and social cards | `social/open-graph-1200x630.png`; supplied avatar files | Use supplied assets for Open Graph/social presence |
| Exact brand tokens | `brand/color-palette.json`, `brand/contrast-ratios.json`, `web/brand-tokens.css` | Source of truth for brand values and contrast |
| Typography | `fonts/DMSerifDisplay-Regular.woff`, `fonts/InterVariable.woff2` | Use license-compliant locally self-hosted fonts; do not send files through chat |

**Source integrity:** `logos/open-horizons-horizontal-full.svg` matches the owner's separately supplied master `logo files/open-horizons-horizontal-full.svg`. Its SHA-256 in the uploaded reference package is `c1967aff311d501b7cc16acbf2e17ccfed5d77eb0fe765371ec47d673cab84eb`. The reverse SVG's reference hash is `be07ade1fe0f2cce21ce58e2a421ccca95198a7dbd26cd4e197d272fc7ef08a7`. Verify the copied repo asset against these when installing; **do not assume the provisional SVG on an older prototype branch is a byte-identical brand master**.

Logo rules from the guide: preserve original aspect ratio, path geometry and colors; maintain clear space of at least **one quarter of the visible symbol height**, outside transparent file margins; never add shadows, crop, stretch, rotate, recolor, or put it on busy imagery.

## 2. Official colors and responsibilities

| Token | HEX | Correct purpose |
| --- | --- | --- |
| Forest | `#164B3B` | Primary CTAs, brand headings and interactive emphasis |
| Terracotta | `#C9774F` | Sun in logo, decorative/illustration accents, subtle borders, icon details |
| Ivory | `#F6F2E9` | Primary warm background |
| Ink | `#20352E` | Main body text |
| Pale Sage | `#E1E8E1` | Secondary section background and cards |
| Deep Forest | `#10372B` | Hero accent blocks, dark CTA/footer, button hover |
| Deep Clay | `#9C4C2B` | Accessible warm accent text on ivory |
| White | `#FFFFFF` | Card surface or text on Forest |

**Contrast is non-negotiable:** Forest on Ivory 8.93:1; White on Forest 9.98:1; Ink on Ivory 11.67:1; Deep Clay on Ivory 5.4:1. Terracotta on Ivory ~3.01:1 and White on Terracotta ~3.37:1: **do not use either for small/normal text.**

**Primary CTA is Forest with white text, not Terracotta with white text.** The original brand guide calls for that. Terracotta can still be prominent as a decorative accent, a sun motif, linework, larger graphic shape or non-text detail, but it must not become the primary button fill for normal-size white labels.

## 3. Typography, scale, density and rhythm

- Display / prominent section headings: **DM Serif Display Regular 400**.
- Navigation, body, buttons, forms, eyebrow labels: **Inter**, with disciplined weight/tracking.
- Brand-guide scale: hero about **56px desktop / 36px mobile**; section headings **36px / 28px**; body **16–18px desktop / 16px mobile**; navigation **14–16px / 14px**. Treat these as starting targets; honor readability and responsive line length.
- Avoid artificial bold DM Serif, all-caps paragraphs, tightly compressed headings, tiny body copy or over-dense landing pages.

**Modern Beyond Border-inspired composition, in our palette:** large editorial heading blocks, generous vertical whitespace, obvious content hierarchy, decisive section transitions, refined information cards, visually grounded proof and process sections. Avoid the generic SaaS-dashboard layout. Motion should be subtle CSS only, with reduced-motion support; no animation libraries.

## 4. Component styling contract

| Component | Our styling | UX reference |
| --- | --- | --- |
| Header | Ivory/white surface; horizontal original logo; restrained professional navigation; accessible mega menu; Forest consultation CTA | Beyond Border layout/navigation; Deel CTA priority |
| Hero | Large DM Serif headline, clear subhead, original brand SVG/graphic illustration, balanced whitespace; no borrowed photo | Beyond Border landing-page hierarchy |
| Trust strip | Real platform score, direct verify links, understated separators, readable facts | Beyond Border proof placement + Deel quick trust |
| Core service cards | Larger editorial typography, warm-white cards, Forest text, restrained border, small Terracotta graphic detail | Beyond Border specialist-services presentation |
| Package / deliverable rows | Clean readable grids, document motifs, minimal iconography | Self Petition USA service-product clarity |
| Audience cards | Short tailored promise, explicit destination, strong typographic titles | Beyond Border audience structure |
| Founder | Owner-confirmed facts with approved real photo via PhotoSlot, or neutral branded illustration without a fictional portrait | Beyond Border human-credibility rhythm |
| Process | Existing eight-stage sequence; cohesive numbered design and accessibility | Beyond Border step-by-step storytelling |
| Testimonials | Verbatim review text, platform, source URL, region/date where known | Beyond Border trust section, but verification-first |
| Forms | Simple Inter labels, clear inputs, Forest focus ring, validation states and one strong CTA | Deel low-friction lead capture |
| Footer | Deep Forest surface, **reverse horizontal logo**, navigable service groups, social links and unchanged compliance disclaimer | Beyond Border closing information architecture |

Do not reproduce Beyond Border's distinctive illustration, exact layout measurements or full page; use **its overall editorial rhythm and specialist-immigration experience** as the design reference.

## 5. Responsive and accessibility acceptance

Design mobile first and test 360, 768, 1024 and 1440px. Header must be usable without horizontal scroll; hero CTAs stack when needed; no 3-column mobile grids; body copy remains readable; all links/buttons have usable touch targets. WCAG AA contrast and visible keyboard focus are required. Review layout and form states, not only unit tests.

## 6. Visual work must respect repo scope and phase boundaries

- The owner approved Beyond Border as the primary website-design reference and the original Open Horizons brand; `CLAUDE.md` has now been explicitly aligned on the design-planning branch. This updates the governing **target design**, but does not apply branding code to production.
- `feature/open-horizons-revamp` is a prior visual prototype, **not** the approved asset source or automatic integration branch. Audit it, then reuse only verified content/components.
- New design docs are not implementation completion. Page designs must be reviewed first; code ships through the phase branches in `06-implementation-plan.md`.
- Only the marketing host `immigrationhorizons.com` is in scope. Preserve portal, staff, CMS and enterprise UI.
- Never push to `main`, deploy, or silently change the production site. Work in draft PRs.

## 7. What must be approved before visual implementation

1. **Completed:** owner approved the brand/reference hierarchy and the governing `CLAUDE.md` design instructions were aligned.
2. **Pending:** approval of original homepage and representative service-page visual mockups, both Beyond Border-led.
3. **Pending if applicable:** real founder photo/credentials; Upwork values and office address are owner-gated.
4. **Pending:** a responsive visual review of header, trust strip, cards, CTAs, forms and footer with original SVG masters.

No other competitor may override our original branding, accessibility, content accuracy or not-a-law-firm requirements.
