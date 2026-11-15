# 01 — Information architecture

## 1. Current state (as of 2026-11-16)

- `src/lib/content/services.ts` has two arrays:
  - `caseCategories`: `eb2-niw`, `eb1a`, `eb1b`, `eb1c`, `o1-visa`
  - `supportServices`: `rfe-response`, `recommendation-letters`, `expert-opinion-letters`, `business-plans`, `evidence-packaging`
- `allServices` (same file) feeds the consultation form dropdown; `?service=<slug>` pre-fills it.
- Navigation (`navigation.ts`), footer, `sitemap.ts` and `RelatedServices` all derive from these arrays, so adding a
  service to the catalogue updates the header, mega menu, footer and sitemap automatically.
- Service pages: EB-2 NIW is bespoke (`src/app/(site)/services/eb2-niw/page.tsx` + `src/lib/content/eb2-niw.ts`);
  every other slug is data-driven via `src/app/(site)/services/[slug]/page.tsx` and
  `src/lib/content/service-pages/*.ts` (registry in `index.ts`).
- `server/utils/services.js` is a **CommonJS copy** of the catalogue used by the admin CMS. It must be kept in step.

## 2. Target model: add a `tier`, add a third group

Add a tier to every catalogue entry and a new `otherVisas` array for nonimmigrant classifications.

```ts
// src/lib/content/services.ts
export type ServiceTier = "core" | "secondary";

export type CaseCategory = {
  slug: string;
  enumValue: string;
  name: string;
  tagline: string;
  description: string;
  eligibility: string;
  deliverables: string[];
  engagementOptions: EngagementOption[];
  tier: ServiceTier;                       // NEW
  classification: "immigrant" | "nonimmigrant"; // NEW — drives badges and copy
};

export type SupportService = { /* existing fields */ tier: ServiceTier }; // NEW field

export const caseCategories: CaseCategory[]  // eb2-niw, eb1a, eb1b, eb1c — all tier "core", classification "immigrant"
export const supportServices: SupportService[] // existing five + "noid-response" — all tier "core"
export const otherVisas: CaseCategory[]      // NEW — o1-visa (moved here), e2-visa, f1-visa, f2-visa, j1-visa, b1-b2-visa
                                              // all tier "secondary", classification "nonimmigrant"

export const allServices = [...caseCategories, ...supportServices, ...otherVisas];
```

**O-1 moves** from `caseCategories` to `otherVisas`. Its slug (`o1-visa`) and URL do not change, so no redirect is needed.

Update every consumer of the arrays: `navigation.ts`, `sitemap.ts`, `related-services.tsx`, the homepage sections
`case-categories.tsx` and `support-services.tsx`, the consultation page, and `src/app/(site)/services/page.tsx`.
Search for `caseCategories` and `supportServices` across `src/` and handle each hit.

## 3. URL map

| URL | Tier | Status | Renderer |
| --- | --- | --- | --- |
| `/services/eb2-niw` | Core | Exists — rewrite copy | Bespoke page |
| `/services/eb1a` | Core | Exists — expand | `[slug]` |
| `/services/eb1b` | Core | Exists — expand | `[slug]` |
| `/services/eb1c` | Core | Exists — expand | `[slug]` |
| `/services/rfe-response` | Core | Exists — refocus on RFEs | `[slug]` |
| `/services/noid-response` | Core | **New** | `[slug]` |
| `/services/recommendation-letters` | Core | Exists | `[slug]` |
| `/services/expert-opinion-letters` | Core | Exists | `[slug]` |
| `/services/business-plans` | Core | Exists — add E-2 section | `[slug]` |
| `/services/evidence-packaging` | Core | Exists | `[slug]` |
| `/services/o1-visa` | Secondary | Exists — re-tier only | `[slug]` |
| `/services/e2-visa` | Secondary | **New** | `[slug]` |
| `/services/f1-visa` | Secondary | **New** | `[slug]` |
| `/services/f2-visa` | Secondary | **New** | `[slug]` |
| `/services/j1-visa` | Secondary | **New** | `[slug]` |
| `/services/b1-b2-visa` | Secondary | **New** | `[slug]` |
| `/for/self-petitioners` | Core audience | **New** | New `for/[slug]` route |
| `/for/professionals` | Core audience | **New** | `for/[slug]` |
| `/for/researchers` | Core audience | **New** | `for/[slug]` |
| `/for/professors` | Core audience | **New** | `for/[slug]` |
| `/for/students` | Secondary audience | **New** | `for/[slug]` |
| `/for/investors` | Secondary audience | **New** | `for/[slug]` |
| `/reviews` | — | Exists — rebuild | Existing page |
| `/about` | — | Exists — add founder E-E-A-T | Existing page |

**Duplicate URL to fix:** CLAUDE.md records a duplicate `/eb2-niw` vs `/services/eb2-niw` inherited from the legacy
site. If `/eb2-niw` resolves on the production host, add a permanent redirect in `next.config.ts`:

```ts
async redirects() {
  return [{ source: "/eb2-niw", destination: "/services/eb2-niw", permanent: true }];
},
```

## 4. Navigation

Replace the two mega-menu columns with three, in this order:

| Column heading | Source | Notes |
| --- | --- | --- |
| Green card petitions | `caseCategories` | Core |
| RFE, NOID & support | `supportServices` | Core |
| Other US visas | `otherVisas` | Secondary; render with quieter styling (smaller type or a muted heading) |

Keep the mega-menu feature panel, but change its copy to the core promise:

- heading: "Not sure if you qualify for EB-2 NIW or EB-1?"
- body: one sentence on the free eligibility consultation
- CTA: "Book a free consultation" → `/consultation`

Add a top-level nav item **"Who we help"** → `/for/self-petitioners` with a small dropdown of the six audience pages,
or put it inside the Services mega menu as a fourth column. Pick whichever keeps the header usable at the `md`
breakpoint, and verify there is no horizontal scroll.

Footer (`footerNav`): three service columns matching the mega menu, plus Company. Add "Who we help" links to Company.

## 5. The Consultation enum (three-place change)

New services need a value on the lead record. The enum lives in **three** places that must match exactly:

1. `src/lib/models/Consultation.ts` → `CONSULTATION_SERVICE_VALUES`
2. `server/models/Consultation.js` → `service.enum`
3. The legacy site repo's `models/Consultation.js` (separate repo, only if it still writes to the shared
   `consultations` collection)

Values to add (append; never reorder or rename existing ones, because stored documents use them):

```
"NOID Response", "E-2 Visa", "F-1 Visa", "F-2 Visa", "J-1 Visa", "B-1/B-2 Visa"
```

- `"O-1 Visa"` and `"RFE & NOID Responses"` already exist; keep them. The new NOID page's `enumValue`/`name` used by
  the form is `"NOID Response"`; the RFE page keeps `"RFE & NOID Responses"` so historic leads still match.
- Also mirror the new catalogue entries into `server/utils/services.js`.
- Run `npm test` and `cd server && npm test`. `test/lead-form-semantics.test.ts` covers form behaviour; extend it so
  every `allServices` entry's value is in `CONSULTATION_SERVICE_VALUES` (this guards the enum from drifting again).

**Owner decision pending** (README, open decision 1). If the owner says no, map every `otherVisas` entry's
`enumValue` to `"Immigration Consultation"` and skip the model changes.

## 6. Audience pages: new route

```
src/app/(site)/for/[slug]/page.tsx        // renderer, mirrors services/[slug]/page.tsx
src/lib/content/audience-pages/types.ts   // AudiencePageContent
src/lib/content/audience-pages/index.ts   // registry + getAudiencePage + audiencePageSlugs
src/lib/content/audience-pages/*.ts       // one file per audience
```

```ts
export type AudiencePageContent = {
  slug: string;                 // "researchers"
  name: string;                 // "Researchers & Scientists" (breadcrumb + nav)
  tier: ServiceTier;
  headline: string;             // H1
  subhead: string;
  definition: string;           // 40–60 word snippet answer
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  painPoints: ListItem[];       // what this audience struggles with
  recommendedServices: string[];// slugs from allServices, in priority order
  whatWeDeliver: ListItem[];    // the full-package deliverables, phrased for this audience
  sections: PageSection[];      // reuse the service-page section union
  faqs: Faq[];
  testimonialIds: string[];     // ids from testimonials.ts relevant to this audience
};
```

Reuse `ServiceHero`, `ContentSection`, `DefinitionList`, `Faqs`, `RelatedServices`, `Breadcrumbs`, `CtaBanner`.
Do not create new visual components unless one is missing. Add the route to `sitemap.ts` (priority 0.7).
