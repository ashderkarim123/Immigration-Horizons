import type { ServicePageContent } from "./types";

/**
 * O-1. Regulatory anchors: INA §101(a)(15)(O) and 8 CFR 214.2(o).
 *
 * Note this is a NONIMMIGRANT classification. The page states that plainly —
 * conflating it with the immigrant categories is the most consequential
 * misunderstanding a reader could leave with.
 */
export const o1Visa: ServicePageContent = {
  slug: "o1-visa",
  name: "O-1 Visa",
  eyebrow: "Extraordinary Ability or Achievement",
  headline: "O-1 visa petition preparation",
  subhead:
    "Petition strategy, evidence packaging, and drafting for O-1A and O-1B filings — including advisory opinion coordination and premium-processing-ready assembly.",
  definition:
    "The O-1 is a temporary U.S. work visa for individuals with extraordinary ability in the sciences, education, business, athletics, or the arts, or a record of extraordinary achievement in film and television. It is a nonimmigrant classification, requires a U.S. petitioner or agent, and is filed on Form I-129.",
  metaTitle: "O-1 Visa Petition Preparation | O-1A & O-1B Requirements",
  metaDescription:
    "Complete guide to the O-1 visa: O-1A and O-1B criteria, the advisory opinion requirement, petitioner and agent rules, evidence strategy, and common mistakes.",
  keywords: [
    "O1 visa",
    "O-1 visa",
    "O-1A",
    "O-1B",
    "O-1 visa requirements",
    "extraordinary ability visa",
    "O-1 petition",
    "advisory opinion",
  ],
  keyFacts: [
    { label: "Petition form", value: "Form I-129" },
    { label: "Classification type", value: "Nonimmigrant (temporary)" },
    { label: "U.S. petitioner or agent", value: "Required" },
    { label: "Advisory opinion", value: "Required" },
    { label: "Criteria threshold", value: "3 of 8 (O-1A), or a major award" },
    { label: "Self-petition", value: "Not permitted" },
  ],
  toc: [
    { id: "what-is-o1", label: "What is the O-1 visa?" },
    { id: "o1a-o1b", label: "O-1A vs O-1B" },
    { id: "criteria", label: "The O-1A criteria" },
    { id: "petitioner", label: "Petitioner, agent & advisory opinion" },
    { id: "evidence", label: "Evidence strategy" },
    { id: "mistakes", label: "Common mistakes" },
    { id: "how-we-help", label: "How we help" },
    { id: "faqs", label: "Frequently asked questions" },
  ],
  sections: [
    {
      kind: "prose",
      id: "what-is-o1",
      eyebrow: "The basics",
      heading: "What is the O-1 visa?",
      paragraphs: [
        "The O-1 is a nonimmigrant classification — a temporary work visa, not a green card. This is the single most important thing to understand about it, because O-1 shares much of its vocabulary with EB-1A and the two are frequently confused.",
        "An O-1 authorises you to work in the United States for a specific petitioner, in a specific field, for an initial period of up to three years, with extensions available in increments of up to one year. It does not confer permanent residence and it does not lead to it automatically.",
        "Unlike EB-1A and EB-2 NIW, the O-1 cannot be self-petitioned. A U.S. employer, or a U.S. agent, must file Form I-129 on your behalf. The agent route is what makes the classification workable for people with multiple engagements rather than a single employer, which is common in the arts, in athletics, and increasingly among senior technical consultants.",
        "The O-1 also requires something the immigrant categories do not: a written advisory opinion from an appropriate peer group, labor organisation, or management organisation. This is a procedural requirement with its own lead time, and it is a frequent cause of delay in otherwise well-prepared filings.",
      ],
      callout: {
        title: "O-1 is temporary; EB-1A is permanent",
        body: "Many applicants use an O-1 as a bridge while pursuing EB-1A or EB-2 NIW. Helpfully, O-1 is not subject to the strict immigrant-intent restrictions that apply to some other nonimmigrant classifications, so pursuing permanent residence does not by itself undermine an O-1 filing. The two are often run in parallel rather than in sequence.",
      },
    },
    {
      kind: "subsections",
      id: "o1a-o1b",
      eyebrow: "Two sub-classifications",
      heading: "O-1A and O-1B: which applies to you",
      intro: [
        "The O-1 splits into sub-classifications with different standards and different evidentiary criteria. Filing under the wrong one is a structural error, not a detail.",
      ],
      subsections: [
        {
          heading: "O-1A — sciences, education, business, or athletics",
          paragraphs: [
            "O-1A covers individuals with extraordinary ability in the sciences, education, business, or athletics. The standard is sustained national or international acclaim, demonstrated either through a major internationally recognised award or through evidence meeting at least three of eight regulatory criteria.",
            "This is the route for researchers, engineers, founders, executives, and athletes. The criteria closely resemble the EB-1A set, though there are meaningful differences — notably that O-1A has eight criteria rather than ten, and includes employment in a critical or essential capacity for distinguished organisations.",
          ],
        },
        {
          heading: "O-1B — arts, or motion picture and television",
          paragraphs: [
            "O-1B covers individuals with extraordinary ability in the arts, and individuals with a record of extraordinary achievement in the motion picture or television industry. These are two different standards housed in one sub-classification.",
            "For the arts, the standard is distinction — a high level of achievement evidenced by a degree of skill and recognition substantially above that ordinarily encountered. This is a lower bar than the sustained acclaim required under O-1A, reflecting how careers in the arts are actually built and recognised.",
            "The qualifying evidence differs too: it can be satisfied by nomination for or receipt of a significant national or international award such as an Academy Award, Emmy, Grammy, or Directors Guild Award, or by meeting at least three of six alternative criteria.",
          ],
        },
      ],
    },
    {
      kind: "criteria",
      id: "criteria",
      eyebrow: "The evidentiary test",
      heading: "The eight O-1A criteria",
      intro: [
        "Absent a major internationally recognised award, an O-1A petition must include evidence meeting at least three of the following criteria, set out at 8 CFR 214.2(o)(3)(iii). Where these criteria do not readily apply to the beneficiary's occupation, comparable evidence may be submitted.",
      ],
      items: [
        {
          title: "Nationally or internationally recognised awards",
          body: "Receipt of nationally or internationally recognised prizes or awards for excellence in the field. As always, the selection standard is what needs documenting, not the certificate.",
        },
        {
          title: "Membership in associations requiring outstanding achievement",
          body: "Membership in associations that require outstanding achievements of their members, as judged by recognised national or international experts.",
        },
        {
          title: "Published material about you",
          body: "Published material in professional or major trade publications, newspapers, or other major media about you and your work in the field.",
        },
        {
          title: "Judging the work of others",
          body: "Participation on a panel, or individually, as a judge of the work of others in the same or an allied field.",
        },
        {
          title: "Original contributions of major significance",
          body: "Original scientific, scholarly, or business-related contributions of major significance in the field. Downstream evidence of impact — adoption, citation, implementation — is what carries this criterion.",
        },
        {
          title: "Authorship of scholarly articles",
          body: "Authorship of scholarly articles in the field, in professional journals or other major media.",
        },
        {
          title: "Critical or essential capacity for distinguished organisations",
          body: "Employment in a critical or essential capacity for organisations and establishments that have a distinguished reputation. Both the nature of the role and the standing of the organisation must be evidenced.",
        },
        {
          title: "High salary or remuneration",
          body: "Evidence that you have commanded, or will command, a high salary or other substantial remuneration for services, supported by comparative data for the field.",
        },
      ],
    },
    {
      kind: "subsections",
      id: "petitioner",
      eyebrow: "Procedural requirements",
      heading: "Petitioner, agent, and the advisory opinion",
      subsections: [
        {
          heading: "You cannot petition for yourself",
          paragraphs: [
            "An O-1 requires a U.S. petitioner. This can be an employer, or a U.S. agent. What it cannot be is you: self-petitioning is not available in this classification, which is a fundamental difference from EB-1A and EB-2 NIW.",
            "Founders of U.S. companies can often have their own company petition for them, but this requires care around who controls the employment relationship, and the arrangement needs to be documented rather than assumed.",
          ],
        },
        {
          heading: "The agent route",
          paragraphs: [
            "Where you will work for multiple employers, or are traditionally self-employed, a U.S. agent may file the petition. Agent filings generally require an itinerary of the work to be performed and documentation of the arrangements with the various entities involved.",
            "This is what makes O-1 viable for people whose careers do not consist of a single full-time job, and it is one of the more technically demanding filing structures in the classification.",
          ],
        },
        {
          heading: "The advisory opinion",
          paragraphs: [
            "Every O-1 petition requires a written advisory opinion from a peer group, labor organisation, or management organisation appropriate to the field. In some fields the relevant organisation is obvious; in others — particularly emerging technical fields — identifying an appropriate body takes work.",
            "Advisory opinions have their own turnaround time, entirely outside your control and outside USCIS's. Requesting the opinion early, rather than after the rest of the petition is assembled, is one of the simplest ways to avoid an otherwise unnecessary delay.",
          ],
        },
      ],
    },
    {
      kind: "cta",
      title: "Deciding between O-1, EB-1A, and EB-2 NIW?",
      body: "These are different instruments and are often best used together rather than chosen between. We assess your record against all three and explain what each would realistically require.",
      ctaLabel: "Book a free assessment",
    },
    {
      kind: "subsections",
      id: "evidence",
      eyebrow: "Where cases are won",
      heading: "O-1 evidence strategy",
      subsections: [
        {
          heading: "Tie the evidence to the specific engagement",
          paragraphs: [
            "Unlike the immigrant categories, an O-1 is tied to specific work for a specific petitioner over a defined period. The petition must establish not only that you have extraordinary ability, but that the work you are coming to do requires someone of that calibre. Petitions that document the person thoroughly while describing the engagement vaguely tend to draw questions.",
          ],
        },
        {
          heading: "Build the itinerary properly on agent filings",
          paragraphs: [
            "Where an agent is petitioning, the itinerary and the supporting contracts or deal memos are load-bearing evidence, not paperwork. They establish what work exists, with whom, and over what period. Thin itinerary documentation is one of the more common weaknesses in agent-filed petitions.",
          ],
        },
        {
          heading: "Start the advisory opinion first",
          paragraphs: [
            "Because the consultation is outside your control, it should be initiated at the start of the process rather than at the end. Identifying the appropriate peer group early also surfaces problems — such as no obvious organisation existing for a niche field — while there is still time to address them.",
          ],
        },
        {
          heading: "Assemble for premium processing",
          paragraphs: [
            "O-1 petitions are frequently filed with premium processing, which compresses adjudication into a short window. That makes completeness at filing more important than usual: a package that would have drawn a request for evidence still draws one, just faster. Fees and availability should be confirmed on the official USCIS page at the time of filing.",
          ],
        },
      ],
    },
    {
      kind: "list",
      id: "mistakes",
      eyebrow: "What goes wrong",
      heading: "Common O-1 mistakes",
      items: [
        {
          title: "Assuming the O-1 is a green card",
          body: "It is a temporary nonimmigrant classification. Applicants who expect permanent residence from an O-1 have misunderstood the instrument, and often should be pursuing EB-1A or EB-2 NIW in parallel.",
        },
        {
          title: "Filing O-1B when O-1A applies, or the reverse",
          body: "The sub-classifications have different standards and different criteria sets. Filing under the wrong one is a structural error that is difficult to repair mid-adjudication.",
        },
        {
          title: "Leaving the advisory opinion to the end",
          body: "The consultation has a turnaround entirely outside your control. Requesting it last is the most common self-inflicted delay in O-1 filings.",
        },
        {
          title: "Weak itinerary documentation on agent petitions",
          body: "Agent filings depend on a properly evidenced itinerary. Listing intended engagements without supporting contracts or confirmations undermines the structure the petition rests on.",
        },
        {
          title: "Describing the person but not the work",
          body: "The petition must establish that the specific engagement calls for someone of extraordinary ability, not merely that the beneficiary possesses it.",
        },
        {
          title: "Founder petitions without a documented employment relationship",
          body: "Where a founder's own company is the petitioner, the control and employment arrangements need to be documented deliberately rather than treated as self-evident.",
        },
      ],
    },
    {
      kind: "prose",
      id: "how-we-help",
      eyebrow: "Working with us",
      heading: "How we prepare O-1 petitions",
      paragraphs: [
        "Immigration Horizons is an immigration consulting and paralegal services practice. We are not attorneys and do not provide legal representation or legal advice. On O-1 matters we prepare the petition narrative and evidence strategy, draft support and endorsement letters, help identify an appropriate peer group and coordinate the advisory opinion request, and organise exhibits into a filing-ready structure suited to premium processing.",
        "Because the O-1 requires a U.S. petitioner or agent, we work with whoever is filing — an employer's HR team, a founder's own company, or an agent — and we regularly act as additional drafting capacity alongside a firm's own counsel.",
      ],
    },
  ],
  faqs: [
    {
      question: "What is the O-1 visa?",
      answer:
        "The O-1 is a temporary U.S. work visa for individuals with extraordinary ability in the sciences, education, business, athletics, or the arts, or with a record of extraordinary achievement in motion picture or television. It is a nonimmigrant classification filed on Form I-129 and requires a U.S. petitioner or agent.",
    },
    {
      question: "Is the O-1 visa a green card?",
      answer:
        "No. The O-1 is a nonimmigrant classification that authorises temporary work for a specific petitioner, initially for up to three years with extensions in increments of up to one year. It does not confer permanent residence. Applicants seeking a green card typically pursue EB-1A or EB-2 NIW, often in parallel with an O-1.",
    },
    {
      question: "Can I self-petition for an O-1?",
      answer:
        "No. An O-1 requires a U.S. employer or a U.S. agent to file the petition on your behalf. Founders can often have their own U.S. company petition for them, but the employment and control arrangements need to be documented deliberately. If you need a self-petition route, EB-1A and EB-2 NIW are the alternatives.",
    },
    {
      question: "What is the difference between O-1A and O-1B?",
      answer:
        "O-1A covers extraordinary ability in the sciences, education, business, or athletics, assessed against eight criteria. O-1B covers extraordinary ability in the arts or extraordinary achievement in motion picture and television, with its own criteria and, for the arts, a distinction standard that is lower than the sustained acclaim O-1A requires.",
    },
    {
      question: "What is the advisory opinion and do I really need one?",
      answer:
        "Every O-1 petition requires a written advisory opinion from an appropriate peer group, labor organisation, or management organisation in your field. It is a procedural requirement, and because turnaround is outside your control, it should be requested at the start of the process rather than once the rest of the petition is complete.",
    },
    {
      question: "Can I apply for a green card while on an O-1?",
      answer:
        "The O-1 is not subject to the strict immigrant-intent restrictions that apply to certain other nonimmigrant classifications, so pursuing permanent residence does not by itself undermine an O-1 filing. Many applicants hold O-1 status while an EB-1A or EB-2 NIW petition is pending.",
    },
    {
      question: "How does the O-1 compare to EB-1A?",
      answer:
        "They share vocabulary but differ fundamentally. O-1 is temporary, requires a U.S. petitioner or agent and an advisory opinion, and is tied to specific work. EB-1A is a permanent immigrant category, can be self-petitioned, requires no advisory opinion, and is assessed against ten criteria plus a final merits determination.",
    },
    {
      question: "Can you help if my O-1 receives an RFE?",
      answer:
        "Yes, including on petitions we did not originally prepare. We review what the officer has questioned — most often the beneficiary's qualifications, the nature of the engagement, or the itinerary on agent filings — and prepare a focused response addressing those specific points.",
    },
  ],
  faqTitle: "O-1 visa frequently asked questions",
  faqDescription:
    "The questions we are asked most often about O-1A and O-1B eligibility, petitioners, advisory opinions, and how the O-1 relates to permanent residence.",
  sources: [
    {
      label: "USCIS — O-1 Visa: Individuals with Extraordinary Ability or Achievement",
      href: "https://www.uscis.gov/working-in-the-united-states/temporary-workers/o-1-visa-individuals-with-extraordinary-ability-or-achievement",
    },
    {
      label: "8 CFR 214.2(o) — Aliens of extraordinary ability or achievement",
      href: "https://www.ecfr.gov/current/title-8/chapter-I/subchapter-B/part-214/section-214.2",
    },
    { label: "USCIS — Form I-129", href: "https://www.uscis.gov/i-129" },
    {
      label: "USCIS — Check Case Processing Times",
      href: "https://egov.uscis.gov/processing-times/",
    },
  ],
  scopeNote:
    "This page is general educational information about the O-1 nonimmigrant classification, not legal advice about any individual case.",
};
