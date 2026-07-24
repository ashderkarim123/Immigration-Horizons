import { ArrowRight } from "lucide-react";

import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Section, SectionHeading } from "@/components/ui/section";
import {
  caseCategories,
  supportServices,
  type CaseCategory,
  type SupportService,
} from "@/lib/content/services";

const isCaseCategory = (
  service: CaseCategory | SupportService,
): service is CaseCategory => "tagline" in service && "enumValue" in service;

/**
 * Related-service links. Passing `exclude` drops the current page from its
 * own related list.
 */
export function RelatedServices({
  exclude,
  heading = "Related services",
  description = "Cases rarely sit in one category. These are the routes and deliverables most often considered alongside this one.",
}: {
  exclude?: string;
  heading?: string;
  description?: string;
}) {
  const related = [...caseCategories, ...supportServices]
    .filter((service) => service.slug !== exclude)
    .slice(0, 6);

  return (
    <Section tone="tint">
      <SectionHeading eyebrow="Keep exploring" title={heading} description={description} />

      <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {related.map((service) => (
          <Card
            key={service.slug}
            href={`/services/${service.slug}`}
            className="group flex h-full flex-col gap-3"
          >
            <CardTitle className="text-xl">{service.name}</CardTitle>
            <CardBody className="text-sm">
              {isCaseCategory(service) ? service.tagline : service.description}
            </CardBody>
            <span className="text-navy-700 group-hover:text-navy-900 mt-auto inline-flex items-center gap-1.5 pt-2 font-sans text-sm font-semibold">
              Learn more
              <ArrowRight
                size={15}
                aria-hidden
                className="transition-transform duration-200 ease-(--ease-out-soft) motion-safe:group-hover:translate-x-1"
              />
            </span>
          </Card>
        ))}
      </div>
    </Section>
  );
}
