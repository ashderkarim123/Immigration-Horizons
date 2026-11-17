/**
 * Homepage copy. Everything the homepage says that is not already derived
 * from the service catalogue, the FAQ set or the testimonials lives here, so
 * the section components stay free of inline prose.
 */

export const hero = {
  eyebrow: "EB-2 NIW · EB-1 · RFE & NOID",
  /** Two lines; the renderer keeps a real space between them for crawlers. */
  headline: ["EB-2 NIW and EB-1 petitions,", "prepared with precision."],
  subline:
    "Full petition packages for self-petitioners, professionals, researchers and professors — plus RFE and NOID responses, even for petitions we did not prepare.",
  primaryCta: { label: "Book a free consultation", href: "/consultation" },
  secondaryCta: { label: "Got an RFE or NOID?", href: "/services/rfe-response" },
  checks: ["Original drafting", "Verifiable reviews", "Not a law firm — we prepare, you file"],
  artAlt:
    "Illustration: an open doorway framing a sunrise over a horizon, with a path leading toward it",
} as const;

/** Facts beside the rating in the proof strip. None is a count or a claim. */
export const proofFacts = [
  "Every review links to its source",
  "Full packages or single deliverables",
  "Clients across multiple countries",
] as const;

export const packageSection = {
  eyebrow: "What you receive",
  heading: "A full petition package — or just the piece you need.",
  lead: "Every EB-2 NIW and EB-1 package is drafted from your own record, indexed to the regulation, and handed over ready to file. Each item can also be engaged on its own.",
  cta: { label: "Book a free consultation", href: "/consultation" },
  compare: { label: "Compare every service", href: "/services" },
} as const;

export const packageIncludes = [
  {
    title: "Petition cover letter",
    body: "The argument for your case, mapped to the regulation and to every exhibit.",
  },
  {
    title: "Proposed endeavor or criteria mapping",
    body: "The Dhanasar prongs for NIW, or the regulatory criteria for EB-1, matched to your evidence.",
  },
  {
    title: "Recommendation letters",
    body: "Drafted from interviews with each recommender, in their voice, for their signature.",
  },
  {
    title: "Expert opinion letters",
    body: "Independent assessments of your work prepared for a qualified expert to review and sign.",
  },
  {
    title: "Exhibit index and evidence packaging",
    body: "Every document labeled, ordered and cross-referenced so an adjudicator can find it.",
  },
  {
    title: "Forms checklist",
    body: "The USCIS forms your filing needs, prepared for you or your attorney to review and sign.",
  },
  {
    title: "RFE and NOID support",
    body: "If USCIS asks for more, we prepare the response — including for petitions we did not prepare.",
  },
] as const;

/**
 * Core audiences. `href` is added when the `/for/*` pages ship (Phase 5);
 * until then the cards are informative only, so no link can 404.
 */
export const audiences = [
  {
    slug: "self-petitioners",
    title: "Self-petitioners",
    body: "Filing EB-2 NIW or EB-1A on your own record, without an employer sponsor.",
    icon: "target",
  },
  {
    slug: "professionals",
    title: "Professionals",
    body: "Engineers, physicians, AI and data specialists, executives and founders.",
    icon: "briefcase",
  },
  {
    slug: "researchers",
    title: "Researchers & scientists",
    body: "Postdocs, research scientists and lab leads with a publication record.",
    icon: "document",
  },
  {
    slug: "professors",
    title: "Professors & academics",
    body: "Tenured and tenure-track faculty, including EB-1B with a university petitioner.",
    icon: "badge",
  },
] as const;

export const audienceSection = {
  eyebrow: "Who we help",
  heading: "Prepared for the way your record actually looks",
  lead: "The evidence a researcher has is not the evidence a founder has. We prepare each petition around the record in front of us.",
  otherVisas: "Student or investor? See other US visas",
} as const;

export const otherVisasSection = {
  eyebrow: "Also available",
  heading: "Other US visas we prepare",
  lead: "Document preparation and interview coaching for nonimmigrant visas. We prepare; we do not file or represent.",
} as const;
