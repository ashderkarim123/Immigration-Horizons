/**
 * Service catalogue.
 *
 * Two distinct shapes, which the legacy site conflated into one flat list:
 *
 * - `caseCategories` — the visa classification a client files under. These are
 *   the primary search-intent pages ("EB-2 NIW", "EB-1A").
 * - `supportServices` — individual deliverables that can be bought on their own
 *   or as part of a full package. Previously these only existed as bullet
 *   points inside each category, so they had no pages and captured no search
 *   traffic despite being what many clients actually search for.
 */

export type EngagementOption = {
  type: "single-task" | "full-package";
  label: string;
  description: string;
};

export type CaseCategory = {
  slug: string;
  /** Value stored on Consultation records — must match the legacy enum. */
  enumValue: string;
  name: string;
  tagline: string;
  description: string;
  eligibility: string;
  deliverables: string[];
  engagementOptions: EngagementOption[];
};

export const caseCategories: CaseCategory[] = [
  {
    slug: "eb2-niw",
    enumValue: "EB-2 NIW",
    name: "EB-2 NIW",
    tagline: "National Interest Waiver",
    description:
      "For advanced-degree professionals or individuals of exceptional ability whose work is in the national interest of the United States.",
    eligibility:
      "You generally qualify if you hold an advanced degree (or a bachelor’s plus 5+ years progressive experience) or can show exceptional ability in your field, and your proposed work has substantial merit and national importance, positions you well to advance it, and it benefits the U.S. even without a job offer or labor certification.",
    deliverables: [
      "Personal statement / proposed endeavor narrative",
      "Business plan / personal plan",
      "Recommendation letters",
      "Expert opinion letters",
      "Full Dhanasar-framework petition",
      "RFE / NOID response",
    ],
    engagementOptions: [
      {
        type: "single-task",
        label: "Hire for a single deliverable",
        description:
          "Just need a proposed endeavor narrative, a business plan, or an RFE response? We can prepare that one piece on its own.",
      },
      {
        type: "full-package",
        label: "Full petition package",
        description:
          "We build your entire EB-2 NIW case from scratch — strategy, writing, letters, and full form filing support.",
      },
    ],
  },
  {
    slug: "eb1a",
    enumValue: "EB-1A",
    name: "EB-1A",
    tagline: "Extraordinary Ability",
    description:
      "For individuals with extraordinary ability in the sciences, arts, education, business, or athletics who can demonstrate sustained national or international acclaim.",
    eligibility:
      "You generally qualify if you can document sustained acclaim at the top of your field — meeting at least 3 of the USCIS regulatory criteria (awards, media coverage, judging others’ work, original contributions, authorship, high salary, and similar), with evidence that you plan to continue working in your area of expertise in the U.S.",
    deliverables: [
      "Full petition strategy & criteria mapping",
      "Personal statement / cover letter",
      "Recommendation letters",
      "Expert opinion letters",
      "Exhibit organization & indexing",
      "RFE / NOID response",
    ],
    engagementOptions: [
      {
        type: "single-task",
        label: "Hire for a single deliverable",
        description:
          "Need help with just your recommendation letters, exhibit indexing, or an RFE reply? We can take on that piece alone.",
      },
      {
        type: "full-package",
        label: "Full petition package",
        description:
          "We map your criteria, write every document, and organize your full EB-1A petition from start to filing.",
      },
    ],
  },
  {
    slug: "eb1b",
    enumValue: "EB-1B",
    name: "EB-1B",
    tagline: "Outstanding Professor or Researcher",
    description:
      "For outstanding professors and researchers recognized internationally for their academic achievements, typically sponsored by a US employer.",
    eligibility:
      "You generally qualify if you have international recognition for outstanding achievement in a specific academic field, at least 3 years of teaching or research experience in that field, and a qualifying offer to continue that work in the U.S. (tenure-track, research, or comparable position).",
    deliverables: [
      "Petition letter & criteria mapping",
      "Recommendation letters",
      "Expert opinion letters",
      "Publication & citation evidence packaging",
      "RFE / NOID response",
    ],
    engagementOptions: [
      {
        type: "single-task",
        label: "Hire for a single deliverable",
        description:
          "Need only your recommendation letters or a publication/citation evidence package built out? We can prepare that alone.",
      },
      {
        type: "full-package",
        label: "Full petition package",
        description:
          "We build your complete EB-1B case — letters, evidence packaging, and full form filing support.",
      },
    ],
  },
  {
    slug: "eb1c",
    enumValue: "EB-1C",
    name: "EB-1C",
    tagline: "Multinational Manager or Executive",
    description:
      "For multinational executives and managers transferring to a US branch, parent, subsidiary, or affiliate of their overseas employer.",
    eligibility:
      "You generally qualify if you’ve worked at least 1 of the last 3 years abroad in a managerial or executive capacity for a qualifying overseas entity, and you’re coming to the U.S. to work in a managerial or executive role for a related U.S. entity (parent, branch, subsidiary, or affiliate).",
    deliverables: [
      "Petition letter & organizational evidence",
      "Business plan / corporate structure documentation",
      "Supporting affidavits & letters",
      "RFE / NOID response",
    ],
    engagementOptions: [
      {
        type: "single-task",
        label: "Hire for a single deliverable",
        description:
          "Just need corporate structure documentation or an RFE response drafted? We can take on that piece alone.",
      },
      {
        type: "full-package",
        label: "Full petition package",
        description:
          "We build your complete EB-1C case — organizational evidence, letters, and full form filing support.",
      },
    ],
  },
  {
    slug: "o1-visa",
    enumValue: "O-1",
    name: "O-1 Visa",
    tagline: "Extraordinary Ability or Achievement",
    description:
      "For individuals with extraordinary ability or a demonstrated record of extraordinary achievement seeking temporary work authorization in their field.",
    eligibility:
      "You generally qualify if you can show sustained acclaim or a record of extraordinary achievement in the sciences, education, business, athletics, arts, or the motion picture and television industry, together with a U.S. petitioner or agent and work in your area of expertise.",
    deliverables: [
      "Petition narrative & evidence strategy",
      "Support letters & endorsement drafting",
      "Advisory opinion coordination",
      "Exhibit organization & filing-ready structure",
      "RFE / NOID response",
    ],
    engagementOptions: [
      {
        type: "single-task",
        label: "Hire for a single deliverable",
        description:
          "Need only your support letters drafted or your exhibits organised for filing? We can take on that piece alone.",
      },
      {
        type: "full-package",
        label: "Full petition package",
        description:
          "We structure the case around your field, draft every document, and prepare a premium-processing-ready packet.",
      },
    ],
  },
];

export type SupportService = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
};

export const supportServices: SupportService[] = [
  {
    slug: "rfe-response",
    name: "RFE & NOID Responses",
    tagline: "Request for Evidence support",
    description:
      "A focused, evidence-led response to a USCIS Request for Evidence or Notice of Intent to Deny — including cases we did not originally prepare.",
  },
  {
    slug: "recommendation-letters",
    name: "Recommendation Letters",
    tagline: "Written from scratch",
    description:
      "Custom recommendation letters drafted around each recommender’s relationship to your work, with no boilerplate or reused templates.",
  },
  {
    slug: "expert-opinion-letters",
    name: "Expert Opinion Letters",
    tagline: "Independent field expertise",
    description:
      "Third-party expert opinion letters that explain the significance of your work to an adjudicator who is not a specialist in your field.",
  },
  {
    slug: "business-plans",
    name: "Business & Personal Plans",
    tagline: "Endeavor documentation",
    description:
      "Business plans and personal endeavor plans that document what you intend to do in the U.S. and why it carries national importance.",
  },
  {
    slug: "evidence-packaging",
    name: "Evidence Review & Packaging",
    tagline: "Exhibits, indexing, filing order",
    description:
      "Review, organisation, and indexing of your supporting evidence into a clean exhibit set an adjudicator can follow.",
  },
];

export const allServices = [...caseCategories, ...supportServices];

export const findCaseCategory = (slug: string) =>
  caseCategories.find((category) => category.slug === slug);

export const findSupportService = (slug: string) =>
  supportServices.find((service) => service.slug === slug);
