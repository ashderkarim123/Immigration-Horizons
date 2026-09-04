import type { ServicePageContent } from "./types";

/** EB-1B. Regulatory anchors: INA §203(b)(1)(B) and 8 CFR 204.5(i). */
export const eb1b: ServicePageContent = {
  slug: "eb1b",
  name: "EB-1B",
  eyebrow: "Outstanding Professor or Researcher",
  headline: "EB-1B Outstanding Professor & Researcher petitions",
  subhead:
    "Petition preparation for academics and industry researchers with international recognition — including the employer-side documentation this category requires.",
  definition:
    "EB-1B is a U.S. employment-based immigrant category for outstanding professors and researchers who are internationally recognised in a specific academic area. It requires at least three years of teaching or research experience in that area and a qualifying job offer from a U.S. employer, who files Form I-140 on the applicant's behalf.",
  metaTitle: "EB-1B Outstanding Professor & Researcher Petitions",
  metaDescription:
    "The EB-1B outstanding professor or researcher green card: the six regulatory criteria, employer requirements, qualifying positions, and evidence strategy.",
  keywords: [
    "EB1B",
    "EB-1B",
    "outstanding professor",
    "outstanding researcher",
    "EB-1B requirements",
    "EB-1B criteria",
    "EB1B green card",
    "EB-1B petition",
  ],
  keyFacts: [
    { label: "Petition form", value: "Form I-140" },
    { label: "Employer sponsor", value: "Required" },
    { label: "Labor certification", value: "Not required" },
    { label: "Preference category", value: "Employment-based first (EB-1)" },
    { label: "Criteria threshold", value: "2 of 6" },
    { label: "Minimum experience", value: "3 years teaching or research" },
  ],
  toc: [
    { id: "what-is-eb1b", label: "What is EB-1B?" },
    { id: "requirements", label: "The three core requirements" },
    { id: "criteria", label: "The six regulatory criteria" },
    { id: "employer", label: "Employer and position requirements" },
    { id: "evidence", label: "Evidence strategy" },
    { id: "mistakes", label: "Common mistakes" },
    { id: "how-we-help", label: "How we help" },
    { id: "faqs", label: "Frequently asked questions" },
  ],
  sections: [
    {
      kind: "prose",
      id: "what-is-eb1b",
      eyebrow: "The basics",
      heading: "What is the EB-1B outstanding professor or researcher category?",
      paragraphs: [
        "EB-1B sits alongside EB-1A in the first employment-based preference, but it is built for a different situation. Where EB-1A is a self-petition for individuals with acclaim across a broad range of fields, EB-1B is specifically for academics and researchers, and it requires an employer.",
        "The trade-off is deliberate. Because an employer is sponsoring you into a defined position, the evidentiary bar is lower than EB-1A's: you must show international recognition as outstanding in your academic area, rather than sustained acclaim placing you among the very top of your field. You need evidence meeting two of six criteria rather than three of ten.",
        "Like EB-1A and EB-2 NIW, no labor certification is required. The employer petitions directly, which removes the PERM recruitment process from the front of the case while still tying the petition to a specific qualifying position.",
        "For university faculty and research staff who have an offer in hand, EB-1B is frequently the strongest available route — and it is regularly overlooked by applicants who assume EB-1A is the only first-preference option.",
      ],
    },
    {
      kind: "list",
      id: "requirements",
      eyebrow: "Eligibility",
      heading: "The three core EB-1B requirements",
      intro: [
        "All three must be satisfied. The first two concern you; the third concerns the position and the employer.",
      ],
      items: [
        {
          title: "International recognition as outstanding",
          body: "You must be recognised internationally as outstanding in a specific academic area. The recognition must be international in scope, and it must attach to a defined academic area rather than to general professional competence.",
        },
        {
          title: "At least three years of teaching or research experience",
          body: "Three years of experience in teaching or research in that academic area. Experience gained while pursuing an advanced degree can count where the applicant had full responsibility for the classes taught, or where the research is recognised as outstanding.",
        },
        {
          title: "A qualifying job offer",
          body: "An offer of employment for a tenured or tenure-track teaching position, a comparable research position at a university or institution of higher education, or a comparable research position with a private employer that meets the additional conditions described below.",
        },
      ],
    },
    {
      kind: "criteria",
      id: "criteria",
      eyebrow: "The evidentiary test",
      heading: "The six EB-1B regulatory criteria",
      intro: [
        "You must submit evidence meeting at least two of the six criteria set out at 8 CFR 204.5(i)(3)(i). As with EB-1A, satisfying the count is a threshold: the officer then assesses whether the record as a whole establishes international recognition as outstanding.",
      ],
      items: [
        {
          title: "Major prizes or awards for outstanding achievement",
          body: "Receipt of major prizes or awards for outstanding achievement in the academic field. Document the selection standard — eligibility, judging body, and how many are chosen — not just the certificate.",
        },
        {
          title: "Membership in associations requiring outstanding achievement",
          body: "Membership in associations that require their members to demonstrate outstanding achievements. Fee-based or automatic memberships do not satisfy this criterion.",
        },
        {
          title: "Published material about your work by others",
          body: "Published material in professional publications written by others about your work in the academic field. The material must be about your work, and the authorship must be independent of you.",
        },
        {
          title: "Judging the work of others",
          body: "Participation, either individually or on a panel, as the judge of the work of others in the same or an allied academic field. Journal peer review, conference programme committees, and grant panels all fall here — document invitations and completed reviews.",
        },
        {
          title: "Original scientific or scholarly research contributions",
          body: "Original scientific or scholarly research contributions to the academic field. As in EB-1A, the evidence that carries weight is downstream: independent citation, adoption by other groups, or documented reliance on the work.",
        },
        {
          title: "Authorship of scholarly books or articles",
          body: "Authorship of scholarly books or articles in the academic field, in scholarly journals with international circulation. The international circulation of the venue is part of what must be documented.",
        },
      ],
      callout: {
        title: "Two of six is the threshold, not the conclusion",
        body: "As with EB-1A, meeting the required number of criteria advances the petition to a qualitative assessment of the record as a whole. A petition that documents two criteria thinly and argues nothing further is vulnerable even where the count is technically satisfied.",
      },
    },
    {
      kind: "subsections",
      id: "employer",
      eyebrow: "The sponsor side",
      heading: "Employer and position requirements",
      intro: [
        "EB-1B is unusual in that a meaningful part of the petition concerns the employer rather than the applicant. This half of the case is frequently under-prepared.",
      ],
      subsections: [
        {
          heading: "Qualifying academic positions",
          paragraphs: [
            "A tenured or tenure-track teaching position at a university or institution of higher education qualifies, as does a comparable research position at such an institution. The word comparable is doing real work here: the position should be permanent in nature, meaning it has no defined term or is expected to continue, rather than being a fixed-term appointment.",
            "Postdoctoral appointments with a defined end date frequently fail this test. Where a postdoc is being used as the qualifying offer, the permanence of the position needs to be addressed directly rather than assumed.",
          ],
        },
        {
          heading: "Qualifying private-employer positions",
          paragraphs: [
            "A comparable research position with a private employer can qualify, but the regulation imposes additional conditions: the employer must employ at least three full-time researchers, and must have documented accomplishments in the academic field.",
            "Both conditions require evidence from the employer — organisational documentation of the research staff, and documentation of the department's or company's research accomplishments. This is not something the applicant can supply alone.",
          ],
        },
        {
          heading: "What the employer must provide",
          paragraphs: [
            "In practice the employer's contribution includes the offer letter describing the permanent nature of the position, documentation of the institution's or department's standing, and — for private employers — evidence of research staffing and accomplishments.",
            "Where we are engaged on an EB-1B, we typically prepare a specific document request for the employer's HR or faculty affairs contact, because the internal person handling it is often doing so for the first time.",
          ],
        },
      ],
    },
    {
      kind: "cta",
      title: "Have an offer and want to know if it qualifies?",
      body: "We assess both halves of an EB-1B — your record against the six criteria, and whether the position and employer meet the regulatory conditions — before any drafting begins.",
      ctaLabel: "Book a free assessment",
    },
    {
      kind: "subsections",
      id: "evidence",
      eyebrow: "Where cases are won",
      heading: "EB-1B evidence strategy",
      subsections: [
        {
          heading: "Establish that the recognition is international",
          paragraphs: [
            "The standard is international recognition, and a record demonstrating standing only within one country or one institution is the most common substantive weakness. Evidence with international reach — citations from researchers in multiple countries, invited talks abroad, international collaborations, editorial or review work for internationally circulated journals — speaks directly to the statutory language.",
          ],
        },
        {
          heading: "Define the academic area precisely",
          paragraphs: [
            "Recognition must attach to a specific academic area. Defining that area too broadly makes the recognition look thin relative to the field; defining it too narrowly invites the argument that the area is not a recognised field at all. Getting this framing right is one of the more consequential drafting decisions in an EB-1B.",
          ],
        },
        {
          heading: "Independent letters, again",
          paragraphs: [
            "Letters from researchers at other institutions, in other countries, who have no collaborative history with you, are the most direct evidence of international recognition available. Letters from your department head and co-authors establish something different and less useful to this category.",
          ],
        },
        {
          heading: "Citation evidence in field context",
          paragraphs: [
            "Citation counts should be presented with field-normalised context and with independent citations separated from self-citations and co-author citations. In academic categories this distinction is examined closely.",
          ],
        },
      ],
    },
    {
      kind: "list",
      id: "mistakes",
      eyebrow: "What goes wrong",
      heading: "Common EB-1B mistakes",
      items: [
        {
          title: "Using a fixed-term postdoc as the qualifying offer",
          body: "Positions with a defined end date frequently fail the permanence expectation for a comparable research position. Where a postdoc is the offer, permanence must be addressed head-on, not glossed over.",
        },
        {
          title: "Under-documenting the employer side",
          body: "Especially for private employers, where the three-full-time-researchers condition and documented research accomplishments both require employer-supplied evidence that nobody thinks to gather until late.",
        },
        {
          title: "Evidence that shows national, not international, recognition",
          body: "Strong standing within one country does not meet a standard that expressly requires international recognition.",
        },
        {
          title: "Defining the academic area loosely",
          body: "A vague or shifting definition of the academic area makes the recognition harder to assess and easier to question.",
        },
        {
          title: "Filing EB-1B without checking EB-1A and EB-2 NIW",
          body: "Many researchers qualify under more than one category. Choosing before assessing forecloses options that may have been stronger.",
        },
        {
          title: "Treating two criteria as sufficient on its own",
          body: "Meeting the count without arguing that the record demonstrates international recognition as outstanding leaves the qualitative assessment unaddressed.",
        },
      ],
    },
    {
      kind: "prose",
      id: "how-we-help",
      eyebrow: "Working with us",
      heading: "How we prepare EB-1B petitions",
      paragraphs: [
        "Immigration Horizons is an immigration consulting and paralegal services practice. We are not attorneys and do not provide legal representation or legal advice. On EB-1B cases we prepare the petition letter, draft recommendation and expert opinion letters, package publication and citation evidence, and prepare the document request that the sponsoring employer needs to respond to.",
        "Because EB-1B is employer-sponsored, we frequently work alongside a university's faculty affairs office or an employer's counsel, and we are comfortable operating as additional drafting capacity within that structure rather than as the sole party on the case.",
      ],
    },
  ],
  faqs: [
    {
      question: "What is the EB-1B outstanding professor or researcher category?",
      answer:
        "EB-1B is a U.S. employment-based immigrant category for professors and researchers who are internationally recognised as outstanding in a specific academic area. It requires at least three years of teaching or research experience in that area and a qualifying job offer from a U.S. employer, who files the petition.",
    },
    {
      question: "Can I self-petition for EB-1B?",
      answer:
        "No. Unlike EB-1A and EB-2 NIW, EB-1B requires a U.S. employer to sponsor you and to file Form I-140 on your behalf. If you do not have an employer sponsor, EB-1A or EB-2 NIW are the self-petition alternatives worth assessing.",
    },
    {
      question: "How many EB-1B criteria do I need to meet?",
      answer:
        "At least two of the six criteria set out in 8 CFR 204.5(i)(3)(i). Meeting two is a threshold rather than a conclusion — USCIS then assesses whether the record as a whole establishes that you are internationally recognised as outstanding in your academic area.",
    },
    {
      question: "Does a postdoctoral position qualify as the job offer?",
      answer:
        "It depends on the nature of the position. The qualifying offer must be a tenured or tenure-track teaching position, or a comparable research position, and comparable research positions are generally expected to be permanent rather than for a defined term. Where a postdoc is being used, the permanence of the role needs to be addressed directly in the petition.",
    },
    {
      question: "Can a private company sponsor an EB-1B?",
      answer:
        "Yes, for a comparable research position, provided the employer employs at least three full-time researchers and has documented accomplishments in the academic field. Both conditions require evidence supplied by the employer, which is a part of the case that is often prepared late.",
    },
    {
      question: "What is the difference between EB-1A and EB-1B?",
      answer:
        "EB-1A is a self-petition requiring sustained national or international acclaim, evidenced against three of ten criteria. EB-1B requires an employer sponsor and a qualifying position, but applies a lower standard — international recognition as outstanding in a specific academic area, evidenced against two of six criteria.",
    },
    {
      question: "Does the three years of experience have to be after my PhD?",
      answer:
        "Not necessarily. Experience gained while working on an advanced degree can count where the applicant had full responsibility for the classes taught, or where the research conducted is recognised as outstanding. How that experience is documented matters, and it should be addressed explicitly in the petition.",
    },
    {
      question: "Can you work with my university's HR or faculty affairs office?",
      answer:
        "Yes. Because EB-1B is employer-sponsored, part of the record has to come from the institution. We prepare a specific document request for the employer contact and work alongside the institution or its counsel as additional drafting capacity where that is the arrangement.",
    },
  ],
  faqTitle: "EB-1B frequently asked questions",
  faqDescription:
    "The questions we are asked most often about outstanding professor and researcher eligibility, employer requirements, and evidence.",
  sources: [
    {
      label: "USCIS — Employment-Based Immigration: First Preference EB-1",
      href: "https://www.uscis.gov/working-in-the-united-states/permanent-workers/employment-based-immigration-first-preference-eb-1",
    },
    {
      label: "8 CFR 204.5(i) — Outstanding professors and researchers",
      href: "https://www.ecfr.gov/current/title-8/chapter-I/subchapter-B/part-204/subpart-A/section-204.5",
    },
    { label: "USCIS — Form I-140", href: "https://www.uscis.gov/i-140" },
    {
      label: "USCIS — Check Case Processing Times",
      href: "https://egov.uscis.gov/processing-times/",
    },
  ],
  scopeNote:
    "This page is general educational information about the EB-1B outstanding professor and researcher category, not legal advice about any individual case.",
};
