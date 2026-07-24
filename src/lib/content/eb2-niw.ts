import type { Faq } from "./faqs";

/**
 * Deep content for the EB-2 NIW resource page — the practice's primary
 * search target.
 *
 * Accuracy boundaries applied throughout (see CLAUDE.md):
 * - Regulatory statements are tied to the statute, the CFR, or the AAO's
 *   precedent decision in Matter of Dhanasar, 26 I&N Dec. 884 (AAO 2016).
 * - No processing times, filing fees, or approval rates. Those change and
 *   are case-specific; the page points to the official USCIS tools instead.
 * - Nothing is phrased as advice about an individual case. This describes
 *   the framework USCIS applies, not what any reader should do.
 */

export type Paragraphs = string[];

export type Criterion = {
  title: string;
  body: string;
};

export const eb2NiwMeta = {
  title: "EB-2 NIW: Complete Guide to the National Interest Waiver",
  metaTitle: "EB-2 NIW Petition Preparation | National Interest Waiver Guide",
  metaDescription:
    "Complete guide to the EB-2 National Interest Waiver: Dhanasar eligibility, evidence strategy, required documents, USCIS process, and common mistakes. Petition preparation by Immigration Horizons.",
  heroHeadline: "EB-2 National Interest Waiver (NIW)",
  heroSubhead:
    "The complete guide to eligibility, evidence, and petition strategy — plus how we prepare NIW cases for professionals and law firms worldwide.",
  /** ~55 words, standalone, positioned for featured-snippet capture. */
  definition:
    "The EB-2 National Interest Waiver (NIW) is a U.S. employment-based immigrant petition that allows a qualified applicant to request USCIS waive the standard job offer and labor certification requirements. Because those requirements can be waived, the EB-2 NIW is a self-petition — no employer sponsorship is needed, and the applicant files Form I-140 on their own behalf.",
};

export const keyFacts = [
  { label: "Petition form", value: "Form I-140" },
  { label: "Employer sponsor", value: "Not required" },
  { label: "Labor certification (PERM)", value: "Waived" },
  { label: "Preference category", value: "Employment-based second (EB-2)" },
  { label: "Legal framework", value: "Matter of Dhanasar (AAO 2016)" },
  { label: "Self-petition", value: "Yes" },
];

/** Section 1 — What it is */
export const whatItIs: Paragraphs = [
  "Employment-based immigration to the United States normally requires an employer. The employer tests the U.S. labor market through the PERM labor certification process, demonstrates that no qualified U.S. worker is available, and then petitions on the worker's behalf. That process ties the applicant to a specific job and a specific sponsor.",
  "The National Interest Waiver is an exception written into the second-preference employment category. Under section 203(b)(2)(B) of the Immigration and Nationality Act, the Secretary of Homeland Security may waive the job offer requirement — and with it the labor certification requirement — when doing so is in the national interest of the United States.",
  "The practical consequence is significant. Because there is no job offer requirement to satisfy, there is no employer to sponsor you, no PERM recruitment to run, and no position you are locked into. You file Form I-140 yourself, on your own behalf, arguing your own case. This is why the EB-2 NIW is attractive to researchers, founders, physicians, and engineers whose work does not fit neatly into a single employer-sponsored role.",
  "It is also why NIW petitions are argued rather than simply documented. An employer-sponsored petition largely asks whether the applicant meets the requirements of a defined job. An NIW petition asks a broader question: is what this person intends to do important enough to the country that the United States should set aside its normal protections for the domestic labor market? That is a persuasive question, and it is won or lost on how well the evidence is assembled.",
];

/** Section 2 — Benefits */
export const benefits: Criterion[] = [
  {
    title: "No employer sponsor required",
    body: "You petition for yourself. You are not dependent on an employer's willingness to sponsor, their immigration budget, their timeline, or their continued existence. For founders, independent researchers, and consultants, this is often the deciding factor.",
  },
  {
    title: "No PERM labor certification",
    body: "The labor certification process — including the recruitment steps and prevailing wage determination — is waived entirely. This removes an entire procedural stage from the front of the process.",
  },
  {
    title: "Job flexibility",
    body: "Because the petition is not tied to a specific position with a specific employer, you retain far more freedom to change roles, employers, or the structure of your work, provided you continue to work in the area of the endeavor you described.",
  },
  {
    title: "Family included",
    body: "Your spouse and unmarried children under 21 may generally be included as derivative beneficiaries on the same petition family, rather than requiring separate qualifying petitions of their own.",
  },
  {
    title: "Concurrent filing where a visa number is available",
    body: "If a visa number is available for your priority date and country of chargeability, you may be able to file the adjustment of status application alongside or after the I-140, depending on your circumstances. The Department of State Visa Bulletin is the authority on availability.",
  },
  {
    title: "Open to a wide range of fields",
    body: "Dhanasar explicitly contemplates endeavors in business, entrepreneurship, science, technology, culture, health, and education. It is not an academic-only category, and it does not require a research position.",
  },
];

/** Section 3 — Step one eligibility: qualifying for EB-2 itself */
export const advancedDegreeRoute: Paragraphs = [
  "Under 8 CFR 204.5(k)(2), an advanced degree means any U.S. academic or professional degree above the baccalaureate level, or a foreign equivalent degree. A master's, a professional doctorate, or a PhD satisfies this directly.",
  "The regulation also provides an equivalence: a U.S. baccalaureate degree or foreign equivalent, followed by at least five years of progressive post-baccalaureate experience in the specialty, is considered the equivalent of a master's degree. The word doing the work in that sentence is progressive — the experience must show increasing responsibility, scope, or expertise over time, not five years of the same role.",
  "Foreign degrees generally require a credential evaluation establishing U.S. equivalence. A three-year bachelor's degree from some education systems may not evaluate as a U.S. four-year baccalaureate, which is a common and avoidable problem discovered late in the process.",
];

export const exceptionalAbilityRoute: Paragraphs = [
  "The alternative route is exceptional ability in the sciences, arts, or business. The regulation defines this as a degree of expertise significantly above that ordinarily encountered in the field — a meaningfully higher bar than competence, though lower than the sustained national or international acclaim EB-1A demands.",
  "Under 8 CFR 204.5(k)(3)(ii), you must submit evidence meeting at least three of the following six criteria. Meeting three is the threshold to be considered, not an automatic qualification: USCIS then evaluates the evidence as a whole to decide whether it actually demonstrates exceptional ability.",
];

export const exceptionalAbilityCriteria: Criterion[] = [
  {
    title: "Academic record",
    body: "An official academic record showing a degree, diploma, certificate, or similar award from a college, university, school, or other institution of learning relating to the area of exceptional ability.",
  },
  {
    title: "Ten years of experience",
    body: "Letters documenting at least ten years of full-time experience in the occupation, typically from current or former employers.",
  },
  {
    title: "Licence or certification",
    body: "A licence to practise the profession, or a certification for the particular profession or occupation.",
  },
  {
    title: "Salary demonstrating exceptional ability",
    body: "Evidence that you have commanded a salary, or other remuneration for services, that demonstrates exceptional ability. This is normally argued against comparative wage data for the field and location.",
  },
  {
    title: "Professional memberships",
    body: "Membership in professional associations. Weight depends heavily on whether membership requires demonstrated achievement or simply payment of a fee.",
  },
  {
    title: "Recognition for achievements",
    body: "Recognition for achievements and significant contributions to the industry or field, from peers, government entities, or professional or business organisations.",
  },
];

/** Section 4 — The Dhanasar framework */
export const dhanasarIntro: Paragraphs = [
  "Meeting the EB-2 requirement is the entry ticket. It is not the case. The petition itself is decided under the three-prong framework the Administrative Appeals Office set out in Matter of Dhanasar, 26 I&N Dec. 884 (AAO 2016), which replaced the earlier NYSDOT standard.",
  "All three prongs must be satisfied. They are assessed together on the record you submit, and the most common reason a well-credentialed applicant receives a Request for Evidence is that the petition documented the person thoroughly while barely arguing the endeavor.",
];

export const dhanasarProngs = [
  {
    number: "1",
    label: "Prong one",
    title: "The proposed endeavor has substantial merit and national importance",
    body: [
      "These are two distinct tests inside one prong, and they fail for different reasons.",
      "Substantial merit is the more forgiving of the two. Dhanasar expressly contemplates merit in business, entrepreneurship, science, technology, culture, health, and education. The endeavor does not need to produce immediate economic benefit — research with clear potential to advance a field can qualify.",
      "National importance is where petitions are more often lost. The test is not how large your employer is, how prestigious your institution is, or how many people work in your industry. It is about the prospective impact of the specific endeavor you describe. Work confined to a single company's internal operations, or benefiting only a local area, tends to struggle here — even when the work is genuinely excellent.",
      "This is why the endeavor must be defined precisely before anything else is drafted. A vague endeavor cannot be assessed for national importance, and a vague endeavor is what an adjudicator sees when a petition simply describes a job title.",
    ],
  },
  {
    number: "2",
    label: "Prong two",
    title: "You are well positioned to advance the proposed endeavor",
    body: [
      "This prong shifts from the endeavor to you. Dhanasar directs adjudicators to consider your education, skills, knowledge, and record of success in related efforts; a model or plan for future activities; any progress towards achieving the endeavor; and the interest of potential customers, users, investors, or other relevant entities.",
      "One point is frequently misunderstood and worth stating plainly: this prong does not require you to prove the endeavor will succeed. Dhanasar is explicit that a petitioner need not demonstrate that the endeavor is more likely than not to ultimately succeed. What must be shown is that you are well positioned to advance it.",
      "In practice this prong rewards documented traction over stated intention. Citations of your work by independent researchers, adoption of your methods by others, funding awarded to your project, letters from parties who have no relationship to you but rely on your work — these carry considerably more weight than a description of what you plan to do next.",
    ],
  },
  {
    number: "3",
    label: "Prong three",
    title:
      "On balance, it benefits the United States to waive the job offer requirement",
    body: [
      "The third prong asks whether it is beneficial to the United States to waive the job offer and labor certification requirements — and it is the prong most often treated as an afterthought.",
      "Dhanasar identifies factors relevant here: whether, in light of the nature of your qualifications or the proposed endeavor, it would be impractical either for you to secure a job offer or for you to obtain a labor certification; whether, even assuming other qualified U.S. workers are available, the United States would still benefit from your contributions; and whether the national interest in your contributions is sufficiently urgent to warrant forgoing the labor certification process.",
      "Note the second factor carefully. It anticipates the obvious objection — that qualified U.S. workers exist — and asks whether the benefit stands regardless. A petition that ignores this factor leaves the strongest counterargument against it unanswered.",
      "Self-employment, entrepreneurship, and work that is inherently self-directed tend to argue well under this prong, because the impracticality of the labor certification route follows naturally from the nature of the work.",
    ],
  },
];

/** Section 5 — Required documents */
export const requiredDocuments: Criterion[] = [
  {
    title: "Form I-140, Immigrant Petition for Alien Worker",
    body: "The petition itself, filed by you as a self-petitioner. Always check the current edition and filing address on the official USCIS form page before filing — both change.",
  },
  {
    title: "Petition letter",
    body: "The central document of the filing. It sets out the proposed endeavor, argues each Dhanasar prong in turn, and directs the adjudicator to the specific exhibits supporting each claim.",
  },
  {
    title: "Proof of the EB-2 qualification",
    body: "Degree certificates and transcripts, plus a credential evaluation for foreign degrees. If qualifying through the bachelor's-plus-five-years route, employment letters establishing the progressive nature of the experience.",
  },
  {
    title: "Personal statement or endeavor plan",
    body: "A clear articulation of what you intend to do in the United States, why it matters beyond your own career, and how you intend to carry it forward.",
  },
  {
    title: "Recommendation and expert opinion letters",
    body: "Letters from people positioned to speak to your work, ideally including independent authors with no employment or supervisory relationship to you.",
  },
  {
    title: "Evidence of impact",
    body: "Publications, citation reports, patents, funding awards, adoption of your work by others, media coverage, awards, and comparable documentation of the record you are relying on.",
  },
  {
    title: "Identity and status documents",
    body: "Passport biographic page, and current U.S. immigration status documents where applicable.",
  },
  {
    title: "Exhibit index",
    body: "A tabbed, numbered index mapping every claim in the petition letter to the document that supports it. Not formally required — consistently valuable.",
  },
];

/** Section 6 — Evidence strategy */
export const evidenceStrategy: { title: string; body: Paragraphs }[] = [
  {
    title: "Recommendation letters",
    body: [
      "Letters are the most misused evidence type in NIW filings. The common failure is volume over substance: eight letters from co-authors and supervisors, all describing the applicant as excellent, none explaining what changed in the field because of the applicant's work.",
      "Independent letters carry disproportionate weight. A letter from someone who has never worked with you, has no incentive to help you, and can nonetheless describe how your work affected theirs is worth more than several letters from close collaborators.",
      "The strongest letters are specific. They identify a problem, explain what the applicant did about it, and describe the concrete consequence — a method adopted, a system deployed, a result relied upon. Adjectives are not evidence.",
    ],
  },
  {
    title: "Publications and citations",
    body: [
      "Publications establish that work was disseminated. Citations establish that others found it useful. The second matters more, and a citation report should be presented in context: what is a strong citation count in your specific subfield, and where does yours sit relative to that?",
      "Raw totals without field context invite an adjudicator to draw their own conclusion. Independent citations — excluding self-citations and those from co-authors — should be separated out, because that distinction will be drawn anyway.",
    ],
  },
  {
    title: "Peer review and editorial work",
    body: [
      "Reviewing for journals or conferences, or serving on programme committees, evidences that your field regards you as qualified to judge others' work. Document the invitations and completed reviews, not merely a claim of reviewer status.",
    ],
  },
  {
    title: "Patents and commercialised work",
    body: [
      "A granted patent shows novelty. It does not, on its own, show impact — many patents are never used. Where a patent has been licensed, implemented, or built upon, that downstream fact is the evidence that matters, and it should be documented directly.",
    ],
  },
  {
    title: "Funding, grants, and investment",
    body: [
      "Competitive funding is strong prong-two evidence: an independent body assessed the work and committed resources to it. Document the competitiveness of the award, your specific role in securing it, and what the funding is being used to do.",
    ],
  },
  {
    title: "Media coverage",
    body: [
      "Coverage of your work in credible outlets can support both merit and importance. Coverage in outlets that publish paid placements is easily identified as such and can weaken an otherwise strong filing by association. Prefer fewer, more credible items.",
    ],
  },
  {
    title: "Awards and professional memberships",
    body: [
      "For both, the evidence is the selection standard, not the certificate. Who is eligible, who decides, how many are chosen, and on what basis? An award with a documented competitive process supports the case; an award with no discoverable criteria adds little and consumes an adjudicator's attention.",
    ],
  },
];

/** Section 7 — Process */
export const processStages: Criterion[] = [
  {
    title: "Define the proposed endeavor",
    body: "Before any drafting, the endeavor is defined with enough precision that its national importance can be assessed. This single step drives the entire petition.",
  },
  {
    title: "Assess and map the evidence",
    body: "Your existing record is mapped against all three Dhanasar prongs to identify which prong is currently weakest — that is where the work is needed.",
  },
  {
    title: "Gather targeted evidence",
    body: "You receive a specific list of what to obtain and what each item must demonstrate, rather than a generic checklist.",
  },
  {
    title: "Draft the petition",
    body: "The petition letter, personal statement or endeavor plan, and recommendation and expert opinion letters are drafted so that each argues its part of the case without contradicting the others.",
  },
  {
    title: "Assemble and index exhibits",
    body: "Evidence is organised and indexed so every claim in the petition letter maps to a numbered exhibit an adjudicator can locate immediately.",
  },
  {
    title: "File Form I-140",
    body: "The completed package is prepared for submission to USCIS. Filing addresses, form editions, and fees are confirmed against the official USCIS page at the time of filing.",
  },
  {
    title: "Respond to an RFE or NOID if one issues",
    body: "If USCIS requests further evidence, the response addresses the specific concerns the officer raised, rather than resubmitting the original filing with more material attached.",
  },
  {
    title: "Adjustment of status or consular processing",
    body: "Once the I-140 is approved and a visa number is available for your priority date and country of chargeability, the case proceeds by adjustment of status inside the United States or consular processing abroad.",
  },
];

/** Section 8 — Common mistakes */
export const commonMistakes: Criterion[] = [
  {
    title: "Describing a job instead of an endeavor",
    body: "The most frequent structural error. A petition that says the applicant will 'work as a senior data scientist at a technology company' has described employment. Prong one requires a defined endeavor whose prospective impact can be assessed nationally.",
  },
  {
    title: "Documenting the person, arguing nothing",
    body: "Extensive credentials assembled without an explicit argument for each prong. Adjudicators are not obliged to construct your case from a pile of exhibits, and an RFE is the predictable result.",
  },
  {
    title: "Treating prong three as a formality",
    body: "Two paragraphs restating prongs one and two. Prong three asks a distinct question — whether waiving the job offer requirement is itself beneficial — and it needs its own argument.",
  },
  {
    title: "Relying entirely on close-collaborator letters",
    body: "Letters exclusively from supervisors and co-authors invite the reading that no one outside your immediate circle has noticed the work.",
  },
  {
    title: "Presenting citation counts without field context",
    body: "A number with no comparative frame cannot be evaluated. Field-normalised context is what makes the number meaningful.",
  },
  {
    title: "Inconsistency across documents",
    body: "When the petition letter, the personal statement, and the recommendation letters describe the endeavor differently, the inconsistency undermines all three. Internal consistency is checked for exactly this reason.",
  },
  {
    title: "Unindexed exhibits",
    body: "A large evidence set with no index forces an adjudicator to search for support that may well be present. Evidence that cannot be found is functionally evidence that was not submitted.",
  },
  {
    title: "Overstating the record",
    body: "Describing work as more significant than the documentation supports is both counterproductive and serious. Misrepresentation carries consequences for the applicant, and adjudicators read a great many petitions.",
  },
];

/** Section 9 — FAQs. Rendered on-page and serialised into FAQPage schema. */
export const eb2NiwFaqs: Faq[] = [
  {
    question: "What is the EB-2 NIW?",
    answer:
      "The EB-2 National Interest Waiver is a U.S. employment-based immigrant petition that allows a qualified applicant to ask USCIS to waive the standard job offer and labor certification requirements. Because those requirements can be waived, it is a self-petition — the applicant files Form I-140 on their own behalf without an employer sponsor.",
  },
  {
    question: "Do I need a job offer or employer to file an EB-2 NIW?",
    answer:
      "No. Waiving the job offer requirement is the defining feature of the National Interest Waiver, which is what makes it a self-petition. You do not need an employer to sponsor you, and you are not tied to a specific position. You do need to continue working in the area of the endeavor described in your petition.",
  },
  {
    question: "What are the three Dhanasar prongs?",
    answer:
      "Under Matter of Dhanasar, USCIS asks three questions: whether the proposed endeavor has both substantial merit and national importance; whether the applicant is well positioned to advance that endeavor; and whether, on balance, it would benefit the United States to waive the job offer and labor certification requirements. All three must be satisfied.",
  },
  {
    question: "Do I need a PhD to qualify for an EB-2 NIW?",
    answer:
      "No. You must meet the underlying EB-2 requirement, which can be satisfied by an advanced degree, by a bachelor's degree plus at least five years of progressive post-baccalaureate experience in the specialty, or by demonstrating exceptional ability under the six regulatory criteria. A PhD is one route among several, and it is not required.",
  },
  {
    question: "Can entrepreneurs and business founders qualify?",
    answer:
      "Yes. Matter of Dhanasar expressly contemplates endeavors in business and entrepreneurship, and the case itself did not involve a traditional academic researcher. Self-directed work can argue particularly well under the third prong, because the impracticality of obtaining a labor certification follows naturally from the nature of the work.",
  },
  {
    question: "Does the EB-2 NIW require me to prove my work will succeed?",
    answer:
      "No, and Dhanasar is explicit on this point: a petitioner need not demonstrate that the proposed endeavor is more likely than not to ultimately succeed. The second prong asks whether you are well positioned to advance the endeavor, which is assessed through your record, your skills, documented progress, and interest from relevant parties.",
  },
  {
    question: "How many recommendation letters should an EB-2 NIW include?",
    answer:
      "There is no required number, and quality matters far more than quantity. Letters from independent authors who have no employment or collaborative relationship with you generally carry more weight than letters from supervisors and co-authors, because they show the work has been noticed beyond your immediate circle.",
  },
  {
    question: "What happens if my EB-2 NIW receives an RFE?",
    answer:
      "A Request for Evidence means the officer needs more information on specific points before deciding, not that the petition has been denied. The response should address precisely what was raised, with targeted supporting evidence. We prepare RFE responses regularly, including for petitions originally filed by someone else.",
  },
  {
    question: "How long does an EB-2 NIW take, and what does it cost?",
    answer:
      "USCIS processing times change continuously and vary by service centre and case type, so we will not publish a figure we cannot stand behind. The authoritative sources are the official USCIS processing times tool and the USCIS fee schedule. Our own scope and cost depend on the state of your evidence, which we assess at the consultation.",
  },
  {
    question: "Can I file an EB-2 NIW while I am outside the United States?",
    answer:
      "Yes. Form I-140 can be filed from abroad, and we work with international clients as a matter of routine. Once the petition is approved and a visa number is available for your priority date and country of chargeability, the case proceeds through consular processing rather than adjustment of status.",
  },
  {
    question: "Is the EB-2 NIW easier than EB-1A?",
    answer:
      "They are different arguments rather than different difficulty levels. EB-1A requires sustained national or international acclaim evidenced against ten regulatory criteria. EB-2 NIW has a lower acclaim threshold but requires you to establish that your specific endeavor is nationally important and that waiving the job offer requirement benefits the United States. Some profiles genuinely support both.",
  },
  {
    question: "Can Immigration Horizons guarantee my EB-2 NIW will be approved?",
    answer:
      "No, and you should be cautious of anyone who says otherwise. USCIS adjudicates every petition on its own record and no preparer controls that outcome. What we control is the quality of the argument, the strength and organisation of the evidence, and the internal consistency of the filing. Our completed-case history and client reviews are public so you can assess the work itself.",
  },
];

/** Official sources cited on the page. External authority links support EEAT. */
export const officialSources = [
  {
    label: "USCIS — Employment-Based Immigration: Second Preference EB-2",
    href: "https://www.uscis.gov/working-in-the-united-states/permanent-workers/employment-based-immigration-second-preference-eb-2",
  },
  {
    label: "Matter of Dhanasar, 26 I&N Dec. 884 (AAO 2016)",
    href: "https://www.justice.gov/eoir/page/file/920996/download",
  },
  {
    label: "USCIS — Form I-140",
    href: "https://www.uscis.gov/i-140",
  },
  {
    label: "USCIS — Check Case Processing Times",
    href: "https://egov.uscis.gov/processing-times/",
  },
  {
    label: "U.S. Department of State — Visa Bulletin",
    href: "https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin.html",
  },
];

/** Table of contents. Ids must match the section element ids on the page. */
export const tableOfContents = [
  { id: "what-is-eb2-niw", label: "What is the EB-2 NIW?" },
  { id: "benefits", label: "Benefits of the EB-2 NIW" },
  { id: "eligibility", label: "Eligibility: qualifying for EB-2" },
  { id: "dhanasar", label: "The Dhanasar three-prong test" },
  { id: "documents", label: "Required documents" },
  { id: "evidence", label: "Evidence strategy" },
  { id: "process", label: "The USCIS process" },
  { id: "mistakes", label: "Common mistakes" },
  { id: "how-we-help", label: "How we help" },
  { id: "faqs", label: "Frequently asked questions" },
];
