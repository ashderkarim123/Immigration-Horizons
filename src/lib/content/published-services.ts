import { servicePageSlugs } from "./service-pages/slugs";
import { allServices, caseCategories, otherVisas, serviceGroups, supportServices } from "./services";

const publishedSlugs = new Set<string>(["eb2-niw", ...servicePageSlugs]);

export const hasServicePage = (service: { slug: string }) => publishedSlugs.has(service.slug);
export const publishedCaseCategories = caseCategories.filter(hasServicePage);
export const publishedSupportServices = supportServices.filter(hasServicePage);
export const publishedOtherVisas = otherVisas.filter(hasServicePage);
export const publishedServices = allServices.filter(hasServicePage);
export const publishedServiceGroups = serviceGroups.map((group) => ({
  ...group,
  services: group.services.filter(hasServicePage),
}));
