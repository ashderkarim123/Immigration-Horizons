/**
 * Brand positioning copy.
 *
 * Positioning rule that governs every word here: Immigration Horizons is an
 * immigration consulting and paralegal services practice, not a law firm.
 * Language must stay within "consultants / specialists / petition preparation
 * / paralegal support" and must never imply legal representation or advice.
 */

export const mission = {
  heading: "Our mission",
  body: "To give professionals the same quality of petition preparation that large firms reserve for their biggest cases — clear strategy, evidence organised to be read, and documents written from scratch around one person's record.",
};

export const vision = {
  heading: "Our vision",
  body: "To become the most trusted independent immigration consulting practice for employment-based petitions, judged on work that can be checked rather than claims that cannot.",
};

export type CoreValue = {
  title: string;
  body: string;
};

export const coreValues: CoreValue[] = [
  {
    title: "Honest assessment first",
    body: "If your profile does not yet support the category you are asking about, we say so at the consultation. A weak filing costs you far more than a candid conversation.",
  },
  {
    title: "Evidence over adjectives",
    body: "Adjudicators respond to documented facts, not enthusiastic language. Every claim we draft is tied to something in your record.",
  },
  {
    title: "Verifiable, not just claimed",
    body: "Our reviews and completed-case history are public on our marketplace profiles. We do not publish testimonials a visitor cannot check.",
  },
  {
    title: "Clear scope, clear boundaries",
    body: "We prepare, draft, research, and organise. We are not attorneys and do not provide legal representation or legal advice — and we tell every client exactly where that line sits.",
  },
];

/**
 * Audience segments, taken from the practice's actual client mix across
 * EB-2 NIW and EB-1 filings.
 */
export type Audience = {
  title: string;
  body: string;
};

export const whoCanApply: Audience[] = [
  {
    title: "Engineers",
    body: "Civil, mechanical, electrical, and software engineers whose work advances infrastructure, safety, energy, or manufacturing capability in the U.S.",
  },
  {
    title: "Researchers & scientists",
    body: "Principal investigators, postdoctoral researchers, and industry scientists with publication, citation, or peer-review records.",
  },
  {
    title: "Physicians & healthcare professionals",
    body: "Clinicians, specialists, and public-health professionals, including those working in underserved settings or on population-level health outcomes.",
  },
  {
    title: "AI & data professionals",
    body: "Machine learning engineers, applied scientists, and data leaders whose systems are deployed at meaningful scale.",
  },
  {
    title: "University professors & academics",
    body: "Faculty and academic staff with teaching and research records — often the strongest fit for EB-1B where an employer is sponsoring.",
  },
  {
    title: "Entrepreneurs & founders",
    body: "Founders whose venture creates U.S. jobs, capability, or technology, documented through traction rather than intention.",
  },
  {
    title: "Executives & senior managers",
    body: "Multinational managers and executives transferring into a U.S. entity — the core EB-1C profile.",
  },
  {
    title: "Immigration attorneys & paralegals",
    body: "Firms that need extra drafting capacity on a case, whether that is a petition letter, an evidence package, or an RFE response under deadline.",
  },
];

/**
 * Saying plainly who we turn away is a stronger trust signal than any claim
 * about who we serve — and it filters out consultations that would waste
 * everyone's time.
 */
export const whoWeDontHelp: Audience[] = [
  {
    title: "Anyone needing legal representation",
    body: "If your situation calls for an attorney — removal proceedings, an appeal, or anything requiring representation before USCIS or a court — you need a licensed immigration lawyer, not a consultant. We will tell you that directly.",
  },
  {
    title: "Profiles that do not yet meet the threshold",
    body: "If your record does not currently support the category you are asking about, we say so at the consultation rather than taking the work. Sometimes the right advice is to build the record for a year first.",
  },
  {
    title: "Anyone wanting evidence overstated",
    body: "We will not describe work as more significant than the record shows, or draft letters that claim what a recommender cannot support. Misrepresentation carries serious consequences for the applicant, not the preparer.",
  },
  {
    title: "Anyone shopping for a guarantee",
    body: "No preparer controls how USCIS adjudicates a petition. If a promised approval is what you are looking for, we are not the right practice — and we would be wary of any that offers one.",
  },
];
