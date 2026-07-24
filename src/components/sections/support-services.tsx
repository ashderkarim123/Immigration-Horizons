import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/section";
import { Reveal, RevealGroup, RevealItem } from "@/components/ui/reveal";
import { DocumentStack } from "@/components/visuals/document-stack";
import { supportServices } from "@/lib/content/services";

/**
 * The "you don't have to buy the whole package" section. This is a real
 * differentiator — clients frequently arrive needing one document, or an RFE
 * response on a case someone else filed. A petition-package illustration
 * anchors the intro so the section leads with an image, not a wall of text.
 */
export function SupportServices() {
  return (
    <section className="py-20 sm:py-28">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <Reveal className="order-last flex justify-center lg:order-first">
            <DocumentStack className="w-full max-w-sm" />
          </Reveal>

          <Reveal delay={0.08} className="flex flex-col gap-4">
            <Eyebrow>Single deliverables</Eyebrow>
            <h2 className="text-display-md sm:text-display-lg font-semibold">
              Hire us for one piece, not the whole case
            </h2>
            <p className="text-lead text-ink-600 text-pretty">
              Already have counsel, or only need one document written properly?
              Each deliverable below can be prepared on its own — including RFE
              responses for petitions we did not originally prepare.
            </p>
            <div className="mt-2">
              <Button href="/services" variant="outline">
                Compare every service
              </Button>
            </div>
          </Reveal>
        </div>

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
      </Container>
    </section>
  );
}
