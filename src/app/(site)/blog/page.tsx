import type { Metadata } from "next";
import { ArrowRight, BookOpen } from "lucide-react";

import { CtaBanner } from "@/components/sections/cta-banner";
import { Breadcrumbs } from "@/components/service/breadcrumbs";
import { JsonLd, breadcrumbSchema } from "@/components/seo/json-ld";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { caseCategories } from "@/lib/content/services";

export const metadata: Metadata = {
  title: "Immigration Blog",
  description:
    "In-depth articles on EB-2 NIW, EB-1A, EB-1B, EB-1C and O-1 immigration petitions are coming soon. In the meantime, explore our full category guides.",
  alternates: { canonical: "/blog" },
  openGraph: {
    type: "website",
    title: "Immigration Blog | Immigration Horizons",
    description: "In-depth immigration articles — coming soon.",
    url: "/blog",
  },
};

const trail = [
  { name: "Home", path: "/" },
  { name: "Blog", path: "/blog" },
];

/** Topics we plan to publish — real intent, not fabricated posts. */
const plannedTopics = [
  "EB-2 NIW for engineers, researchers, and physicians",
  "How to define a strong proposed endeavour",
  "Independent vs collaborator recommendation letters",
  "Reading and responding to a USCIS RFE",
  "EB-1A: choosing which criteria to lead on",
  "Premium processing: when it helps and when it doesn't",
];

export default function BlogPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema(trail)} />

      <section className="bg-navy-950 relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(201,153,46,0.15),transparent_58%)]"
        />
        <Container width="wide" className="relative py-16 sm:py-24">
          <Breadcrumbs trail={trail} tone="dark" className="mb-8" />
          <div className="max-w-3xl">
            <span className="bg-gold-500/15 text-gold-300 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 font-sans text-xs font-semibold">
              <BookOpen size={14} aria-hidden />
              Coming soon
            </span>
            <h1 className="text-display-lg sm:text-display-xl mt-5 font-semibold text-white">
              The Immigration Horizons blog
            </h1>
            <p className="text-lead text-navy-200 mt-5 text-pretty">
              We&apos;re building a library of practical, profession-specific
              articles on employment-based immigration. Until it launches, our
              in-depth category guides already cover the essentials — eligibility,
              evidence strategy, and the mistakes that sink otherwise-strong
              petitions.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button href="/resources" variant="gold" size="lg">
                Explore our guides
              </Button>
              <Button href="/consultation" variant="inverse" size="lg">
                Book a free consultation
              </Button>
            </div>
          </div>
        </Container>
      </section>

      <Section>
        <SectionHeading
          eyebrow="What's coming"
          title="Topics we're writing about"
          description="A sense of what the blog will cover. Want one of these sooner, or have a question of your own? The consultation is the fastest way to get an answer."
        />
        <ul className="mx-auto mt-14 grid max-w-4xl gap-3 sm:grid-cols-2">
          {plannedTopics.map((topic) => (
            <li
              key={topic}
              className="rounded-card border-ink-200 text-navy-800 flex items-center gap-3 border bg-white px-5 py-4 font-sans text-sm font-medium"
            >
              <span
                aria-hidden
                className="bg-gold-500 h-1.5 w-1.5 shrink-0 rounded-full"
              />
              {topic}
            </li>
          ))}
        </ul>
      </Section>

      <Section tone="tint">
        <SectionHeading
          eyebrow="Start here instead"
          title="Read a full category guide now"
        />
        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {caseCategories.map((category) => (
            <Card
              key={category.slug}
              href={`/services/${category.slug}`}
              className="group flex h-full flex-col gap-3"
            >
              <CardTitle className="text-xl">{category.name}</CardTitle>
              <CardBody className="text-sm">{category.tagline}</CardBody>
              <span className="text-navy-700 group-hover:text-navy-900 mt-auto inline-flex items-center gap-1.5 pt-2 font-sans text-sm font-semibold">
                Read the guide
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

      <CtaBanner />
    </>
  );
}
