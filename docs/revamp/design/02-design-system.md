# 02 — Website design system (Open Horizons)

Implemented in `prototypes/tokens.css`; to land in `src/app/globals.css` (`@theme`) and the existing primitives in
`src/components/ui/` during Phase 3. Nothing here needs a dependency or a client component.

## 1. Colour tokens

| Token | Hex | Role | Contrast (measured) |
| --- | --- | --- | --- |
| `forest` (primary) | `#164B3B` | Primary buttons, headings, links, icons, logo | 8.93:1 on ivory, 9.98:1 white-on-forest |
| `forest-deep` | `#10372B` | Dark sections, footer, primary hover | white 13.1:1; ivory 78 % 11.7:1 |
| `terracotta` (accent) | `#C9774F` | Numerals ≥ 2 rem, stars, rules, illustration, FAQ marker, hairline highlights. **Never body text, never a button fill with text** | 3.01:1 on ivory (large text only), 3.89:1 on deep forest (large text only) |
| `terracotta-light` | `#E9C6B5` | Eyebrows and labels **on Deep Forest** | 8.24:1 on deep forest |
| `clay` (deep clay) | `#9C4C2B` | Eyebrows, taglines, warm labels on light surfaces | 5.40:1 on ivory, 6.03:1 on white |
| `ivory` | `#F6F2E9` | Page background, hero, default section | — |
| `sage` | `#E1E8E1` | Alternating section, quiet cards, proof strip | ink-muted 5.53:1 |
| `white` | `#FFFFFF` | Cards on ivory, "white" sections | — |
| `ink` | `#20352E` | Body text | 11.67:1 on ivory |
| `ink-muted` | `#4C5E56` | Secondary text | 7.0:1 on ivory, 6.9:1 on white |
| `rule` / `rule-strong` | forest at 14 % / 28 % | Hairlines, card borders | — |
| `forest-tint` / `terracotta-tint` | `#E7EEE9` / `#F3E3D8` | Badge and icon backgrounds, nav hover | badge text 8.46:1 / 4.82:1 |

Surfaces rotate **ivory → white → sage → deep forest**; no two adjacent sections share a surface (the existing
`page.tsx` comment documents the same rule for navy/white/tint).

Tailwind mapping (Phase 3): keep the ramp *names* the codebase already uses so no class changes are needed beyond
tokens — `navy-*` becomes the forest ramp (`navy-800 = forest`, `navy-950 = forest-deep`, `navy-50 = forest-tint`),
`gold-*` becomes the terracotta ramp (`gold-500 = terracotta`, `gold-700 = clay`, `gold-200 = terracotta-light`,
`gold-50 = terracotta-tint`), `ink-*` becomes the warm ink ramp (`ink-50 = ivory`, `ink-100 = sage`, `ink-600 =
ink-muted`, `ink-700 = ink`). The gold contrast rule in `CLAUDE.md` then reads "terracotta-500 never as text on light;
use 700+" and stays true. Rename the ramps to `forest-*`, `terracotta-*` in a follow-up if the owner wants the class
names to match the brand (it is a mechanical find-and-replace; not required for the visual result).

## 2. Typography

| Role | Face | Desktop | ≤1024 | ≤768 | Line-height | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Hero H1 | DM Serif Display 400 | 56 px | 44 px | 36 px | 1.06 | `max-width: 14ch` |
| Service H1 | DM Serif Display | clamp(36–52 px) | — | 36 px | 1.08 | `max-width: 18ch` |
| H2 | DM Serif Display | 36 px | 32 px | 28 px | 1.12 | |
| H3 (cards) | DM Serif Display | 24 px | — | 20 px | 1.22 | Card titles, step titles 20 px |
| Numerals | DM Serif Display, terracotta | 32–40 px | — | — | 1 | Process steps, prongs, deliverables |
| Lead | Inter 400 | 18 px | — | 17 px | 1.6 | `ink-muted` |
| Body | Inter 400 | 16 px | — | 16 px | 1.65 | `ink`; measure 66ch |
| Small | Inter 400 | 14 px | — | 14 px | 1.5 | Sources, meta |
| Eyebrow | Inter 700 | 12 px, 0.14em tracking, uppercase | — | — | 1.4 | `clay` on light, `terracotta-light` on dark |
| Nav | Inter 500 | 15 px | — | 17 px (mobile panel) | 1 | |
| Button | Inter 600 | 15 px (md), 16 px (lg), 14 px (sm) | — | — | 1 | |

DM Serif Display has one weight and no italic: never use `font-style: italic` or bold on display text. Emphasis in
headings is done with a line break or terracotta numeral, not with weight. Inter is the only sans; no third family.

Fonts stay on `next/font/google` (`DM_Serif_Display` weight 400, `Inter` variable), which self-hosts at build time — zero
external font requests, the same mechanism the site already uses.

## 3. Spacing, radius, elevation, motion

- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 56 / 64 / 96 / 120 px. Section padding 96 px desktop (64 compact, 120
  spacious), 64 px mobile (80 spacious). Grid gap 24 px; split layouts 56–64 px.
- Containers: 1200 px default, 1280 px wide, 66ch prose. Gutter 24 px, 16 px ≤768 px.
- Radius: 8 px small (callouts, inputs), 16 px card, 24 px panel, pill for buttons/chips/badges.
- Elevation: `shadow-card` (0 1 2 / 0 10 28 at 4–7 % forest) on white cards; `shadow-lifted` only on hover and the
  mega panel. Nothing heavier; sage and ivory cards have no shadow.
- Motion: CSS only. Buttons and link-cards lift 1–3 px on hover inside `@media (prefers-reduced-motion: no-preference)`.
  Scroll reveals keep the existing `animation-timeline: view()` rule and its `@supports` guard. No animation library.

## 4. Components

For each: purpose · typography · colours · size · radius/border · states · mobile · accessibility · reuse.

### 4.1 Header + mega menu
- Sticky, ivory at 92 % with 10 px blur, 1 px hairline. 84 px tall (72 px mobile). Logo 280/220/200 px.
- Nav links Inter 500 15 px, pill hover `forest-tint`; current page forest 600. Services opens a 1040 px white panel
  (24 px radius, lifted shadow) with four columns: Green card petitions, RFE/NOID & support (clay labels), Other US visas
  (muted label, lighter link weight — the visual "secondary" tier), and a Deep Forest feature card with the
  consultation CTA.
- Primary CTA: `btn-primary md`, label "Book a free consultation" everywhere (one label across the site).
- Mobile ≤900 px: hamburger (44 px, hairline border) toggles a panel: Home, grouped service links with tier labels
  (secondary visas collapsed to one line), Who we help, Reviews, About, Resources, Contact, full-width CTA.
- A11y: `aria-expanded`/`aria-controls` on both toggles, Escape closes, focus stays visible (3 px clay outline, 3 px
  offset). Tab order verified: logo → nav → mega links → CTA.
- Reuse: the existing `layout/header.tsx` client component keeps all its logic; only classes, the logo `<Image>` and
  the nav data change. "Who we help" is added to `primaryNav` only when `/for/*` exists (Phase 5).

### 4.2 Hero (home)
Ivory, split 1.05 / 0.95, 88 px padding. Left: eyebrow, H1 (two-line, `{" "}` preserved for crawlers), lead, two CTAs
(`primary lg` + `outline lg`), three check items. Right: inline SVG illustration (doors, sunrise, path, two document
motifs), `aspect-ratio 5/4`, `role="img"` with alt. Mobile: single column, art after copy at max 520 px, CTAs full
width, WhatsApp only as the floating button (not a third hero button — the spec's 360 px wrap concern).
Reuse: `sections/hero.tsx` with copy moved to `src/lib/content/home.ts`; `hero-visual.tsx` replaced by the new SVG.

### 4.3 Service hero
Ivory (not dark). Breadcrumbs, badges (classification + form), H1, lead, **definition** callout (4 px terracotta left
rule, white), `primary lg` + `outline lg` ("What's in the package" anchors to the package module), the one-line
"we prepare, you file" note. Right: **key-facts panel** (white card, hairline rows, dt muted / dd forest 600). Mobile:
facts panel after the CTAs. Reuse: `service/service-hero.tsx` and `layout/page-hero.tsx` restyled; `keyFacts` data
already exists.

### 4.4 Buttons and text links
| Variant | Fill / text | Border | Hover | Use |
| --- | --- | --- | --- | --- |
| `primary` | forest / white | — | forest-deep, lifted shadow | Every primary CTA on light |
| `outline` | transparent / forest | rule-strong | forest-tint fill, forest border | Secondary CTA on light |
| `on-dark` | white / forest | — | ivory | Primary CTA on Deep Forest |
| `ghost-dark` | transparent / white | white 35 % | white border, 8 % fill | Secondary on Deep Forest (WhatsApp) |
| text link | forest 600 + 16 px arrow | — | underline | Card and section links |

Pill radius; heights 40 / 48 / 56 px; min 44 px touch target everywhere. Disabled 55 % opacity. Focus ring 3 px clay.
Terracotta is never a button fill with text (white on terracotta is 3.37:1). Reuse: `ui/button.tsx` — rename `gold`
→ `on-dark` semantics (same slot), keep `primary/outline/inverse/ghost`.

### 4.5 Service card (core)
White, hairline, 16 px radius, 28 px padding, card shadow. Row: H3 (DM Serif 24) + badge (`forest` "Immigrant petition"
/ `clay` "Response service"); tagline clay 600 14 px; two-line body muted; "What's included →" text link. Whole card is
the link (`a.card`); hover lifts 3 px and sets the border to forest. Grid 3 × 2 desktop, 1 column ≤768 px. Reuse:
`ui/card.tsx` (`Card href`, `CardTitle`, `CardBody`, `Badge`) unchanged in API.

### 4.6 Audience card
As the service card but with a 44 px forest-tint icon tile, 20 px H3, one-line body, "For … →". 4 across, 2 ≤1024,
1 ≤768. Below the grid a muted sentence linking students/investors to `#other-visas`. Reuse: `Card` + `FeatureIcon`.

### 4.7 Trust / proof strip
Sage band with top and bottom hairlines, 20 px padding. Left: `RatingBadge` — five terracotta stars, "4.8 / 5" in DM
Serif 24 forest, "from 44 reviews on Fiverr · checked 16 Nov 2026 · view source ↗" as one external link. Right: three
check facts. Renders nothing for a platform with `score: null` (Upwork until supplied). Mobile wraps to two rows.
Reuse: `sections/trust-bar.tsx` becomes this; data from `site.ts` `ratings` (Phase 4).

### 4.8 Review card
White, 24–28 px padding. Terracotta stars (aria-label "5 out of 5"), verbatim quote in `ink` 16 px, footer with name
(forest 600) + service · location, and the source link ("Fiverr ↗", external). Never "5-star rated". Reuse:
`sections/testimonials.tsx`; type extension per `04-reviews-and-proof.md`.

### 4.9 Process step card
Ordered list, CSS counter → "01…08" in DM Serif 32 terracotta, 2 px sage-deep top rule, H3 20 px, body muted 15 px.
4 × 2 desktop, 2 × 4 ≤1024, 1 column mobile. No timings anywhere. Reuse: `sections/process.tsx` with `processSteps`.

### 4.10 Package / deliverable module
Deep Forest section: left column eyebrow (terracotta-light), H2 white, lead at 82 % ivory, `on-dark` CTA + white text
link; right column a two-column `<dl>` with terracotta numerals, white DM Serif 20 `dt`, 80 % ivory `dd`, hairline
dividers. On service pages the same list appears as a sage panel with check icons ("Full … package") and a one-line
"quoted after consultation, no prices" note. Reuse: new `sections/package-includes.tsx`, data in `home.ts`.

### 4.11 FAQ
Native `<details>/<summary>`, hairline dividers, summary Inter 600 17 px forest, terracotta "+ / –" marker, answer
muted at 66ch. First item open. Visible answer text must equal the `FAQPage` schema string. Reuse: `sections/faqs.tsx`
(already server-rendered).

### 4.12 Forms (consultation, contact)
Inputs: 48 px tall, white, 1 px `rule-strong`, 8 px radius, 16 px text, label above (Inter 600 14 px ink), helper /
error below (14 px; error in `clay` with an icon, `aria-describedby`). Focus: 2 px forest border + 3 px clay ring.
Select and textarea identical. Success state: sage panel with forest check icon, H2, next-step text, WhatsApp link.
Submit = `primary lg`, full width ≤768 px. The form card sits on white over ivory, max 640 px, with the disclaimer
beneath. Reuse: existing form handlers and `actions.ts` untouched; only classes change.

### 4.13 Breadcrumbs
13 px muted, "/" separators in `rule-strong`, current item `aria-current="page"`, on light surfaces only (the service
hero is now ivory, so the dark variant is retired). Reuse: `service/breadcrumbs.tsx`.

### 4.14 CTA banners
- Inline (service body): Deep Forest panel, 24 px radius, H3 white 24 px, one-line lead, `on-dark` button; stacks ≤768.
- Closing: Deep Forest section, centred, eyebrow, H2 clamp(32–48 px) max 20ch, lead, `on-dark lg` + `ghost-dark lg`
  (WhatsApp). Reuse: `sections/cta-banner.tsx`, `service/inline-cta.tsx`.

### 4.15 Footer
Deep Forest. Grid 1.3fr + 4 × 1fr (2 columns ≤1024, 1 ≤768). Brand column: reverse logo 240 px, `site.disclaimer`
verbatim at 78 % ivory, email, WhatsApp / Fiverr / Upwork links. Column headings `h3` styled as eyebrows in
terracotta-light. Bottom bar: copyright + legal links. The old white logo tile and the gradient blobs go. Reuse:
`layout/footer.tsx`; `footerNav` already provides the three service groups + Company.

### 4.16 Chips (secondary visas)
White pill, hairline, forest label + muted descriptor, hover forest-tint. One wrapping row. Reuse: new
`sections/other-visas-row.tsx`.

### 4.17 Table of contents (service pages)
260 px sticky column (top 108 px), 2 px sage-deep left rail, current item forest with terracotta rail, muted
otherwise; a sage mini-CTA panel beneath. ≤1024 px it becomes a wrapping inline list under the hero and the mini-CTA
is hidden (the inline and closing CTAs remain). Reuse: `service/table-of-contents.tsx`.

### 4.18 PhotoSlot
Unchanged behaviour; placeholder restyled to white with hairline, symbol mark at 120 px and the "to be supplied" label.
Never a stock person.

### 4.19 Icons
Lucide (already installed), 1.75 stroke, inside 44 px forest-tint tiles. No second icon family.

### 4.20 Containers and responsive layout
`Container` widths unchanged (6xl/7xl/68ch). Breakpoints used: 400, 768, 900 (nav), 1024, 1440 (max). No horizontal
scroll at 360/768/1024/1440 (verified on both prototypes).
