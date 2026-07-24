import type { ServicePageContent } from "./types";

export const expertOpinionLetters: ServicePageContent = {
  slug: "expert-opinion-letters",
  name: "Expert Opinion Letters",
  eyebrow: "Independent Field Expertise",
  headline: "Expert opinion letter preparation",
  subhead:
    "Independent expert opinion letters that explain the significance of your work to an adjudicator who is not a specialist in your field — drafted to be credible, specific, and defensible.",
  definition:
    "An expert opinion letter is a statement from a recognised authority in a field, offering an independent assessment of the significance of someone's work or the standards of their profession. In a petition it functions as third-party expert testimony, helping a non-specialist adjudicator understand why a contribution matters.",
  metaTitle: "Expert Opinion Letter Preparation for Immigration Petitions",
  metaDescription:
    "Independent expert opinion letter drafting for EB-2 NIW, EB-1A, EB-1B and O-1 petitions. Field-expert assessments that explain the significance of your work to a non-specialist adjudicator.",
  keywords: [
    "expert opinion letter",
    "immigration expert letter",
    "EB-1A expert opinion",
    "EB2 NIW expert letter",
    "expert testimonial letter",
    "advisory opinion",
  ],
  keyFacts: [
    { label: "Perspective", value: "Independent field expert" },
    { label: "Purpose", value: "Explain significance to a non-expert" },
    { label: "Available standalone", value: "Yes" },
    { label: "Used across", value: "EB-2 NIW, EB-1, O-1" },
    { label: "Distinct from", value: "Recommendation letters" },
  ],
  toc: [
    { id: "what-is-it", label: "What an expert opinion letter is" },
    { id: "vs-recommendation", label: "How it differs from a recommendation" },
    { id: "credible", label: "What makes one credible" },
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
      heading: "What is an expert opinion letter?",
      paragraphs: [
        "An expert opinion letter is a statement from an established authority in a field, giving an independent, reasoned assessment. In a petition, its job is to bridge a gap: the adjudicator deciding your case is an immigration officer, not a specialist in your discipline, and cannot be expected to judge on their own whether a particular contribution is significant to your field.",
        "The expert supplies that judgement. A well-drafted expert opinion explains, in accessible terms, what the relevant standards are in the field, where your work sits against them, and why a specific contribution matters. It gives the adjudicator an authoritative basis for a conclusion they could not reach unaided.",
        "Because the letter carries the weight of the expert's authority, its credibility is everything. An opinion that reads as advocacy — as an attempt to argue the case rather than assess it — undermines the very expertise it relies on. The strongest expert letters are measured, specific, and willing to explain their reasoning rather than simply asserting a conclusion.",
      ],
    },
    {
      kind: "prose",
      id: "vs-recommendation",
      eyebrow: "A common confusion",
      heading: "How an expert opinion differs from a recommendation letter",
      paragraphs: [
        "The two are often confused, and used interchangeably, but they do different jobs.",
        "A recommendation letter is usually from someone who knows you or your work directly, and speaks to what you specifically have done. Its value comes from first-hand knowledge of you.",
        "An expert opinion letter is usually from someone who may not know you at all, and speaks to the significance of the work and the standards of the field. Its value comes from the author's authority to judge the field, not from any personal connection to you. In fact, the absence of a personal relationship can strengthen an expert opinion, because it removes the suspicion of bias.",
        "The strongest petitions often use both: recommendation letters to establish what you did, first-hand, and expert opinion letters to establish, independently, that what you did matters. Understanding which letter is doing which job is part of assembling an evidence set that holds together.",
      ],
      callout: {
        title: "Independence is the source of the weight",
        body: "An expert with no relationship to you, assessing your work against the standards of the field, is exactly the kind of testimony that answers an adjudicator's real question — whether the work matters beyond the people invested in the petition.",
      },
    },
    {
      kind: "list",
      id: "credible",
      eyebrow: "The bar",
      heading: "What makes an expert opinion letter credible",
      items: [
        {
          title: "Genuine, documented expertise",
          body: "The author's standing to give the opinion must be clear and evidenced — their position, record, and recognition in the specific field the opinion addresses.",
        },
        {
          title: "Reasoning, not just conclusion",
          body: "An assertion that work is significant is weak; an explanation of why, against identifiable standards, is strong. The letter should show its working.",
        },
        {
          title: "Accessible to a non-specialist",
          body: "The opinion has to be understood by an adjudicator with no background in the field. Unexplained jargon defeats the letter's entire purpose.",
        },
        {
          title: "Measured tone",
          body: "An opinion that reads as balanced assessment is more persuasive than one that reads as advocacy. Overstatement invites scepticism about the expert's objectivity.",
        },
        {
          title: "Specific to your work",
          body: "General statements about the importance of a field do little. The opinion must connect the field's standards to your particular contribution.",
        },
      ],
    },
    {
      kind: "list",
      id: "process",
      eyebrow: "What happens",
      heading: "How we prepare expert opinion letters",
      numbered: true,
      items: [
        {
          title: "Identify what the opinion needs to establish",
          body: "We determine which point in the petition an expert opinion is best placed to support — significance of a contribution, standards of the field, or the standing of a body of work.",
        },
        {
          title: "Frame the expert's assessment",
          body: "We draft the opinion around a clear, reasoned assessment that an appropriate expert can genuinely endorse, explaining the field's standards and where your work sits.",
        },
        {
          title: "Keep it accessible and measured",
          body: "The draft is written for a non-specialist reader and kept to a tone of assessment rather than advocacy, so the expertise carries the weight.",
        },
        {
          title: "Align with the wider evidence",
          body: "The opinion is checked against the petition and the recommendation letters so the whole evidence set tells one coherent story.",
        },
        {
          title: "Expert review and endorsement",
          body: "The letter is provided to the expert to review, adjust, and sign. It must reflect their genuine professional judgement, in their own voice.",
        },
      ],
    },
    {
      kind: "list",
      id: "mistakes",
      eyebrow: "What goes wrong",
      heading: "Common expert opinion letter mistakes",
      items: [
        {
          title: "Reading as advocacy",
          body: "An opinion that argues the case rather than assessing the work undermines the objectivity that gives it value.",
        },
        {
          title: "Conclusion without reasoning",
          body: "Stating that work is important without explaining why, against what standard. Adjudicators discount unsupported assertions even from senior figures.",
        },
        {
          title: "Unexplained technical language",
          body: "Writing for peers rather than for the adjudicator. If the non-specialist reader cannot follow it, the opinion cannot do its job.",
        },
        {
          title: "An expert whose standing is not established",
          body: "Failing to document why this particular author is qualified to give an authoritative opinion in the specific field at issue.",
        },
        {
          title: "Generic field statements",
          body: "Praising the importance of the field in general without connecting it to your specific contribution.",
        },
      ],
    },
    {
      kind: "prose",
      id: "how-we-help",
      eyebrow: "Working with us",
      heading: "How we help with expert opinion letters",
      paragraphs: [
        "Immigration Horizons is an immigration consulting and paralegal services practice. We are not attorneys and do not provide legal representation or legal advice. We draft expert opinion letters as reasoned, accessible, independent assessments that an appropriate expert can genuinely endorse and sign in their own voice.",
        "Expert opinion letters can be prepared on their own or as part of a full petition package, and we frequently prepare them as additional drafting capacity for attorneys and paralegals. Where a matter calls for a formal advisory opinion from a specific body — as an O-1 petition does — that is a distinct requirement, and we can help you understand and coordinate it.",
      ],
    },
  ],
  faqs: [
    {
      question: "What is an expert opinion letter?",
      answer:
        "It is a statement from a recognised authority in a field giving an independent, reasoned assessment — typically of the significance of someone's work or the standards of their profession. In a petition it helps a non-specialist immigration adjudicator understand why a contribution matters, on the strength of the expert's authority to judge the field.",
    },
    {
      question: "How is it different from a recommendation letter?",
      answer:
        "A recommendation letter is usually from someone who knows your work directly and speaks to what you have done. An expert opinion letter is usually from an authority who may not know you at all, and speaks to the significance of the work and the standards of the field. The absence of a personal relationship can actually strengthen an expert opinion.",
    },
    {
      question: "Does the expert need to know me personally?",
      answer:
        "No, and often it is better if they do not. An expert opinion draws its weight from the author's authority to assess the field, not from a personal connection to you. Independence removes the suspicion of bias, which is part of what makes the assessment credible to an adjudicator.",
    },
    {
      question: "Can you provide the expert as well as the letter?",
      answer:
        "We draft the letter to be reasoned, accessible, and defensible, and it must be reviewed and signed by an appropriate expert who genuinely endorses it. The expert's authority and independence are central to the letter's value, so the opinion has to reflect their real professional judgement, in their own voice.",
    },
    {
      question: "Is an expert opinion letter the same as an O-1 advisory opinion?",
      answer:
        "No. An O-1 petition requires a formal written advisory opinion from a specific peer, labor, or management organisation, which is a distinct procedural requirement. An expert opinion letter is evidence about the significance of your work and can be used across categories. We can help you understand and coordinate both.",
    },
  ],
  faqTitle: "Expert opinion letter frequently asked questions",
  faqDescription:
    "The questions we are asked most often about expert opinion letters and how they differ from recommendation and advisory letters.",
  sources: [
    {
      label: "USCIS — Employment-Based Immigration: First Preference EB-1",
      href: "https://www.uscis.gov/working-in-the-united-states/permanent-workers/employment-based-immigration-first-preference-eb-1",
    },
    {
      label: "USCIS Policy Manual — Extraordinary Ability (evidence evaluation)",
      href: "https://www.uscis.gov/policy-manual/volume-6-part-f-chapter-2",
    },
  ],
  scopeNote:
    "This page is general educational information about expert opinion letters in immigration petitions, not legal advice about any individual case.",
};
