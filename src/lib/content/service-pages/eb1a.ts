import type { ServicePageContent } from "./types";

/**
 * EB-1A. Regulatory anchors: INA §203(b)(1)(A), 8 CFR 204.5(h), and the
 * two-step analysis from Kazarian v. USCIS, 596 F.3d 1115 (9th Cir. 2010).
 */
export const eb1a: ServicePageContent = {
  slug: "eb1a",
  name: "EB-1A",
  eyebrow: "Extraordinary Ability",
  headline: "EB-1A Extraordinary Ability petitions",
  subhead:
    "Criteria mapping, evidence selection, and petition drafting for applicants with sustained national or international acclaim — prepared for individuals and for law firms needing drafting capacity.",
  definition:
    "EB-1A is a U.S. employment-based immigrant category for individuals with extraordinary ability in the sciences, arts, education, business, or athletics. It requires sustained national or international acclaim and is a self-petition — no employer sponsorship or labor certification is required to file Form I-140.",
  metaTitle: "EB-1A Extraordinary Ability Green Card: Criteria & Evidence",
  metaDescription:
    "The EB-1A extraordinary-ability green card explained: the ten regulatory criteria, the Kazarian two-step test, evidence strategy, and the mistakes that draw RFEs.",
  keywords: [
    "EB1A",
    "EB-1A",
    "extraordinary ability visa",
    "EB-1A requirements",
    "EB-1A criteria",
    "EB1A green card",
    "EB-1A petition",
    "EB-1A evidence",
    "Kazarian",
  ],
  keyFacts: [
    { label: "Petition form", value: "Form I-140" },
    { label: "Employer sponsor", value: "Not required" },
    { label: "Labor certification", value: "Not required" },
    { label: "Preference category", value: "Employment-based first (EB-1)" },
    { label: "Criteria threshold", value: "3 of 10, or a major award" },
    { label: "Self-petition", value: "Yes" },
  ],
  toc: [
    { id: "what-is-eb1a", label: "What is EB-1A?" },
    { id: "criteria", label: "The ten regulatory criteria" },
    { id: "kazarian", label: "The two-step Kazarian analysis" },
    { id: "evidence", label: "Evidence strategy" },
    { id: "documents", label: "Required documents" },
    { id: "mistakes", label: "Common mistakes" },
    { id: "how-we-help", label: "How we help" },
    { id: "faqs", label: "Frequently asked questions" },
  ],
  sections: [
    {
      kind: "prose",
      id: "what-is-eb1a",
      eyebrow: "The basics",
      heading: "What is the EB-1A extraordinary ability category?",
      paragraphs: [
        "EB-1A sits in the first preference of the employment-based immigrant categories. It is reserved for individuals who can demonstrate extraordinary ability in the sciences, arts, education, business, or athletics — defined in the regulation as a level of expertise indicating that the person is one of that small percentage who have risen to the very top of the field of endeavour.",
        "Two features make it attractive. First, it is a self-petition: like the EB-2 NIW, no employer needs to sponsor you and no labor certification is required. Second, EB-1 is a higher-preference category than EB-2, which can matter considerably for applicants from countries where the second preference is heavily oversubscribed.",
        "The trade-off is the standard of proof. EB-2 NIW asks whether your proposed endeavour is nationally important. EB-1A asks a different question entirely: whether you have already achieved sustained national or international acclaim, and whether your achievements have been recognised in your field. It is a backward-looking test about your record, not a forward-looking test about your plans.",
        "You must also intend to continue working in your area of extraordinary ability in the United States. Unlike EB-1B and EB-1C, no job offer is required, but evidence of intended continued work in the field is expected.",
      ],
    },
    {
      kind: "criteria",
      id: "criteria",
      eyebrow: "The threshold test",
      heading: "The ten EB-1A regulatory criteria",
      intro: [
        "There are two ways to satisfy the evidentiary threshold. The first is a one-time achievement: a major, internationally recognised award. The regulation's own example is a Nobel Prize, and this route is genuinely rare.",
        "Everyone else must submit evidence meeting at least three of the ten criteria set out at 8 CFR 204.5(h)(3). Where these criteria do not readily apply to your occupation, the regulation permits comparable evidence to be submitted instead.",
      ],
      items: [
        {
          title: "Nationally or internationally recognised prizes or awards",
          body: "Receipt of lesser nationally or internationally recognised prizes or awards for excellence in the field. What matters is the selection standard: who is eligible, who judges, and how many are chosen. A student award or an internal company prize rarely carries the required recognition.",
        },
        {
          title: "Membership in associations requiring outstanding achievement",
          body: "Membership in associations that require outstanding achievements of their members, as judged by recognised national or international experts. Memberships obtained by paying a fee, or by holding a particular job title, do not satisfy this criterion.",
        },
        {
          title: "Published material about you",
          body: "Published material about you and your work in professional or major trade publications or other major media. The material must be about you, not merely mention you, and the outlet's circulation and standing need to be documented.",
        },
        {
          title: "Judging the work of others",
          body: "Participation, individually or on a panel, as a judge of the work of others in the same or an allied field. Peer review for journals, conference programme committees, grant review panels, and competition judging all fall here. Document the invitations and the completed work.",
        },
        {
          title: "Original contributions of major significance",
          body: "Original scientific, scholarly, artistic, athletic, or business-related contributions of major significance. This is the criterion most often claimed and most often found insufficient, because originality alone is not the test — the significance of the contribution to the wider field must be shown.",
        },
        {
          title: "Authorship of scholarly articles",
          body: "Authorship of scholarly articles in the field, in professional or major trade publications or other major media. Publication establishes dissemination; it is the citation and adoption record that establishes impact.",
        },
        {
          title: "Display of work at artistic exhibitions or showcases",
          body: "Display of your work at artistic exhibitions or showcases. Applicable primarily to applicants in the arts.",
        },
        {
          title: "Leading or critical role",
          body: "Evidence that you have performed in a leading or critical role for organisations or establishments that have a distinguished reputation. Both halves must be documented: the nature of your role, and the distinguished standing of the organisation.",
        },
        {
          title: "High salary or remuneration",
          body: "Evidence that you have commanded a high salary or other significantly high remuneration in relation to others in the field. This is argued against comparative wage data for the occupation and geography, not asserted.",
        },
        {
          title: "Commercial success in the performing arts",
          body: "Evidence of commercial successes in the performing arts, shown through box office receipts or record, cassette, compact disk, or video sales.",
        },
      ],
      callout: {
        title: "Three is a floor, not a finish line",
        body: "Meeting three criteria moves you to the second stage of the analysis. It does not establish eligibility on its own — a point that surprises many applicants and is explained below.",
      },
    },
    {
      kind: "prose",
      id: "kazarian",
      eyebrow: "How it is actually decided",
      heading: "The two-step Kazarian analysis",
      paragraphs: [
        "Following Kazarian v. USCIS, 596 F.3d 1115 (9th Cir. 2010), USCIS evaluates EB-1A petitions in two distinct stages, and understanding the split explains most otherwise-puzzling denials.",
        "At the first stage, the officer counts. Does the evidence submitted meet the plain language of at least three criteria? This is a threshold exercise, and the quality of the evidence is not weighed here beyond determining whether it satisfies each criterion.",
        "At the second stage — the final merits determination — the officer steps back and asks whether the record as a whole demonstrates sustained national or international acclaim and that you are among the small percentage at the very top of your field. This is a qualitative judgement about the totality of the evidence.",
        "The practical consequence is that a petition can satisfy four or five criteria on paper and still be denied at the final merits stage. Petitions that are assembled purely to tick criteria, without a coherent argument that the record as a whole demonstrates acclaim, are precisely the ones that fail here. A well-built EB-1A petition argues both stages explicitly.",
      ],
    },
    {
      kind: "subsections",
      id: "evidence",
      eyebrow: "Where cases are won",
      heading: "EB-1A evidence strategy",
      intro: [
        "Selecting which criteria to lead on is a strategic decision, not an administrative one. Claiming more criteria is not better if the additional ones are weak: each weak claim invites scrutiny and dilutes the impression the record creates at the final merits stage.",
      ],
      subsections: [
        {
          heading: "Choose depth over breadth",
          paragraphs: [
            "Three thoroughly documented criteria produce a stronger petition than six thinly evidenced ones. A criterion supported by a single ambiguous document does more harm than good — it signals to the adjudicator that the record was assembled to reach a count.",
          ],
        },
        {
          heading: "Original contributions need downstream evidence",
          paragraphs: [
            "This criterion fails more than any other because petitions describe what the applicant did without showing what changed as a result. The evidence that carries weight is downstream: independent citation of the work, adoption of the method by other groups, implementation in industry, licensing, or explicit reliance described by parties with no connection to the applicant.",
            "A description of the contribution, however well written, is not evidence of its significance. Documentation of its effect is.",
          ],
        },
        {
          heading: "Independent letters outweigh collaborator letters",
          paragraphs: [
            "Letters from supervisors, co-authors, and colleagues establish that people who know you regard you highly. Letters from independent experts who have never worked with you, and who can describe concretely how your work affected theirs, establish acclaim in the field. The second category is what this category is testing for.",
          ],
        },
        {
          heading: "Present citations in field context",
          paragraphs: [
            "Citation counts vary enormously between disciplines. A number presented without a comparative frame invites the adjudicator to supply their own. Independent citations should be separated from self-citations and co-author citations, and the totals should be positioned against what is typical for the specific subfield.",
          ],
        },
        {
          heading: "Document sustained acclaim, not a single peak",
          paragraphs: [
            "The regulation uses the word sustained. A record showing recognition concentrated in one period, with little since, invites the argument that acclaim was not maintained. Evidence spanning a period demonstrates the continuity the standard asks for.",
          ],
        },
      ],
    },
    {
      kind: "list",
      id: "documents",
      eyebrow: "What a filing contains",
      heading: "Required documents for an EB-1A petition",
      items: [
        {
          title: "Form I-140",
          body: "Filed by you as a self-petitioner. Confirm the current form edition and filing address on the official USCIS page before filing.",
        },
        {
          title: "Petition letter",
          body: "The central document: it establishes which criteria are claimed, maps evidence to each, and argues the final merits determination explicitly rather than leaving it to inference.",
        },
        {
          title: "Evidence for each claimed criterion",
          body: "Organised criterion by criterion, so an adjudicator assessing criterion four is not searching the whole exhibit set for the relevant material.",
        },
        {
          title: "Recommendation and expert opinion letters",
          body: "Ideally weighted towards independent authors with no employment or collaborative relationship to you.",
        },
        {
          title: "Evidence of intended continued work",
          body: "Documentation that you intend to continue working in your area of extraordinary ability in the United States — a job offer is not required, but the intent must be supported.",
        },
        {
          title: "Identity and status documents",
          body: "Passport biographic page and current U.S. immigration status documents where applicable.",
        },
        {
          title: "Exhibit index",
          body: "A numbered index tying every claim in the petition letter to the document that supports it.",
        },
      ],
    },
    {
      kind: "cta",
      title: "Not sure whether your record supports EB-1A?",
      body: "We assess your profile against all ten criteria and the final merits standard, and tell you honestly whether EB-1A, EB-2 NIW, or both are realistic for you today.",
      ctaLabel: "Book a free assessment",
    },
    {
      kind: "list",
      id: "mistakes",
      eyebrow: "What goes wrong",
      heading: "Common EB-1A mistakes",
      items: [
        {
          title: "Treating the criteria count as the whole test",
          body: "Assembling evidence to reach three criteria without arguing the final merits determination. This is the single most common structural failure, and it is the reason petitions meeting four or five criteria still get denied.",
        },
        {
          title: "Claiming weak criteria alongside strong ones",
          body: "Every claimed criterion is examined. A thin claim attracts scrutiny that spills over onto the rest of the petition and weakens the overall impression of the record.",
        },
        {
          title: "Confusing originality with significance",
          body: "Describing a contribution as novel is not the same as documenting that the field was affected by it. The regulation asks for contributions of major significance.",
        },
        {
          title: "Relying on membership and awards without selection criteria",
          body: "A certificate proves receipt. It does not establish that the award or membership required outstanding achievement — that requires documenting the selection standard.",
        },
        {
          title: "Letters that praise rather than describe",
          body: "Letters full of superlatives and short on specifics carry little weight. The useful letter identifies a problem, states what the applicant did, and describes the concrete consequence.",
        },
        {
          title: "Filing EB-1A when EB-2 NIW is the stronger argument",
          body: "The categories test different things. A record that is strong on national importance but light on acclaim will usually argue better as an NIW. Choosing the category before assessing the record is a costly error.",
        },
      ],
    },
    {
      kind: "prose",
      id: "how-we-help",
      eyebrow: "Working with us",
      heading: "How we prepare EB-1A petitions",
      paragraphs: [
        "Immigration Horizons is an immigration consulting and paralegal services practice. We are not attorneys and do not provide legal representation or legal advice. What we do is prepare petitions: mapping your record against the ten criteria, selecting which to lead on, drafting the petition letter and supporting letters from scratch, and organising exhibits criterion by criterion so the argument is followable.",
        "We work on full EB-1A packages and on single deliverables — a set of recommendation letters, an exhibit index, or an RFE response on a petition someone else prepared. We also act as additional drafting capacity for immigration attorneys and paralegals working to a deadline.",
      ],
    },
  ],
  faqs: [
    {
      question: "What is the EB-1A extraordinary ability category?",
      answer:
        "EB-1A is a U.S. employment-based immigrant category for individuals with extraordinary ability in the sciences, arts, education, business, or athletics. It requires sustained national or international acclaim, and is a self-petition — no employer sponsorship and no labor certification are required to file Form I-140.",
    },
    {
      question: "How many EB-1A criteria do I need to meet?",
      answer:
        "You need evidence meeting at least three of the ten criteria in 8 CFR 204.5(h)(3), unless you have received a one-time major internationally recognised award. Meeting three moves you past the threshold stage, but it does not by itself establish eligibility — the officer then makes a final merits determination on the record as a whole.",
    },
    {
      question: "Do I need a job offer or employer for EB-1A?",
      answer:
        "No. EB-1A is a self-petition and no employer sponsorship or labor certification is required. You must, however, be able to show that you intend to continue working in your area of extraordinary ability in the United States.",
    },
    {
      question: "What is the Kazarian two-step analysis?",
      answer:
        "Following Kazarian v. USCIS, USCIS first counts whether the evidence meets at least three regulatory criteria, then makes a separate final merits determination assessing whether the record as a whole demonstrates sustained acclaim and that the applicant is among the small percentage at the very top of the field. Both stages must be satisfied.",
    },
    {
      question: "Is EB-1A harder than EB-2 NIW?",
      answer:
        "They test different things rather than sitting on a single difficulty scale. EB-1A is backward-looking and asks whether you have already achieved sustained acclaim. EB-2 NIW is forward-looking and asks whether your proposed endeavour is nationally important and whether waiving the job offer requirement benefits the United States. Some records support both.",
    },
    {
      question: "Can I use comparable evidence if the criteria do not fit my field?",
      answer:
        "The regulation allows comparable evidence to be submitted where the listed criteria do not readily apply to the applicant's occupation. This provision needs to be argued explicitly — you must explain why the standard criteria are not applicable to your field before offering alternative evidence in their place.",
    },
    {
      question: "How many recommendation letters does an EB-1A petition need?",
      answer:
        "There is no required number, and quality matters far more than quantity. Letters from independent experts who have not worked with you generally carry more weight than letters from supervisors and co-authors, because the category is testing for recognition beyond your immediate circle.",
    },
    {
      question: "Can you help with an EB-1A RFE?",
      answer:
        "Yes, including on petitions we did not originally prepare. We review the notice, identify precisely which criteria or which part of the final merits determination the officer is questioning, and prepare a targeted response addressing those specific points with supporting evidence.",
    },
  ],
  faqTitle: "EB-1A frequently asked questions",
  faqDescription:
    "The questions we are asked most often about extraordinary ability eligibility, criteria, and evidence.",
  sources: [
    {
      label: "USCIS — Employment-Based Immigration: First Preference EB-1",
      href: "https://www.uscis.gov/working-in-the-united-states/permanent-workers/employment-based-immigration-first-preference-eb-1",
    },
    {
      label: "8 CFR 204.5(h) — Aliens of extraordinary ability",
      href: "https://www.ecfr.gov/current/title-8/chapter-I/subchapter-B/part-204/subpart-A/section-204.5",
    },
    { label: "USCIS — Form I-140", href: "https://www.uscis.gov/i-140" },
    {
      label: "USCIS — Check Case Processing Times",
      href: "https://egov.uscis.gov/processing-times/",
    },
    {
      label: "U.S. Department of State — Visa Bulletin",
      href: "https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin.html",
    },
  ],
  scopeNote:
    "This page is general educational information about the EB-1A extraordinary ability category, not legal advice about any individual case.",
};
