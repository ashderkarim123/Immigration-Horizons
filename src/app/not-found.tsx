import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, LifeBuoy, Mail, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Reveal } from "@/components/ui/reveal";
import { Eyebrow, Section, SectionHeading } from "@/components/ui/section";
import { publishedCaseCategories as caseCategories, publishedSupportServices as supportServices, publishedOtherVisas as otherVisas } from "@/lib/content/published-services";
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
      <section className="bg-ink-50 border-navy-800/14 border-b">
        <Container width="wide" className="py-20 sm:py-28">
          <Reveal className="mx-auto flex max-w-2xl flex-col items-center gap-6 text-center">
            <Image
              src="/images/open-horizons-stacked-full.svg"
              alt=""
              width={800}
              height={720}
              className="h-auto w-40"
            />
            <Eyebrow>Error 404</Eyebrow>

            <h1 className="text-display-lg sm:text-display-xl">
              We couldn&apos;t find that page
            </h1>

            <p className="text-lead text-ink-600 text-pretty">
              The link may be out of date, or the page may have moved. Your case
              is what matters — here is where to pick things back up.
            </p>

            <div className="mt-2 flex flex-wrap justify-center gap-3">
              <Button href="/" variant="primary" size="lg">
                Back to home
              </Button>
              <Button href="/consultation" variant="outline" size="lg">
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
          <h2 className="font-display text-navy-800 mt-10 text-xl font-semibold">Other US visas</h2>
          <ul className="mt-5 flex flex-wrap gap-3">
            {otherVisas.map((visa) => (
              <li key={visa.slug}><Link href={`/services/${visa.slug}`} className="text-navy-800 underline underline-offset-4">{visa.name}</Link></li>
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
