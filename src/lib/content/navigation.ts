import { publishedServiceGroups } from "./published-services";
import type { ServiceTier } from "./services";

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
  columns: { heading: string; links: NavLink[]; tier: ServiceTier }[];
  feature: { heading: string; body: string; ctaLabel: string; ctaHref: string };
};

const serviceColumns = publishedServiceGroups.map((group) => ({
  heading: group.heading,
  tier: group.tier,
  links: group.services.map((service) => ({
    label: service.name,
    href: `/services/${service.slug}`,
    description: service.tagline,
  })),
}));

export const primaryNav: NavItem[] = [
  { label: "Home", href: "/" },
  {
    label: "Services",
    href: "/services",
    mega: {
      columns: serviceColumns,
      feature: {
        heading: "Not sure if you qualify for EB-2 NIW or EB-1?",
        body: "Book a free consultation to discuss your background, evidence and petition preparation needs.",
        ctaLabel: "Book a free consultation",
        ctaHref: "/consultation",
      },
    },
  },
  { label: "About", href: "/about" },
  { label: "Resources", href: "/resources" },
  { label: "Reviews", href: "/reviews" },
  { label: "Contact", href: "/contact" },
];

export const footerNav: { heading: string; links: NavLink[] }[] = [
  ...serviceColumns,
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
