import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { PageHero } from "@/components/layout/page-hero";
import { CtaBanner } from "@/components/sections/cta-banner";
import { Faqs } from "@/components/sections/faqs";
import { CategoryComparison } from "@/components/visuals/category-comparison";
import { JsonLd, breadcrumbSchema } from "@/components/seo/json-ld";
import { baseOpenGraph } from "@/lib/seo/og";
import { Badge, Card, CardBody, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Section, SectionHeading } from "@/components/ui/section";
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

const responseSlugs = new Set(["rfe-response", "noid-response"]);

/** A router, not a landing page: three tiered sections matching the mega menu, core first and larger. */
export default function ServicesPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema(trail)} />

      <PageHero
        trail={trail}
        eyebrow="What we do"
        title="What we prepare"
        description={serviceIndexCopy.intro}
      >
        <div className="flex flex-wrap gap-3">
          <Button href="/consultation" variant="primary" size="lg">
            Book a free consultation
          </Button>
          <Button href="#support-services" variant="outline" size="lg">
            Browse single deliverables
          </Button>
        </div>
      </PageHero>

      <Section id="case-categories">
        <SectionHeading eyebrow="Green card petitions" title={serviceIndexCopy.petitionsHeading} />

        <div className="mx-auto mt-6 max-w-2xl">
          <SnippetAnswer>
            Employment-based immigration categories differ by what they require
            you to prove. EB-2 NIW requires a nationally important endeavor.
            EB-1A requires sustained acclaim. EB-1B and EB-1C require an
            employer sponsor.
          </SnippetAnswer>
        </div>

        <RevealGroup className="mt-14 grid gap-6 md:grid-cols-2">
          {caseCategories.map((category) => (
            <RevealItem key={category.slug}>
              <Card href={`/services/${category.slug}`} className="group flex h-full flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <CardTitle>{category.name}</CardTitle>
                  <Badge>Immigrant petition</Badge>
                </div>
                <p className="text-gold-700 font-sans text-sm font-semibold">{category.tagline}</p>
                <CardBody className="text-[0.9375rem]">{category.description}</CardBody>
                <span className="text-navy-800 mt-auto inline-flex items-center gap-1.5 pt-2 font-sans text-sm font-semibold">
                  Full guide
                  <ArrowRight size={15} aria-hidden className="transition-transform duration-200 ease-(--ease-out-soft) motion-safe:group-hover:translate-x-1" />
                </span>
              </Card>
            </RevealItem>
          ))}
        </RevealGroup>
      </Section>

      <CategoryComparison />

      <Section id="support-services" tone="tint">
        <SectionHeading
          eyebrow="RFE, NOID & support"
          title={serviceIndexCopy.supportHeading}
          description="You do not have to engage a full petition package. Each deliverable below can be prepared on its own — including RFE and NOID responses for petitions originally filed by someone else."
        />

        <RevealGroup className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {supportServices.map((service) => (
            <RevealItem key={service.slug}>
              <Card href={`/services/${service.slug}`} className="group flex h-full flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <CardTitle className="text-xl">{service.name}</CardTitle>
                  <Badge tone={responseSlugs.has(service.slug) ? "gold" : "neutral"}>
                    {responseSlugs.has(service.slug) ? "Response service" : "Single deliverable"}
                  </Badge>
                </div>
                <CardBody className="text-sm">{service.description}</CardBody>
                <span className="text-navy-800 mt-auto inline-flex items-center gap-1.5 pt-2 font-sans text-sm font-semibold">
                  Learn more
                  <ArrowRight size={15} aria-hidden className="transition-transform duration-200 ease-(--ease-out-soft) motion-safe:group-hover:translate-x-1" />
                </span>
              </Card>
            </RevealItem>
          ))}
        </RevealGroup>
      </Section>

      <Section id="other-visas" tone="ivory" space="compact">
        <SectionHeading as="h2" title={serviceIndexCopy.otherHeading} description={serviceIndexCopy.otherDescription} align="left" />
        <ul className="mt-8 flex flex-wrap gap-2.5">
          {otherVisas.map((visa) => (
            <li key={visa.slug}>
              <Link
                href={`/services/${visa.slug}`}
                className="border-navy-800/28 text-navy-800 hover:border-navy-800 hover:bg-navy-50 inline-flex items-center gap-2 rounded-full border bg-white px-4 py-2.5 font-sans text-[0.9375rem] font-medium transition-colors duration-200"
              >
                {visa.name}
                <span className="text-ink-600 font-normal">{visa.tagline}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Faqs faqs={homepageFaqs.slice(0, 8)} tone="white" />
      <CtaBanner />
    </>
  );
}
