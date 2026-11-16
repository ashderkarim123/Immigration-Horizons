# 00 — Competitor design reference review

Checked 2026-11-16 with headless Chromium (full-page captures at 1440 px and 390 px) plus a text read of each page.
Beyond Border's `/visa/eb2-niw-visa` and `/about-us` were captured on the second attempt (their trackers keep the network
busy, so `networkidle` timed out; `domcontentloaded` + 6 s worked). Their blog article at `/resources/eb-2-niw` was read
as text only. Captures are in the session's temporary folder, not committed (third-party material).

## Priority hierarchy

| Reference | Role | What it informs | What it must not inform |
| --- | --- | --- | --- |
| **Beyond Border** | Primary | Structure, editorial rhythm, section progression, service-page depth, About presentation, responsive behaviour | Palette (theirs is also cream + dark green — see §1.4), copy, claims, photography, attorney model |
| **Deel Immigration** | Secondary | CTA hierarchy, proof next to the CTA, persona routing, CTA repetition on long pages, mobile conversion | Visual style, colour, product UI, stats |
| **Self Petition USA** | Tertiary | Package vs single-deliverable clarity, RFE positioning, self-petitioner segmentation | Visual identity, pricing tables, AI product framing |

## 1. Beyond Border (beyondborderglobal.com)

### 1.1 What was observed

**Homepage, desktop.** Sticky light header: wordmark left, six text links, one dark pill CTA ("Contact Us"). Hero is a
two-column split — small uppercase eyebrow, a three-line serif H1 (last line in italic), three short paragraphs, one
dark CTA — with a large photograph on the right carrying a floating list of the five visa links. Then: a client-logo
strip; a centred serif statement paragraph; a full-bleed photo band with four stats; a second logo strip; a "Partner
you can rely on" split (text + CTA left, image right) followed by a two-column definition list of four differentiators;
press list; five pathway cards (icon, title, one line, arrow) in a vertical stack; a dark-green attorney section with
four profile cards; a dark "Embark with transparency" process band; six case-study image cards; testimonial columns;
tabbed FAQ; dark green footer with four link columns, office list and a long disclaimer.

**Homepage, mobile (390 px).** Single column throughout. Hamburger opens a bordered panel listing the six items with
two disclosure rows ("Visa Supported", "Resources") and the dark CTA inside the panel. The hero stacks: eyebrow, H1,
photo, floating visa links below the photo, then the paragraphs and CTA. A persistent "Request A Consultation" chip and
a WhatsApp bubble sit bottom-right.

**EB-2 NIW service page.** Dark-green hero: three small pills (Self Petition / No Job Offer / No PERM), H1, two
paragraphs, a "not legal advice" line, and an inline **lead form** on the right (name, email, phone, LinkedIn, message,
source). Then: logo strip; "Why choose" six-card grid; "Three Dhanasar prongs" three cards + CTA; attorney cards;
"Who we help" six cards with images; four video testimonials; a long **guide** section with pill jump-links, an
attorney "Reviewed by" byline, key-takeaways box, two side-by-side cards for the EB-2 baseline, a visa-bulletin
callout, numbered five-step process, common mistakes; pricing cards; FAQ accordion; closing CTA.

**About page.** Dark hero with H1 "We simplify immigration", a four-photo grid, CTA and a stats line. Then a numbered
"who we serve" list, a logo strip, a two-column numbered process, a dark stats + attorney grid, selection criteria,
numbered approach, pathway cards, and a closing CTA.

**Typography and colour (from the captures).** Warm cream page (`≈#F5F1EA`), near-black dark green bands
(`≈#0F2E24`), a transitional serif for all headings with italic accents, a neutral sans for body, 11–12 px uppercase
eyebrows with wide tracking, thin hairline card borders, 12–16 px radii, no drop shadows to speak of, very generous
section padding (≈120 px), and photography of real clients/attorneys throughout.

### 1.2 Adopt (as principles, re-expressed in our system)

1. **Editorial hierarchy**: eyebrow → serif heading → short lead → one action. Every section follows the same cadence.
2. **Section rhythm by surface, not by decoration**: alternating cream / white / dark-green bands do all the work.
3. **Hairline cards, large radii, no heavy shadows**: the card reads as paper, not as a SaaS tile.
4. **Service page as a guide**: jump links, a definition up top, prongs as numbered cards, numbered process, FAQ, a
   closing CTA, and a reviewer/author byline for E-E-A-T.
5. **Dark closing band** with a single large serif statement and one CTA.
6. **Mobile nav as a bordered panel** with grouped disclosures and the CTA inside the panel.
7. **Persistent conversion on mobile** (one floating action, not two).
8. **About page as an argument**: who we serve → how we work → who does the work → what we cannot control.

### 1.3 Do not copy

- No photography of people (repo rule) — we use the Open Horizons illustration language instead.
- No logo wall of employers, no "98 % approval", no "4,000+ cases", no "1 month to file-ready", no money-back guarantee,
  no "ex-USCIS officer review", no attorney network. Our proof is the verifiable Fiverr aggregate and verbatim reviews.
- No pricing cards or fee figures (repo rule).
- No inline lead form in the hero — our consultation flow lives on `/consultation`; the hero links to it.
- No italic accent words in headings (DM Serif Display ships no italic; faux-italic is not acceptable).
- No tabbed FAQ (needs JS); native `<details>` is enough and matches the repo's no-client-JS rule.

### 1.4 Differentiation risk — their palette is close to ours

Beyond Border is cream + deep green with a serif. So is Open Horizons. If we only swap tokens we produce a visual
sibling. The design therefore leans on what they do not have:

- **Terracotta** as the signature accent (numerals, rules, stars, eyebrows) and the **sunrise/door/path** motif in
  illustration; their accent is none.
- **DM Serif Display's high-contrast letterforms** at larger sizes vs their lighter transitional serif.
- **Pale Sage** as a third, cool surface, so section rhythm is ivory → white → sage → deep forest, not just
  cream/green.
- **Pill buttons and chips** (they use squared pills with 6 px radius).
- **Structured content modules** (key-facts panel, deliverables list, prong cards) that are ours.

## 2. Deel Immigration (deel.com/immigration)

**Observed.** H1 + two-line subline + one black pill CTA ("Book a consultation"), a G2 rating badge and four named
reviews immediately under the hero, three persona cards each with "Learn more", a dark coverage band, feature hub,
a "free visa assessment" soft offer, success stories, short FAQ, stats + final CTA. On mobile the CTA sits directly
under the H1, the rating badge is the first thing after the hero, persona cards stack full-width. No form on the page;
every action routes to one booking CTA.

**Adopt.** One primary CTA label used everywhere ("Book a free consultation"); rating badge directly after the hero
(our proof strip); persona routing cards (our "Who we help"); CTA repeated after the explainer, after proof, and at
the close; secondary offer as a softer CTA ("Got an RFE or NOID?" is ours — it is a real second intent, not a decoy).

**Do not copy.** Palette, product UI mock-ups, stat bands, cookie-wall patterns, the "free assessment" promise (we
have no tool; Phase 8 is optional and is a readiness checklist, not an assessment).

## 3. Self Petition USA (selfpetitionusa.com)

**Observed.** Three product tiers, a comparison table of deliverables, explicit "not included" rows (form filing),
separate RFE section with a three-step flow, three audience types (self-petitioners without a lawyer / with their own
lawyer / lawyers), review walls with platform badges and "Review source" links, pricing in cards and nav.

**Adopt.** The deliverables list phrased as what the client receives; the **package vs single deliverable**
distinction; stating plainly that the client (or their attorney) files; the "with your own attorney" audience; a
source link on every review; an RFE flow described as review → identify issues → respond point by point.

**Do not copy.** Pricing, success-rate / customer-count tiles, AI product framing, the gradient/blue SaaS style, Discord
community.

## 4. Summary of the design direction

Beyond Border's **structure** + Deel's **CTA discipline** + Self Petition USA's **service clarity**, rendered entirely
in the Open Horizons system (forest, terracotta, ivory, sage, DM Serif Display, Inter, the door-and-sunrise mark), with
every proof element limited to what the repository can verify.
