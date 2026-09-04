import type { ServicePageContent } from "./types";

export const businessPlans: ServicePageContent = {
  slug: "business-plans",
  name: "Business & Personal Plans",
  eyebrow: "Endeavor Documentation",
  headline: "Business plan & endeavor plan preparation",
  subhead:
    "Business plans and personal endeavor plans that document what you intend to do in the United States and why it carries national importance — written to support the petition, not to raise capital.",
  definition:
    "In an employment-based petition, a business or personal endeavor plan documents the applicant's proposed work in the United States and its prospective impact. Unlike an investor's business plan, its audience is a USCIS adjudicator, and its purpose is to establish national importance and feasibility — not to attract funding.",
  metaTitle: "Immigration Business & Endeavor Plan Preparation",
  metaDescription:
    "Business and personal endeavor plan preparation for EB-2 NIW and EB-1C petitions — written for a USCIS audience to show national importance and feasibility.",
  keywords: [
    "immigration business plan",
    "EB2 NIW business plan",
    "endeavor plan",
    "proposed endeavor",
    "EB-1C business plan",
    "personal statement immigration",
    "NIW business plan",
  ],
  keyFacts: [
    { label: "Audience", value: "USCIS adjudicator" },
    { label: "Purpose", value: "National importance & feasibility" },
    { label: "Not for", value: "Raising investment" },
    { label: "Used in", value: "EB-2 NIW, EB-1C" },
    { label: "Available standalone", value: "Yes" },
  ],
  toc: [
    { id: "what-is-it", label: "What an endeavor plan is for" },
    { id: "vs-investor", label: "Not an investor business plan" },
    { id: "components", label: "What a strong plan contains" },
    { id: "process", label: "Our process" },
    { id: "mistakes", label: "Common mistakes" },
    { id: "how-we-help", label: "How we help" },
    { id: "faqs", label: "Frequently asked questions" },
  ],
  sections: [
    {
      kind: "prose",
      id: "what-is-it",
      eyebrow: "The basics",
      heading: "What a business or endeavor plan is for in a petition",
      paragraphs: [
        "In an employment-based petition — most often an EB-2 NIW, and sometimes an EB-1C — a business or personal endeavor plan does a specific job: it documents what you propose to do in the United States, and builds the case that the work matters and is achievable.",
        "For an EB-2 NIW, this connects directly to the Dhanasar framework. The first prong asks whether your proposed endeavor has substantial merit and national importance; the second asks whether you are well positioned to advance it. A well-constructed endeavor plan is where those questions are answered concretely — defining the endeavor precisely enough to be assessed, and documenting the traction and capability that show you can carry it forward.",
        "For an EB-1C, the plan does different work: documenting the U.S. entity's operations, structure, and viability, and the managerial or executive role the applicant will hold within it.",
        "In both cases, the plan is evidence within a petition, and it has to be consistent with everything else in that petition. A plan that describes the endeavor differently from the petition letter or the personal statement creates a contradiction, so the plan is built as part of the case rather than as a standalone document bolted on.",
      ],
    },
    {
      kind: "prose",
      id: "vs-investor",
      eyebrow: "A crucial distinction",
      heading: "Why this is not an investor business plan",
      paragraphs: [
        "The most common mistake with immigration business plans is treating them like the plans written to raise capital. The two look superficially similar and are fundamentally different in purpose.",
        "An investor plan is written to persuade someone to fund a venture. It emphasises returns, market opportunity, and upside, and a degree of optimistic framing is expected and understood.",
        "An immigration plan is written to persuade an adjudicator that the proposed work is nationally important and realistically achievable. Its currency is credibility, not ambition. Overstated projections and promotional language, which an investor would discount automatically, actively harm an immigration plan — they invite the adjudicator to question whether anything in the document can be relied upon.",
        "The tone that works is measured and evidenced. Claims are supported; projections are grounded; the national importance is argued from the nature of the work rather than asserted through enthusiasm. A plan written for investors and repurposed for USCIS reliably reads as what it is.",
      ],
      callout: {
        title: "Credibility is the whole point",
        body: "An adjudicator's question is not 'is this exciting?' but 'can I believe this?' Every projection that cannot be supported, and every superlative that cannot be evidenced, moves the plan in the wrong direction.",
      },
    },
    {
      kind: "list",
      id: "components",
      eyebrow: "The structure",
      heading: "What a strong immigration business plan contains",
      items: [
        {
          title: "A precisely defined endeavor",
          body: "For an NIW, the endeavor stated specifically enough that its national importance can actually be assessed. A vague endeavor cannot be evaluated, and vagueness is the most common structural weakness.",
        },
        {
          title: "The national importance argument",
          body: "A grounded explanation of why the work matters beyond a single employer or locality, connected to the field, the sector, or the population it affects.",
        },
        {
          title: "Evidence of feasibility and capability",
          body: "What you have already done, the resources and relationships in place, and why you are positioned to carry the endeavor forward — traction over intention.",
        },
        {
          title: "Grounded projections",
          body: "Where projections are appropriate, they are built on stated, defensible assumptions rather than presented as confident forecasts.",
        },
        {
          title: "Consistency with the petition",
          body: "Alignment with the petition letter, personal statement, and supporting evidence, so the plan reinforces the case rather than contradicting it.",
        },
      ],
    },
    {
      kind: "list",
      id: "process",
      eyebrow: "What happens",
      heading: "How we prepare your plan",
      numbered: true,
      items: [
        {
          title: "Define the endeavor or the entity",
          body: "For an NIW, we work with you to define the proposed endeavor precisely. For an EB-1C, we establish what the U.S. entity does and the role you will hold.",
        },
        {
          title: "Build the importance and feasibility case",
          body: "We identify what makes the work nationally important and gather the evidence that shows it is achievable and that you can advance it.",
        },
        {
          title: "Draft for a USCIS audience",
          body: "The plan is written in a measured, evidenced register aimed at an adjudicator, not an investor, with every claim tied to support.",
        },
        {
          title: "Ground the projections",
          body: "Any forward-looking figures are built on explicit assumptions that can withstand scrutiny.",
        },
        {
          title: "Align with the petition",
          body: "The finished plan is checked against the rest of the petition for consistency before it becomes part of the filing.",
        },
      ],
    },
    {
      kind: "list",
      id: "mistakes",
      eyebrow: "What goes wrong",
      heading: "Common business plan mistakes",
      items: [
        {
          title: "Repurposing an investor plan",
          body: "Using a plan written to raise money. Its promotional tone and optimistic projections read as unreliable to an adjudicator.",
        },
        {
          title: "An endeavor defined too vaguely",
          body: "A proposed endeavor stated so broadly that its national importance cannot be assessed. Precision is what makes the importance argument possible.",
        },
        {
          title: "Ungrounded projections",
          body: "Forecasts presented as facts, without the assumptions that would let an adjudicator judge whether they are credible.",
        },
        {
          title: "Importance asserted, not argued",
          body: "Claiming the work is nationally important through enthusiastic language rather than building the case from the nature of the work.",
        },
        {
          title: "Contradicting the rest of the petition",
          body: "A plan that describes the endeavor differently from the petition letter, creating an inconsistency in the record.",
        },
      ],
    },
    {
      kind: "prose",
      id: "how-we-help",
      eyebrow: "Working with us",
      heading: "How we help with business and endeavor plans",
      paragraphs: [
        "Immigration Horizons is an immigration consulting and paralegal services practice. We are not attorneys and do not provide legal representation or legal advice. We prepare business plans and personal endeavor plans written specifically for a USCIS audience — defining the endeavor, building the national-importance and feasibility case, and grounding any projections in defensible assumptions.",
        "Plans can be prepared on their own or as part of a full petition package, and we regularly build them as additional capacity for attorneys and paralegals. Because the plan has to fit the petition, we build it in alignment with the rest of the case wherever we are also preparing those documents.",
      ],
    },
  ],
  faqs: [
    {
      question: "Do I need a business plan for an EB-2 NIW?",
      answer:
        "It depends on the case. A business or endeavor plan is often valuable because it is where the proposed endeavor is defined precisely and its national importance and feasibility are documented, which speaks directly to the Dhanasar framework. Whether a full plan or a shorter endeavor document is appropriate is something we assess for your specific case.",
    },
    {
      question: "Can I use my investor business plan for immigration?",
      answer:
        "It is not advisable. Investor plans are written to raise capital and use an optimistic, promotional tone with confident projections. A USCIS adjudicator reads for credibility rather than upside, and that promotional framing tends to harm an immigration plan. An immigration plan needs to be measured, evidenced, and written for a different audience.",
    },
    {
      question: "What is the difference between an EB-2 NIW plan and an EB-1C plan?",
      answer:
        "An EB-2 NIW plan documents your proposed endeavor and its national importance and feasibility, connecting to the Dhanasar prongs. An EB-1C plan documents the U.S. entity's operations, structure, and viability, and the managerial or executive role you will hold. They support different arguments and are built differently.",
    },
    {
      question: "How long is an immigration business plan?",
      answer:
        "There is no fixed length, and longer is not better. The plan should be as detailed as the case requires to define the endeavor, establish its importance, and show feasibility — and no longer. Padding a plan with generic market content weakens rather than strengthens it.",
    },
    {
      question: "Can you prepare just the plan?",
      answer:
        "Yes. A business or endeavor plan can be prepared on its own, whether you are handling the rest of the petition yourself or working with an attorney. Where we are also preparing the petition, we build the plan in alignment with the other documents so the case stays consistent.",
    },
  ],
  faqTitle: "Business plan frequently asked questions",
  faqDescription:
    "The questions we are asked most often about business and endeavor plans for immigration petitions.",
  sources: [
    {
      label: "USCIS — Employment-Based Immigration: Second Preference EB-2",
      href: "https://www.uscis.gov/working-in-the-united-states/permanent-workers/employment-based-immigration-second-preference-eb-2",
    },
    {
      label: "Matter of Dhanasar, 26 I&N Dec. 884 (AAO 2016)",
      href: "https://www.justice.gov/eoir/page/file/920996/download",
    },
  ],
  scopeNote:
    "This page is general educational information about business and endeavor plans in immigration petitions, not legal advice about any individual case.",
};
