import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";

import { Breadcrumbs } from "@/components/service/breadcrumbs";
import { CtaBanner } from "@/components/sections/cta-banner";
import { Faqs } from "@/components/sections/faqs";
import { CategoryComparison } from "@/components/visuals/category-comparison";
import { JsonLd, breadcrumbSchema } from "@/components/seo/json-ld";
import { Badge, Card, CardBody, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Eyebrow, Section, SectionHeading } from "@/components/ui/section";
import { RevealGroup, RevealItem } from "@/components/ui/reveal";
import { SnippetAnswer } from "@/components/ui/snippet-answer";
import { homepageFaqs } from "@/lib/content/faqs";
import { caseCategories, supportServices } from "@/lib/content/services";

export const metadata: Metadata = {
  title: "Our Services",
  description:
    "EB-2 NIW, EB-1A, EB-1B, EB-1C and O-1 petition preparation, plus single deliverables: RFE responses, recommendation letters, expert opinion letters, business plans and evidence packaging.",
  alternates: { canonical: "/services" },
  openGraph: {
    type: "website",
    title: "Our Services | Immigration Horizons",
    description:
      "Employment-based immigration petition preparation and single-deliverable support services.",
    url: "/services",
  },
};

const trail = [
  { name: "Home", path: "/" },
  { name: "Services", path: "/services" },
];

export default function ServicesPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema(trail)} />

      <section className="bg-navy-900 relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(201,153,46,0.15),transparent_58%)]"
        />
        <Container width="wide" className="relative py-14 sm:py-20">
          <Breadcrumbs trail={trail} tone="dark" className="mb-8" />
          <div className="flex max-w-3xl flex-col gap-5">
            <Eyebrow className="text-gold-300">What we do</Eyebrow>
            <h1 className="text-display-lg sm:text-display-xl font-semibold text-white">
              Immigration petition preparation services
            </h1>
            <p className="text-lead text-navy-200 text-pretty">
              We work two ways: full petition preparation for a case category,
              or a single deliverable prepared on its own. Both are available to
              individuals and to law firms needing extra drafting capacity.
            </p>
            <div className="mt-2 flex flex-wrap gap-3">
              <Button href="/consultation" variant="gold" size="lg">
                Get a free eligibility assessment
              </Button>
              <Button href="#support-services" variant="inverse" size="lg">
                Browse single deliverables
              </Button>
            </div>
          </div>
        </Container>
      </section>

      <Section id="case-categories" className="scroll-mt-28">
        <SectionHeading
          eyebrow="Case categories"
          title="Which employment-based category fits your profile?"
        />

        <div className="mx-auto mt-6 max-w-2xl">
          <SnippetAnswer>
            Employment-based immigration categories differ by what they require
            you to prove. EB-2 NIW requires a nationally important endeavor.
            EB-1A requires sustained acclaim. EB-1B and EB-1C require an
            employer sponsor. O-1 is a temporary work classification rather than
            an immigrant petition.
          </SnippetAnswer>
        </div>

        <RevealGroup className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
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
                  Full guide
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

      <CategoryComparison />

      <Section id="support-services" className="scroll-mt-28">
        <SectionHeading
          eyebrow="Single deliverables"
          title="Or hire us for one piece of the case"
          description="You do not have to engage a full petition package. Each deliverable below can be prepared on its own — including RFE responses for petitions originally filed by someone else."
        />

        <RevealGroup className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
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
          <Button href="/consultation" variant="primary" size="lg">
            Talk to an immigration specialist
          </Button>
        </div>
      </Section>

      <Faqs faqs={homepageFaqs.slice(0, 8)} />
      <CtaBanner />
    </>
  );
}
