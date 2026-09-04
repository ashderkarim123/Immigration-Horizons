import type { ServicePageContent } from "./types";

export const evidencePackaging: ServicePageContent = {
  slug: "evidence-packaging",
  name: "Evidence Review & Packaging",
  eyebrow: "Exhibits, Indexing, Filing Order",
  headline: "Evidence review, packaging & document organization",
  subhead:
    "Review, organisation, and indexing of your supporting evidence into a clean, navigable exhibit set — so every claim in the petition maps to a document an adjudicator can find immediately.",
  definition:
    "Evidence packaging is the review, organisation, and indexing of a petition's supporting documents into a structured exhibit set. Well-organised evidence lets an adjudicator locate the proof behind each claim without searching; poorly organised evidence, however strong, can be overlooked simply because it could not be found.",
  metaTitle: "USCIS Evidence Packaging & Document Organization",
  metaDescription:
    "Evidence review, exhibit organisation, and indexing for EB-2 NIW, EB-1A, EB-1B, EB-1C and O-1 petitions — a strong record made into a filing-ready exhibit set.",
  keywords: [
    "evidence packaging",
    "USCIS documentation",
    "exhibit index",
    "petition exhibits",
    "immigration document organization",
    "evidence organization",
    "petition packaging",
  ],
  keyFacts: [
    { label: "What it produces", value: "Indexed, filing-ready exhibits" },
    { label: "Core principle", value: "Every claim maps to a document" },
    { label: "Available standalone", value: "Yes" },
    { label: "Used across", value: "All petition categories" },
    { label: "Also for", value: "Attorneys & paralegals" },
  ],
  toc: [
    { id: "what-is-it", label: "What evidence packaging is" },
    { id: "why-it-matters", label: "Why organisation changes outcomes" },
    { id: "what-good-looks-like", label: "What a good exhibit set looks like" },
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
      heading: "What evidence packaging actually is",
      paragraphs: [
        "Evidence packaging is the work of turning a pile of supporting documents into a structured, indexed exhibit set that an adjudicator can navigate. It sits between having the right evidence and filing a petition that presents it well — and it is routinely underestimated.",
        "The core idea is simple: every factual claim the petition makes should be traceable to a specific, numbered exhibit, and the adjudicator should be able to get from the claim to the proof in seconds. When the petition letter says a method was adopted by other research groups, the reader should be able to turn immediately to the exhibit that shows it.",
        "This is not clerical work. Deciding what to include and what to leave out, how to group and sequence exhibits, and how to label them so the argument is easy to follow, is a substantive part of building a persuasive petition. A strong record presented as an unsorted stack is a weaker petition than a moderate record presented clearly.",
      ],
    },
    {
      kind: "list",
      id: "why-it-matters",
      eyebrow: "The stakes",
      heading: "Why organisation changes outcomes",
      intro: [
        "Adjudicators work through a high volume of petitions under time pressure. How evidence is organised directly affects whether it is seen and credited.",
      ],
      items: [
        {
          title: "Evidence that cannot be found is evidence that was not submitted",
          body: "An adjudicator is not obliged to search an unsorted set for support the petition asserts exists. Strong material buried in a disorganised package can be missed entirely, and its absence read against the petition.",
        },
        {
          title: "A navigable set builds credibility",
          body: "A clean, indexed package signals a careful, credible filing before the adjudicator has read a word of argument. Disorganisation signals the opposite and colours how the rest is read.",
        },
        {
          title: "Clear mapping pre-empts questions",
          body: "When every claim visibly connects to its proof, there is less for an adjudicator to query — which is part of how good packaging reduces the risk of an avoidable Request for Evidence.",
        },
        {
          title: "Volume without structure works against you",
          body: "A large exhibit set with no index or logic is harder to credit than a smaller, well-ordered one. More documents is not the same as more persuasion.",
        },
      ],
    },
    {
      kind: "subsections",
      id: "what-good-looks-like",
      eyebrow: "The standard",
      heading: "What a good exhibit set looks like",
      subsections: [
        {
          heading: "A clear index at the front",
          paragraphs: [
            "A tabbed, numbered index lists every exhibit with a short description, so the adjudicator has a map of the evidence before they enter it. The index is the first thing that tells the adjudicator this is an organised filing.",
          ],
        },
        {
          heading: "A logical sequence",
          paragraphs: [
            "Exhibits are ordered to follow the argument — grouped by the criterion or point they support, in the order the petition letter addresses them — rather than in the arbitrary order the documents happened to arrive.",
          ],
        },
        {
          heading: "Direct claim-to-exhibit references",
          paragraphs: [
            "The petition letter cites specific exhibit numbers as it makes each claim, so the reader is pointed straight to the proof. The evidence and the argument reference each other rather than sitting in separate silos.",
          ],
        },
        {
          heading: "Only what earns its place",
          paragraphs: [
            "Marginal or duplicative documents are cut. Every exhibit should do a job; material that adds bulk without adding weight makes the strong evidence harder to see and is removed deliberately.",
          ],
        },
      ],
    },
    {
      kind: "list",
      id: "process",
      eyebrow: "What happens",
      heading: "Our evidence packaging process",
      numbered: true,
      items: [
        {
          title: "Review the full record",
          body: "We go through everything you have and assess what each item proves, how strong it is, and which claim or criterion it supports.",
        },
        {
          title: "Select and prioritise",
          body: "We decide what belongs in the set and what should be left out, keeping the material that carries weight and cutting what only adds bulk.",
        },
        {
          title: "Sequence and group",
          body: "Exhibits are organised to follow the argument, grouped by the point they support and ordered to match the petition.",
        },
        {
          title: "Build the index",
          body: "A clear, numbered exhibit index is prepared so the adjudicator has a map of the evidence at the front of the package.",
        },
        {
          title: "Cross-reference the argument",
          body: "Where we are also preparing the petition letter, each claim is tied to its exhibit number so the argument and the evidence point to each other.",
        },
        {
          title: "Prepare filing-ready output",
          body: "The finished package is assembled in a clean, consistent, submission-ready format.",
        },
      ],
    },
    {
      kind: "list",
      id: "mistakes",
      eyebrow: "What goes wrong",
      heading: "Common evidence packaging mistakes",
      items: [
        {
          title: "No index",
          body: "Submitting exhibits with no map at the front, leaving the adjudicator to find their own way through the evidence.",
        },
        {
          title: "Arbitrary ordering",
          body: "Exhibits in the order they were collected rather than in the order that follows the argument.",
        },
        {
          title: "Claims that do not cite exhibits",
          body: "A petition letter that asserts facts without pointing to the specific exhibits that prove them, forcing the adjudicator to search.",
        },
        {
          title: "Everything included",
          body: "Adding every document available on the theory that more is safer. Volume without selection obscures the evidence that matters.",
        },
        {
          title: "Inconsistent labelling",
          body: "Exhibit numbers, references, and descriptions that do not match across the index, the letter, and the documents themselves.",
        },
      ],
    },
    {
      kind: "prose",
      id: "how-we-help",
      eyebrow: "Working with us",
      heading: "How we help with evidence packaging",
      paragraphs: [
        "Immigration Horizons is an immigration consulting and paralegal services practice. We are not attorneys and do not provide legal representation or legal advice. We review your supporting evidence, decide what belongs in the exhibit set, organise and sequence it to follow the argument, build a clear exhibit index, and produce a clean, filing-ready package.",
        "Evidence packaging can be engaged on its own — including for a petition you or your attorney have otherwise prepared — or as part of a full petition package. We regularly provide this as additional capacity for immigration attorneys and paralegals who have the evidence but need it organised to a high standard under deadline.",
      ],
    },
  ],
  faqs: [
    {
      question: "What is evidence packaging?",
      answer:
        "It is the review, organisation, and indexing of a petition's supporting documents into a structured exhibit set. The aim is that every claim the petition makes is traceable to a specific numbered exhibit, so an adjudicator can move from a claim to its proof immediately rather than searching an unsorted stack.",
    },
    {
      question: "Does how I organise my evidence really affect the outcome?",
      answer:
        "Yes. Adjudicators work through many petitions under time pressure and are not obliged to hunt through a disorganised set for support the petition asserts exists. Strong evidence that cannot be located can be overlooked entirely, while a clean, indexed package builds credibility before the argument is even read.",
    },
    {
      question: "Should I include every document I have?",
      answer:
        "No. More is not better. A large set with no structure is harder to credit than a smaller, well-ordered one, and marginal or duplicative documents make the strong evidence harder to see. Part of packaging well is deciding what to leave out so that what remains does real work.",
    },
    {
      question: "Can you package evidence for a petition I prepared myself?",
      answer:
        "Yes. Evidence packaging can be engaged on its own, including for a petition you or your attorney have otherwise prepared. We review the record, organise and index it, and produce a filing-ready exhibit set, whether or not we prepared any of the other documents.",
    },
    {
      question: "What is an exhibit index?",
      answer:
        "An exhibit index is a numbered list at the front of the package describing each exhibit, so the adjudicator has a map of the evidence before they enter it. Together with claim-to-exhibit references in the petition letter, it is what lets a reader move directly from an assertion to the document that supports it.",
    },
  ],
  faqTitle: "Evidence packaging frequently asked questions",
  faqDescription:
    "The questions we are asked most often about organising, indexing, and packaging petition evidence.",
  sources: [
    {
      label: "USCIS — Employment-Based Immigration: First Preference EB-1",
      href: "https://www.uscis.gov/working-in-the-united-states/permanent-workers/employment-based-immigration-first-preference-eb-1",
    },
    {
      label: "USCIS — Employment-Based Immigration: Second Preference EB-2",
      href: "https://www.uscis.gov/working-in-the-united-states/permanent-workers/employment-based-immigration-second-preference-eb-2",
    },
  ],
  scopeNote:
    "This page is general educational information about evidence organisation for immigration petitions, not legal advice about any individual case.",
};
