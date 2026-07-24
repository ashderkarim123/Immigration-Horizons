import { ArrowRight } from "lucide-react";

import { Badge, Card, CardBody, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RevealGroup, RevealItem } from "@/components/ui/reveal";
import { Section, SectionHeading } from "@/components/ui/section";
import { caseCategories } from "@/lib/content/services";

export function CaseCategories() {
  return (
    <Section tone="tint">
      <SectionHeading
        eyebrow="What we do"
        title="Find the category your profile actually supports"
        description="Most clients arrive unsure whether they qualify for EB-2 NIW or EB-1. We assess your record against the criteria before any drafting begins."
      />

      <RevealGroup className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {caseCategories.map((category) => (
          <RevealItem key={category.slug}>
            <Card
              href={`/services/${category.slug}`}
              className="group flex h-full flex-col gap-4"
            >
              <Badge>{category.tagline}</Badge>
              <CardTitle>{category.name}</CardTitle>
              <CardBody className="text-sm">{category.description}</CardBody>
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

      <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
        <Button href="/consultation" variant="primary">
          Find out which category fits you
        </Button>
        <Button href="/services" variant="ghost">
          Compare all categories
        </Button>
      </div>
    </Section>
  );
}
