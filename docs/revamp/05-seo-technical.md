# 05 — SEO: technical and on-page

The codebase already has a strong SEO base: server-rendered pages, per-page `metadata`, canonical URLs, Open Graph,
`ProfessionalService` / `WebSite` / `FAQPage` / `BreadcrumbList` JSON-LD, a host-aware `robots.ts`, and a
hand-dated `sitemap.ts`. This revamp builds on that; it does not replace it.

## 1. Metadata rules (every page)

| Item | Rule |
| --- | --- |
| `title` | ≤ 60 chars, primary keyword first, brand last: `Primary Keyword | Immigration Horizons`. Use `title: { absolute }` as existing pages do |
| `description` | 120–155 chars, includes the primary keyword once, ends with the benefit or action |
| `alternates.canonical` | The page's own path; query strings never canonical |
| `openGraph` | Spread `baseOpenGraph` or `articleOpenGraph` from `src/lib/seo/og.ts`; same title and description |
| `keywords` | Optional; keep the existing per-page arrays, they cost nothing |
| H1 | Exactly one, and it says the same thing as the title in natural language |

## 2. Keyword map

| Page | Tier | Primary keyword | Supporting keywords |
| --- | --- | --- | --- |
| `/` | Core | eb2 niw petition preparation | eb1 petition help, rfe response, noid response |
| `/services/eb2-niw` | Core | eb2 niw petition preparation | national interest waiver help, niw self petition, dhanasar, proposed endeavor |
| `/services/eb1a` | Core | eb1a petition help | extraordinary ability green card, eb1a criteria, eb1a self petition |
| `/services/eb1b` | Core | eb1b outstanding researcher | eb1b professor green card, eb1b requirements |
| `/services/eb1c` | Core | eb1c multinational manager | eb1c executive green card, eb1c vs l1a |
| `/services/rfe-response` | Core | i-140 rfe response | niw rfe response, eb1a rfe help, rfe response preparation |
| `/services/noid-response` | Core | noid response | notice of intent to deny i-140, niw noid |
| `/services/recommendation-letters` | Core | niw recommendation letter | eb1a recommendation letter, expert letter |
| `/services/expert-opinion-letters` | Core | expert opinion letter immigration | eb2 niw expert letter |
| `/services/business-plans` | Core | eb2 niw business plan | immigration business plan, e2 business plan |
| `/for/self-petitioners` | Core | eb2 niw self petition help | eb1a self petition, file niw without lawyer |
| `/for/researchers` | Core | eb2 niw for researchers | eb1b researcher, green card for scientists |
| `/for/professors` | Core | eb1b professor | green card for professors, niw for academics |
| `/for/professionals` | Core | eb2 niw for engineers | niw for doctors, niw without publications |
| `/services/o1-visa` | Secondary | o1 visa petition preparation | o1a extraordinary ability |
| `/services/e2-visa` | Secondary | e2 visa business plan | e2 treaty investor, e2 visa requirements |
| `/services/f1-visa` | Secondary | f1 visa interview preparation | ds-160 help, f1 visa documents, 214(b) refusal |
| `/services/f2-visa` | Secondary | f2 visa for dependents | f2 visa spouse, f2 to f1 |
| `/services/j1-visa` | Secondary | j1 visa preparation | j1 research scholar, ds-2019 |
| `/services/b1-b2-visa` | Secondary | b1 b2 visa interview preparation | visitor visa ds-160 |
| `/for/students` | Secondary | f1 visa help for students | study in usa visa help |
| `/for/investors` | Secondary | e2 visa help | investor visa business plan |

One primary keyword per URL. Never target the same primary keyword on two pages: that is how the old `/eb2-niw`
vs `/services/eb2-niw` duplicate split its ranking.

## 3. Structured data

Add to `src/components/seo/json-ld.tsx`:

```ts
export function serviceSchema(page: { name: string; path: string; description: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: page.name,
    url: `${site.url}${page.path}`,
    description: page.description,
    provider: { "@id": `${site.url}/#organization` },
    areaServed: "Worldwide",
    serviceType: "Immigration petition preparation",
  };
}

export const founderSchema = {   // owner-confirmed facts only (03 §4.4)
  "@context": "https://schema.org",
  "@type": "Person",
  "@id": `${site.url}/#founder`,
  name: "Rahat Karim",
  jobTitle: "Founder",
  worksFor: { "@id": `${site.url}/#organization` },
  sameAs: [social.fiverrProfile, social.upworkProfile], // add LinkedIn when supplied
};
```

| Page type | Schema |
| --- | --- |
| Homepage | `organizationSchema`, `websiteSchema`, `faqSchema` (existing) |
| Service pages (`[slug]` and EB-2 NIW) | `breadcrumbSchema`, `faqSchema`, **`serviceSchema`** (new) |
| Audience pages | `breadcrumbSchema`, `faqSchema` |
| About | `organizationSchema`, `breadcrumbSchema`, **`founderSchema`** (new); add `founder: { "@id": …/#founder }` to `organizationSchema` |
| Blog posts | `Article` with `author` → `founderSchema` id, `dateModified` |

Also update `organizationSchema.description` so it leads with EB-2 NIW, EB-1 and RFE/NOID and lists the secondary
visas after them. Keep `disambiguatingDescription: site.disclaimer`. Add `address` only after the owner confirms it
(README open decision 5).

## 4. Sitemap

`src/app/sitemap.ts`:

- Include `otherVisas` and the audience pages.
- Priorities: homepage 1.0 · core service pages 0.9 · core audience pages 0.8 · secondary service and audience
  pages 0.6 · reviews 0.6 · others unchanged.
- **Bump `CONTENT_LAST_MODIFIED`** to the deploy date of each phase that changes copy. Do not switch to `new Date()`
  (the comment in the file explains why).

## 5. Internal linking rules

- Every service page: `RelatedServices` shows two siblings of the **same tier first**; core pages never list a
  secondary page as related, except the "Thinking long term?" link that runs from secondary to core.
- Every secondary page links to at least one core page (the long-term path).
- Every core service page links to at least one audience page, and every audience page links to its recommended
  services in priority order.
- Anchor text = the target page's primary keyword or a natural variant ("EB-2 NIW petition preparation"), not "click here".
- Breadcrumbs on every page below the homepage (component exists).

## 6. Content engine (after the build phases)

The blog route exists (`/blog/[slug]`, posts from the CMS). Publishing rules:

- At least 3 of every 4 posts on EB-2 NIW, EB-1 or RFE/NOID topics.
- Formats: comparisons (EB-1A vs EB-2 NIW, EB-1B vs EB-1A, O-1 vs EB-1A, F-1 vs J-1), profession guides (NIW for
  engineers, physicians, educators, data scientists), RFE/NOID breakdowns (common RFE themes and how a response
  addresses them).
- Every post: named author (founder), last-updated date, links to one core service page and one audience page.
- **No** approval-rate statistics, fee amounts or processing times in posts either (CLAUDE.md). Link USCIS data pages instead.

## 7. Off-page (owner tasks, outside the repo)

- Google Search Console: verify the domain, submit `sitemap.xml` after each phase, watch the Pages and Performance reports.
- Google Business Profile and Bing Places for the Tallahassee address.
- Point the existing n8n backlink workflow at the two benchmarks' referring domains (Beyond Border, Deel).
- Higher-education and international-student outlets, using the founder's FSU and USEFP background for guest articles.

## 8. Verification (run on the production build: `npm run build && npm start`)

Automated:

```bash
npm run lint && npx tsc --noEmit && npm run build && npm test
npm run seo:audit      # scripts/seo/audit.py — titles, descriptions, canonicals, one H1, alt text, schema
```

Rendered-HTML checks (from CLAUDE.md; script them or check by hand on every new and changed page):

- exactly one `<h1>`, no heading-level skips;
- `FAQPage` answers byte-match the visible answers;
- exactly one `<meta name="robots">`;
- canonical equals the page's own path;
- title ≤ 60 and description ≤ 155 characters;
- a scan of the rendered text finds **zero**: dollar amounts, month/week timeframes, "guarantee", approval or success
  rates, and "attorney"/"lawyer" used to describe us (the words may appear only in "we are not a law firm" or "your attorney");
- no horizontal scroll at 360 / 768 / 1024 / 1440px;
- Lighthouse (mobile) on `/`, `/services/eb2-niw`, `/services/f1-visa`: Performance ≥ 95, SEO 100, Accessibility ≥ 95.
