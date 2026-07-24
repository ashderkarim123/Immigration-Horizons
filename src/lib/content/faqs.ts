/**
 * FAQ content. These strings are rendered on-page *and* serialised into
 * FAQPage JSON-LD, so they must stay plain-text and self-contained — Google
 * requires the schema answer to match the visible answer.
 *
 * Accuracy rules applied throughout:
 * - No processing-time or cost figures. Both change and are case-specific.
 * - No approval-rate or guarantee language of any kind.
 * - Nothing that reads as legal advice or implies we are attorneys.
 */

export type Faq = {
  question: string;
  answer: string;
};

export const homepageFaqs: Faq[] = [
  {
    question: "What is the EB-2 National Interest Waiver (NIW)?",
    answer:
      "The EB-2 National Interest Waiver is an employment-based immigrant petition route that lets a qualified applicant ask USCIS to waive the standard job offer and labor certification (PERM) requirements. USCIS assesses these petitions under the framework set out in Matter of Dhanasar, which asks three things: whether the proposed endeavor has substantial merit and national importance, whether the applicant is well positioned to advance it, and whether, on balance, it benefits the United States to waive the job offer requirement.",
  },
  {
    question: "Do I need a job offer or an employer to file an EB-2 NIW?",
    answer:
      "No. That is the defining feature of the National Interest Waiver. Because the job offer and labor certification requirements can be waived, an EB-2 NIW is a self-petition — you can file it yourself without an employer sponsoring you. This is what makes it attractive to researchers, founders, and professionals who do not have, or do not want to depend on, an employer-sponsored route.",
  },
  {
    question: "Who generally qualifies for an EB-2 NIW?",
    answer:
      "You must first meet the underlying EB-2 requirement, which means either holding an advanced degree (or a bachelor's degree plus five years of progressive post-baccalaureate experience) or demonstrating exceptional ability in the sciences, arts, or business. On top of that, you must satisfy the three Dhanasar prongs. Meeting the degree requirement alone is not sufficient — the substance of the case is the endeavor and the evidence behind it.",
  },
  {
    question: "What is the difference between EB-1A and EB-2 NIW?",
    answer:
      "EB-1A is for individuals with extraordinary ability who can show sustained national or international acclaim, evidenced either by a one-time major internationally recognised award or by satisfying at least three of the ten regulatory criteria in 8 CFR 204.5(h)(3). EB-2 NIW has a lower acclaim threshold but requires you to show that your specific proposed endeavor is nationally important and that waiving the job offer requirement benefits the United States. They are different arguments, not different tiers of the same argument, and some profiles genuinely support both.",
  },
  {
    question: "What is EB-1B, and how is it different from EB-1A?",
    answer:
      "EB-1B is for outstanding professors and researchers. Unlike EB-1A, it is not a self-petition — it requires a U.S. employer to sponsor you and to offer a tenured, tenure-track, or comparable permanent research position. It requires international recognition in a specific academic field, at least three years of teaching or research experience in that field, and evidence meeting at least two of the six regulatory criteria for the category.",
  },
  {
    question: "Who is EB-1C for?",
    answer:
      "EB-1C is for multinational managers and executives. It generally requires that you worked abroad in a managerial or executive capacity for at least one of the three years before the petition, for an entity related to the U.S. employer — such as a parent, branch, subsidiary, or affiliate — and that you are coming to the United States to work in a managerial or executive role for that related entity. It is employer-sponsored, and the corporate relationship between the two entities has to be documented properly.",
  },
  {
    question: "Are you an immigration law firm?",
    answer:
      "No. Immigration Horizons is an immigration consulting and paralegal services practice. We prepare petitions, draft documents, conduct research, organise evidence, and assist with USCIS forms and packaging. We are not attorneys, we do not provide legal advice, and we do not represent clients before USCIS or any court. Where a case needs legal representation, we say so.",
  },
  {
    question: "Can you help if I have already received an RFE or NOID?",
    answer:
      "Yes, and this is one of the most common ways clients come to us — including on petitions we did not originally prepare. We review the notice, identify precisely what the officer is questioning, and prepare a focused response addressing those specific points with supporting evidence, rather than resubmitting the original filing with more material attached.",
  },
  {
    question: "Can I hire you for just one document instead of a full petition?",
    answer:
      "Yes. Every deliverable can be engaged on its own — a recommendation letter set, an expert opinion letter, a business or endeavor plan, an evidence and exhibit package, or an RFE response. Many clients working with their own attorney use us for a single piece of the case, and we also work as additional drafting capacity for immigration attorneys and paralegals.",
  },
  {
    question: "Do you work with clients outside the United States?",
    answer:
      "Yes. The practice is built around international clients and we work across time zones as a matter of routine. Communication happens over email and WhatsApp, and where needed we can work in more than one language.",
  },
  {
    question: "How long does a petition take, and what does it cost?",
    answer:
      "Both depend on the category, the current state of your evidence, and the scope of work you actually need, so we quote after the consultation rather than publishing a fixed price list. On timing, USCIS processing times change continuously and vary by service centre and case type — we will not quote you a figure we cannot stand behind. The authoritative source is the official USCIS processing times tool, and we will walk you through what it means for your specific filing.",
  },
  {
    question: "Can you guarantee my petition will be approved?",
    answer:
      "No, and you should be cautious of anyone who does. USCIS adjudicates every petition on its own record, and no preparer controls that outcome. What we control is the quality of the argument, the strength and organisation of the evidence, and the internal consistency of the filing. Our completed-case history and client reviews are public on our marketplace profiles so you can assess our work rather than take a promise on trust.",
  },
];
