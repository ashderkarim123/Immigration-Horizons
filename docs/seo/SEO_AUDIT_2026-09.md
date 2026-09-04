# SEO Audit — Public Marketing Site

**Date:** 2026-09-04
**Scope:** All 21 indexable marketing routes (`src/app/(site)/**`), `sitemap.xml`, `robots.txt`
**Method:** `npm run build` → production server → rendered-HTML inspection of every page (titles, meta, canonical, OG/Twitter, JSON-LD, heading outline, images, internal links) + content-accuracy scan against the CLAUDE.md rules.
**Not covered:** live SERP / competitor analysis (per request — technical + on-page only), the `(app)` SaaS surface and `server/` CMS (both correctly `noindex`).

The new stack is **not yet live** (`immigrationhorizons.com` still serves the legacy repo). This audit is against what this repo will ship.

---

## Verdict

The site is in good technical shape. Canonicalisation, the heading hierarchy, structured data coverage, internal linking, and content-accuracy discipline are all solid — no dollar figures, processing times, approval rates, or "law firm / attorney" self-description leaked into any rendered page. The money pages (`/services/*`) have real depth (2,000–4,800 words) and cite primary sources.

The gaps are concentrated in **social/Open Graph presentation**, **title & description length discipline**, and a handful of **structured-data and sitemap** refinements. Nothing here blocks launch, but items in 🔴 should be fixed before the cutover because they affect every shared link and every SERP snippet.

| Severity | Count | Theme |
|---|---|---|
| 🔴 High | 4 | OG images, over-length titles/descriptions, sitemap `lastmod` churn |
| 🟡 Medium | 7 | Homepage H1, thin `/blog`, EEAT structured data, generic top-level titles, duplicate FAQ schema, `article` OG type without article metadata, hero-image preload vs empty alt |
| 🟢 Low | 8 | Redundant `robots` tags, H1 spacing, footer heading levels, unverified stats copy, Twitter handle, OG image alt, responsive-preload `imagesizes`, `/services` FAQ schema |

---

## 🔴 High — fix before cutover

### H1. No real Open Graph image anywhere; most pages have none at all

- **Root `src/app/layout.tsx`** `metadata` has **no `openGraph` / `twitter` block**, so there is no site-wide default card.
- `/`, `/services/*` and the `/services` dynamic pages set `openGraph.images` to **`/images/logo-header.png` at `551×320`** — wrong aspect ratio for `summary_large_image` (wants 1200×630), and a bare logo makes a weak card.
- `/about`, `/blog`, `/consultation`, `/contact`, `/faqs`, `/resources`, `/reviews` declare `openGraph` **with no image** → no image in the card.
- `/privacy`, `/terms` declare **no `openGraph` at all**.
- `og:image:alt` is missing everywhere.

**Fix**
1. Create `public/images/og-default.png` (1200×630, navy ground, wordmark + "US Immigration Petition Specialists"). Optionally per-category variants for the five case pages.
2. Add to root `layout.tsx` `metadata`:
   ```ts
   openGraph: {
     type: "website",
     siteName: site.name,
     locale: "en_US",
     url: site.url,
     images: [{ url: "/images/og-default.png", width: 1200, height: 630, alt: `${site.name} — US immigration petition preparation` }],
   },
   twitter: { card: "summary_large_image", images: ["/images/og-default.png"] },
   ```
3. Delete the per-page `images: [{ url: "/images/logo-header.png", width: 551, height: 320 }]` from `src/app/(site)/page.tsx`, `src/app/(site)/services/[slug]/page.tsx`, and `src/app/(site)/services/eb2-niw/page.tsx` — let them inherit, or point them at a real 1200×630 asset.
4. Drop the redundant per-page `twitter.card` / `openGraph.type` where they now just repeat the inherited default.

### H2. Meta descriptions run long and will be truncated

Google renders ~155–160 characters. Current lengths:

| Page | Chars | Page | Chars |
|---|---|---|---|
| `/services/eb1a` | **208** | `/services/eb2-niw` | **195** |
| `/services/recommendation-letters` | **197** | `/services/rfe-response` | **193** |
| `/about` | 190 | `/` | 189 |
| `/services/expert-opinion-letters` | 189 | `/services/eb1b` | 188 |
| `/services` | 187 | `/services/eb1c` | 185 |
| `/services/business-plans` | 180 | | |

**Fix** — trim every `metaDescription` over ~165 chars in `src/lib/content/service-pages/*.ts`, `src/lib/content/eb2-niw.ts`, `src/lib/content/site.ts` (`site.description`), and the inline `description` in the nine top-level `page.tsx` files. Front-load the primary keyword and the differentiator; drop the trailing service-list padding.
Example — `/services/eb1a` FROM (208) *"Complete guide to the EB-1A extraordinary ability green card: the ten regulatory criteria, the Kazarian two-step analysis, evidence strategy, and common mistakes. Petition preparation by Immigration Horizons."* → TO (150) *"EB-1A extraordinary-ability green card: the ten criteria, the Kazarian two-step test, evidence strategy, and the mistakes that draw RFEs."*

### H3. Service-page `<title>` tags exceed the SERP pixel budget

`title: { absolute: page.metaTitle }` means these render verbatim with **no brand suffix**, and several are too long to display in full (~60 char / 575 px cap):

| Page | Current title | Chars |
|---|---|---|
| `/services/eb1a` | EB-1A Extraordinary Ability Petition Preparation \| Requirements & Evidence | **78** |
| `/services/business-plans` | Business Plan & Endeavor Plan Preparation for Immigration Petitions | **71** |
| `/services/evidence-packaging` | Evidence Packaging & Document Organization for USCIS Petitions | 66 |
| `/services/eb1b` | EB-1B Outstanding Professor & Researcher Petition Preparation | 65 |
| `/services/eb1c` | EB-1C Multinational Manager & Executive Petition Preparation | 64 |
| `/services/eb2-niw` | EB-2 NIW Petition Preparation \| National Interest Waiver Guide | 62 |

**Fix** — tighten to ≤ 60 in the content files, e.g.
- eb1a → `EB-1A Extraordinary Ability Green Card: Criteria & Evidence` (57)
- business-plans → `Immigration Business & Endeavor Plan Preparation` (47)
- eb1b → `EB-1B Outstanding Professor & Researcher Petitions` (49)
- eb1c → `EB-1C Multinational Manager & Executive Petitions` (48)

Decide deliberately whether service titles carry ` | Immigration Horizons`. Right now top-level pages get it (template) and service pages don't — pick one convention. Given the length pressure and that these target informational queries, brandless is defensible; if so, document it.

### H4. `sitemap.xml` sets `lastmod` to build time for every URL on every build

`src/app/sitemap.ts` uses `const now = new Date()` for every entry. Each deploy rewrites all 21 `<lastmod>` values, which trains Google to discount them.

**Fix** — derive `lastModified` from real content dates. Add a `lastReviewed` (or reuse an existing `updatedAt`) field to the service-page content objects and the homepage/section content, and fall back to a hard-coded constant for pages that genuinely haven't changed. Also emit the homepage `<loc>` as `${site.url}/` for consistency with the canonical host normalisation.

---

## 🟡 Medium

### M1. Homepage H1 carries no target keyword
`src/app/(site)/page.tsx` H1 is *"Your immigration case, prepared with precision."* — a brand slogan. The `<title>`/OG target "EB-2 NIW Petition Preparation", but the H1 (a Group-A on-page factor) and the first H2 (*"Petition preparation built around one person's record"*) never say "EB-2 NIW" or "immigration petition". The keyword first appears in H2 #4.
**Fix** — either make the H1 keyword-bearing (*"Immigration petition preparation, built around your record"*) or promote the "What is the EB-2 NIW?" section higher. Keep the slogan as a `<p>` deck under the H1.

### M2. `/blog` is a thin placeholder and is indexed
504 words, "coming soon", no articles — in `sitemap.ts` at priority 0.5 and fully indexable. Borderline against the "no placeholder content" rule.
**Fix** — either `noindex` `/blog` until the first real post ships (leave it in nav, out of the sitemap), or reframe it as a genuine hub page that curates the category guides with real standalone value. Same lens applies loosely to `/resources` (782 w) and `/reviews` (733 w) — acceptable for their purpose but keep an eye on them.

### M3. EEAT structured data is under-built for a YMYL site
- No `Person` schema for Rahat Karim despite the "Our team" section on `/about` and a substantive bio. Add `Person` with `jobTitle`, `knowsAbout`, `sameAs` (Fiverr/Upwork/LinkedIn), linked from the `ProfessionalService` via `founder` / `employee`.
- `ProfessionalService` has only two `sameAs` entries and no `knowsAbout`. Add the marketplace profiles already in `src/lib/content/site.ts` plus any LinkedIn, and a `knowsAbout` array of the case categories.
- `/reviews` renders verifiable testimonials but emits only `BreadcrumbList`. Consider `Review` items (author, `itemReviewed` → the `ProfessionalService`) — **without `reviewRating`**, since the no-ratings rule stands. Owner call.

### M4. Top-level page titles are generic and keyword-light
`About Us | …` (31), `Contact Us | …` (33), `Our Services | …` (35), `Resources | …` (32), `Client Reviews | …` (37). Half the pixel budget is unused and none carry a query term.
**Fix** — e.g. `Our Services` → `US Immigration Petition Preparation Services`; `Resources` → `US Immigration Guides & Official USCIS Resources`; `About Us` → `About Immigration Horizons — Petition Preparation Specialists`.

### M5. Duplicate `FAQPage` schema across `/`, `/faqs`, and every `/services/*`
`/faqs` reuses `homepageFaqs.slice(6)` for its "general" group, so the same Q&A pairs ship with `FAQPage` markup on both `/` and `/faqs`. Google asks that a given FAQ set live on one URL.
**Fix** — keep `FAQPage` on the service pages (unique sets), keep it on `/faqs` as the canonical FAQ home, and drop it from the homepage (the homepage FAQ section stays as HTML, just without the schema block). Verify answers still byte-match visible text wherever the schema remains (spot-checked OK on `/services/eb2-niw`).

### M6. Service pages use `og:type: article` with no article metadata
`src/app/(site)/services/[slug]/page.tsx` and `eb2-niw/page.tsx` set `openGraph.type: "article"` but emit no `article:published_time`, `article:modified_time`, or `article:author`, and there's no `Article` JSON-LD.
**Fix** — either switch to `type: "website"`, or commit to `article` and add the three `article:*` fields (author = Rahat Karim) plus `Article`/`TechArticle` JSON-LD. The latter is the stronger EEAT play.

### M7. Homepage preloads a decorative image
`immigration-consultation-hero-v1.png` renders with `alt=""` (decorative) yet gets `<link rel="preload" as="image">` — it competes with the real LCP (the H1 over the navy hero). The header logo is also preloaded.
**Fix** — drop `priority` from the decorative hero image so it's not preloaded; if it's actually meaningful, give it real alt text instead. Confirm which element is LCP with a trace and preload only that.

---

## 🟢 Low / polish

- **L1.** `/privacy` and `/terms` set `robots: { index: true, follow: true }` — that's the default and the other 18 pages correctly omit it. Remove for consistency (CLAUDE.md flags "exactly one `<meta name=robots>`").
- **L2.** Homepage H1 markup is `case,<span class="block">prepared…</span>` with no space — screen readers and text extraction read "case,prepared". Add a space or an explicit break.
- **L3.** Footer nav headings ("Case Categories", "Support Services", "Company", "Contact") are `<h2>` on every page, cluttering the heading outline. Demote to `<p class="…">` or a `<h2 class="sr-only">`-free pattern; keep them out of the document outline.
- **L4.** "200+ cases handled" / "5+ years" (`src/lib/content/site.ts` `stats`, `about.ts`, `mission.tsx`) are unverifiable quantitative claims — not a rules violation, but get explicit owner sign-off. Also fix "Over 5+ years" (redundant) in `src/components/sections/mission.tsx`.
- **L5.** No `twitter:site` / `twitter:creator`. Add if the practice has an X account; otherwise ignore.
- **L6.** Add `og:image:alt` (covered by the H1 fix if the root default includes `alt`).
- **L7.** The homepage responsive image preload has no `imagesizes` attribute, so the browser can't match a candidate to the render size. Resolved by dropping the preload (L7 = M7).
- **L8.** `/services` shows a visible "Frequently asked questions" section with no `FAQPage` schema. Given M5 (dedupe), leaving it schema-less is fine — just note the deliberate choice.

---

## What's already good (don't regress)

- **Canonicalisation:** every page has a correct self-referential absolute canonical via `metadataBase`; `og:url` matches.
- **Heading hierarchy:** exactly one `<h1>` per page, zero heading-level skips across all 21 pages.
- **`robots.txt` / host split:** `src/app/robots.ts` is host-aware — `app.*` / `admin.*` get `Disallow: /`, the marketing host allows all and links the sitemap. 404 returns `noindex` + a proper title. `/styleguide` is `noindex, nofollow`.
- **Structured data baseline:** `BreadcrumbList` on every page; `ProfessionalService` + `WebSite` on `/`; `ProfessionalService` on `/about`; `FAQPage` on the pages with unique FAQ sets; `disambiguatingDescription` carries the not-a-law-firm disclaimer into the Organization graph.
- **Content accuracy:** programmatic scan of all rendered pages found **zero** dollar amounts, **zero** month/week processing-time claims, **zero** approval/success-rate percentages, and no "attorney / lawyer / law firm / legal advice" self-description — every match was the disclaimer or an explicit "we are not…" statement. "Guarantee" appears only in negation ("cannot guarantee approval") on `/`, `/faqs`, `/services/eb2-niw`, `/services/rfe-response`, `/terms`.
- **Content depth:** `/services/eb2-niw` 4,807 w, `/services/eb1a` 3,005 w, `/services/o1-visa` 2,856 w, etc. — real topical coverage with `OfficialSources` citations.
- **Internal linking:** homepage links every service page, `/about`, `/resources`, `/contact`, `/blog`, `/reviews`, `/faqs`; nav + mega-menu + footer derive from `src/lib/content/services.ts` so no service page is orphaned.
- **Performance posture:** self-hosted variable fonts with `<link rel=preload>`, zero external font/script requests, illustrations as inline SVG, `next/image` with responsive `srcset` and correct `sizes`, CSS-only scroll reveals. No JS animation library.
- **The legacy `/eb2-niw` vs `/services/eb2-niw` duplicate** noted in CLAUDE.md does **not** exist in this build — only `/services/eb2-niw` is routed. Nothing to canonicalise.

---

## Suggested order of work

1. **H1** (OG default image + root metadata) — one asset, one file, fixes every page.
2. **H2 + H3** (title/description length) — mechanical edits in `src/lib/content/**`.
3. **H4** (sitemap `lastmod`) — small content-model change.
4. **M1, M5, M6** — homepage H1, FAQ-schema dedupe, OG `article` type.
5. **M3** (Person / richer Organization schema) — the biggest EEAT lever, slightly larger.
6. Everything in 🟢 as a cleanup pass.

Re-run `npm run build` and re-check the rendered HTML after each batch; the CLAUDE.md pre-launch checklist (single `<h1>`, one `<meta robots>`, FAQ byte-match, no horizontal scroll, content-accuracy scan) still applies.
