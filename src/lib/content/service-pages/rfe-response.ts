import type { ServicePageContent } from "./types";

/** RFE / NOID response preparation. A support service, not a visa category. */
export const rfeResponse: ServicePageContent = {
  slug: "rfe-response",
  name: "RFE & NOID Responses",
  eyebrow: "Request for Evidence Support",
  headline: "USCIS RFE & NOID response preparation",
  subhead:
    "A focused, evidence-led response to a Request for Evidence or Notice of Intent to Deny — including cases we did not originally prepare, and under deadline.",
  definition:
    "A USCIS Request for Evidence (RFE) is a formal notice asking for additional documentation before an officer decides a petition. It is not a denial. A well-prepared RFE response addresses the specific concerns the officer raised, point by point, with targeted evidence — rather than resubmitting the original filing with more material attached.",
  metaTitle: "USCIS RFE Response Preparation | RFE & NOID Support",
  metaDescription:
    "Professional USCIS RFE and NOID response preparation for EB-2 NIW, EB-1A, EB-1B, EB-1C and O-1 petitions — including cases filed by someone else. Focused, evidence-led responses under deadline.",
  keywords: [
    "USCIS RFE",
    "RFE response",
    "Request for Evidence",
    "NOID response",
    "Notice of Intent to Deny",
    "EB2 NIW RFE",
    "RFE response help",
    "immigration RFE",
  ],
  keyFacts: [
    { label: "Applies to", value: "Any employment-based petition" },
    { label: "Our own cases", value: "Yes" },
    { label: "Cases filed elsewhere", value: "Yes" },
    { label: "An RFE is", value: "A request, not a denial" },
    { label: "Deadline-driven", value: "Responses are time-limited" },
  ],
  toc: [
    { id: "what-is-rfe", label: "What is an RFE?" },
    { id: "rfe-vs-noid", label: "RFE vs NOID" },
    { id: "why-it-matters", label: "Why the response matters" },
    { id: "approach", label: "How we approach a response" },
    { id: "process", label: "The process" },
    { id: "mistakes", label: "Common mistakes" },
    { id: "how-we-help", label: "How we help" },
    { id: "faqs", label: "Frequently asked questions" },
  ],
  sections: [
    {
      kind: "prose",
      id: "what-is-rfe",
      eyebrow: "The basics",
      heading: "What is a USCIS Request for Evidence?",
      paragraphs: [
        "A Request for Evidence is a notice USCIS issues when an officer needs more information before deciding a petition. It sets out specific points on which the officer is not yet satisfied, and it gives a deadline by which a response must be received.",
        "The most important thing to understand is that an RFE is not a denial, and it is not a signal that the case is lost. It is an opportunity — often the last one before a decision — to close the specific gaps the officer identified. Many petitions that receive an RFE go on to be approved once those gaps are addressed properly.",
        "It is equally important to understand that an RFE is specific. The officer has told you, in the notice, exactly what is troubling them. A response that ignores those points and simply restates the original argument, or buries the answer under a large volume of new material, tends to fail — not because the case is weak, but because the response did not do the one job it had.",
        "RFE deadlines are firm. Missing the deadline generally results in the petition being decided on the existing record, which usually means denial. The clock starts when the notice issues, so the time to begin is immediately.",
      ],
      callout: {
        title: "We respond to cases we did not file",
        body: "A significant share of the RFE work we do is on petitions originally prepared by someone else — including cases where the applicant's law firm provided limited support. Coming to us at the RFE stage is common and entirely workable.",
      },
    },
    {
      kind: "prose",
      id: "rfe-vs-noid",
      eyebrow: "Know the difference",
      heading: "RFE versus NOID",
      paragraphs: [
        "A Notice of Intent to Deny (NOID) is more serious than an RFE. Where an RFE says the officer needs more information, a NOID says the officer is currently inclined to deny the petition and is giving you a final chance to change their mind.",
        "The practical difference is tone and stakes. A NOID response has to do more than supply missing documents: it has to engage directly with the officer's stated reasoning and explain why that reasoning does not support denial, backed by evidence. The margin for a vague or partial response is smaller.",
        "In both cases the underlying discipline is the same — read what the officer actually said, address each point specifically, and support every assertion with evidence the officer can locate. The difference is that a NOID leaves less room for error, which makes careful preparation more important, not less.",
      ],
    },
    {
      kind: "list",
      id: "why-it-matters",
      eyebrow: "What is at stake",
      heading: "Why the response matters more than the original filing",
      intro: [
        "By the time an RFE issues, the officer has already formed a view. The response is your chance to move that view — and a few things determine whether it does.",
      ],
      items: [
        {
          title: "It is often the last word",
          body: "In many cases the officer decides on the response without further correspondence. What you submit here is frequently the final input into the decision, which is why it warrants more care than a routine filing, not less.",
        },
        {
          title: "The officer told you the standard",
          body: "An RFE usually cites the specific regulatory language or criterion at issue. That is a gift: it tells you exactly what the response has to satisfy. A good response quotes the officer's own framing back and answers it directly.",
        },
        {
          title: "New evidence must be relevant, not merely more",
          body: "Adding volume is not the same as answering the question. Evidence that does not speak to the officer's specific concern adds length without adding persuasion, and can obscure the material that does answer it.",
        },
        {
          title: "Consistency with the original filing is scrutinised",
          body: "The response is read alongside the original petition. Anything in the response that contradicts the original filing creates a new problem, so the two have to be reconciled deliberately.",
        },
      ],
    },
    {
      kind: "subsections",
      id: "approach",
      eyebrow: "Our method",
      heading: "How we approach an RFE response",
      subsections: [
        {
          heading: "Parse the notice before anything else",
          paragraphs: [
            "The first task is to separate what the officer is actually asking from how the RFE is phrased. Standard RFE templates contain boilerplate, and it is easy to respond to the template language rather than to the specific concern that triggered the notice. We identify each distinct issue the officer has raised and treat each as a question that must be answered.",
          ],
        },
        {
          heading: "Answer point by point, in the officer's order",
          paragraphs: [
            "The response is structured to mirror the RFE. Each concern the officer raised gets its own labelled section, so that when the officer reads the response with the notice beside them, every point is easy to find and visibly addressed. Nothing is left for the officer to infer or hunt for.",
          ],
        },
        {
          heading: "Supply targeted evidence, indexed",
          paragraphs: [
            "For each point, we identify the specific evidence that answers it and present that evidence in a clear, indexed exhibit set. Where the original filing already contained relevant material the officer may have overlooked, we point to it directly rather than assuming it will be reconsidered.",
          ],
        },
        {
          heading: "Reconcile with the original record",
          paragraphs: [
            "Before submission, the response is checked against the original petition for consistency, so the officer sees a coherent case rather than two documents that describe the situation differently.",
          ],
        },
      ],
    },
    {
      kind: "list",
      id: "process",
      eyebrow: "What happens",
      heading: "The RFE response process",
      numbered: true,
      items: [
        {
          title: "Send us the notice and the original filing",
          body: "We need the full RFE and, ideally, the petition it responds to. The notice tells us the concerns; the original filing tells us what the officer was working from.",
        },
        {
          title: "Issue analysis",
          body: "We break the notice into its distinct issues and identify, for each, what would satisfy the officer and what evidence is available or obtainable.",
        },
        {
          title: "Evidence plan",
          body: "You receive a specific list of what to gather for each point, with an eye on the deadline so nothing is left to the last moment.",
        },
        {
          title: "Drafting",
          body: "We draft the response letter, structured point by point, and prepare or revise supporting letters and documents as needed.",
        },
        {
          title: "Exhibit assembly",
          body: "Evidence is organised and indexed so each response point maps to the document that supports it.",
        },
        {
          title: "Review and submission preparation",
          body: "The complete response is checked for consistency with the original filing and prepared for submission within the deadline.",
        },
      ],
    },
    {
      kind: "list",
      id: "mistakes",
      eyebrow: "What goes wrong",
      heading: "Common RFE response mistakes",
      items: [
        {
          title: "Restating the original argument",
          body: "The officer already read the original filing and was not persuaded. Repeating it, more emphatically, does not address why.",
        },
        {
          title: "Answering the boilerplate, not the concern",
          body: "Responding to the templated language of the RFE while missing the specific issue that actually triggered it.",
        },
        {
          title: "Burying the answer in volume",
          body: "Submitting a large quantity of new material without making clear which item answers which concern. Evidence the officer cannot connect to a point does little work.",
        },
        {
          title: "Creating inconsistencies",
          body: "New statements in the response that contradict the original petition, handing the officer a fresh reason for doubt.",
        },
        {
          title: "Leaving it too late",
          body: "RFE and NOID deadlines are firm. Starting late compresses the evidence-gathering stage, which is usually where the time is actually needed.",
        },
      ],
    },
    {
      kind: "prose",
      id: "how-we-help",
      eyebrow: "Working with us",
      heading: "How we help with RFEs and NOIDs",
      paragraphs: [
        "Immigration Horizons is an immigration consulting and paralegal services practice. We are not attorneys and do not provide legal representation or legal advice. On RFE and NOID matters we analyse the notice, plan and draft the response, prepare or revise supporting letters, and assemble an indexed exhibit set that maps to each of the officer's concerns.",
        "We take these on across all the categories we work in — EB-2 NIW, EB-1A, EB-1B, EB-1C, and O-1 — including petitions we did not originally prepare, and we regularly work as additional drafting capacity for immigration attorneys and paralegals responding under deadline.",
      ],
    },
  ],
  faqs: [
    {
      question: "Is an RFE a denial?",
      answer:
        "No. A Request for Evidence means the officer needs more information before deciding, not that the petition has been refused. Many petitions that receive an RFE are approved once the specific concerns raised in the notice are addressed properly with targeted evidence.",
    },
    {
      question: "Can you help with an RFE on a petition someone else filed?",
      answer:
        "Yes. A large share of our RFE work is on petitions originally prepared by another party, including cases where an applicant's law firm provided limited support. We review the notice and the original filing and prepare a focused response regardless of who prepared the petition.",
    },
    {
      question: "What is the difference between an RFE and a NOID?",
      answer:
        "An RFE asks for more information; a Notice of Intent to Deny states that the officer is currently inclined to deny the petition and gives a final chance to respond. A NOID response has to engage directly with the officer's stated reasoning, not just supply missing documents, so the margin for a partial response is smaller.",
    },
    {
      question: "How long do I have to respond to an RFE?",
      answer:
        "The deadline is stated in the notice and it is firm. Missing it generally means the petition is decided on the existing record, which usually results in denial. Because the evidence-gathering stage is where time is most often needed, it is best to begin as soon as the notice arrives.",
    },
    {
      question: "What should an RFE response contain?",
      answer:
        "A response should address each concern the officer raised, point by point, in the officer's own framing, supported by targeted and indexed evidence. It should also be consistent with the original petition. Simply resubmitting the original filing with more material attached is the most common reason responses fail.",
    },
    {
      question: "Does responding to an RFE guarantee approval?",
      answer:
        "No. USCIS decides each petition on its record and no preparer controls that outcome. What a well-prepared response controls is whether the officer's specific concerns are clearly and credibly answered, which is the part within anyone's power to influence.",
    },
  ],
  faqTitle: "RFE & NOID frequently asked questions",
  faqDescription:
    "The questions we are asked most often about responding to a USCIS Request for Evidence or Notice of Intent to Deny.",
  sources: [
    {
      label: "USCIS — Responding to a Request for Evidence",
      href: "https://www.uscis.gov/forms/filing-guidance/tips-for-filing-forms-by-mail",
    },
    {
      label: "USCIS — Check Case Processing Times",
      href: "https://egov.uscis.gov/processing-times/",
    },
  ],
  scopeNote:
    "This page is general educational information about USCIS Requests for Evidence and Notices of Intent to Deny, not legal advice about any individual case.",
};
