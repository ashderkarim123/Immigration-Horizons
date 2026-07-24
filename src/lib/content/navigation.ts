import { caseCategories, supportServices } from "./services";

export type NavLink = {
  label: string;
  href: string;
  /** Shown in the mega menu; omitted in compact lists. */
  description?: string;
};

export type NavItem =
  | { label: string; href: string; mega?: never }
  | { label: string; href: string; mega: NavMega };

export type NavMega = {
  columns: { heading: string; links: NavLink[] }[];
  feature: { heading: string; body: string; ctaLabel: string; ctaHref: string };
};

const caseCategoryLinks: NavLink[] = caseCategories.map((category) => ({
  label: category.name,
  href: `/services/${category.slug}`,
  description: category.tagline,
}));

const supportServiceLinks: NavLink[] = supportServices.map((service) => ({
  label: service.name,
  href: `/services/${service.slug}`,
  description: service.tagline,
}));

export const primaryNav: NavItem[] = [
  { label: "Home", href: "/" },
  {
    label: "Services",
    href: "/services",
    mega: {
      columns: [
        { heading: "Case Categories", links: caseCategoryLinks },
        { heading: "Support Services", links: supportServiceLinks },
      ],
      feature: {
        heading: "Not sure which category fits?",
        body: "Tell us about your background and goals. We will tell you which classification your profile actually supports — before you spend anything on a filing.",
        ctaLabel: "Book a free consultation",
        ctaHref: "/consultation",
      },
    },
  },
  { label: "About", href: "/about" },
  { label: "Resources", href: "/resources" },
  { label: "Blog", href: "/blog" },
  { label: "Contact", href: "/contact" },
];

export const footerNav: { heading: string; links: NavLink[] }[] = [
  { heading: "Case Categories", links: caseCategoryLinks },
  { heading: "Support Services", links: supportServiceLinks },
  {
    heading: "Company",
    links: [
      { label: "About Us", href: "/about" },
      { label: "Client Reviews", href: "/reviews" },
      { label: "Resources", href: "/resources" },
      { label: "Blog", href: "/blog" },
      { label: "FAQs", href: "/faqs" },
      { label: "Contact", href: "/contact" },
    ],
  },
];

export const legalNav: NavLink[] = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Use", href: "/terms" },
];
