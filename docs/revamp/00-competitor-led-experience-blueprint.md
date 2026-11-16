# 00 — Competitor-led website experience blueprint

**Status:** design/research brief for the *public marketing site*, not a code implementation task.  
**Research checked:** 2026-11-16. **Business identity:** Immigration Horizons. **Approved design direction:** Open Horizons.

## 1. The goal and the three distinct decisions

Build a premium, conversion-oriented Immigration Horizons website that competes with specialist U.S. immigration preparation sites. **Our goal is not to imitate their colors, illustrations, logos, legal claims, or wording.**

Keep these decisions separate:

1. **Competitor-informed product and UX:** which pages exist, how users navigate them, what each page explains, how evidence and calls-to-action appear, and how leads convert.
2. **Our brand expression:** use the approved Open Horizons logo masters and palette/typography from the owner's supplied brand kit. See [07 — Brand application](07-open-horizons-brand-application.md).
3. **Implementation sequencing:** extend the current Next.js marketing site in small, tested changes, following the existing Phase 0–8 ordering. See [08 — Page-by-page design and rollout](08-page-design-and-rollout.md) and [06 — Implementation plan](06-implementation-plan.md).

The reference websites answer **what kind of experience we should build**. The Open Horizons kit answers **what ours looks like**. The engineering specifications answer **how it is delivered**.

## 2. Competitor benchmark matrix — live sites

The table records *observed patterns* on accessible pages. It is not a license to reuse competitor assets, promises, reviews or statistics.

| Reference | Verified site | What the site demonstrates | Pattern we adapt | What we must **not** reuse |
| --- | --- | --- | --- | --- |
| **Beyond Border — primary content and trust benchmark** | https://www.beyondborderglobal.com/ | Specialization in EB-2 NIW, EB-1A, O-1, L-1, E-2; audience-led hero, evidence-focused educational explanations, testimonials/people, staged process and consultation action. Its resources include named writers/reviewers. | Rich service pages, profession-specific educational content, concise trust strip, consistent hero → evidence → process → FAQ → CTA progression | Their logo, photos, attorney network claims, refund guarantee, approval percentages, client counts, or speed promises |
| **Deel Immigration — primary conversion benchmark** | https://www.deel.com/immigration (currently redirects to https://www.deel.com/hr-services/employee-immigration/) | Simple consultation-led headline, review/social proof near the top, journeys for individuals/founders/people teams, concise benefit cards, service explanation, repeat consultation prompts, FAQs | Landing pages that explain the offer fast; one dominant CTA and one secondary action; segment routes; low-friction inquiry | Deel branding, G2 numbers as our own, claims of legal representation, SaaS mobility features we do not offer |
| **Self Petition USA — self-petitioner/service-product benchmark** | https://www.selfpetitionusa.com/ | Distinct service options for NIW DIY, draft review, prepared narrative and RFE response; clear audience segmentation for individual self-petitioners and lawyers; educational tools | Explain **full package vs individual deliverable**, compare offers without jargon, make RFE help a direct entry point | Their copy, packages, software/AI claims, prices, client reviews, performance figures |

**Live-research limitation:** the previously referenced Deel campaign URL (`/plp/immigration-eb-2-niw`) did not resolve in this review. The verified Deel Immigration entry point above is used instead. Self Petition USA's server-rendered HTML could not be fully opened without JavaScript; its indexed site content was accessible. Recheck each site's layout in a real browser before design sign-off; do not pretend the live site was visually pixel-audited.

**Research links for the design reviewer:**
- Beyond Border home: https://www.beyondborderglobal.com/
- Beyond Border authored/reviewed content example: https://www.beyondborderglobal.com/resources/us-visa-now-requires-social-media-accounts-to-be-public-says-us-embassy
- Deel Immigration: https://www.deel.com/immigration
- Deel NIW education example: https://www.deel.com/blog/eb-2-niw-self-petition-visa-for-exceptional-talent-explained/
- Self Petition USA: https://www.selfpetitionusa.com/

## 3. Our differentiated positioning

Our principal offer is **original EB-2 NIW / EB-1 petition preparation and standalone RFE / NOID response preparation**, including work on petitions prepared elsewhere.

Priority order:

1. **Core immigrant petition pages:** EB-2 NIW, EB-1A, EB-1B, EB-1C.
2. **Core response and deliverable pages:** RFE, NOID, recommendation letters, expert letters, business plans, evidence organization.
3. **Secondary temporary/nonimmigrant support:** O-1, E-2, F-1, F-2, J-1, B-1/B-2.

**Differentiation to communicate, without unverified superiority claims:** dedicated EB-1B content for professors/researchers; dedicated NOID and RFE entry points; full petition packages *or* specific drafting tasks; routes for self-petitioners, professionals, researchers and professors; F-1/F-2 document and interview preparation as secondary services.

The user should understand within the first screen: what we prepare; whom we help; what happens next; that we are not a law firm; and why our public reviews are verifiable.

## 4. Five-hub information architecture

The homepage directs visitors into five connected areas:

- **Green card petitions:** EB-2 NIW, EB-1A, EB-1B, EB-1C.
- **Responses and preparation services:** RFE, NOID, letters, business plans, exhibit organization.
- **Who we help:** self-petitioners, professionals, researchers, professors; students/investors as secondary.
- **Other U.S. visas:** O-1, E-2, F-1, F-2, J-1, B-1/B-2.
- **Proof, resources and contact:** reviews, founder/about, educational articles, FAQs, consultations and contact.

The **core hubs must be visible first** in mega navigation, homepage and services index. Secondary paths must remain discoverable without dominating. Do not link to any route until its page actually exists.

## 5. Homepage — competitor-informed experience, our own visual design

The homepage is a custom Immigration Horizons page, **not a screenshot recreation**.

| Order | Visitor sees | Reference logic | Our execution |
| --- | --- | --- | --- |
| 1 | Header + hero | Beyond Border specialist positioning; Deel's clear conversion action | Official horizontal Open Horizons logo, three-category navigation, one primary consultation CTA, EB-2 NIW / EB-1 / RFE / NOID promise |
| 2 | Verifiable proof strip | Both primary sites establish trust early | Fiverr 4.8/5 from 44 reviews (as checked 2026-11-16), with a link; Upwork values omitted until confirmed |
| 3 | Six flagship service cards | Specialist services are independently navigable | EB-2 NIW, EB-1A, EB-1B, EB-1C, RFE, NOID; all have distinct page links |
| 4 | Full petition package contents | Self Petition USA's clarity on deliverables | Petition narrative, evidence mapping, letters, forms checklist, exhibits, response support |
| 5 | Audience selector | Deel's segmented journeys | Self-petitioners, professionals, researchers, professors |
| 6 | EB-2 NIW explainer | Beyond Border's educational depth | Concise Dhanasar overview linked to the flagship page |
| 7 | Founder credibility | Trust through visible real people | Owner-confirmed credentials only; real portrait if approved, otherwise PhotoSlot |
| 8 | Eight-step preparation process | Process transparency | The existing eight-stage flow, with client/attorney filing responsibilities clear |
| 9 | Why choose us + actual reviews | Visible differentiation and external proof | Six concise service-specific strengths and real verifyable review text |
| 10 | Other U.S. visa row | Secondary discovery without distraction | Compact links/cards for O-1, E-2, F-1, F-2, J-1, B-1/B-2 |
| 11 | FAQs and final CTA | Search intent and conversion | Eight FAQ answers matching schema; consultation/WhatsApp; footer disclaimer |

Do not add a scored “you qualify” eligibility verdict to the hero. Until the optional readiness checklist is approved and built, “Free consultation” is the truthful lead action.

## 6. UX conventions for all pages

- **One site-wide system:** same logo, navigation, typography, button hierarchy, forms, FAQ treatment, footer, breadcrumb, link styles and trust elements.
- **One offer per page:** lead with the page's distinct keyword and visitor question, then practical preparation deliverables and a clear next step.
- **Proof with evidence:** direct links to review platforms; testimonials preserved verbatim; no invented approvals or case stories.
- **Soft claims, strong clarity:** do not copy competitor approval rates, pricing, success guarantees, refund guarantees, lawyer relationships or aggressive timelines.
- **Responsive first:** mobile experience is authored deliberately, not a scaled desktop screenshot. Test at 360/768/1024/1440 px.
- **Progressive navigation:** the visitor can reach a flagship service, audience page or consultation in one or two actions without horizontal scrolling.

## 7. Competitive design review deliverables

Before UI coding, save a reference audit for **each** of the three benchmark sites: desktop and mobile screenshot (if accessible), navigation pattern, hero anatomy, proof presentation, service-card treatment, CTA placements, footer pattern, and the parts we will **not** copy. Record dates and URLs. Do not include competitor logos or protected photos in shipping code.

Create **separate wireframes** for: home, services index, flagship NIW, EB-1 family, RFE/NOID, deliverables, other visa, audience, reviews, about/founder, consultation/contact, blog/resources, FAQ and legal. The route-by-route content and CTA differences are in [08](08-page-design-and-rollout.md).

## 8. Source precedence and unresolved decisions

1. Existing repository `AGENTS.md` / `CLAUDE.md` govern implementation/security/compliance until the owner authorizes updates.
2. The owner's original Open Horizons brand guide and SVG masters govern the **intended new brand**, but `CLAUDE.md` still describes the old navy/gold brand. **Reconcile the rules explicitly before changing public UI.**
3. `docs/revamp/README.md` and the Phase 1 report record decisions already confirmed (including consultation enum values and the production host); do not ask for them again.
4. `01`–`06` retain the exact service-content, data, SEO and phase acceptance requirements.
5. No live deployment without owner approval. `main` is connected to production.

This is a **benchmark and site-design brief**, not a claim that all listed pages have been designed, coded or launched.
