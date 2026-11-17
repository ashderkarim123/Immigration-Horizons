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
    "Immigration Horizons prepares EB-2 NIW and EB-1 petitions, RFE and NOID responses, recommendation letters and business plans, plus preparation support for F-1, E-2 and other U.S. visas.",
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

export type PlatformRating = {
  /** `null` until the owner supplies the figure; nothing renders for it. */
  score: number | null;
  count: number | null;
  /** ISO date the figure was read from the profile, so a stale number is easy to spot. */
  checkedOn: string | null;
  url: string;
};

/** Show the real score; never round it up to five stars. */
export const ratings: Record<"Fiverr" | "Upwork", PlatformRating> = {
  Fiverr: { score: 4.8, count: 44, checkedOn: "2026-11-16", url: social.fiverrProfile },
  Upwork: { score: null, count: null, checkedOn: null, url: social.upworkProfile },
};

export const stats = {
  casesHandled: "200+",
  yearsExperience: "5+",
} as const;
