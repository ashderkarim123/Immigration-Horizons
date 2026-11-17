# Revamp Phase 3 — Open Horizons rebrand and homepage

Date: 2026-11-17. Branch: `revamp/3-homepage` (stacked on `revamp/4-reviews`, because the homepage proof strip and
the reviews section read the Phase 4 `ratings` and `featured` data). Draft PR: not opened from this environment
(`gh` is unavailable); the owner opens it against `revamp/4-reviews`. Spec: `03-homepage-and-components.md`, the
Design Gate D0 package in `design/`. Nothing merged or deployed.

## Owner decisions applied (2026-11-17)

- **Design Gate D0 approved**, and the request was to revamp every page to it. `CLAUDE.md` "Brand & design system"
  now describes Open Horizons (forest, terracotta, ivory, sage; DM Serif Display + Inter; the terracotta contrast
  rule), so the governing rules and the code agree.
- **No founder section on the homepage.** Its slot (after the EB-2 NIW explainer) shows the verifiable client
  outcomes instead, and the reviews section follows later in the page. No founder credentials were published
  anywhere.

## Delivered

- **Tokens** (`src/app/globals.css`): the forest, terracotta and warm-ink ramps replace navy, gold and cool ink
  under the **same ramp names** (`navy-*` = forest, `gold-*` = terracotta, `ink-*` = warm ink), as the D0 mapping
  recommends. No class names changed for the colour swap. Ivory page background, forest-tinted shadows, clay focus
  ring, `font-synthesis: none`. `ink-500` was darkened one step from the D0 value so small text on sage passes AA.
- **Fonts** (`src/app/layout.tsx`): DM Serif Display 400 + Inter via `next/font`. Theme colour `#164B3B`.
- **Brand assets**: the approved SVG masters copied into `public/images/` (checksums verified against
  `design/assets/CHECKSUMS.sha256`), new favicon and apple-touch icon, the Organization JSON-LD logo, the SaaS shell
  logos and the OG card (regenerated in the new palette). Retired: `logo-header.png`, `Main logo.PNG`,
  `Immigration.png`, `favicon-16/32.png`, the three `ChatGPT Image …png` files and the person-photo hero.
- **Primitives**: `Button` (`gold` variant replaced by `onDark`; terracotta is never a text-bearing fill), `Card`,
  `Badge` (tone encodes tier, no wrapping), `Section` (adds `ivory`; `tint` = sage; `navy` = deep forest),
  `FeatureIcon`, `PhotoSlot` (symbol-mark placeholder), `RatingBadge` (dated, links to source).
- **Shared chrome**: header (ivory, SVG logo, Reviews replaces Blog in the top bar, four-column mega menu with a
  deep-forest feature card, one CTA label site-wide), footer (deep forest, reverse logo, disclaimer verbatim,
  four link columns), `PageHero` and `ServiceHero` (ivory, light breadcrumbs, white key-facts panel, "we prepare,
  you file" line), table of contents (rail style), inline CTA, closing CTA, FAQ (split layout, terracotta marker,
  first item open), related services.
- **Homepage** (`src/app/(site)/page.tsx`): copy moved to `src/lib/content/home.ts`; new `CoreServices`,
  `PackageIncludes`, `AudienceRouter`, `OtherVisasRow`; inline-SVG door/sunrise hero; sage proof strip with the
  Fiverr rating; order Hero → proof → core services → package → who we help → NIW explainer → client outcomes →
  process → why us (six items) → reviews → other visas → FAQ → closing CTA. Surfaces never repeat back to back.
  Audience cards carry no links until the `/for/*` pages exist (Phase 5).
- **Every other public page**: `/services` (three tiered sections, chip row for other visas), all service pages via
  the renderer and the bespoke EB-2 NIW page (badge tone by tier, "What's in the package" secondary CTA where a
  package section exists, WhatsApp otherwise), `/reviews`, `/about`, `/blog`, blog articles, `/consultation`,
  `/contact`, `/faqs`, `/resources`, 404. No form handler changed.
- **`homepageFaqs`**: the RFE/NOID question now sits with the NIW and EB-1 questions, ahead of the scope questions.
- **Copy fixes found while verifying**:
  - My Phase 2 spelling pass had turned "organis-" into "oorganiz-" in 62 places across the service content files
    (visible on the EB-2 NIW, EB-1A/B/C, evidence and other service pages). All corrected; no other word was affected.
  - Remaining British spellings in public content (16 words in eight files) normalized as whole words.
  - Five meta descriptions over 155 characters trimmed (homepage, expert opinion letters, evidence packaging, O-1,
    terms). This closes the "stricter description checks" gate carried since Phase 1.

## Validation

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | Pass |
| `npm run lint` | Pass (existing `.eslintignore` warning only) |
| Root `npm test` | 498 passed, 0 failed |
| Server `npm test` | Not run: no `server/` file changed |
| `npm run build` | Pass with `__NEXT_PROCESSED_ENV=true` and `MONGODB_URI` cleared; `/` still static (`○`) |
| Rendered-HTML scan, **all 22 sitemap URLs** | 200, one H1, no heading skips, canonical equals path, every FAQPage answer byte-matches visible text, title ≤ 60, description ≤ 155, zero dollar amounts, timeframes, approval rates, attorney self-description, "5-star rated", retired asset references or external font hosts |
| Homepage first-load JS | 646,833 bytes uncompressed across 9 scripts; Phase 1 baseline 648,809. No new client component (`header.tsx` is still the only `"use client"` file in the marketing chrome) |
| Horizontal scroll at 360 / 768 / 1024 / 1440 px (Chromium, 11 pages) | None. The first run found a 124 px overflow at 1024 caused by the header; the full desktop nav now starts at 1280 px and the menu button covers 1024–1279 |
| Contrast (every text/background token pair used) | All pairs ≥ 4.5:1 for text; terracotta only on numerals ≥ 2 rem and ornament (≥ 3.0:1) |
| Screenshots reviewed | Homepage 1440 and 360, mobile menu, EB-2 NIW 1440 |
| `<meta name="robots">` | 0 on indexable pages. Pre-existing Phase 1 open gate; unchanged |

Not run: Lighthouse (the acceptance target of ≥ 95 is **not claimed** until measured), `npm run seo:audit`,
Firefox/Safari, screen-reader pass. Mouse users who hover the Services trigger and then click it close the panel
again; that toggle behaviour predates this phase and was left as it was.

## Decisions and deferrals

- Ramp names kept (`navy-*`, `gold-*`); renaming to `forest-*`/`terracotta-*` is a separate mechanical pass.
- Founder section: not built, per the owner. `about.ts` and the About page still show only the lines already
  published there ("5+ years", "200+ cases"); the USEFP/Fulbright wording stays unpublished.
- `/for/*` links on the audience cards and the header "Who we help" item wait for Phase 5.
- The portal and staff SaaS surfaces inherit the new tokens (shared ramps) but were not redesigned or reviewed.
  `petition-workspace-about-v1.png` on the About page still needs the provenance check from the D0 asset audit.

## Open gates carried forward

Robots meta (0 per page), the server calendar DST test, and the review import (owner export) remain open.
Lighthouse must be run before release.
