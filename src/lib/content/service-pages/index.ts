import { businessPlans } from "./business-plans";
import { eb1a } from "./eb1a";
import { eb1b } from "./eb1b";
import { eb1c } from "./eb1c";
import { evidencePackaging } from "./evidence-packaging";
import { expertOpinionLetters } from "./expert-opinion-letters";
import { noidResponse } from "./noid-response";
import { o1Visa } from "./o1-visa";
import { recommendationLetters } from "./recommendation-letters";
import { rfeResponse } from "./rfe-response";
import type { ServicePageContent } from "./types";
import type { ServicePageSlug } from "./slugs";
export { servicePageSlugs } from "./slugs";

/**
 * Registry consumed by the /services/[slug] route.
 *
 * eb2-niw is deliberately absent: it has a bespoke route at
 * app/services/eb2-niw/page.tsx. Next.js resolves static segments before
 * dynamic ones, so the flagship page wins without any special handling here.
 */
export const servicePages = {
  eb1a,
  eb1b,
  eb1c,
  "o1-visa": o1Visa,
  "rfe-response": rfeResponse,
  "noid-response": noidResponse,
  "recommendation-letters": recommendationLetters,
  "expert-opinion-letters": expertOpinionLetters,
  "business-plans": businessPlans,
  "evidence-packaging": evidencePackaging,
} satisfies Record<ServicePageSlug, ServicePageContent>;

export const getServicePage = (slug: string): ServicePageContent | undefined =>
  Object.hasOwn(servicePages, slug) ? servicePages[slug as ServicePageSlug] : undefined;

export type { ServicePageContent } from "./types";
