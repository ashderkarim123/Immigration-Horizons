# 03 — Homepage design (desktop and mobile)

Prototype: `prototypes/homepage.html`. Renders: `screenshots/homepage-1440.png` (desktop), `homepage-1024.png`,
`homepage-768.png`, `homepage-360.png` (mobile), `homepage-360-menu.png` (mobile panel open),
`homepage-1440-mega.png` (Services mega menu open). Section order follows `docs/revamp/03-homepage-and-components.md` §2
and the brief §8. All copy in the prototype is existing repository copy or the approved spec copy; no claims were added.

| # | Section | Surface | Desktop composition | Mobile (≤768) | Content source | Conversion role |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Header | ivory 92 % sticky | Logo 280 · 7 links · Services mega (4 cols) · primary CTA | Logo 220 · hamburger → grouped panel with CTA | `navigation.ts` | Persistent CTA |
| 2 | Hero | ivory | 1.05/0.95 split: eyebrow, H1 "EB-2 NIW and EB-1 petitions, prepared with precision.", lead, **Book a free consultation** + **Got an RFE or NOID?**, 3 checks · door/sunrise illustration | Stack; art 520 max; CTAs full width; WhatsApp via FAB only | `home.ts` hero (spec §3) | Primary + RFE intent |
| 3 | Proof strip | sage, hairlines | RatingBadge 4.8/5 · 44 Fiverr reviews · checked 16 Nov 2026 · source link; 3 facts | Two rows | `site.ts` ratings | Trust next to CTA (Deel) |
| 4 | Core services | white | H2 centred; 3 × 2 service cards: EB-2 NIW, EB-1A, EB-1B, EB-1C (Immigrant petition badge), RFE, NOID (Response service badge) | 1 column | `caseCategories` + core `supportServices` | Route to service pages |
| 5 | Full petition packages | deep forest | 1/1.6 split: H2 "A full petition package — or just the piece you need.", lead, on-dark CTA, compare link · 7-item numbered `<dl>` | Stack; single-column list | `home.ts` packageIncludes | Package vs single clarity (SPU) |
| 6 | Who we help | ivory | H2 left; 4 audience cards (Self-petitioners, Professionals, Researchers & scientists, Professors & academics); "Student or investor?" link to #other-visas | 1 column | `audience-pages` (Phase 5) | Persona routing (Deel) |
| 7 | EB-2 NIW explainer | white | 1/1 split: H2, two paragraphs, outline CTA to the guide + link to the service · 3 numbered prong rows with source line | Stack | `eb2-niw.ts` | Education → flagship |
| 8 | Founder credibility | sage | 0.8/1.2 split: PhotoSlot (empty, symbol motif) · H2 name + role, lead bio, 3 credential checks, About link | Stack; slot 360 max | `about.ts` team (owner-approved lines only) | E-E-A-T |
| 9 | Process | ivory | H2 + lead ("We prepare. You, or your attorney, file."); 8 steps 4 × 2 with terracotta numerals | 1 column | `about.ts` processSteps | Expectation setting |
| 10 | Why Immigration Horizons | white | H2 centred; 6 differentiators 3 × 2 with icon tiles | 1 column | `about.ts` differentiators (trimmed to 6) | Differentiation without claims |
| 11 | Reviews | sage | H2 + "All reviews" outline; 3 review cards (NIW RFE, EB-1A, RFE paralegal), each source-linked | 1 column | `testimonials.ts` featured | Proof |
| 12 | Other US visas | ivory, compact | Muted eyebrow, H3 (not H2 — visually quieter), one-line scope, 6 chips | Chips wrap | `otherVisas` | Secondary discovery |
| 13 | FAQ | white | 1/1.8 split: H2 + "All FAQs" · 6 native disclosures, first open | Stack | `homepageFaqs` reordered (NIW, EB-1, RFE/NOID first) | Objection handling; FAQPage schema |
| 14 | Final CTA | deep forest, spacious | Centred H2, lead, on-dark CTA + ghost WhatsApp | Stack | `cta-banner` | Close |
| — | Footer | deep forest | Reverse logo, disclaimer verbatim, contact; 4 link columns; legal bar | 1 column | `footerNav`, `legalNav`, `site.disclaimer` | Navigation + compliance |

Surface rhythm: ivory → sage → white → forest → ivory → white → sage → ivory → white → sage → ivory → white → forest →
forest-footer. The two adjacent deep-forest blocks at the end (final CTA + footer) are deliberate: the footer's hairline
and the logo change mark the boundary, and it matches the reference's dark close.

## Heading outline (verified in the render)

`h1` hero → `h2` ×11 (sections 4–14 except 12) → `h3` for cards, steps, prongs, chips section, footer columns. One H1,
no skipped levels at any width.

## What is deliberately not on the page

- No eligibility/readiness tool or "check eligibility" CTA (Phase 8 is optional and unbuilt).
- No stats band (no counts of countries, approvals or success rates). "200+ cases" and "5+ years" appear only inside
  the founder bio because they are already published in `about.ts`; the owner should confirm they stay.
- No person photography; the founder slot is empty until an approved photo arrives.
- No prices, fees, timeframes. The process copy says so explicitly.
- No links to `/for/*` until Phase 5 ships them — in the prototype the cards link to `#`; in implementation the section
  is gated behind `audience-pages` existing, the same mechanism Phase 1 used for service links.

## Mobile notes (from the 360 px render)

- H1 at 36 px wraps to four lines without orphans; the eyebrow sits on one line.
- Both CTAs are full-width stacked; the floating WhatsApp button does not overlap them (hero padding bottom ≥ 56 px).
- The proof strip wraps to rating + three facts in two rows; the external-link affordance stays visible.
- The deep-forest package list reads in one column with numerals aligned.
- The mobile menu panel lists the three tiers with clay/muted labels and keeps the CTA inside the panel (reference
  pattern), total height ≈ 1.4 screens — acceptable; the secondary visas are collapsed to one line to keep it short.
