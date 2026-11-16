# 01 — Open Horizons brand asset audit

Checked 2026-11-16.

## 1. Where the masters are

The approved package is the **untracked** folder `Revamp/Logo Bradning/Open_Horizons_Brand_Kit/` (kit README:
"Open Horizons, version 1.0, 12 October 2026"). It is not in git and must not be committed wholesale (it carries
PDFs, PNG exports and build scripts). The files the website needs are copied into `docs/revamp/design/assets/` with
SHA-256 checksums in `assets/CHECKSUMS.sha256`, so Phase 3 can copy them into `public/` and prove they are the masters.

The loose `Revamp/Logo Bradning/open-horizons-horizontal-full.svg` is byte-identical to the kit master.

The prototype branch `feature/open-horizons-revamp` committed `public/images/open-horizons-horizontal-full.svg`;
it is **byte-identical** to the kit master (verified with `cmp`), so that branch's logo is not a provisional
approximation. Its other changes (recoloured `navy-*`/`gold-*` ramps, "Check eligibility" CTA label) are **not**
adopted — see `06-implementation-mapping.md`.

## 2. Inventory

| Asset | Kit path | Copied to `assets/` | Website use |
| --- | --- | --- | --- |
| Horizontal full-colour logo | `logos/open-horizons-horizontal-full.svg` (1000×280, outlined type) | ✅ | Header on ivory/white |
| Horizontal reverse (white + terracotta sun) | `logos/open-horizons-horizontal-reverse.svg` | ✅ | Footer and any Deep Forest surface |
| Horizontal white / black | `logos/open-horizons-horizontal-{white,black}.svg` | — | Print / mono contexts only |
| Stacked full / reverse / white / black | `logos/open-horizons-stacked-*.svg` | full ✅ | Social avatars, OG art, 404 page |
| Symbol full / reverse / white / black | `logos/open-horizons-symbol-*.svg` (280×280) | full ✅, reverse ✅ | Compact brand contexts, PhotoSlot placeholder motif, app icon |
| Favicon | `favicons/favicon.svg`, `favicon.ico`, PNG 16/32/48 | svg ✅, ico ✅ | Replaces `public/favicon.ico`, `favicon-16.png`, `favicon-32.png` |
| Apple touch icon | `favicons/apple-touch-icon-180x180.png` | ✅ | Replaces `public/images/apple-touch-icon.png` |
| Maskable / android icons, `web/site.webmanifest` | `favicons/*`, `web/` | — | Only if a manifest is added (not planned) |
| Open Graph | `social/open-graph.svg` + `open-graph-1200x630.png` | svg ✅ | Replaces `public/images/og-card.png`; `scripts/generateOgImage.tsx` must be updated or retired |
| Social avatars | `social/social-avatar-{forest,ivory}*.{svg,png}` | — | Owner's profiles, not the site |
| DM Serif Display Regular | `fonts/DMSerifDisplay-Regular.{ttf,woff}` + OFL | woff ✅ | Prototype only; production uses `next/font/google` `DM_Serif_Display` (self-hosted at build, zero external requests) |
| Inter variable | `fonts/InterVariable.woff2` + OFL | ✅ | Prototype only; production keeps `next/font/google` `Inter` |
| Palette | `brand/color-palette.json`, `.csv`, `contrast-ratios.json` | — (values reproduced in `02-design-system.md`) | Source of truth for tokens |
| Brand guide | `brand/Open_Horizons_Brand_Guide.pdf`, overview PNGs | — | Reference |
| `web/brand-tokens.css`, `install-snippets.html` | kit web folder | — | Reference only; our tokens live in Tailwind `@theme` |

Nothing required by the brief is missing from the kit. **Missing from the repository** (not the kit): the three
documents the brief cites — `docs/revamp/00-competitor-led-experience-blueprint.md`,
`07-open-horizons-brand-application.md`, `08-page-design-and-rollout.md` — do not exist on any local or remote branch
(`git log --all -- docs/revamp/0[078]*` is empty). This package stands in for them; the owner should confirm no
separate copy exists.

## 3. Logo rules applied in the design

- Header: `horizontal-full.svg`, rendered width 280 px desktop, 220 px ≤768 px, 200 px ≤400 px, `height:auto`,
  `width="1000" height="280"` attributes to reserve the ratio (no CLS). Never cropped, recoloured or stretched.
- Clear space: the symbol's door height on all sides (the SVG already pads to this; do not tighten the header bar
  below 72 px).
- Dark surfaces: `horizontal-reverse.svg` only. Never the full-colour logo on a white tile over the footer (the old
  navy footer did this; it is not needed because a reverse master exists).
- The symbol may be used alone at ≥32 px; below that use the favicon artwork, which is a simplified mark.
- Illustrations may quote the motif (doors, sunrise, path) but never reproduce the lockup as artwork.

## 4. Current assets to retire in Phase 3

`public/images/logo-header.png`, `Main logo.PNG`, `Immigration.png`, `og-card.png`, `favicon*.png`, `favicon.ico`,
`apple-touch-icon.png`, the three `ChatGPT Image …png` files, and `immigration-consultation-hero-v1.png` (the current
hero renders a person image of unverified provenance, already flagged in the Phase 1 report; the new hero is inline
SVG). `petition-workspace-about-v1.png` needs a provenance check before it stays.
