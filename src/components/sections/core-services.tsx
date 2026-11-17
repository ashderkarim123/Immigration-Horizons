import { ArrowRight } from "lucide-react";

import { Badge, Card, CardBody, CardTitle } from "@/components/ui/card";
import { RevealGroup, RevealItem } from "@/components/ui/reveal";
import { Section, SectionHeading } from "@/components/ui/section";
import {
  publishedCaseCategories,
  publishedSupportServices,
} from "@/lib/content/published-services";

const responseSlugs = new Set(["rfe-response", "noid-response"]);

/**
 * The six core services in one grid: the four immigrant petitions and the
 * two response services. The badge tone encodes which is which.
 */
export function CoreServices() {
  const services = [
    ...publishedCaseCategories.map((s) => ({ ...s, response: false })),
    ...publishedSupportServices
      .filter((s) => responseSlugs.has(s.slug))
      .map((s) => ({ ...s, tagline: s.name, response: true })),
  ];

  return (
    <Section>
      <SectionHeading
        eyebrow="Core services"
        title="What we prepare"
        description="Full EB-2 NIW and EB-1 petition packages, and responses when USCIS asks for more."
      />

      <RevealGroup className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {services.map((service) => (
          <RevealItem key={service.slug}>
            <Card
              href={`/services/${service.slug}`}
              className="group flex h-full flex-col gap-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <CardTitle>{service.name}</CardTitle>
                <Badge tone={service.response ? "gold" : "navy"}>
                  {service.response ? "Response service" : "Immigrant petition"}
                </Badge>
              </div>
              {!service.response ? (
                <p className="text-gold-700 font-sans text-sm font-semibold">{service.tagline}</p>
              ) : null}
              <CardBody className="flex-1 text-[0.9375rem]">{service.description}</CardBody>
              <span className="text-navy-800 mt-1 inline-flex items-center gap-1.5 font-sans text-sm font-semibold">
                What&apos;s included
                <ArrowRight
                  size={15}
                  aria-hidden
                  className="transition-transform duration-200 ease-(--ease-out-soft) motion-safe:group-hover:translate-x-1"
                />
              </span>
            </Card>
          </RevealItem>
        ))}
      </RevealGroup>
    </Section>
  );
}
