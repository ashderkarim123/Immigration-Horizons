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
| `README.md` | Goals, priorities, guardrails, decisions still open |
| `01-information-architecture.md` | Service tiers, new slugs, navigation, URL map, the Consultation enum change |
| `02-content-specs.md` | Page-by-page content specs for every new or changed page |
| `03-homepage-and-components.md` | Homepage section order, new and changed components |
| `04-reviews-and-proof.md` | Testimonials model, importing Fiverr and Upwork reviews, the reviews page |
| `05-seo-technical.md` | Metadata, keyword map, schema, sitemap, internal linking, verification |
| `06-implementation-plan.md` | Phases, tasks, acceptance criteria, AI-assistant prompts |
| `design/` | Design Gate D0: competitor-led design direction, Open Horizons design system, prototypes and handoff (awaiting approval) |
| `phase-2-report.md` | Phase 2 delivery: NOID page, RFE refocus, EB-2 NIW / EB-1 / business-plan expansions, validation and deferrals |

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

## Benchmarks

Design and SEO patterns are modelled on two non-law competitors:

- **Beyond Border** — https://www.beyondborderglobal.com — content engine: comparison articles, pages by
  profession, named author and reviewer on each article, free eligibility checkers.
- **Deel Immigration** — https://www.deel.com/plp/immigration-eb-2-niw — conversion landing pages: stat strip, review
  badge in the hero, one CTA, short FAQ.

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
