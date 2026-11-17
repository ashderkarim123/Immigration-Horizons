# 06 — Implementation plan

Eight phases, one branch and one pull request each. Core work ships before secondary work. Each phase ends with the
definition of done in `README.md`. **Never push or merge to `main` without the owner's go-ahead: `main` deploys to production.**

| Phase | Branch | What ships | Depends on |
| --- | --- | --- | --- |
| 0 | — | Baseline measurements, owner decisions | — |
| 1 | `revamp/1-catalogue` | Service tiers, `otherVisas`, nav, footer, sitemap, lead enum, copy fixes | 0 |
| 2 | `revamp/2-core-content` | NOID page, RFE refocus, EB-2 NIW and EB-1 expansions | 1 |
| 3 | `revamp/3-homepage` | `home.ts`, new sections, new homepage order | 1, 2 |
| 4 | `revamp/4-reviews` | Testimonial model, imported reviews, `/reviews`, review slots | 1 |
| 5 | `revamp/5-audiences` | `/for/[slug]` route and the four core audience pages | 2, 4 |
| 6 | `revamp/6-secondary` | E-2, F-1, F-2, J-1, B-1/B-2 pages, O-1 re-tier, two secondary audience pages | 1, 5 |
| 7 | `revamp/7-seo-hardening` | Service and founder schema, sitemap priorities, CLAUDE.md update, full verification | all |
| 8 (optional) | `revamp/8-readiness-check` | Interactive NIW/EB-1 readiness checklist | 7 |

---

## Phase 0 — Baseline and decisions (owner, ~1 hour)

- [ ] Answer the open decisions in `README.md` (enum, which app serves production, Upwork figures, founder photo, address).
- [ ] Record a baseline: `npm run build && npm start`, then `npm run seo:audit` and a mobile Lighthouse run on `/` and
      `/services/eb2-niw`. Save the output as `docs/revamp/baseline-2026-11.md`.
- [ ] Export Search Console Performance data (queries, pages, last 3 months) for later comparison.

---

## Phase 1 — Catalogue and information architecture

Spec: `01-information-architecture.md`.

Status (2026-11-16): active phase. Implementation is on `revamp/1-catalogue` in draft PR #10; the all-green
validation/release gate remains open. See [the Phase 1 report](phase-1-report.md), including an unchanged server
calendar DST failure and strict SEO findings. Do not treat the implementation checkboxes as merge/deploy approval.

Tasks:

- [x] `src/lib/content/services.ts`: add `ServiceTier`, `tier`, `classification`; create `otherVisas`; move O-1 into it;
      add the `noid-response` entry to `supportServices`; extend `allServices`.
- [x] Mirror the catalogue in `server/utils/services.js`.
- [x] Lead enum: append the six values in `src/lib/models/Consultation.ts` and `server/models/Consultation.js` (owner approved 2026-11-16).
- [x] Add a test that every `allServices` value is in `CONSULTATION_SERVICE_VALUES`.
- [x] `navigation.ts`: three mega-menu columns; update `footerNav`. "Who we help" links remain gated until Phase 5
      creates the audience pages, following the owner's explicit no-404-navigation rule.
- [x] Update every consumer of `caseCategories` / `supportServices` (grep `src/`).
- [x] `sitemap.ts`: include `otherVisas` slugs (pages arrive in Phase 6, so **gate on `servicePageSlugs`**: list a
      slug only when its content file exists, so the sitemap never lists a 404).
- [x] Copy fixes from `02-content-specs.md` §5 ("filing" wording, `site.description`).
- [x] Check `/eb2-niw` → `/services/eb2-niw` conditional redirect: the production source URL returned 404, so no redirect was added.

Acceptance: the header, footer and consultation dropdown show the three groups; no 404 links; all tests green;
historic lead values unchanged.

AI prompt:

```
Read CLAUDE.md, AGENTS.md, docs/revamp/README.md and docs/revamp/01-information-architecture.md.
Implement Phase 1 from docs/revamp/06-implementation-plan.md on a new branch revamp/1-catalogue.
Do not create service page content files yet (Phase 2 and 6). Keep every existing enum value and slug.
Mirror catalogue changes in server/utils/services.js. Add the enum guard test.
Run lint, tsc, build, npm test and (cd server && npm test). Show me the diff summary and anything you could not do.
```

---

## Design Gate D0 — design direction (between Phase 1 and any UI phase)

Status (2026-11-17): **approved by the owner**; implemented in Phase 3. Originally delivered 2026-11-16 on `revamp/d0-design-gate`. See `design/README.md`
(competitor analysis, brand audit, design system, rendered homepage and service-page prototypes, page-family specs,
journey map, implementation mapping, verification report). Phase 3 and every later phase that touches shared UI
must not start until the owner approves the direction and `CLAUDE.md` is updated to Open Horizons.

---

## Phase 2 — Core content

Spec: `02-content-specs.md` §1–2.

- [x] New `service-pages/noid-response.ts` and register it in `index.ts`.
- [x] Refocus `rfe-response.ts` (H1, title, NOID link; keep the slug and catalogue name).
- [x] Expand `eb2-niw.ts` and the bespoke page: package section, audience section (links in Phase 5), RFE/NOID section.
- [x] Expand `eb1a.ts`, `eb1b.ts`, `eb1c.ts`; add the E-2 subsection to `business-plans.ts` (link in Phase 6).
- [x] US spelling pass on every file touched.
- [x] Open and verify every URL in `sources` (two pre-existing USCIS/State links block automated clients).

Delivered 2026-11-16 on `revamp/2-core-content`; see `phase-2-report.md`.

Acceptance: each page meets the §0 rules in `02-content-specs.md`; the rendered-HTML scan (`05` §8) is clean.

AI prompt:

```
Read CLAUDE.md, docs/revamp/README.md and docs/revamp/02-content-specs.md (sections 0–2).
On branch revamp/2-core-content, write noid-response.ts and expand the existing core pages exactly as specified.
Content rules are strict: no fees, no dollar amounts, no timeframes, no approval rates, no "we file", no attorney
self-description. Cite only primary sources and tell me which source URLs you could not open.
Then run the checks in docs/revamp/05-seo-technical.md section 8 on the production build and report results per page.
```

---

## Phase 3 — Homepage

Spec: `03-homepage-and-components.md`.

- [x] Create `src/lib/content/home.ts`; move hero copy out of `hero.tsx`.
- [x] Build `CoreServices`, `PackageIncludes`, `AudienceRouter`, `OtherVisasRow`, `RatingBadge`.
      `FounderCredibility` **dropped by the owner** (2026-11-17): verifiable client outcomes take its slot.
- [x] Reorder `src/app/(site)/page.tsx`; re-check alternating backgrounds.
- [x] Update homepage `metadata` (title stays `EB-2 NIW & EB-1 Petition Preparation | Immigration Horizons` or the
      existing equivalent ≤ 60 chars; description mentions RFE/NOID).
- [x] `homepageFaqs`: NIW, EB-1, RFE/NOID first.
- [x] `/services` index: three tiered sections.
- [x] Open Horizons tokens, fonts, assets and shared chrome applied to every public page (owner request).

Delivered 2026-11-17 on `revamp/3-homepage`; Lighthouse still to be measured. See `phase-3-report.md`.

Acceptance: zero new client JS on `/`; no horizontal scroll at the four widths; one H1; Lighthouse mobile ≥ 95 performance.

AI prompt:

```
Read CLAUDE.md (especially Motion, Images, Gold contrast) and docs/revamp/03-homepage-and-components.md.
On branch revamp/3-homepage, move all hero copy into src/lib/content/home.ts and build the new server components from
existing ui/ primitives. Do not add dependencies. Use PhotoSlot with no image for the founder until I supply a photo.
Reorder the homepage, keep alternating tones, then compare the / route's first-load JS before and after and report it.
```

---

## Phase 4 — Reviews

Spec: `04-reviews-and-proof.md`.

- [x] Extend the `Testimonial` type; add `testimonialsFor`; add `ratings` to `site.ts`.
- [ ] Import Fiverr (44) and Upwork reviews into `testimonials.ts` verbatim; save raw exports under `docs/revamp/data/`
      (**blocked**: Fiverr returns 403 to automated clients; owner supplies the export).
- [x] Rebuild `/reviews` with `?service=` filtering (server-side, no client JS).
- [x] Add review slots to the `[slug]` renderer and the EB-2 NIW page.

Delivered 2026-11-17 on `revamp/4-reviews` except the import; see `phase-4-report.md`.

Acceptance: every review has a working `verifyUrl`; "5-star rated" appears nowhere; `/reviews?service=eb2-niw` canonicals to `/reviews`.

AI prompt:

```
Read docs/revamp/04-reviews-and-proof.md. On branch revamp/4-reviews, extend the Testimonial type and import the reviews
from docs/revamp/data/*.json verbatim (do not edit wording, do not invent names or dates). Ask me before publishing any
review that could identify a client or mentions case details. Build the /reviews filter with searchParams (a Promise in
Next 16) and plain links.
```

---

## Phase 5 — Audience pages

Spec: `01-information-architecture.md` §6, `02-content-specs.md` §4.

- [ ] `src/lib/content/audience-pages/{types,index}.ts` and `src/app/(site)/for/[slug]/page.tsx` (mirror the service renderer).
- [ ] Content files: `self-petitioners`, `professionals`, `researchers`, `professors`.
- [ ] Add to sitemap and navigation.

Acceptance: four pages render with their own H1, FAQs, matched reviews and links to recommended services in order.

---

## Phase 6 — Secondary (nonimmigrant) pages

Spec: `02-content-specs.md` §3–4.

- [ ] Content files: `e2-visa`, `f1-visa`, `f2-visa`, `j1-visa`, `b1-b2-visa`; register them.
- [ ] O-1: "Thinking long term?" section.
- [ ] Audience content: `students`, `investors`.
- [ ] Every page states it is nonimmigrant and carries the scope note.

Acceptance: as Phase 2, plus each page links at least one core page.

AI prompt:

```
Read CLAUDE.md, docs/revamp/02-content-specs.md section 3 and the existing o1-visa.ts (the nonimmigrant pattern to
follow). On branch revamp/6-secondary, write the five secondary service pages and two audience pages. Our role is
document preparation and interview coaching only; every page must say so in its scopeNote. Verify the F-2 study and
work rules against 8 CFR 214.2(f) before writing them, and quote the CFR section you relied on in your report.
```

---

## Phase 7 — SEO hardening and release

Spec: `05-seo-technical.md`.

- [ ] `serviceSchema` and `founderSchema` in `json-ld.tsx`; wire them as listed in §3; update `organizationSchema.description`.
- [ ] Sitemap priorities; bump `CONTENT_LAST_MODIFIED`.
- [ ] Update `CLAUDE.md` "Primary services" with the core and secondary tiers.
- [ ] Full verification (§8) on every URL in the sitemap; fix everything it finds.
- [ ] Owner merges and deploys; submit the sitemap in Search Console; request indexing for the top 10 URLs.

Acceptance: `seo:audit` clean on every sitemap URL; Lighthouse targets met; schema validates in Google's Rich Results Test.

---

## Phase 8 (optional) — NIW/EB-1 readiness checklist

An interactive self-check is the main lead magnet both benchmarks use, but it carries two risks here: it adds client
JavaScript, and a "score" can read as a legal eligibility opinion. If built:

- Make it a **readiness checklist** ("Which of these do you have?"), not an eligibility verdict. The result says what
  evidence the person has and lacks, and invites a consultation. Never "you qualify" / "you don't qualify".
- One isolated client component on its own route (`/tools/niw-readiness`), so no other page gains JS.
- Questions and result copy live in `src/lib/content/tools/niw-readiness.ts`.
- Optional email capture posts to the existing consultation lead handler with `service: "EB-2 NIW"`; no new backend.
- Owner signs off on the copy before release.

---

## After launch (ongoing)

- Two blog posts a week per `05-seo-technical.md` §6.
- Monthly: refresh `ratings` in `site.ts` (and its `checkedOn` date), add new reviews, compare Search Console against
  the Phase 0 baseline.
- Quarterly: re-read every core service page against current USCIS policy; bump `CONTENT_LAST_MODIFIED` when copy changes.
