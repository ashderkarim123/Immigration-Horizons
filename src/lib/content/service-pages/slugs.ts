/** Lightweight publication manifest, shared with the client header.
 * Add a slug here when registering its content in index.ts. EB-2 NIW is bespoke.
 */
export const servicePageSlugs = [
  "eb1a", "eb1b", "eb1c", "o1-visa", "rfe-response",
  "recommendation-letters", "expert-opinion-letters", "business-plans", "evidence-packaging",
] as const;

export type ServicePageSlug = (typeof servicePageSlugs)[number];
