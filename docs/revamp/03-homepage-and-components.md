# 03 — Homepage and components

## 1. Current homepage (src/app/(site)/page.tsx)

Order today: `Hero` → `TrustBar` → `Mission` → `CaseCategories` → `SupportServices` → `WhatIsNiw` → `WhoCanApply` →
`Process` → `Differentiators` → `CaseOutcomes` → `Testimonials` → `Faqs` → `CtaBanner`.

The hero already leads with "EB-2 NIW and EB-1 petitions" (good). Problems to fix:

- Hero copy is written **inline in JSX** (`components/sections/hero.tsx`), which breaks the repo rule that all copy
  lives in `src/lib/content/**`. Move it to a new `src/lib/content/home.ts` as part of this work.
- The hero subline links O-1 at the same weight as the EB categories. O-1 is now secondary.
- There is no NOID entry point, no aggregate review figure, no audience routing, and no founder credibility above the fold.

## 2. Target order

| # | Section | Component | Change |
| --- | --- | --- | --- |
| 1 | Hero | `Hero` | Copy from `home.ts`; H1 below; second CTA for RFE/NOID |
| 2 | Proof strip | `TrustBar` | Add review figures from `site.ts` `ratings` (see `04-reviews-and-proof.md`) |
| 3 | Core services | `CaseCategories` + `SupportServices` | Merge into one **`CoreServices`** grid: EB-2 NIW, EB-1A, EB-1B, EB-1C, RFE, NOID. Large cards |
| 4 | What the full package includes | **new** `PackageIncludes` | Deliverables list, from `home.ts` |
| 5 | Who we help | **new** `AudienceRouter` | Four core audience cards → `/for/*` |
| 6 | What is EB-2 NIW | `WhatIsNiw` | Keep |
| 7 | Founder credibility | `Mission` → extend, or **new** `FounderCredibility` | Rahat's USEFP / Fulbright background (owner-verified facts only) |
| 8 | Process | `Process` | Keep (eight steps) |
| 9 | Why us | `Differentiators` | Keep; trim to six items if the page runs long |
| 10 | Reviews | `Testimonials` | Core-service reviews first; link `/reviews` |
| 11 | Other US visas | **new** `OtherVisasRow` | One compact row of six links from `otherVisas` |
| 12 | FAQ | `Faqs` | NIW, EB-1, RFE/NOID questions first (`homepageFaqs`) |
| 13 | Final CTA | `CtaBanner` | Keep |

`WhoCanApply` and `CaseOutcomes` overlap with the new sections: fold `WhoCanApply` into `AudienceRouter` and keep
`CaseOutcomes` only if it shows real, verifiable outcomes. Keep the alternating background tones; re-check that no two
adjacent sections share a tone after reordering (the comment in `page.tsx` documents the pattern).

## 3. Hero copy (to `src/lib/content/home.ts`)

```ts
export const hero = {
  eyebrow: "EB-2 NIW · EB-1 · RFE & NOID",
  headline: ["EB-2 NIW and EB-1 petitions,", "prepared with precision."], // keep the existing two-line H1
  subline:
    "Full petition packages for self-petitioners, professionals, researchers and professors — plus RFE and NOID responses, even for petitions we did not prepare.",
  primaryCta: { label: "Book a free consultation", href: "/consultation" },
  secondaryCta: { label: "Got an RFE or NOID?", href: "/services/rfe-response" },
  whatsappLabel: "Chat on WhatsApp",
  checks: ["Original drafting", "Verifiable reviews", "Not a law firm — we prepare, you file"],
};
```

- Keep the `{" "}` between H1 lines (see the comment in `hero.tsx`: without it the lines run together for crawlers).
- Three buttons may crowd mobile. If they wrap badly at 360px, make WhatsApp the floating button only (`whatsapp-fab`
  already exists) and keep two CTAs in the hero.

## 4. New components

All are **server components**, typed, reading from `src/lib/content/**`, built from existing primitives in
`src/components/ui/` (`Card`, `Section`, `Container`, `Button`, `FeatureIcon`, `Reveal`). Put them in
`src/components/sections/`.

### 4.1 `CoreServices`

- Props: none; reads `caseCategories` and the core `supportServices` (`rfe-response`, `noid-response`).
- Six cards, two rows of three on desktop, one column on mobile. Each card: name, tagline, two-line description,
  "What's included" link to the service page, and a small badge "Immigrant petition" or "Response service".
- Replaces the homepage use of `CaseCategories` and `SupportServices`. Keep those components if `/services` still uses them.

### 4.2 `PackageIncludes`

- Data: `home.ts` → `packageIncludes: { title: string; body: string }[]`, about six items: petition cover letter,
  proposed endeavor / criteria mapping, recommendation letters, expert opinion letters, exhibit index and evidence
  packaging, forms checklist and RFE/NOID support.
- Layout: `DefinitionList`-style two-column grid. No icons needed beyond `FeatureIcon`.

### 4.3 `AudienceRouter`

- Data: core audience entries from `audience-pages/index.ts` (`tier === "core"`).
- Four cards: Self-petitioners, Professionals, Researchers, Professors. Each links `/for/<slug>`.
- A one-line text link below: "Student or investor? See other US visas →" (anchor to `OtherVisasRow`).

### 4.4 `FounderCredibility`

- Data: `about.ts` → founder entry. **Facts must come from the owner.** The current `about.ts` bio mentions only
  5+ years and 200+ cases. The owner has stated: about 18 years as Senior Program Officer at USEFP (the Fulbright
  Commission in Pakistan); program lead for the Humphrey Fellowship, CCIP and CCAP; team member on the Fulbright
  program; now a PhD student in Higher Education at Florida State University. Add these to `about.ts` once the owner
  confirms the exact wording to publish.
- Layout: `PhotoSlot` (empty slot until a real photo is supplied; never a stock photo), name, role, three short
  credential lines, link to `/about`.

### 4.5 `OtherVisasRow`

- Data: `otherVisas`.
- One compact horizontal list of chips or small cards: O-1, E-2, F-1, F-2, J-1, B-1/B-2, each linking its page.
- Heading: "Other US visas we prepare". Visually quieter than `CoreServices` (smaller type, tint background).
- `id="other-visas"` so `AudienceRouter` can link to it.

### 4.6 `RatingBadge` (used by `TrustBar`, `/reviews`, service pages)

- Props: `platform: "Fiverr" | "Upwork"`, reads `site.ts` `ratings`.
- Renders: "4.8 / 5 · 44 reviews on Fiverr" with an external link to the profile and an `ExternalLink` icon.
- Plain text plus an SVG star; no third-party widget, no client JS.

## 5. Services index page (`/services`)

Three sections matching the mega menu: Green card petitions, RFE/NOID & support, Other US visas. Core sections first
and larger. One intro paragraph that states the priority plainly.

## 6. Accessibility and performance checks for new components

- One `<h1>` per page (the hero's). New sections use `<h2>`; cards use `<h3>`. No skipped levels.
- Gold text contrast rule (CLAUDE.md): gold-500 never as text on white.
- All links have discernible text; card links wrap the title, not the whole card with nested links.
- Zero new client JavaScript on the homepage; confirm with the build output that the `/` route's first-load JS did not grow.
- No horizontal scroll at 360, 768, 1024 and 1440px widths.
