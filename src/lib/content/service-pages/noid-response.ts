import type { ServicePageContent } from "./types";

/** NOID response preparation. A core support service, not a visa category. */
export const noidResponse: ServicePageContent = {
  slug: "noid-response",
  name: "NOID Response",
  eyebrow: "Notice of Intent to Deny support",
  headline: "NOID Response Preparation for EB-2 NIW and EB-1 Petitions",
  subhead:
    "A point-by-point rebuttal of the officer's stated grounds, with new evidence and an indexed exhibit set — including petitions we did not prepare. You or your attorney file the response.",
  definition:
    "A Notice of Intent to Deny (NOID) is a written notice from USCIS stating that the officer intends to deny a petition and explaining why, while giving the petitioner a final opportunity to respond with rebuttal and evidence before a decision is made. It is more serious than a Request for Evidence, but it is not a denial.",
  metaTitle: "NOID Response Help for I-140 | Immigration Horizons",
  metaDescription:
    "NOID response preparation for EB-2 NIW and EB-1 petitions: we map every ground for denial, rebut it with evidence and build the exhibit index. You file.",
  keywords: [
    "NOID response",
    "notice of intent to deny I-140",
    "NIW NOID",
    "EB1A NOID response",
    "USCIS NOID",
    "NOID vs RFE",
    "I-140 NOID rebuttal",
  ],
  keyFacts: [
    { label: "Notice type", value: "Notice of Intent to Deny" },
    { label: "Issued by", value: "USCIS" },
    { label: "Response window", value: "Stated in the notice; respond before it" },
    { label: "Applies to", value: "Form I-140 and other benefit requests" },
    { label: "Petitions we did not prepare", value: "Yes" },
    { label: "Who files the response", value: "You or your attorney" },
  ],
  toc: [
    { id: "what-is-noid", label: "What is a NOID?" },
    { id: "noid-vs-rfe", label: "NOID vs RFE" },
    { id: "how-we-prepare", label: "How we prepare a response" },
    { id: "what-to-send", label: "What you need to send us" },
    { id: "attorney", label: "When to involve an attorney" },
    { id: "faqs", label: "Frequently asked questions" },
  ],
  sections: [
    {
      kind: "prose",
      id: "what-is-noid",
      eyebrow: "The basics",
      heading: "What is a Notice of Intent to Deny?",
      paragraphs: [
        "A Notice of Intent to Deny is USCIS telling you, in writing, that the officer has reviewed the record and currently intends to deny the petition. The notice sets out the grounds: which requirement the officer believes is not met, what in the record led to that view, and sometimes which evidence the officer found unpersuasive and why. It then gives a response period, stated in the notice itself, within which rebuttal evidence and argument may be submitted.",
        "The regulation governing it is 8 CFR 103.2(b)(8)(iv). In plain terms, a NOID is issued when the evidence on file leads the officer toward denial but the officer is required, or chooses, to give the petitioner the chance to address the problem first. USCIS Policy Manual Volume 1, Part E, Chapter 6 describes when officers issue a NOID rather than an RFE and how responses are treated.",
        "Two things follow from that. First, a NOID is not a denial: the petition is still pending and the response is read before any decision issues. Second, the notice is specific. Unlike a Request for Evidence, which asks for information, a NOID explains the officer's reasoning. That reasoning is the thing the response has to engage with.",
        "The response period is firm. If no response is received by the date in the notice, the petition is decided on the existing record, and because the officer has already indicated an intent to deny, that decision is almost always a denial. The time to start is the day the notice arrives.",
      ],
      callout: {
        title: "We prepare responses to petitions we did not prepare",
        body: "Most NOID work reaches us on petitions originally prepared by the applicant, by a document service, or by a firm that has since stepped back. We need the notice and the original filing, not a history with the case.",
      },
    },
    {
      kind: "prose",
      id: "noid-vs-rfe",
      eyebrow: "Know the difference",
      heading: "NOID versus RFE: why the stakes are higher",
      paragraphs: [
        "A Request for Evidence says the officer needs more information before deciding. A Notice of Intent to Deny says the officer has enough information and, on that information, intends to deny. The first invites you to fill a gap. The second asks you to change the officer's mind.",
        "That shifts what a good response looks like. An RFE response can succeed by supplying the missing documents cleanly. A NOID response has to do more: it has to take each stated ground, show why the officer's reading of the record does not support denial, and back that with evidence the officer can locate. Supplying more documents without addressing the reasoning leaves the reasoning standing.",
        "The other difference is finality. A NOID is normally the last correspondence before a decision. Whatever is in the response is what the officer decides on, so the response is treated as the final submission in the case, not as one more exchange.",
        "If you have received a Request for Evidence rather than a NOID, the response discipline is related but the notice is different. Our RFE page covers that situation, including RFEs on petitions prepared elsewhere.",
      ],
      callout: {
        title: "Read the grounds, not just the conclusion",
        body: "A NOID usually contains boilerplate restating the legal standard and then a shorter passage explaining what, in your record, failed it. The short passage is the notice. Everything in the response is organized around it.",
      },
      links: [{ label: "RFE response preparation", href: "/services/rfe-response" }],
    },
    {
      kind: "list",
      id: "how-we-prepare",
      eyebrow: "Our method",
      heading: "How we prepare a NOID response",
      numbered: true,
      intro: [
        "The sequence below is the same for an EB-2 NIW, EB-1A, EB-1B or EB-1C notice. What changes is the standard being argued: the Dhanasar prongs for an NIW, the regulatory criteria and final merits determination for EB-1A, the qualifying position and criteria for EB-1B, the corporate relationship and managerial capacity for EB-1C.",
      ],
      items: [
        {
          title: "Read the notice and the original record together",
          body: "We read the NOID alongside the petition it responds to, so we know what the officer was working from and what was already in the record but may have been overlooked or discounted.",
        },
        {
          title: "Map each ground for denial",
          body: "Every distinct reason the officer gives is isolated and written down as a question the response must answer. A single NOID often contains three or four separate grounds hidden inside one paragraph.",
        },
        {
          title: "Rebut the officer's reasoning point by point",
          body: "For each ground, the response states the standard, states what the officer concluded, and explains with reference to specific exhibits why the record meets the standard. Each ground gets its own labeled section in the officer's order.",
        },
        {
          title: "Gather new evidence that answers the ground",
          body: "Where the record is genuinely thin on a point, we identify what would answer it and give you a specific list to obtain: letters, records, citations, corporate documents. Evidence is chosen because it answers a ground, not because it adds weight.",
        },
        {
          title: "Draft the response brief and the exhibit index",
          body: "The brief is written as a single document the officer can read with the notice beside it. Every assertion cites an exhibit; the index lists every exhibit, old and new, so nothing has to be hunted for.",
        },
        {
          title: "Client review and hand-off for filing",
          body: "You, or your attorney, review the complete response. We reconcile it against the original petition for consistency and hand over a package ready for you or your attorney to file within the response period.",
        },
      ],
    },
    {
      kind: "list",
      id: "what-to-send",
      eyebrow: "Getting started",
      heading: "What you need to send us",
      intro: [
        "We can start as soon as we receive these. Partial material slows the first step, because the grounds cannot be mapped without the full notice.",
      ],
      items: [
        {
          title: "The full notice",
          body: "Every page of the NOID, including the cover page with the receipt number and the stated response date. The grounds are often spread across the whole document.",
        },
        {
          title: "The filed petition and its exhibits",
          body: "The petition letter, Form I-140 as filed, and the exhibit set, ideally with the index. If you do not have a complete copy, send what you have and tell us what is missing.",
        },
        {
          title: "Any prior RFE and the response to it",
          body: "If the petition already went through a Request for Evidence, both the notice and the response are part of the record the officer is now reading, and the NOID will usually refer to them.",
        },
        {
          title: "Anything new since filing",
          body: "New publications, citations, letters, contracts, awards, corporate changes: anything that bears on the grounds and did not exist, or was not included, when the petition was filed.",
        },
      ],
    },
    {
      kind: "prose",
      id: "attorney",
      eyebrow: "Scope",
      heading: "When to involve an attorney",
      paragraphs: [
        "Immigration Horizons is an immigration consulting and paralegal services practice. We prepare the response brief, the evidence and the exhibit index. We do not file the response, appear before USCIS, or give legal advice on whether to respond, withdraw or refile. The client or their attorney files.",
        "Some situations call for an attorney's involvement from the outset, and we say so when we see them. A NOID that raises questions about your immigration status, a prior denial or misrepresentation finding, a notice that cites fraud or material misrepresentation, or any case heading toward an appeal, motion or litigation needs legal counsel. In those cases we are glad to work as drafting capacity alongside your attorney, which is a common arrangement for us.",
        "The decision whether to respond, to withdraw the petition, or to refile instead is a legal and strategic choice. We can set out, in general terms, what each option involves so you can discuss it with your attorney, but the decision is yours and theirs.",
      ],
    },
    {
      kind: "cta",
      title: "Received a NOID? Send it to us today.",
      body: "Send the full notice and the filed petition. We will tell you plainly what the grounds are, what a response would need to show, and whether we can prepare it.",
      ctaLabel: "Book a free consultation",
    },
  ],
  faqs: [
    {
      question: "Can you respond to a NOID on a petition you did not prepare?",
      answer:
        "Yes. Most of the NOID responses we prepare are on petitions originally prepared by the applicant, by another service or by a firm that is no longer involved. We need the full notice and the petition as filed, with its exhibits. From those we map the grounds and prepare the response brief and evidence for you or your attorney to file.",
    },
    {
      question: "Is a NOID a denial?",
      answer:
        "No. A Notice of Intent to Deny means the officer currently intends to deny the petition and is giving you a final chance to respond before deciding. The petition remains pending until a decision issues. A response that engages with the officer's stated reasoning and supports it with evidence is read before that decision is made.",
    },
    {
      question: "What happens if I do not respond to a NOID?",
      answer:
        "If no response is received by the date stated in the notice, USCIS decides the petition on the existing record. Because the officer has already set out an intent to deny, that decision is almost always a denial. The response period is stated in the notice itself and is firm, so preparation should start the day the notice arrives.",
    },
    {
      question: "Can new evidence be submitted with a NOID response?",
      answer:
        "Yes. A NOID response may include new evidence and argument addressing the grounds in the notice. The evidence must relate to eligibility as it stood when the petition was filed, and it must answer the officer's stated reasons rather than simply add volume. We identify which grounds the record is thin on and give you a specific list of what to obtain.",
    },
    {
      question: "Should I withdraw and refile instead of responding?",
      answer:
        "That is a legal and strategic decision for you and your attorney. In general terms, responding keeps the current petition alive and answers the officer's grounds on the existing record, while withdrawing and refiling starts a new petition that can be built with a stronger record. Each has consequences for priority date and status that an attorney should assess. We can explain the options in general terms; we do not make the decision.",
    },
    {
      question: "What is the difference between a NOID and an RFE?",
      answer:
        "A Request for Evidence asks for more information before the officer decides. A Notice of Intent to Deny states that the officer has reviewed the record and intends to deny, explains why, and gives a final chance to respond. An RFE response can succeed by supplying what was asked for. A NOID response has to engage with the officer's reasoning point by point and support the rebuttal with evidence.",
    },
    {
      question: "Do you file the NOID response?",
      answer:
        "No. We prepare the response brief, the supporting evidence and the exhibit index. You or your attorney file the response with USCIS within the period stated in the notice. We are not a law firm and do not represent clients before USCIS.",
    },
  ],
  faqTitle: "NOID response frequently asked questions",
  faqDescription:
    "The questions we are asked most often about responding to a USCIS Notice of Intent to Deny on an I-140 petition.",
  sources: [
    {
      label: "8 CFR 103.2(b) — Evidence and processing; requests for evidence and notices of intent to deny",
      href: "https://www.ecfr.gov/current/title-8/chapter-I/subchapter-B/part-103/subpart-A/section-103.2",
    },
    {
      label: "USCIS Policy Manual, Volume 1, Part E, Chapter 6 — Evidence",
      href: "https://www.uscis.gov/policy-manual/volume-1-part-e-chapter-6",
    },
    { label: "USCIS — Form I-140", href: "https://www.uscis.gov/i-140" },
  ],
  scopeNote:
    "We prepare the NOID response brief, evidence and exhibit index for you or your attorney to file. We do not file it, appear before USCIS, or give legal advice on whether to respond, withdraw or refile.",
};
