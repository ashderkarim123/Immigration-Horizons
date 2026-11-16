# 06 — Implementation mapping (design → phase → code)

Track B does not start until the owner approves this package and resolves the items in
`07-verification-report.md` §5. When it does, every design lands inside the existing phase plan
(`docs/revamp/06-implementation-plan.md`); no new phase is needed except an explicit **brand token step at the start of
Phase 3**, because Phase 3 is the first phase that touches shared UI.

| Design | Phase · branch | Files | Notes |
| --- | --- | --- | --- |
| Tokens (`02` §1–3) | 3 · `revamp/3-homepage`, first commit | `src/app/globals.css` `@theme` ramps, shadows, body background; `src/app/layout.tsx` fonts (`DM_Serif_Display` 400 + `Inter`), `themeColor #164B3B`; `src/lib/content/brand.ts` if it carries colours | Keep ramp names (`navy-*`, `gold-*`, `ink-*`) in this step; optional rename later. The prototype branch's `globals.css` diff is a usable starting point for the ramps, but regenerate the values from `02-design-system.md` (its ink ramp differs) |
| Logo, favicon, OG (`01`) | 3 | `public/images/open-horizons-*.svg` (copy from `docs/revamp/design/assets`, verify checksums), `public/favicon.ico`, `favicon.svg`, `apple-touch-icon.png`, `og` artwork; `src/app/layout.tsx` icons metadata; `scripts/generateOgImage.tsx` | Retire the assets listed in `01` §4 |
| Header + mega (`02` §4.1) | 3 | `src/components/layout/header.tsx` (classes, `<Image>` of the SVG at 280/220 px with `width=1000 height=280`), `src/lib/content/navigation.ts` (Reviews into `primaryNav`; "Who we help" only in Phase 5) | Stays the only `"use client"` file |
| Hero + illustration (`02` §4.2) | 3 | `src/components/sections/hero.tsx` (copy → `src/lib/content/home.ts`), replace `hero-visual.tsx` with the inline SVG from the prototype | Remove the person PNG; delete `immigration-consultation-hero-v1.png` |
| Proof strip / RatingBadge | 3 (layout) + 4 (data) | `sections/trust-bar.tsx`, new `ui/rating-badge.tsx`, `site.ts` `ratings` | Renders nothing while `score` is null |
| Core services grid | 3 | new `sections/core-services.tsx` replacing `case-categories.tsx` + `support-services.tsx` on `/`; keep both for `/services` | Uses `Card href`, `Badge` |
| Package module | 3 | new `sections/package-includes.tsx`, `home.ts` | Deep-forest `Section tone="navy"` slot |
| Who we help | 3 (component) · 5 (links live) | new `sections/audience-router.tsx`; gate on `audience-pages/index.ts` entries existing | No `/for/*` links before Phase 5 |
| NIW explainer | 3 | `sections/what-is-niw.tsx` restyled; prongs from `eb2-niw.ts` | |
| Founder credibility | 3 | new `sections/founder-credibility.tsx`, `about.ts` team entry | Only owner-approved lines; PhotoSlot empty |
| Process, Differentiators, Reviews, FAQ, CTA banner | 3 | `sections/process.tsx`, `differentiators.tsx`, `testimonials.tsx`, `faqs.tsx`, `cta-banner.tsx`; `faqs.ts` reorder | Surface rotation per `03` |
| Other visas row | 3 | new `sections/other-visas-row.tsx` (`id="other-visas"`) | Quiet styling, H3 |
| Footer (`02` §4.15) | 3 | `src/components/layout/footer.tsx` | Reverse SVG; remove white tile and gradients; disclaimer verbatim |
| Buttons, cards, section, eyebrow | 3 | `ui/button.tsx` (variant semantics), `ui/card.tsx`, `ui/section.tsx` (`tint` → sage, `navy` → deep forest), `ui/photo-slot.tsx` placeholder | API unchanged |
| Service hero, breadcrumbs, TOC, inline CTA, related | 3 (shared chrome) · 2 (content) | `service/service-hero.tsx` (ivory + key-facts panel), `breadcrumbs.tsx` (light only), `table-of-contents.tsx` (sticky rail + mini CTA), `inline-cta.tsx`, `related-services.tsx`; `services/[slug]/page.tsx` + `services/eb2-niw/page.tsx` section surfaces | Content expansions remain Phase 2 work and may ship before Phase 3 with the old chrome |
| Package panel / scope checklist on service pages | 2 (data) · 3 (component) | `service-pages/types.ts` gains an optional `package` block (title, items, note) and `scopeNote` already planned; renderer gets one `PackagePanel` | Secondary visas use the same component with the checklist variant |
| Services directory | 3 | `src/app/(site)/services/page.tsx` | Three tiered sections already exist from Phase 1; restyle only |
| Reviews page | 4 | `src/app/(site)/reviews/page.tsx` | Filter chips as links; aggregate badge |
| Audience pages | 5 / 6 | `src/app/(site)/for/[slug]/page.tsx`, `audience-pages/*` | Sage `PageHero`, recommended-path cards |
| Secondary visa pages | 6 | `service-pages/{e2,f1,f2,j1,b1-b2}-visa.ts` | Neutral badge, scope note as definition, no package panel |
| About, Consultation, Contact, FAQs, Resources, Blog, legal, 404 | 3 (chrome) · later phases for content | respective `src/app/(site)/*/page.tsx`, `layout/page-hero.tsx`, form class names | No handler changes |
| Blog byline block | after Phase 7 (blog data layer) | `blog/[slug]/page.tsx` | Owner-verified names only |
| `CLAUDE.md` brand section | 3 (same PR) or earlier by owner | `CLAUDE.md` Brand & design system, gold contrast rule → terracotta | Must be updated before or with the token commit, or the repo rules contradict the code |
| Readiness checklist | 8 (optional) | `/tools/niw-readiness` client island | Styled with the same tokens; no "eligibility" wording |

## Phase 3 acceptance additions (from this package)

- Fonts: zero external font requests; DM Serif Display 400 and Inter variable only.
- Logo: header SVG byte-identical to `docs/revamp/design/assets/logos/open-horizons-horizontal-full.svg`.
- Contrast: every text/background pair in `02` §1 re-measured on the production build; terracotta never as body text
  or a text-bearing fill; eyebrows on deep forest use terracotta-light.
- Zero new client JavaScript on `/`; first-load JS not above the Phase 1 baseline (648,809 B uncompressed).
- No horizontal scroll at 360/768/1024/1440; one H1; no heading skips; FAQ answers byte-match schema.
- Lighthouse mobile measured (performance ≥ 95, accessibility ≥ 95, SEO 100) — not claimed until run.
