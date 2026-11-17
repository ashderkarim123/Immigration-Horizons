# Revamp Phase 4 — reviews

Date: 2026-11-17. Branch: `revamp/4-reviews` (stacked on `revamp/2-core-content`, because it replaces the EB-2 NIW
reviews block Phase 2 added). Draft PR: not opened from this environment (`gh` is unavailable); the owner opens it
against `revamp/2-core-content`. Spec: `04-reviews-and-proof.md`. Nothing merged or deployed.

## Delivered

- **`Testimonial` type extended** (`src/lib/content/testimonials.ts`): `serviceSlug?`, `featured?`, `source` narrowed
  to `ReviewPlatform`. The eight existing entries keep their ids and verbatim text. `serviceSlug` was set only where
  the review names the service: three EB-1A, two EB-2 NIW, one RFE response. The two "I-140 Petition" messages are
  left untagged because the category is not stated.
- **Helpers**: `testimonialsFor(slug)`, `featuredTestimonials`, `reviewFilters` (the seven spec chips),
  `findReviewFilter(slug)` and `testimonialsMatching(filter)`. Any slug in a group selects the group, so
  `?service=eb1c` shows the EB-1B / EB-1C chip as active.
- **`ratings` in `site.ts`** with `checkedOn` dates: Fiverr 4.8 / 44 (read 2026-11-16), Upwork `null` until supplied.
- **`RatingBadge`** (`src/components/ui/rating-badge.tsx`): links to the profile, prints the real score to one
  decimal, renders nothing for a `null` score.
- **`/reviews` rebuilt**: H1 "Client Reviews", rating badges in the hero, filter chips as plain `<a>` links read from
  `searchParams` (a Promise in Next 16), `aria-current` on the active chip, canonical fixed at `/reviews` for every
  query string, an empty state for a chip with no tagged review, breadcrumb schema kept. Zero client JS added; the
  route is now server-rendered on request instead of static because it reads the query string.
- **`ServiceReviews` slot** (`src/components/sections/service-reviews.tsx`): up to five tagged reviews between the
  main content and the FAQs, rendered on every data-driven service page and on the bespoke EB-2 NIW page (replacing
  the Phase 2 inline block). Hidden when nothing is tagged, so no page shows unrelated praise.
- **Homepage** `Testimonials` section now reads `featuredTestimonials` (the same three cards as before, so no visual
  change). `TestimonialCard` verify link now names the platform ("Verify on Fiverr").
- **Guard test** `test/testimonials.test.ts`: unique ids, `https` verify URLs, ratings 1–5, every `serviceSlug` and
  filter slug exists in `allServices`, 3–6 featured, filter resolution, `ratings` dated whenever scored, and no
  "5-star rated" string anywhere in site content or components.

## Not delivered: the review import (blocked on data)

`docs/revamp/data/` does not exist and `fiverr.com` returns HTTP 403 to automated clients, so the 44 Fiverr reviews
and the Upwork feedback could not be exported from this environment. Nothing was transcribed from memory or invented.
When the owner saves `docs/revamp/data/fiverr-reviews-2026-11.json` (and the Upwork export), the mapping is one entry
per review following the rules in the spec §4; the data layer, filters and page slots are ready for them. Until then
the Letters and Other visas chips show the empty state.

## Validation

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | Pass |
| `npm run lint` | Pass (existing `.eslintignore` warning only) |
| Root `npm test` | 498 passed, 0 failed (495 before this phase + 3 new) |
| Server `npm test` | Not run: no `server/` file changed |
| `npm run build` | Pass with `__NEXT_PROCESSED_ENV=true` and `MONGODB_URI` cleared; `/reviews` is now `ƒ` (dynamic) |
| Rendered-HTML scan on `next start` (`/reviews`, `/reviews?service=eb2-niw`, `?service=eb1c`, `?service=recommendation-letters`, `?service=bogus`, `/`, `/services/eb2-niw`, `/services/eb1a`, `/services/noid-response`, `/services/rfe-response`) | One H1, no heading skips, title ≤ 60 and description ≤ 155 (the `/reviews` description was 162 before this phase and is now 136), canonical `/reviews` on every filtered URL, unknown `?service=` falls back to All, active chip carries `aria-current`, Fiverr badge renders and Upwork does not, "5-star rated" absent, zero dollar amounts, timeframes, approval rates or attorney self-description |
| Review counts rendered | `/reviews` 8 · `?service=eb2-niw` 2 · `?service=eb1c` empty state · `/` 3 · EB-2 NIW page 2 · EB-1A page 3 · RFE page 1 · NOID page none (block hidden) |
| `<meta name="robots">` | 0 on every page. Pre-existing Phase 1 open gate; unchanged here |

## Decisions and deferrals

- Reviews on audience pages (spec §6) wait for Phase 5, which creates those pages.
- No `Review` structured data was added (spec §7 marks it optional; `AggregateRating` is deliberately absent).
- "Review us on Google" link waits for the Google Business Profile URL (spec §8, owner task).
- The admin CMS `Testimonial` model is still not read by the site, as the spec directs.

## Open gates carried forward

Robots meta (0 per page) and the server calendar DST test remain open from Phase 1. Phase 3 waits on Design Gate
D0 approval and the `CLAUDE.md` brand update.
