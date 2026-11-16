# 02 — Content specifications

Every service page below is a `ServicePageContent` object (`src/lib/content/service-pages/types.ts`) registered in
`service-pages/index.ts`. **Adding a page = write a content file + register it.** No new page components.

## 0. Rules for every page (AI assistant: check each before finishing a page)

- **Length:** 1,200–1,800 words of real content across `definition`, `sections` and `faqs`. No filler, no placeholders.
- **`metaTitle`** ≤ 60 characters, primary keyword first. **`metaDescription`** ≤ 155 characters, primary keyword plus a reason to click.
- **`definition`** 40–60 words that answer "What is X?" on its own (featured-snippet target).
- **`keyFacts`** facts only: forms, classification, who files, criteria thresholds. **No fees, no dollar amounts, no timeframes.**
- **`faqs`** 6–8 questions. Answers are plain text and must match the rendered answer byte for byte (FAQPage schema).
- **`sources`** primary sources only (INA, CFR, USCIS, travel.state.gov, Study in the States). **Open every URL and
  confirm it resolves before committing.** The URLs below are starting points, not verified links.
- **`scopeNote`** states what we prepare and what we do not do, for that category.
- **Spelling:** US English (organized, organization, recognized). The current repo mixes in British spellings
  ("recognised"); normalise them as you touch each file.
- **Voice:** "we prepare", "we draft", "we organize". Never "we file for you", "we represent", "legal advice". The
  client or their attorney files.
- **Internal links:** each page links to two related services and one audience page (section 5 of `05-seo-technical.md`).

---

## 1. Core pages: changes to existing pages

### 1.1 `/services/eb2-niw` (bespoke flagship)

File: `src/lib/content/eb2-niw.ts` + `src/app/(site)/services/eb2-niw/page.tsx`.

- H1: **"EB-2 NIW Petition Preparation: Full National Interest Waiver Packages"**
- `metaTitle`: `EB-2 NIW Petition Preparation | Immigration Horizons`
- Add a section **"What our full EB-2 NIW package includes"**: proposed endeavor narrative, petition cover letter
  structured on the three Dhanasar prongs, recommendation letters, expert opinion letters, business or personal plan,
  exhibit index, forms checklist, RFE/NOID support. Phrase it as what the client receives.
- Add a section **"Who we prepare NIW petitions for"** that links to `/for/self-petitioners`, `/for/professionals`,
  `/for/researchers`, `/for/professors`.
- Add a section **"Already filed and received an RFE or NOID?"** linking to `/services/rfe-response` and `/services/noid-response`.
- Show 3–5 EB-2 NIW testimonials (filter `testimonials` by `service === "EB-2 NIW"`).
- Keep everything already on the page that is accurate; this is an expansion, not a rewrite from scratch.

### 1.2 `/services/eb1a`, `/eb1b`, `/eb1c`

- Add the same "full package includes" section, adapted per category.
- **EB-1B:** add a section for professors and postdocs, link `/for/professors` and `/for/researchers`. It is the
  category no benchmark covers well. Keep the existing statement that EB-1B needs a U.S. employer petitioner.
- **EB-1A:** add a "Coming from O-1?" subsection linking `/services/o1-visa` (the O-1 → EB-1A bridge).
- **EB-1C:** add a short comparison with L-1A (intracompany transferee), linking nothing external.

### 1.3 `/services/rfe-response` (refocus)

- Keep the slug and the catalogue `name` ("RFE & NOID Responses") so the enum and historic leads still match.
- Change the H1 and `metaTitle` to focus on RFEs: H1 **"I-140 RFE Response Preparation for EB-2 NIW and EB-1"**,
  `metaTitle` `I-140 RFE Response Help for NIW & EB-1 | Immigration Horizons` (check ≤ 60 chars; shorten if needed).
- Keep the existing "RFE versus NOID" section and end it with a link to the new NOID page.
- State that we respond to RFEs on petitions we did **not** prepare, which is a strong differentiator.

### 1.4 `/services/business-plans`

Add an **"E-2 business plans"** subsection linking `/services/e2-visa`. The business plan is the core non-legal
deliverable of an E-2 case.

---

## 2. Core page: new

### 2.1 `/services/noid-response` — NOID Response Preparation

| Field | Value |
| --- | --- |
| `slug` / file | `noid-response` / `service-pages/noid-response.ts` |
| Catalogue | `supportServices`, `tier: "core"`, form value `"NOID Response"` |
| H1 | "NOID Response Preparation for EB-2 NIW and EB-1 Petitions" |
| `metaTitle` | `NOID Response Help for I-140 Petitions | Immigration Horizons` |
| Primary keyword | noid response |
| Supporting | notice of intent to deny i-140, niw noid, eb1a noid response |
| Regulatory anchor | 8 CFR 103.2(b)(8)(iv) |

`keyFacts`: Notice type — Notice of Intent to Deny · Issued by — USCIS · Response window — "Stated in the notice; respond before it" (no number) · Applies to — Form I-140 (and other benefit requests).

Sections:

1. What is a NOID (prose)
2. NOID vs RFE: why the stakes are higher (prose + callout)
3. How we prepare a NOID response (numbered list): read the notice, map each ground for denial, rebut the officer's
   reasoning point by point, gather new evidence, draft the response brief and exhibit index, client review
4. What you need to send us (list): the full notice, the filed petition and exhibits, any prior RFE and response
5. When to involve an attorney (prose): complex status, prior denials, litigation → hand-off, consistent with the scope note
6. CTA (urgent tone, no timeframe): "Received a NOID? Send it to us today."

FAQs (6–8): Can you respond to a NOID on a petition you didn't prepare? · Is a NOID a denial? · What happens if I
don't respond? · Can new evidence be submitted? · Should I withdraw and refile instead? (explain the options in
general terms, defer the decision to the client and their attorney) · Do you file the response? (no — the client or
their attorney files)

Sources: 8 CFR 103.2 (eCFR), USCIS Policy Manual Vol. 1, Part E, Ch. 6.

`scopeNote`: "We prepare the NOID response brief, evidence and exhibit index for you or your attorney to file. We do
not file it, appear before USCIS, or give legal advice on whether to respond, withdraw or refile."

---

## 3. Secondary pages: new (nonimmigrant)

All six live in `otherVisas`, `tier: "secondary"`, `classification: "nonimmigrant"`. Every page must:

- state in its first paragraph and in `keyFacts` that it is a **nonimmigrant (temporary)** classification (follow the
  O-1 page's existing pattern);
- carry a **"Thinking long term?"** section linking to EB-2 NIW / EB-1, which channels secondary traffic to the core;
- use the scope note pattern below.

### 3.1 `/services/e2-visa` — E-2 Treaty Investor: Business Plan & Document Preparation

| Field | Value |
| --- | --- |
| H1 | "E-2 Treaty Investor Visa: Business Plan and Document Preparation" |
| `metaTitle` | `E-2 Visa Business Plan & Document Prep | Immigration Horizons` |
| Primary / supporting | e2 visa business plan / e2 treaty investor, e2 visa requirements, e2 visa documents |
| Anchors | INA §101(a)(15)(E)(ii); 8 CFR 214.2(e); travel.state.gov treaty country list |

`keyFacts`: Classification — Nonimmigrant · Nationality — must be a national of a treaty country · Investment —
"substantial" relative to the enterprise (no figure) · Usual filing — consular (DS-160 + E-2 package) or change of status (I-129)

Sections: what E-2 is · who qualifies (treaty nationality, investment at risk, real and operating enterprise, develop
and direct) · **what we prepare**: business plan with five-year financial projections, investment and source-of-funds
document index, organizational chart, cover-letter draft for the attorney's review · what we don't do (treaty
eligibility opinion, entity formation, consular strategy) · E-2 vs O-1 vs EB-2 NIW for founders (prose comparison) ·
Thinking long term? · CTA.

`scopeNote`: "We write E-2 business plans and organize your investment evidence. Eligibility opinions, entity
structuring and the filing strategy come from your attorney."

### 3.2 `/services/f1-visa` — F-1 Student Visa Preparation

| Field | Value |
| --- | --- |
| H1 | "F-1 Student Visa Preparation: DS-160, Documents and Interview Coaching" |
| `metaTitle` | `F-1 Visa Interview Prep & DS-160 Help | Immigration Horizons` |
| Primary / supporting | f1 visa interview preparation / ds-160 help, f1 visa documents, 214(b) refusal |
| Anchors | INA §101(a)(15)(F)(i); 8 CFR 214.2(f); Study in the States (DHS); travel.state.gov student visas |

`keyFacts`: Classification — Nonimmigrant · School document — Form I-20 (issued by a SEVP-certified school) · Visa
application — DS-160 · Fee form — I-901 SEVIS fee (amount: link to official page) · Interview — at a U.S. embassy or consulate

Sections: what the F-1 is · the steps (admission and I-20, SEVIS fee, DS-160, interview) as a numbered list · **what
we prepare**: DS-160 entered from the student's own answers, funding-document checklist, study-plan and ties-to-home
narrative coaching, mock interviews · after a 214(b) refusal: how we help prepare a stronger reapplication (coaching
only) · **why us**: 18 years advising students at the Fulbright Commission in Pakistan (USEFP). This is the E-E-A-T
anchor for this page, so state it plainly and link `/about` · bringing family → link `/services/f2-visa` · Thinking long
term? (OPT → H-1B or EB-2 NIW, general terms only) · CTA.

`scopeNote`: "We prepare documents and coach interviews. We do not choose your visa category, advise on status
violations, or represent you. Your school's Designated School Official (DSO) is the authority on your I-20 and SEVIS record."

### 3.3 `/services/f2-visa` — F-2 Dependent Visa Preparation

H1 "F-2 Visa for Spouses and Children of F-1 Students" · `metaTitle` `F-2 Dependent Visa Preparation | Immigration Horizons`
· keywords: f2 visa for dependents, f2 visa spouse, f2 to f1 · anchors: 8 CFR 214.2(f)(3), travel.state.gov.

Sections: who qualifies (spouse and unmarried minor children of an F-1) · the dependent I-20 · what we prepare
(DS-160s, relationship and funding documents, family interview coaching) · F-2 limits explained in general terms with
a link to the official source (work is not permitted; study is limited — **verify the exact rule against 8 CFR
214.2(f)(15) before writing it**) · F-2 to F-1 change: hand-off to an attorney · package with F-1 · CTA.

### 3.4 `/services/j1-visa` — J-1 Exchange Visitor Preparation

H1 "J-1 Exchange Visitor Visa: DS-2019, DS-160 and Interview Preparation" · `metaTitle` `J-1 Visa Preparation for Scholars & Researchers | Immigration Horizons`
(shorten to ≤ 60) · keywords: j1 visa preparation, j1 research scholar, ds-2019 · anchors: INA §101(a)(15)(J); 22 CFR Part 62; j1visa.state.gov.

Sections: what the J-1 is · program sponsors and Form DS-2019 · what we prepare · **why us**: Rahat led the Humphrey
Fellowship and the CCIP and CCAP programs at USEFP, all J-1 exchange programs. This is the strongest E-E-A-T
paragraph on the site; keep it factual · the two-year home-residency requirement (212(e)): explain that it exists,
and refer all waiver questions to an attorney · J-1 researchers → EB-1B / EB-2 NIW later · CTA.

### 3.5 `/services/b1-b2-visa` — Visitor Visa Preparation

H1 "B-1/B-2 Visitor Visa Preparation and Interview Coaching" · `metaTitle` `B-1/B-2 Visitor Visa Interview Prep | Immigration Horizons`
· keywords: b1 b2 visa interview, visitor visa ds-160, 214(b) visitor refusal · anchors: INA §101(a)(15)(B), INA §214(b), travel.state.gov visitor visa.

Sections: what B-1 and B-2 cover · the 214(b) presumption, in general terms · what we prepare (DS-160 from the
client's answers, trip-purpose and ties documents, mock interview) · what we don't do (prior overstays,
inadmissibility, waivers → attorney) · CTA. This page is deliberately the shortest of the six (~1,000 words).

### 3.6 `/services/o1-visa` (re-tier only)

Move to `otherVisas`. Add the "Thinking long term?" section linking EB-1A. No other change.

---

## 4. Audience pages (`/for/*`)

Type in `01-information-architecture.md` §6. Each page: 900–1,300 words, own H1, own FAQs, 3–5 matched testimonials.

| Slug | H1 | Recommended services (in order) | Angle |
| --- | --- | --- | --- |
| `self-petitioners` | "EB-2 NIW and EB-1A Help for Self-Petitioners" | eb2-niw, eb1a, recommendation-letters, rfe-response | Full package or single deliverables for people filing without an employer; we prepare, you file |
| `professionals` | "Green Card Petitions for Engineers, Doctors and Industry Professionals" | eb2-niw, eb1a, business-plans | Industry experience without publications; proposed-endeavor framing |
| `researchers` | "EB-2 NIW and EB-1 Petitions for Researchers and Scientists" | eb2-niw, eb1b, eb1a, expert-opinion-letters | Citations, peer review, independent letters |
| `professors` | "EB-1B and EB-2 NIW Petitions for Professors and Academics" | eb1b, eb2-niw, eb1a | Employer-sponsored EB-1B vs self-petitioned NIW; founder's higher-education background |
| `students` (secondary) | "Visa Preparation for International Students" | f1-visa, f2-visa, j1-visa, eb2-niw | F-1 now, NIW later |
| `investors` (secondary) | "E-2 Business Plans and Investor Visa Preparation" | e2-visa, business-plans, eb2-niw | E-2 for treaty nationals; NIW for entrepreneurs |

No invented personas or client stories. Pain points are written generically ("you have industry impact but few
publications"), never as fictional clients.

---

## 5. Site-wide copy fixes

- `src/lib/content/services.ts` → EB-2 NIW `full-package` description says "full form filing support". Change it to
  "full form preparation support" (we prepare; the client files). Check every content file for "filing" used as
  something we do, and apply the same fix to `server/utils/services.js`.
- `site.description` → "Immigration Horizons prepares EB-2 NIW and EB-1 petitions, RFE and NOID responses,
  recommendation letters and business plans, plus preparation support for F-1, E-2 and other U.S. visas."
- Update `CLAUDE.md` → "Primary services" to list core and secondary tiers, so future sessions inherit the priority.
