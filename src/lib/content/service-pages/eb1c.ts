import type { ServicePageContent } from "./types";

/**
 * EB-1C. Regulatory anchors: INA §203(b)(1)(C), 8 CFR 204.5(j), and the
 * statutory definitions of managerial and executive capacity at
 * INA §101(a)(44)(A) and (B).
 */
export const eb1c: ServicePageContent = {
  slug: "eb1c",
  name: "EB-1C",
  eyebrow: "Multinational Manager or Executive",
  headline: "EB-1C Multinational Manager & Executive petitions",
  subhead:
    "Petition preparation for executives and managers transferring into a U.S. entity — including the corporate relationship and organisational evidence this category turns on.",
  definition:
    "EB-1C is a U.S. employment-based immigrant category for multinational managers and executives. It generally requires one year of qualifying employment abroad in a managerial or executive capacity within the three years before the petition, and a U.S. employer — related to the foreign entity — offering a managerial or executive role.",
  metaTitle: "EB-1C Multinational Manager & Executive Petition Preparation",
  metaDescription:
    "Complete guide to the EB-1C multinational manager or executive green card: qualifying corporate relationships, managerial and executive capacity, required evidence, and common mistakes.",
  keywords: [
    "EB1C",
    "EB-1C",
    "multinational manager",
    "multinational executive",
    "EB-1C requirements",
    "EB1C green card",
    "EB-1C petition",
    "managerial capacity",
  ],
  keyFacts: [
    { label: "Petition form", value: "Form I-140" },
    { label: "Employer sponsor", value: "Required" },
    { label: "Labor certification", value: "Not required" },
    { label: "Preference category", value: "Employment-based first (EB-1)" },
    { label: "Qualifying employment abroad", value: "1 year in the prior 3" },
    { label: "U.S. entity trading requirement", value: "At least 1 year" },
  ],
  toc: [
    { id: "what-is-eb1c", label: "What is EB-1C?" },
    { id: "requirements", label: "The core requirements" },
    { id: "capacity", label: "Managerial vs executive capacity" },
    { id: "relationship", label: "Qualifying corporate relationships" },
    { id: "evidence", label: "Evidence strategy" },
    { id: "mistakes", label: "Common mistakes" },
    { id: "how-we-help", label: "How we help" },
    { id: "faqs", label: "Frequently asked questions" },
  ],
  sections: [
    {
      kind: "prose",
      id: "what-is-eb1c",
      eyebrow: "The basics",
      heading: "What is the EB-1C multinational manager or executive category?",
      paragraphs: [
        "EB-1C is the immigrant counterpart to the L-1A intracompany transferee classification. It allows a multinational business to move a senior manager or executive from a foreign entity into a related U.S. entity on a permanent basis, without going through labor certification.",
        "The category is structurally different from EB-1A and EB-1B. There are no criteria to count and no acclaim to demonstrate. EB-1C turns almost entirely on two factual questions: whether a qualifying corporate relationship exists between the foreign and U.S. entities, and whether your role — abroad and in the United States — genuinely meets the statutory definition of managerial or executive capacity.",
        "That makes it a documentation case rather than an argumentation case. The evidence is organisational: corporate ownership records, organisational charts, payroll and staffing data, and descriptions of duties and decision-making authority. Where petitions fail, it is usually because the corporate structure was not evidenced properly or because the role, on examination, looks operational rather than managerial.",
        "Because the petition is employer-filed, the company is the petitioner and much of the record has to come from the business rather than from the individual.",
      ],
    },
    {
      kind: "list",
      id: "requirements",
      eyebrow: "Eligibility",
      heading: "The core EB-1C requirements",
      items: [
        {
          title: "One year of qualifying employment abroad",
          body: "You must have been employed outside the United States for at least one year within the three years preceding the petition. Where you are already in the U.S. working for the petitioning employer, the three-year window is generally measured from the date you were admitted as a nonimmigrant to work for that employer.",
        },
        {
          title: "That employment must have been managerial or executive",
          body: "The qualifying year abroad must have been in a managerial or executive capacity as those terms are defined by statute — not merely in a senior or well-paid role.",
        },
        {
          title: "A qualifying relationship between the entities",
          body: "The U.S. employer must be the same employer, or a parent, subsidiary, branch, or affiliate of the foreign entity. The relationship must be documented through ownership and control evidence, not simply asserted.",
        },
        {
          title: "The U.S. role must also be managerial or executive",
          body: "You must be coming to work for the U.S. entity in a managerial or executive capacity. A role that is senior in title but operational in substance will not satisfy this.",
        },
        {
          title: "The U.S. entity must have been doing business for at least one year",
          body: "The petitioning U.S. employer must have been doing business for at least one year before the petition is filed. Newly established entities cannot petition immediately under this category.",
        },
      ],
    },
    {
      kind: "subsections",
      id: "capacity",
      eyebrow: "The heart of the case",
      heading: "Managerial capacity vs executive capacity",
      intro: [
        "These are defined terms at INA §101(a)(44)(A) and (B). Job titles carry no weight — the analysis is about what the person actually does, who they direct, and what decisions they control.",
      ],
      subsections: [
        {
          heading: "Managerial capacity",
          paragraphs: [
            "A manager, in the statutory sense, manages the organisation or a department, subdivision, function, or component of it; supervises and controls the work of other supervisory, professional, or managerial employees, or manages an essential function; has authority over personnel actions such as hiring and firing, or — where no employees are directly supervised — functions at a senior level within the organisational hierarchy or with respect to the function managed; and exercises discretion over the day-to-day operations of the activity or function.",
            "Critically, a person who primarily supervises non-professional employees is not considered to be acting in a managerial capacity merely by virtue of supervisory duties. This is a frequent point of failure for first-line supervisors of operational staff.",
          ],
        },
        {
          heading: "Function managers",
          paragraphs: [
            "The statute expressly contemplates managing an essential function rather than managing people. This route is available where the applicant directs a core function of the business without a direct-report structure beneath them.",
            "Function-manager cases require particularly careful documentation: the function must be identified and shown to be essential to the organisation, the applicant's seniority relative to that function must be established, and it must be clear that the applicant directs the function rather than performing it personally. Function-manager petitions attract scrutiny precisely because the usual organisational-chart evidence is absent.",
          ],
        },
        {
          heading: "Executive capacity",
          paragraphs: [
            "An executive directs the management of the organisation or a major component or function of it; establishes the goals and policies of that organisation, component, or function; exercises wide latitude in discretionary decision-making; and receives only general supervision or direction from higher-level executives, the board of directors, or the stockholders.",
            "The distinguishing feature is policy and direction-setting authority, and the degree of independence from supervision. An executive sets what the organisation does; a manager runs how it gets done.",
          ],
        },
      ],
      callout: {
        title: "Small companies are not excluded — but they are examined",
        body: "There is no minimum headcount in the statute. Small organisations can and do succeed under EB-1C. What they must do is document the organisational structure carefully enough to show the role is genuinely managerial or executive rather than the applicant performing the operational work themselves.",
      },
    },
    {
      kind: "list",
      id: "relationship",
      eyebrow: "The corporate side",
      heading: "Qualifying corporate relationships",
      intro: [
        "The relationship between the foreign and U.S. entities must fall into one of the recognised categories, and must be proven through ownership and control documentation.",
      ],
      items: [
        {
          title: "Same employer",
          body: "The U.S. and foreign operations are the same legal entity — for example, a foreign company operating a U.S. branch.",
        },
        {
          title: "Parent",
          body: "The foreign entity owns and controls the U.S. entity, or the reverse. Ownership percentages and control mechanisms both need documenting.",
        },
        {
          title: "Subsidiary",
          body: "One entity owns, directly or indirectly, a controlling interest in the other, or owns half with veto control, or otherwise has effective control.",
        },
        {
          title: "Branch",
          body: "An operating division or office of the same organisation housed in a different location.",
        },
        {
          title: "Affiliate",
          body: "Two entities owned and controlled by the same parent, or by the same group of individuals in substantially the same proportions. Affiliate relationships based on common individual ownership require careful proportional documentation.",
        },
      ],
      callout: {
        title: "The relationship must survive the whole process",
        body: "A qualifying relationship must exist and be maintained. Restructurings, acquisitions, and divestitures during the process can affect eligibility, and are worth flagging early rather than discovering mid-adjudication.",
      },
    },
    {
      kind: "cta",
      title: "Not sure whether the role or the corporate structure qualifies?",
      body: "We assess both the organisational relationship and the substance of the role against the statutory definitions before drafting begins — including where a function-manager argument is the realistic route.",
      ctaLabel: "Book a free assessment",
    },
    {
      kind: "subsections",
      id: "evidence",
      eyebrow: "What actually persuades",
      heading: "EB-1C evidence strategy",
      subsections: [
        {
          heading: "Organisational charts that show substance",
          paragraphs: [
            "Charts should show the applicant's position, everyone reporting to them, and what those people do — with job titles, education levels, and duties. A chart showing boxes and titles alone does not establish that the applicant supervises professional or managerial staff rather than operational staff.",
            "Charts for both the foreign entity during the qualifying year and the U.S. entity are needed. Petitions that document only the U.S. side leave the qualifying-year requirement unevidenced.",
          ],
        },
        {
          heading: "Duty descriptions with time allocation",
          paragraphs: [
            "Vague duty descriptions are the most common weakness in EB-1C filings. A description that allocates the applicant's time across specific responsibilities is far more persuasive, because it lets the adjudicator see that managerial or executive duties dominate rather than sitting alongside substantial operational work.",
          ],
        },
        {
          heading: "Corporate ownership documentation",
          paragraphs: [
            "Share certificates, stock ledgers, articles of incorporation, operating agreements, and audited financial statements as applicable. Where ownership runs through intermediate holding entities, the full chain needs documenting — not just the endpoints.",
          ],
        },
        {
          heading: "Evidence the U.S. entity is doing business",
          paragraphs: [
            "Tax filings, payroll records, contracts, invoices, and premises documentation establishing that the U.S. entity has been actively doing business — not merely existing as a registered entity — for at least a year before filing.",
          ],
        },
      ],
    },
    {
      kind: "list",
      id: "mistakes",
      eyebrow: "What goes wrong",
      heading: "Common EB-1C mistakes",
      items: [
        {
          title: "Job titles standing in for duty evidence",
          body: "Director, Vice President, and Head of are titles, not evidence. The analysis is about actual duties, supervision, and decision-making authority.",
        },
        {
          title: "Supervising non-professional staff only",
          body: "A supervisor of operational or non-professional employees is not, on that basis alone, acting in a managerial capacity under the statutory definition.",
        },
        {
          title: "Undocumented corporate chains",
          body: "Ownership running through intermediate entities without documentation of each link. The relationship must be traceable, not assumed.",
        },
        {
          title: "Ignoring the qualifying year abroad",
          body: "Extensive documentation of the U.S. role with little evidence about the foreign position during the qualifying year. Both sides carry equal weight.",
        },
        {
          title: "Function-manager claims without function evidence",
          body: "Asserting essential-function management without identifying the function, establishing its importance to the business, or showing the applicant directs rather than performs it.",
        },
        {
          title: "Filing before the U.S. entity has traded for a year",
          body: "The one-year doing-business requirement applies to the petitioning U.S. employer and is checked.",
        },
      ],
    },
    {
      kind: "prose",
      id: "how-we-help",
      eyebrow: "Working with us",
      heading: "How we prepare EB-1C petitions",
      paragraphs: [
        "Immigration Horizons is an immigration consulting and paralegal services practice. We are not attorneys and do not provide legal representation or legal advice. On EB-1C matters we prepare the petition letter, build the organisational and corporate-structure documentation, draft supporting affidavits and letters, and assemble business plan or corporate structure materials where the case calls for them.",
        "Because EB-1C petitions are company-filed and evidence-heavy on the corporate side, we typically produce a structured document request for the business, so finance, HR, and legal each know exactly what is needed from them. We frequently work as additional capacity alongside a company's own counsel.",
      ],
    },
  ],
  faqs: [
    {
      question: "What is the EB-1C multinational manager or executive category?",
      answer:
        "EB-1C is a U.S. employment-based immigrant category allowing a multinational business to transfer a manager or executive from a foreign entity to a related U.S. entity permanently. It generally requires one year of qualifying managerial or executive employment abroad within the preceding three years, and no labor certification is required.",
    },
    {
      question: "Can I self-petition for EB-1C?",
      answer:
        "No. EB-1C is employer-filed. The U.S. entity is the petitioner and files Form I-140 on your behalf, and a substantial part of the evidence — corporate ownership records, organisational charts, and proof the entity has been doing business — must come from the company rather than from you.",
    },
    {
      question: "What counts as managerial capacity?",
      answer:
        "Under the statutory definition, a manager manages the organisation or a department, function, or component of it; supervises other supervisory, professional, or managerial employees or manages an essential function; has authority over personnel actions or functions at a senior level; and exercises discretion over day-to-day operations. Supervising non-professional employees alone does not qualify.",
    },
    {
      question: "Can I qualify if I do not supervise anyone?",
      answer:
        "Potentially, through the function-manager route. The statute contemplates managing an essential function rather than personnel. These cases require careful documentation identifying the function, establishing that it is essential to the organisation, and showing that you direct the function rather than personally performing the work.",
    },
    {
      question: "Does my company need to be large?",
      answer:
        "There is no minimum headcount in the statute, and smaller organisations do qualify. What matters is that the organisational structure is documented well enough to show the role is genuinely managerial or executive rather than the applicant carrying out the operational work personally.",
    },
    {
      question: "How long must the U.S. company have been operating?",
      answer:
        "The petitioning U.S. employer must have been doing business for at least one year before the petition is filed. Doing business means actively conducting operations, evidenced through items such as tax filings, payroll, contracts, and invoices — not merely existing as a registered entity.",
    },
    {
      question: "What is the difference between L-1A and EB-1C?",
      answer:
        "L-1A is a temporary nonimmigrant classification for intracompany transferees; EB-1C is the permanent immigrant category built on similar concepts. The definitions of managerial and executive capacity are shared, which is why many EB-1C applicants have previously held L-1A status, though prior L-1A status is not a requirement.",
    },
    {
      question: "What if my company restructures during the process?",
      answer:
        "A qualifying relationship between the foreign and U.S. entities must exist and be maintained. Acquisitions, divestitures, and internal reorganisations can affect eligibility, so they are worth identifying early rather than being discovered partway through adjudication.",
    },
  ],
  faqTitle: "EB-1C frequently asked questions",
  faqDescription:
    "The questions we are asked most often about multinational manager and executive eligibility, corporate structure, and evidence.",
  sources: [
    {
      label: "USCIS — Employment-Based Immigration: First Preference EB-1",
      href: "https://www.uscis.gov/working-in-the-united-states/permanent-workers/employment-based-immigration-first-preference-eb-1",
    },
    {
      label: "8 CFR 204.5(j) — Certain multinational executives and managers",
      href: "https://www.ecfr.gov/current/title-8/chapter-I/subchapter-B/part-204/subpart-A/section-204.5",
    },
    { label: "USCIS — Form I-140", href: "https://www.uscis.gov/i-140" },
    {
      label: "USCIS — Check Case Processing Times",
      href: "https://egov.uscis.gov/processing-times/",
    },
  ],
  scopeNote:
    "This page is general educational information about the EB-1C multinational manager and executive category, not legal advice about any individual case.",
};
