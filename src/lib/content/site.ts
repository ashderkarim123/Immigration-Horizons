/**
 * Single source of truth for site-wide facts. Values mirror the defaults the
 * legacy Express app served, with the same environment-variable overrides so
 * the two apps stay in sync until cutover.
 */

export const site = {
  name: "Immigration Horizons",
  tagline: "Your Future. Our Preparation. One Horizon.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://immigrationhorizons.com",
  description:
    "Immigration Horizons prepares EB-2 NIW, EB-1A, EB-1B and EB-1C petitions, RFE responses, business plans and recommendation letters for clients worldwide.",
  /**
   * Required on every page that describes what we do. We are not a law firm
   * and this must never be softened.
   */
  disclaimer:
    "Immigration Horizons provides petition preparation, writing, and document support services. We are not a law firm and do not provide legal representation before USCIS or any court.",
} as const;

export const contact = {
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "info@immigrationhorizons.com",
  whatsappPrimary:
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER_1 ?? "923305507598",
  whatsappSecondary:
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER_2 ?? "923418883635",
} as const;

export const whatsappLink = (number: string) => `https://wa.me/${number}`;

export const social = {
  fiverrProfile: "https://www.fiverr.com/rahatkarim487",
  fiverrRfeGig:
    "https://www.fiverr.com/rahatkarim487/prepare-a-tailored-response-to-the-rfe-from-uscis",
  upworkProfile:
    "https://www.upwork.com/freelancers/smartwork?p=1930154108755910656",
  upworkRfeNiwCatalog:
    "https://www.upwork.com/services/product/writing-translation-rfe-response-for-your-eb-2-niw-petition-1848244928306240108",
} as const;

export const stats = {
  casesHandled: "200+",
  yearsExperience: "5+",
} as const;
