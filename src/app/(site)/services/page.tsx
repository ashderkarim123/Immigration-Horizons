import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";

import { Breadcrumbs } from "@/components/service/breadcrumbs";
import { CtaBanner } from "@/components/sections/cta-banner";
import { Faqs } from "@/components/sections/faqs";
import { CategoryComparison } from "@/components/visuals/category-comparison";
import { JsonLd, breadcrumbSchema } from "@/components/seo/json-ld";
import { baseOpenGraph } from "@/lib/seo/og";
import { Badge, Card, CardBody, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Eyebrow, Section, SectionHeading } from "@/components/ui/section";
import { RevealGroup, RevealItem } from "@/components/ui/reveal";
import { SnippetAnswer } from "@/components/ui/snippet-answer";
import { homepageFaqs } from "@/lib/content/faqs";
import { publishedCaseCategories as caseCategories, publishedSupportServices as supportServices, publishedOtherVisas as otherVisas } from "@/lib/content/published-services";
import { serviceIndexCopy } from "@/lib/content/services";

export const metadata: Metadata = {
  title: { absolute: serviceIndexCopy.title },
  description: serviceIndexCopy.description,
  alternates: { canonical: "/services" },
  openGraph: {
    ...baseOpenGraph,
    title: serviceIndexCopy.title,
    description: serviceIndexCopy.description,
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

      <section className="bg-navy-950 relative overflow-hidden">
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
              {serviceIndexCopy.intro}
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
          eyebrow="Core services"
          title={serviceIndexCopy.petitionsHeading}
        />

        <div className="mx-auto mt-6 max-w-2xl">
          <SnippetAnswer>
            Employment-based immigration categories differ by what they require
            you to prove. EB-2 NIW requires a nationally important endeavor.
            EB-1A requires sustained acclaim. EB-1B and EB-1C require an
            employer sponsor.
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
          title={serviceIndexCopy.supportHeading}
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

      <Section id="other-visas" tone="tint" space="compact" className="scroll-mt-28">
        <SectionHeading title={serviceIndexCopy.otherHeading} description={serviceIndexCopy.otherDescription} />
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {otherVisas.map((visa) => (
            <Card key={visa.slug} href={`/services/${visa.slug}`} className="flex flex-col gap-2">
              <CardTitle className="text-lg">{visa.name}</CardTitle>
              <CardBody className="text-sm">{visa.tagline}</CardBody>
            </Card>
          ))}
        </div>
      </Section>

      <Faqs faqs={homepageFaqs.slice(0, 8)} />
      <CtaBanner />
    </>
  );
}
