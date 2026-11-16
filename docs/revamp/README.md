# Website Revamp 2026 — Technical Specification

**Owner:** Rahat Karim · **Written:** 2026-11-16 · **Applies to:** the public marketing site only (`src/app/(site)/**`, host `immigrationhorizons.com`)

This folder turns the business strategy ("Immigration Horizons — Website Revamp & SEO Strategy", the Claude Doc) into
build instructions for this repo. It is written for two readers:

- **The developer** (Rahat): what to change, in which files, in what order, and how to verify it.
- **The AI coding assistant** (Claude Code or similar): the same, plus the guardrails it must not cross. Each phase
  in `06-implementation-plan.md` has a ready-to-paste prompt.

> **AI assistant:** read `CLAUDE.md` and `AGENTS.md` at the repo root first. They outrank this folder. Where this spec
> and those files disagree, stop and ask the owner. Never touch `src/app/(app)/**`, `server/` routes unrelated to the
> lead enum, `enterprise-ui/`, or anything on the `app.*` / `admin.*` hosts as part of this revamp.

## Files

| File | What it covers |
| --- | --- |
| `00-competitor-led-experience-blueprint.md` | Beyond Border-first website reference; Deel conversion; Self Petition USA tertiary |
| `README.md` | Goals, priorities, guardrails, decisions still open |
| `01-information-architecture.md` | Service tiers, new slugs, navigation, URL map, the Consultation enum change |
| `02-content-specs.md` | Page-by-page content specs for every new or changed page |
| `03-homepage-and-components.md` | Homepage section order, new and changed components |
| `04-reviews-and-proof.md` | Testimonials model, importing Fiverr and Upwork reviews, the reviews page |
| `05-seo-technical.md` | Metadata, keyword map, schema, sitemap, internal linking, verification |
| `06-implementation-plan.md` | Phases, tasks, acceptance criteria, AI-assistant prompts |
| `07-open-horizons-brand-application.md` | The owner's original logo files, colors, typography, accessibility and component rules |
| `08-page-design-and-rollout.md` | Separate design deliverables for the homepage and each page family, mapped to code phases |

## Goal in one paragraph

Make the site rank for, and convert, people looking for **EB-2 NIW and EB-1 petition preparation and RFE/NOID
responses**: the core business. Add a clearly secondary tier of **non-immigrant visa preparation** (O-1, E-2, F-1,
F-2, J-1, B-1/B-2) that brings in students, families and investors without diluting the core. Show verifiable proof
(Fiverr 4.8/5 from 44 reviews, plus Upwork) on the site itself.

## Priorities

| Tier | Services | Treatment |
| --- | --- | --- |
| **Core** | EB-2 NIW, EB-1A, EB-1B, EB-1C, RFE response, NOID response, recommendation letters, expert opinion letters, business plans, evidence packaging | First in nav, homepage hero and large cards, built first, most content |
| **Secondary** | O-1, E-2, F-1, F-2, J-1, B-1/B-2 | One "Other US visas" group in nav, one compact homepage row, built after core |

O-1 moves from core to secondary: it is a nonimmigrant classification and the business focus is immigrant petitions.

## Primary design reference — owner confirmed 2026-11-16

The owner's explicit design direction is **Beyond Border as the primary reference for website layout, modern visual composition, page structure and overall UI/UX**.

- **Beyond Border:** dominant visual and structural benchmark for header, hero, page hierarchy, service cards, process, trust, founder credibility, educational pages, FAQs and responsive behavior.
- **Deel Immigration:** secondary benchmark **only** for conversion-oriented CTA placement, audience journeys and lead forms.
- **Self Petition USA:** tertiary benchmark for clear petition-package / standalone-deliverable positioning and self-petitioners.
- **Immigration Horizons / Open Horizons:** **all** logos, colors, typography, icons, illustrations and other brand assets must be ours, from the approved owner-supplied brand kit. Do not import competitor assets or copy their copy.
- **Brand CTA rule:** use Forest `#164B3B` with white text for primary buttons. Terracotta `#C9774F` is an accent; normal white button text on Terracotta does not meet the guide's stated AA contrast requirement.

Keep **design track** (reference audit → distinct page mockups → design approval) separate from **implementation track** (phased typed content/component work, PRs, tests, no deploy). See `00`, `07` and `08`.

## Benchmarks

Use the following hierarchy; these are **not equal visual references**:

- **Beyond Border (primary website design)** — https://www.beyondborderglobal.com — modern specialist immigration layout, service/audience hierarchy, rich content, team/proof/process modules and homepage composition.
- **Deel Immigration (secondary conversion)** — https://www.deel.com/hr-services/employee-immigration/ — conversion placement, audience routes, low-friction lead capture, concise CTA/FAQ rhythm.
- **Self Petition USA (tertiary service clarity)** — https://www.selfpetitionusa.com — package versus single-deliverable explanation, self-petitioner routes and RFE support.

Copy their **structure**. Never copy their text, and never copy their claims (see the guardrails below).

## Guardrails (non-negotiable, from CLAUDE.md)

1. **Not a law firm.** Never "attorney", "lawyer", "legal advice", "represent you before USCIS". `site.disclaimer` is
   never softened. New nonimmigrant pages must say what we do *not* do (see `02-content-specs.md` § scope notes).
2. **No dollar amounts, no USCIS fees, no processing times, no month/week timeframes.** Link to official tools instead.
3. **No approval rates, success rates or guarantees.** Keep the "we cannot guarantee approval" FAQ.
4. **No invented case studies, clients or numbers.** Outcome content only from real testimonials with a working `verifyUrl`.
5. **No stock photography of people.** Inline SVG illustrations; real photos via `PhotoSlot` only.
6. **No animation libraries.** Server components; `layout/header.tsx` stays the only `"use client"` file unless a
   phase explicitly adds an interactive tool (Phase 5), which must be an isolated client island.
7. **All copy lives in `src/lib/content/**` as typed data**, never inline in JSX.
8. **Work on a branch.** Pushing or merging to `main` deploys to production.

### Where the strategy doc is overridden by these rules

The strategy doc (written before the repo rules were checked) suggested a few things this codebase deliberately
forbids. **The repo rules win** unless the owner explicitly changes `CLAUDE.md`:

| Strategy doc said | This spec does instead |
| --- | --- |
| Publish price ranges / "starting at" prices | No prices. CTA to a free consultation |
| Publish approval-rate stats and quarterly "approval rate" data posts | No rates. Educational posts explain *what drives* outcomes, citing USCIS data pages by link only |
| USCIS fee calculator tool | Not built. Link to the official USCIS fee schedule |
| Case studies with outcomes | Only from real, consented testimonials already in `testimonials.ts` |

## Owner decisions recorded 2026-11-16

- **Consultation enum approved:** append `NOID Response`, `E-2 Visa`, `F-1 Visa`, `F-2 Visa`, `J-1 Visa` and
  `B-1/B-2 Visa`. Preserve every historic value and its order.
- **Production host confirmed:** this Next.js repository serves `immigrationhorizons.com`, rather than the
  separate legacy Express/EJS repository. No changes to that separate repository are included.

## Open decisions for the owner (do not guess)

1. **Legacy writer status** — the production website is confirmed above. If the separate legacy repository still
   writes or edits shared consultation records elsewhere, its model must accept the appended values before it
   validates those records. That separate checkout was not inspected or changed.
2. **Brand wording in repository rules** — `CLAUDE.md` still specifies navy/gold and Source Serif 4; the owner brief
   specifies Open Horizons forest/terracotta/ivory and DM Serif Display. Phase 1 changes catalogue structure only;
   resolve the visual rules before a phase changes branding.
3. **Upwork rating and review count** — supply the current numbers; the Fiverr figure (4.8 / 44, checked 2026-11-16)
   is already known.
4. **Founder photo** — a real photo for `PhotoSlot` in the founder section, or keep the SVG treatment.
5. **Office address** for the footer and `Organization` schema (Tallahassee, FL) — confirm it may be published.
6. **"Countries served"** — still open from CLAUDE.md; keep "Global" until supplied.

## Definition of done (every phase)

```bash
npm run lint
npx tsc --noEmit
npm run build
npm test
cd server && npm test        # only if server/ was touched (enum change)
npm run seo:audit            # against the production build
```

Plus the rendered-HTML checks in `05-seo-technical.md` §8.
