# 08 — Beyond Border-first page design and implementation map

**This file separates visual design approval from implementation.** The goal is a contemporary, original **Immigration Horizons** website whose overall structure and visual quality are primarily inspired by [Beyond Border](https://www.beyondborderglobal.com/), while [Deel Immigration](https://www.deel.com/hr-services/employee-immigration/) guides consultation conversion and [Self Petition USA](https://www.selfpetitionusa.com/) informs service/product explanation. **Only the Open Horizons kit supplies branding.** Read [00](00-competitor-led-experience-blueprint.md) and [07](07-open-horizons-brand-application.md) first.

## A. Two tracks — never confuse them

### Track A — DESIGN (what the site should look and feel like)

1. **Reference audit.** Review Beyond Border home, services hub, EB-2 NIW, about, testimonials, resources and a mobile rendering. Record section order, navigation pattern, component anatomy, density, CTA placements and responsive changes. Review Deel specifically for CTA conversion, not overall visual design. Review Self Petition USA for full-package/standalone-offer clarity only.
2. **Site-wide design direction.** Produce an original moodboard and component/system sample: Open Horizons header/footer; hero; primary/secondary CTAs; core/secondary cards; audience cards; process; testimonials; FAQ; forms; contact states.
3. **One homepage design.** Complete desktop **1440px**, tablet **768px** and mobile **360px** mockups. Follow the exact section order from `03-homepage-and-components.md`. Beyond Border's premium specialist-site structure is the primary reference.
4. **Independent page designs.** Produce distinct page mockups for each page family in section B. Variations should feel purposeful, not duplicates with changed titles.
5. **Review and sign-off.** Brand accuracy, legal scope, navigation, contrast, content validity, CTA hierarchy and responsive behavior pass before design handoff.

**Design output:** reference audit, design system, distinct home page, approved route-family designs, annotated page-level modules and CTA journey map. A high-fidelity screenshot alone does **not** count as implementation.

### Track B — IMPLEMENTATION (how the approved design reaches the website)

Follow `06-implementation-plan.md`. Each phase has its own feature branch and draft PR. Build on the current Next.js public site, reuse the existing content-driven service page architecture, and keep production untouched.

**Critical:** don't mark a phase complete because it looks good; tests and SEO checks still apply. Equally, don't approve a visually generic page merely because compilation passes.

## B. Every public page type — design plan

The table below is **visual and UX specification**, not a claim that the page is implemented.

| Page / route | Beyond Border-led design pattern | Page-specific sections and treatment | Primary conversion |
| --- | --- | --- | --- |
| **Home** `/` | Premium specialist hero, trust near top, confident large service cards, team credibility, process, FAQ | 13-section hierarchy from `03`: hero → verifiable proof → six core services → full-package contents → four audiences → NIW overview → founder → eight-step process → differentiation → reviews → other visas → FAQ → final CTA | Free consultation; direct RFE/NOID secondary CTA |
| **All services** `/services` | Curated expertise hub with clear grouping, not a giant equal-weight directory | Three groups: Green card petitions (large), RFE/NOID & support (large), Other U.S. visas (smaller). Each existing destination gets a concise service synopsis | Consultation and service detail |
| **Flagship NIW** `/services/eb2-niw` | Deep educational service landing page with strong intro, evidence/qualification explainer and FAQ | Standalone Dhanasar framework, eligibility facts from primary sources, proposed-endeavor narrative, package deliverables, NIW reviews, audiences, RFE/NOID link | Consult about an NIW petition |
| **EB-1A** `/services/eb1a` | Dedicated specialized service page | Criteria mapping, evidence categories, full package, self-petition context, O-1 → EB-1A education, matched verified reviews | EB-1A consultation |
| **EB-1B** `/services/eb1b` | Specialist service / audience crossover | Outstanding researcher and professor requirements, employer-petitioner distinction, research/academic evidence, professor/researcher audience routes | EB-1B preparation consultation |
| **EB-1C** `/services/eb1c` | Specialist service page | Multinational manager/executive evidence and business-relationship documents; clear L-1A comparison | EB-1C preparation consultation |
| **RFE** `/services/rfe-response` | Problem-first urgent service page with reassurance and process | “Already received an RFE?” headline, notice review, point-by-point evidence and response plan; support even if someone else prepared the original petition; separate NOID link | Send RFE / start consultation |
| **NOID** `/services/noid-response` | Dedicated high-intent response landing page | What a NOID is, NOID vs RFE, what to provide, our drafting steps, attorney handoff boundaries; no promises about outcome or response time | Request NOID help |
| **Recommendation letters** `/services/recommendation-letters` | Focused deliverable landing page | Who needs letters, inputs, letter drafting steps, recommender/experience narrative, related petition options | Ask about letter drafting |
| **Expert opinion letters** `/services/expert-opinion-letters` | Focused deliverable landing page | Expert role, evidence context, opinion-draft deliverable, criteria relevance and related services | Ask about expert letters |
| **Business plans** `/services/business-plans` | Focused deliverable landing page | NIW endeavor plan vs E-2 business plan (clear separation), what is written, financial assumptions / source-of-funds documents where applicable | Ask about a business plan |
| **Evidence packaging** `/services/evidence-packaging` | Focused deliverable landing page | Exhibit audit, evidence mapping, index, organization and response support; before/after concepts only from anonymized templates, not invented cases | Ask about evidence packaging |
| **O-1** `/services/o1-visa` | Quieter secondary visa page | Clearly temporary classification, petition-document support, O-1 → EB-1A bridge | O-1 document preparation consultation |
| **E-2** `/services/e2-visa` | Secondary visa page with business-plan emphasis | Treaty-investor overview, business plan, document index and attorney scope handoff; core NIW link | E-2 business plan inquiry |
| **F-1** `/services/f1-visa` | Secondary visa page for student segment | I-20/SEVIS/DS-160 explainer, document checklist, funding narrative coaching, mock interview, F-2 cross-link, owner-verified founder experience | Student preparation consultation |
| **F-2** `/services/f2-visa` | Secondary visa page for dependents | Family eligibility summary, dependent I-20, relationship records, interview coaching, attorney handoff for status changes | Family preparation consultation |
| **J-1** `/services/j1-visa` | Secondary visa page with academic/exchange credibility | DS-2019 program sponsor, interview preparation, two-year rule referral, owner-verified USEFP exchange-program background | J-1 preparation consultation |
| **B-1/B-2** `/services/b1-b2-visa` | Short, focused secondary visitor page | Trip purposes, applicant-provided DS-160 answers, ties documents, interview coaching, inadmissibility handoff | Visitor preparation consultation |
| **Self-petitioners** `/for/self-petitioners` | Audience route based on a specific situation | Full package vs one deliverable; what we prepare, what client files, NIW and EB-1A links, verified review proof | Free consultation |
| **Professionals** `/for/professionals` | Persona-focused editorial page | Industry achievements, evidence beyond publication counts, proposed-endeavor explanation, relevant core services | Free consultation |
| **Researchers** `/for/researchers` | Research/academic credibility route | Publications, citations, peer review, expert evidence, EB-2 NIW vs EB-1B overview | Free consultation |
| **Professors** `/for/professors` | Academic specialist route | EB-1B employer petition vs NIW self-petition, evidence and classroom/research impact, founder credentials if verified | Free consultation |
| **Students** `/for/students` | Secondary audience route | F-1/F-2/J-1 overview, student checklist, interview support, future routes in general terms | Student consultation |
| **Investors** `/for/investors` | Secondary audience route | E-2 business planning and entrepreneur documentation, NIW educational bridge | Business-plan inquiry |
| **Reviews** `/reviews` | Beyond Border-style proof page, but better verification | Aggregate Fiverr score with date/source; filtered verbatim real reviews by service; platform links; no self-serving AggregateRating | Discuss a similar service |
| **About / founder** `/about` | Human-led credibility story, clean editorial photography layout | Why Immigration Horizons exists, precisely confirmed credentials and relevant experience, our non-law-firm role, specialist offerings | Meet the team → consultation |
| **Consultation** `/consultation` | Deel conversion principles inside Beyond Border-like design | Short lead form, service prefill, source/UTM fields, privacy/disclaimer, clear error/accepted states; WhatsApp alternative | Submit free consultation |
| **Contact** `/contact` | Simple, trust-forward contact page | Real contact channels, existing secure form, no invented address, service chooser where useful | Send inquiry |
| **FAQ index** `/faqs` | Educational search-intent page | Organized NIW, EB-1, RFE/NOID, document preparation and secondary visa questions; one canonical page | Consultation |
| **Resources** `/resources` | Beyond Border content hub | Topic clusters, primary-source links, profession guides, comparison resources and author credibility; avoid pseudo-legal advice | Explore guide or consultation |
| **Blog index / post** `/blog`, `/blog/[slug]` | Beyond Border editorial content engine | Searchable educational content; category grouping; named author and reviewed-by only when factual; last-updated date; related services/audiences | Related service inquiry |
| **Privacy / Terms** `/privacy`, `/terms` | Quiet, legible legal-information pages | Same global header/footer and typography; readable prose width; preserve current legal/compliance text | Minimal/appropriate links |

### Reusable page families without sameness

- **Family 1:** Homepage and hub pages — custom art direction and section choreography.
- **Family 2:** Core petition pages — one shared component system, but NIW/EB-1A/EB-1B/EB-1C each have distinct content sections.
- **Family 3:** Response pages — urgent problem-first RFE/NOID layout, with appropriate calm tone.
- **Family 4:** Deliverables — short scope-first educational/offer layouts.
- **Family 5:** Secondary visas — compact informative design that deliberately defers to core pages in visual weight.
- **Family 6:** Audience pages — identity and motivation first, then recommended services.
- **Family 7:** Credibility/conversion/editorial/legal — purpose-specific layout with shared branding and navigation.

Do not create a new React page renderer for every visa; the existing `[slug]` structure and typed content registry remain the implementation source of truth.

## C. Detailed homepage design handoff

1. **Global header:** original Open Horizons horizontal SVG, services mega menu with core first, Who We Help when routes exist, Reviews, Resources, About and one Forest consultation CTA. Responsive dropdown must fit 360px.
2. **Hero:** Beyond Border-inspired editorial heading scale and two-column composition where it makes sense; our own abstract horizon/door/path illustration (not Beyond Border art). DM Serif headline; one Forest CTA for consultation; one subdued RFE/NOID CTA; WhatsApp secondary floating control. Never portray an eligibility verdict if the tool is not built.
3. **Proof bar:** only verified facts. Fiverr 4.8/5 from 44 reviews (checked 2026-11-16); external link. Upwork fields null until verified. Do not import competitor statistics.
4. **Core grid:** six premium cards with generous whitespace; EB-2 NIW and EB-1 higher visual weight; RFE/NOID easy to find. Mobile stack; visible text links; no nested interactive cards.
5. **Package:** original document/exhibit illustrations; clearly separate full package from single deliverables (Self Petition USA contribution).
6. **Audience:** four large, distinct routes, academic/business context artwork only when appropriate; never stock portraits.
7. **Educational / founder:** concise NIW explainer and a real, owner-confirmed founder block; use PhotoSlot until approved image supplied.
8. **Process + why us:** eight steps with visual numbering and a restrained list of actual differentiators. Competitor-inspired process progression, not copied visuals.
9. **Testimonials:** verified originals, 3–6 featured, first NIW/EB-1/RFE; real verification URLs.
10. **Secondary row, FAQ, final CTA/footer:** quiet small-card nonimmigrant discovery, readable collapsible FAQs, deep Forest closing CTA and reverse logo. Unchanged disclaimer on all pages.

## D. Design and engineering rollout gates (aligned to existing phases)

| Gate | Design deliverable | Code phase from `06` | Must be true to proceed |
| --- | --- | --- | --- |
| **D0 — Direction lock** | Beyond Border benchmark audit; approved original-brand component board; desktop/mobile home wireframes and core service wireframe | Before UI work; independent of Phase 1 catalogue changes | Brand guide vs old `CLAUDE.md` conflict resolved by owner, originals located/verified |
| **D1 — Navigation and catalogue** | Header, mega menu, mobile nav, footer, services hub designs | Phase 1 `revamp/1-catalogue` | No dead routes; enum model contracts; existing Phase 1 test report reviewed |
| **D2 — Core pages** | EB-2 NIW, EB-1A/B/C, RFE, NOID and deliverables mockups | Phase 2 `revamp/2-core-content` | Official sources, content scope, unique metadata, service-specific page QA |
| **D3 — Homepage** | Approved original full home design at 1440/768/360 | Phase 3 `revamp/3-homepage` | Forest / Terracotta / Ivory system; original logos; no new unnecessary client JS; no overflow |
| **D4 — Proof** | Reviews index + testimonial block designs | Phase 4 `revamp/4-reviews` | Verbatim verified testimonials, no self-serving rating schema |
| **D5 — Audiences** | Six audience designs with four core variants first | Phase 5 `revamp/5-audiences` | Four core routes exist, are accessible and included in sitemap before linking |
| **D6 — Secondary** | Compact O-1/E-2/F-1/F-2/J-1/B-1/B-2 service and student/investor designs | Phase 6 `revamp/6-secondary` | All new routes exist before nav/sitemap links; temporary classification and scope notes |
| **D7 — Final QA/SEO** | Entire route inventory screenshot/responsive comparison and brand audit | Phase 7 `revamp/7-seo-hardening` | Lint/typecheck/build/tests/SEO audit, metadata/schema, Lighthouse, source validity, owner release approval |
| **D8 — Optional tool** | Standalone readiness-check interactive design | Optional Phase 8 | No legal eligibility verdict, isolated client component, owner-approved result wording |

**Do not force visual design artifacts into Phase 1's code changes if that work is already underway.** The design deliverables can be approved separately while the current release branches preserve the implementation gates.

## E. Final design acceptance checklist

- Beyond Border is recognizable as the **dominant structural inspiration** in hero spacing, specialist-first flow, curated service sections, people/proof/process progression and page templates.
- Deel contributes **CTA journey and lead conversion** patterns, not a competing color or layout system.
- Self Petition USA contributes **package and self-petitioner clarity**, not the site visual identity.
- Brand artwork comes from the owner's **actual SVG/logo kit**; no made-up logos, stock images or competitor art.
- Open Horizons typography and palette follow `07`; primary buttons **Forest with white text**.
- Core services get the greatest visual hierarchy; secondary visas are intentionally smaller/lower.
- The header, service detail, review, consultation and footer share a coherent design system, including mobile.
- Every dynamic route has real page data; never create public links to content files that are not built.
- No invented case outcomes, ratings, success claims or attorney role; preserve the existing disclaimer.
- Every phase stays on its branch and is reviewable; `main` deploys only after explicit owner approval.
