# 04 — Page-family designs

One design system, several compositions. Two families are rendered (`prototypes/homepage.html`,
`prototypes/service-page.html`); the rest are specified against those two so they are implementable without a further
mockup, and each states what makes it different from its neighbours. Every family reuses `Section`, `Container`,
`Card`, `Button`, `PageHero`/`ServiceHero`, `Breadcrumbs`, `Faqs`, `CtaBanner`, `Footer`; none gets a new renderer.

## A. Core landing pages

### A1. Homepage — see `03-homepage-design.md`.

### A2. Services directory `/services`
Ivory `PageHero` (breadcrumb, eyebrow, H1 "What we prepare", one paragraph stating the priority plainly, primary CTA).
Three sections matching the mega menu: **Green card petitions** (white, 4 service cards, 2 × 2), **RFE, NOID &
support** (sage, 6 cards 3 × 2), **Other US visas** (ivory, compact, the chip row + one scope sentence). Closing CTA.
Difference from home: no hero art, no proof strip, no reviews; it is a router. Conversion goal: reach a service page.

### A3. EB-2 NIW flagship `/services/eb2-niw` — rendered: `prototypes/service-page.html`
Ivory service hero with badges, H1, lead, definition callout, two CTAs, key-facts panel. Body = sticky TOC + 66ch
prose: What it is · Who qualifies (two-layer) · **Dhanasar prongs as numbered cards** · callout · inline CTA · **What
we prepare** (sage package panel) · Evidence strategy · Already received an RFE/NOID? · Client reviews (filtered to
EB-2 NIW) · FAQ · Official sources. Then related services (sage) and the closing CTA. Difference: the only page with
prong cards and the full evidence-strategy section; the richest TOC. Goal: consultation; secondary RFE/NOID.

### A4–A6. EB-1A / EB-1B / EB-1C `/services/[slug]`
Same skeleton as A3 via the data-driven renderer. Differences by content: EB-1A shows the **ten criteria** as a
`criteria` section (the renderer already has the kind) and a "Coming from O-1?" subsection; EB-1B adds an
**employer-petitioner note** in the key-facts panel ("Who files: your U.S. employer") and a professors/postdocs
section; EB-1C adds the L-1A comparison as a `subsections` block. Hero badge "Immigrant petition". Goal: consultation.

### A7. RFE response `/services/rfe-response`
Service skeleton with a **response-focused hero**: badge "Response service" (clay), H1 "I-140 RFE Response
Preparation for EB-2 NIW and EB-1", key facts become *Notice type · Who it applies to · What we need from you (the
notice, the filed petition) · Who files the response (you or your attorney)*. Body: how we read the notice → the
three-step response flow (review, identify, respond point-by-point as numbered cards) → "petitions we did not
prepare" callout → RFE vs NOID (links to A8) → reviews filtered to RFE → FAQ → sources. Primary CTA label stays
"Book a free consultation"; the hero's secondary CTA is **"Chat on WhatsApp"** (urgency; deadline-bound visitors).
Goal: fast contact.

### A8. NOID response `/services/noid-response` (new content, Phase 2)
As A7 with NOID facts, a "what a NOID means vs an RFE" definition, and the scope note. Hero secondary CTA WhatsApp.

## B. Supporting service pages — Recommendation letters, Expert opinion letters, Business plans, Evidence packaging
Service skeleton, badge "Single deliverable" (neutral). Key facts: *Used in · Typical count/format · What we need ·
Who signs*. The package panel inverts: it shows **"Part of a full package?"** with links to the four petition pages,
then "Engage on its own" bullets. Business plans adds the E-2 subsection. Reviews filtered where present. Shorter TOC
(5 items). Goal: consultation for a single deliverable; cross-sell to full packages.

## C. Secondary visa pages — O-1, E-2, F-1, F-2, J-1, B-1/B-2
Service skeleton with a **quieter hero**: badge "Nonimmigrant visa" (neutral), a one-line "temporary classification"
statement under the H1, and the **scope note** as the definition callout ("We prepare documents and coach for the
interview. We do not file or represent."). No package panel; instead a "What we prepare" checklist (sage) and a
"Thinking long term?" card linking EB-1A/NIW (O-1, E-2) or nothing (F/J/B). No reviews slot unless matching reviews
exist. Chips to the other five secondary visas replace the related-services cards. Goal: consultation; keep the core
tier visually dominant (muted badge, no deep-forest module).

## D. Audience pages `/for/*` (Phase 5–6)
`PageHero` on **sage** (the one family that opens on sage) with eyebrow "Who we help", H1 "EB-2 NIW and EB-1 for
self-petitioners" etc., lead, primary CTA. Body: **"Your situation"** prose (66ch) · **"Recommended path"** — 2–3
service cards in recommended order with a one-line reason each · **"What you prepare, what we prepare"** two-column
list · matched reviews · FAQ · closing CTA. Students and investors use the same template with the secondary-visa cards
and the scope note. Difference: no TOC, no key facts, no package panel; it is a guided router. Goal: route to the right
service page, then consultation.

## E. Other public pages

| Page | Hero | Body | Distinguishing element | Goal |
| --- | --- | --- | --- | --- |
| Reviews `/reviews` | Ivory `PageHero`, H1, **RatingBadge** row (Fiverr; Upwork when supplied) | Server-side filter chips (`?service=`) as plain links; review cards in a 3-column masonry-free grid; every card source-linked; "How to verify" sage callout | Filter chips + aggregate badge; canonical to `/reviews` | Trust → consultation |
| About `/about` | Ivory `PageHero`, H1 "An immigration preparation practice, not a law firm" | Mission (white) · **Founder** split with PhotoSlot and owner-approved credentials (sage) · "Who we serve" numbered list · Process (8 steps) · "What we do and do not do" four-block grid (white) · closing CTA | The four-block boundary module (reference §1.2 item 8) | E-E-A-T → consultation |
| Consultation `/consultation` | Compact ivory hero: H1, one sentence, "takes about two minutes" **not** stated (no time promises) → just the lead | Two columns: form card (white, max 640) · right rail: what happens next (3 steps), WhatsApp alternative, disclaimer; ≤1024 the rail moves below the form | Form spec §4.12; prefill badge shows the selected service | Submit |
| Contact `/contact` | Compact hero | Form (name, email, message) + contact rail (email, WhatsApp ×2, profiles) | Smaller form; no service select | Submit |
| FAQs `/faqs` | Compact hero | Grouped disclosures: EB-2 NIW · EB-1 · RFE/NOID · Working with us · Other visas; sticky group TOC on desktop | Grouping | Objection handling |
| Resources `/resources` | Compact hero | Card grid of guides (icon tile, title, one line); official-links section with external icons | External-link affordance | Education |
| Blog index `/blog` | Compact hero | Post cards 3 × n: category badge, title (DM Serif 24), date, excerpt; pagination as plain links | Category badge | Education |
| Blog article `/blog/[slug]` | Ivory article header: category, H1, **author + reviewed-by + last updated** line, lead | 66ch prose, sticky TOC, "Also read" callouts (terracotta-tint), inline CTA, FAQ, author box, related posts | Byline block (reference pattern, owner-verified names only) | Education → consultation |
| Privacy / Terms | Compact hero | 68ch prose, hairline H2 dividers | Minimal | Compliance |
| 404 | Ivory, stacked logo centred | "Page not found", search-free recovery links to core services (gated list) | Stacked logo use | Recovery |

## F. What varies vs what stays constant

Constant everywhere: header, footer, type scale, button set, surface rotation, breadcrumb style, CTA labels, the
disclaimer, FAQ pattern, the no-claims rules. Varies by family: hero surface (ivory / sage), hero right column (art /
key facts / none / form rail), the mid-page module (package panel / recommended path / scope checklist), whether a TOC
exists, which CTA is secondary (RFE/NOID, WhatsApp, "What's in the package"), and badge tone (forest / clay / neutral)
which encodes the tier.
