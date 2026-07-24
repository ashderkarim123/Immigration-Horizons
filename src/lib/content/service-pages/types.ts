import type { Faq } from "../faqs";

/**
 * Shared shape for every service page except the EB-2 NIW flagship, which
 * has a bespoke route. One renderer consumes these, so adding a service page
 * means writing content — not components.
 */

export type ListItem = { title: string; body: string };

export type PageSection =
  | {
      kind: "prose";
      id: string;
      eyebrow?: string;
      heading: string;
      paragraphs: string[];
      callout?: { title: string; body: string };
    }
  | {
      kind: "list";
      id: string;
      eyebrow?: string;
      heading: string;
      intro?: string[];
      items: ListItem[];
      numbered?: boolean;
      callout?: { title: string; body: string };
    }
  | {
      kind: "subsections";
      id: string;
      eyebrow?: string;
      heading: string;
      intro?: string[];
      subsections: { heading: string; paragraphs: string[] }[];
      callout?: { title: string; body: string };
    }
  | {
      kind: "criteria";
      id: string;
      eyebrow?: string;
      heading: string;
      intro?: string[];
      /** Rendered as a numbered regulatory criteria set. */
      items: ListItem[];
      callout?: { title: string; body: string };
    }
  | {
      kind: "cta";
      title: string;
      body: string;
      ctaLabel?: string;
    };

export type ServicePageContent = {
  slug: string;
  /** Breadcrumb label and nav name. */
  name: string;
  eyebrow: string;
  headline: string;
  subhead: string;
  /** Standalone ~40–60 word definition for featured-snippet capture. */
  definition: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  keyFacts: { label: string; value: string }[];
  toc: { id: string; label: string }[];
  sections: PageSection[];
  faqs: Faq[];
  faqTitle: string;
  faqDescription: string;
  sources: { label: string; href: string }[];
  /** Closing legal/scope note specific to this category. */
  scopeNote: string;
};
