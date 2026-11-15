# 04 — Reviews and proof

## 1. Facts (checked 2026-11-16)

| Platform | Profile | Rating | Reviews | Source of the figure |
| --- | --- | --- | --- | --- |
| Fiverr | https://www.fiverr.com/rahatkarim487 | **4.8 / 5** | **44** | Fiverr seller profile, read 2026-11-16 |
| Upwork | https://www.upwork.com/freelancers/smartwork?p=1930154108755910656 | _owner to supply_ | _owner to supply_ | — |

**Never write "5-star rated" anywhere on the site.** The site's whole positioning is verifiability, and a visitor who
clicks through and sees 4.8 loses trust. Individual reviews that are 5 stars may show 5 stars.

## 2. Where reviews live

- The public site reads **static data**: `src/lib/content/testimonials.ts` (8 entries today, all Fiverr).
- The admin CMS has a separate DB-backed `Testimonial` model (`server/services/cms/testimonials.js`) that the Next.js
  site does **not** read. Do not wire the site to it in this revamp: static data is crawlable at build time, costs no
  runtime DB call, and matches the content-accuracy rules. Note it as future work.

## 3. Data model changes

Extend the type (additive, so existing entries keep compiling after a one-line migration each):

```ts
// src/lib/content/testimonials.ts
export type ReviewPlatform = "Fiverr" | "Upwork" | "Direct";

export type Testimonial = {
  id: string;
  name: string;            // as shown publicly on the platform (username or first name); never invent
  location: string;        // country as shown on the platform
  service: string;         // display label, e.g. "EB-2 NIW"
  serviceSlug?: string;    // NEW — slug from allServices, used for filtering on service pages
  rating: number;          // 1–5, exactly as on the platform
  date: string;            // ISO "2025-06" when known; otherwise the existing label
  text: string;            // verbatim review text; trim only, never edit wording
  source: ReviewPlatform;  // was string
  verifyUrl: string;       // required — profile or gig URL where the review can be seen
  featured?: boolean;      // NEW — homepage selection
};

export const testimonialsFor = (slug: string) =>
  testimonials.filter((t) => t.serviceSlug === slug);
```

Add aggregate figures to `site.ts`, with the date they were checked so a stale number is easy to spot:

```ts
export const ratings = {
  fiverr: { score: 4.8, count: 44, checkedOn: "2026-11-16", url: social.fiverrProfile },
  upwork: { score: null, count: null, checkedOn: null, url: social.upworkProfile }, // fill when supplied
} as const;
```

`RatingBadge` renders nothing for a platform whose `score` is `null`.

## 4. Importing all reviews

1. Export the 44 Fiverr reviews: from the Fiverr seller dashboard, or with a Claude session that has the Fiverr
   connector (`list_seller_reviews` for `rahatkarim487`), and save the raw result as
   `docs/revamp/data/fiverr-reviews-2026-11.json` (not shipped; for traceability only).
2. Do the same for Upwork feedback (copy from the profile's work history).
3. Map each review to a `Testimonial`. Rules:
   - text **verbatim**; no correcting grammar or merging reviews;
   - `serviceSlug` only when the review or the gig makes the service unambiguous; otherwise leave it out;
   - skip reviews with no text;
   - keep the existing 8 entries and their `id`s (other pages may reference them).
4. Ask the owner before publishing any review that names a third party, mentions an approval notice detail, or
   could identify a client who might not want to be identified.

## 5. Reviews page (`/reviews`)

Rebuild `src/app/(site)/reviews/page.tsx`:

- Header: H1 "Client Reviews", then `RatingBadge` for each platform with a figure.
- Filter chips by service: All, EB-2 NIW, EB-1A, EB-1B/EB-1C, RFE/NOID, Letters, Other visas. Implement filtering
  **without client JS**: `?service=<slug>` read in the server component (`searchParams` is a Promise in Next 16), with
  each chip a plain `<a>`. Give the canonical as `/reviews` regardless of the query string.
- Grid of `TestimonialCard`s (component already exists in `sections/testimonials.tsx`); each shows its platform and a
  "Verify on Fiverr/Upwork" link.
- Keep the existing breadcrumb schema.

## 6. Reviews on other pages

| Page | Which reviews | How many |
| --- | --- | --- |
| Homepage | `featured: true`, core services first | 3–6 |
| Each service page | `testimonialsFor(slug)` | up to 5; hide the block if none |
| Each audience page | `testimonialIds` from its content file | 3–5 |

Add a `Testimonials` slot to the `[slug]` service renderer and the bespoke EB-2 NIW page, placed after the main
content and before the FAQs.

## 7. Structured data

- Do **not** add `AggregateRating` to the `Organization` or `ProfessionalService` schema. Google treats reviews a
  business publishes about itself as self-serving and does not show stars for them, and marking up figures from
  third-party platforms invites a mismatch.
- Individual `Review` objects inside a `Service` schema are allowed but optional. If added, the `reviewBody` must
  match the visible text exactly.

## 8. Other proof to add

- **Google Business Profile** for the Tallahassee address (owner task, outside the codebase). When live, add its URL
  to `social` and a "Review us on Google" link on `/reviews`.
- **Case outcomes:** only from real testimonials already in the file that describe an approval, with `verifyUrl`. No
  separate "case studies" with invented detail.
- **Founder credentials:** see `03-homepage-and-components.md` §4.4.
