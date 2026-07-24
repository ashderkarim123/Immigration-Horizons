import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";

import { CtaBanner } from "@/components/sections/cta-banner";
import { Breadcrumbs } from "@/components/service/breadcrumbs";
import { JsonLd, breadcrumbSchema } from "@/components/seo/json-ld";
import { Badge, Card, CardBody, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { RevealGroup, RevealItem } from "@/components/ui/reveal";
import { Eyebrow, Section, SectionHeading } from "@/components/ui/section";
import { caseCategories, supportServices } from "@/lib/content/services";
import { officialResources } from "@/lib/content/resources";

export const metadata: Metadata = {
  title: "Resources",
  description:
    "Immigration Horizons guides on EB-2 NIW, EB-1A, EB-1B, EB-1C and O-1, plus links to authoritative USCIS and Department of State resources.",
  alternates: { canonical: "/resources" },
  openGraph: {
    type: "website",
    title: "Immigration Resources | Immigration Horizons",
    description:
      "In-depth guides and links to authoritative official immigration resources.",
    url: "/resources",
  },
};

const trail = [
  { name: "Home", path: "/" },
  { name: "Resources", path: "/resources" },
];

export default function ResourcesPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema(trail)} />

      <section className="bg-navy-900 relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(201,153,46,0.15),transparent_58%)]"
        />
        <Container width="wide" className="relative py-16 sm:py-20">
          <Breadcrumbs trail={trail} tone="dark" className="mb-8" />
          <div className="max-w-3xl">
            <Eyebrow className="text-gold-300">Resources</Eyebrow>
            <h1 className="text-display-lg sm:text-display-xl mt-4 font-semibold text-white">
              Guides and official immigration resources
            </h1>
            <p className="text-lead text-navy-200 mt-5 text-pretty">
              Our in-depth guides to each category, alongside links to the
              authoritative government sources. When it comes to processing
              times, fees, and current policy, the official pages are always the
              source of truth — and we link you straight to them.
            </p>
          </div>
        </Container>
      </section>

      {/* Our guides */}
      <Section>
        <SectionHeading
          eyebrow="Our guides"
          title="In-depth category guides"
          description="Each of these is a full, regularly considered resource — eligibility, evidence strategy, required documents, and common mistakes."
        />

        <RevealGroup className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {caseCategories.map((category) => (
            <RevealItem key={category.slug}>
              <Card
                href={`/services/${category.slug}`}
                className="group flex h-full flex-col gap-3"
              >
                <Badge>{category.tagline}</Badge>
                <CardTitle className="text-xl">{category.name} guide</CardTitle>
                <CardBody className="text-sm">{category.description}</CardBody>
                <span className="text-navy-700 group-hover:text-navy-900 mt-auto inline-flex items-center gap-1.5 pt-2 font-sans text-sm font-semibold">
                  Read the guide
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

        <div className="mt-10">
          <h3 className="text-navy-800 mb-5 font-sans text-sm font-bold tracking-[0.14em] uppercase">
            Support service guides
          </h3>
          <ul className="flex flex-wrap gap-3">
            {supportServices.map((service) => (
              <li key={service.slug}>
                <Link
                  href={`/services/${service.slug}`}
                  className="border-ink-300 text-navy-800 hover:border-navy-300 hover:bg-navy-50 inline-flex rounded-full border bg-white px-4 py-2 font-sans text-sm font-medium transition-colors duration-200"
                >
                  {service.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* Official resources */}
      <Section tone="tint">
        <SectionHeading
          eyebrow="Primary sources"
          title="Official immigration resources"
          description="Authoritative government pages. For processing times, fees, and current policy, always rely on these rather than on any figure quoted second-hand."
        />

        <div className="mt-14 grid gap-4 md:grid-cols-2">
          {officialResources.map((resource) => (
            <a
              key={resource.href}
              href={resource.href}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-card border-ink-200 hover:border-navy-300 group flex flex-col gap-2 border bg-white p-6 transition-colors duration-200"
            >
              <span className="text-navy-800 group-hover:text-navy-900 inline-flex items-center gap-2 font-sans text-base font-semibold">
                {resource.label}
                <ExternalLink size={14} className="shrink-0" aria-hidden />
              </span>
              <span className="text-ink-600 text-sm leading-relaxed">
                {resource.description}
              </span>
            </a>
          ))}
        </div>
      </Section>

      {/* Blog pointer */}
      <Section space="compact">
        <div className="rounded-panel border-ink-200 flex flex-col items-start gap-5 border p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
          <div className="max-w-lg">
            <h2 className="font-display text-navy-800 text-xl font-semibold">
              More guides on the way
            </h2>
            <p className="text-ink-600 mt-2 text-[0.9375rem] leading-relaxed">
              We&apos;re building out a library of profession-specific and
              topic-specific articles. In the meantime, the category guides
              above cover the essentials in depth.
            </p>
          </div>
          <Button href="/blog" variant="outline" className="shrink-0">
            Visit the blog
          </Button>
        </div>
      </Section>

      <CtaBanner
        title="Have a question the guides don't answer?"
        body="Book a free consultation and ask us about your specific situation. We'll give you a straight answer."
        ctaLabel="Book your free consultation"
      />
    </>
  );
}
