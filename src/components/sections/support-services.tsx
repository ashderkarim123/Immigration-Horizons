import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { RevealGroup, RevealItem } from "@/components/ui/reveal";
import { Section, SectionHeading } from "@/components/ui/section";
import { supportServices } from "@/lib/content/services";

/**
 * The "you don't have to buy the whole package" section. This is a real
 * differentiator — clients frequently arrive needing one document, or an RFE
 * response on a case someone else filed.
 */
export function SupportServices() {
  return (
    <Section>
      <SectionHeading
        eyebrow="Single deliverables"
        title="Hire us for one piece, not the whole case"
        description="Already have counsel, or only need one document written properly? Each of these can be prepared on its own — including RFE responses for petitions we did not originally prepare."
      />

      <RevealGroup className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {supportServices.map((service) => (
          <RevealItem key={service.slug}>
            <Card
              href={`/services/${service.slug}`}
              className="group flex h-full flex-col gap-3"
            >
              <CardTitle className="text-xl">{service.name}</CardTitle>
              <CardBody className="text-sm">{service.description}</CardBody>
              <span className="text-navy-700 group-hover:text-navy-900 mt-auto inline-flex items-center gap-1.5 pt-2 font-sans text-sm font-semibold">
                Learn more
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

      <div className="mt-12 text-center">
        <Button href="/services" variant="outline">
          Compare every service
        </Button>
      </div>
    </Section>
  );
}
