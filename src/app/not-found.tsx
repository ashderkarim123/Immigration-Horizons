import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, LifeBuoy, Mail, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Reveal } from "@/components/ui/reveal";
import { Eyebrow, Section, SectionHeading } from "@/components/ui/section";
import { caseCategories, supportServices } from "@/lib/content/services";
import { contact, whatsappLink } from "@/lib/content/site";

export const metadata: Metadata = {
  title: "Page not found",
  description:
    "The page you requested could not be found. Browse our EB-2 NIW, EB-1 and RFE support services, or book a free consultation.",
  // No `robots` here on purpose — Next already emits `noindex` for not-found.
  // Setting it again produces two competing <meta name="robots"> tags.
};

/**
 * A 404 still has a job: recover the visitor. Rather than a dead end, this
 * routes them to the case categories, the single-deliverable services, and a
 * direct line to us — the three things someone who mistyped a URL was most
 * likely looking for.
 */
export default function NotFound() {
  return (
    <>
      <section className="bg-navy-900 relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(201,153,46,0.14),transparent_60%)]"
        />

        <Container width="wide" className="relative py-24 sm:py-32">
          <Reveal className="mx-auto flex max-w-2xl flex-col items-center gap-6 text-center">
            <Eyebrow className="text-gold-300">Error 404</Eyebrow>

            <p
              aria-hidden
              className="font-display text-gold-400/25 text-7xl leading-none font-semibold sm:text-8xl"
            >
              404
            </p>

            <h1 className="text-display-lg sm:text-display-xl font-semibold text-white">
              We couldn&apos;t find that page
            </h1>

            <p className="text-lead text-navy-200 text-pretty">
              The link may be out of date, or the page may have moved. Your case
              is what matters — here is where to pick things back up.
            </p>

            <div className="mt-2 flex flex-wrap justify-center gap-3">
              <Button href="/" variant="gold" size="lg">
                Back to home
              </Button>
              <Button href="/consultation" variant="inverse" size="lg">
                Book a free consultation
              </Button>
            </div>
          </Reveal>
        </Container>
      </section>

      <Section tone="tint">
        <SectionHeading
          eyebrow="Where to next"
          title="Browse by case category"
          description="If you were looking for a specific visa classification, it is one of these."
          as="h2"
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
                View category
                <ArrowRight
                  size={15}
                  aria-hidden
                  className="transition-transform duration-200 ease-(--ease-out-soft) motion-safe:group-hover:translate-x-1"
                />
              </span>
            </Card>
          ))}
        </div>

        <div className="border-ink-200 mt-14 border-t pt-12">
          <h2 className="font-display text-navy-800 text-xl font-semibold">
            Or a single deliverable
          </h2>
          <ul className="mt-5 flex flex-wrap gap-3">
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

      <Section space="compact">
        <div className="rounded-panel border-ink-200 flex flex-col items-start gap-6 border p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
          <div className="flex items-start gap-4">
            <span
              aria-hidden
              className="bg-navy-50 text-navy-700 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
            >
              <LifeBuoy size={22} strokeWidth={1.75} />
            </span>
            <div>
              <h2 className="font-display text-navy-800 text-xl font-semibold">
                Still can&apos;t find it?
              </h2>
              <p className="text-ink-600 mt-1 text-[0.9375rem]">
                Message us directly and we will point you to the right page.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              href={whatsappLink(contact.whatsappPrimary)}
              variant="primary"
            >
              <MessageCircle size={16} aria-hidden />
              WhatsApp
            </Button>
            <Button href={`mailto:${contact.email}`} variant="outline">
              <Mail size={16} aria-hidden />
              Email us
            </Button>
          </div>
        </div>
      </Section>
    </>
  );
}
