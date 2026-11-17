import type { Metadata } from "next";
import { ExternalLink, ShieldCheck } from "lucide-react";

import { CtaBanner } from "@/components/sections/cta-banner";
import { TestimonialCard } from "@/components/sections/testimonials";
import { Breadcrumbs } from "@/components/service/breadcrumbs";
import { JsonLd, breadcrumbSchema } from "@/components/seo/json-ld";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { RatingBadge } from "@/components/ui/rating-badge";
import { RevealGroup, RevealItem } from "@/components/ui/reveal";
import { Eyebrow } from "@/components/ui/section";
import { ratings, social } from "@/lib/content/site";
import {
  findReviewFilter,
  reviewFilters,
  testimonialsMatching,
} from "@/lib/content/testimonials";
import { baseOpenGraph } from "@/lib/seo/og";
import { cn } from "@/lib/utils";

/** The canonical is `/reviews` whatever the filter: the query string only narrows the same page. */
export const metadata: Metadata = {
  title: "Client Reviews",
  description:
    "Verified client reviews and case-approval messages. Every review links to our public marketplace profile so you can confirm it yourself.",
  alternates: { canonical: "/reviews" },
  openGraph: {
    ...baseOpenGraph,
    title: "Client Reviews | Immigration Horizons",
    description:
      "Verifiable client reviews and approvals — every one links back to its public source.",
    url: "/reviews",
  },
};

const trail = [
  { name: "Home", path: "/" },
  { name: "Reviews", path: "/reviews" },
];

const chipBase =
  "inline-flex items-center rounded-full border px-4 py-1.5 font-sans text-sm font-semibold transition-colors";

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string | string[] }>;
}) {
  const { service } = await searchParams;
  const active = findReviewFilter(Array.isArray(service) ? service[0] : service);
  const reviews = testimonialsMatching(active);

  return (
    <>
      <JsonLd data={breadcrumbSchema(trail)} />

      <section className="bg-navy-950 relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(201,153,46,0.15),transparent_58%)]"
        />
        <Container width="wide" className="relative py-16 sm:py-20">
          <Breadcrumbs trail={trail} tone="dark" className="mb-8" />
          <div className="max-w-3xl">
            <Eyebrow className="text-gold-300">Verifiable, not just quotable</Eyebrow>
            <h1 className="text-display-lg sm:text-display-xl mt-4 font-semibold text-white">
              Client Reviews
            </h1>
            <p className="text-lead text-navy-200 mt-5 text-pretty">
              Every review below is a real client message from our public
              marketplace profile. Each one links back to its source, so you can
              confirm it yourself. We don&apos;t publish testimonials that
              can&apos;t be checked.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {Object.entries(ratings).map(([platform, rating]) => (
                <RatingBadge key={platform} platform={platform} rating={rating} tone="dark" />
              ))}
              <Button href={social.fiverrProfile} variant="inverse">
                <ShieldCheck size={16} aria-hidden />
                View our public profile
                <ExternalLink size={14} aria-hidden />
              </Button>
            </div>
          </div>
        </Container>
      </section>

      <Container width="wide" className="py-16 sm:py-20">
        <nav aria-label="Filter reviews by service" className="flex flex-wrap gap-2">
          <a
            href="/reviews"
            aria-current={active ? undefined : "page"}
            className={cn(
              chipBase,
              active
                ? "border-ink-200 text-navy-800 hover:border-navy-300 bg-white"
                : "border-navy-900 bg-navy-900 text-white",
            )}
          >
            All
          </a>
          {reviewFilters.map((filter) => {
            const selected = filter === active;
            return (
              <a
                key={filter.label}
                href={`/reviews?service=${filter.slugs[0]}`}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  chipBase,
                  selected
                    ? "border-navy-900 bg-navy-900 text-white"
                    : "border-ink-200 text-navy-800 hover:border-navy-300 bg-white",
                )}
              >
                {filter.label}
              </a>
            );
          })}
        </nav>

        {reviews.length > 0 ? (
          <RevealGroup className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {reviews.map((testimonial) => (
              <RevealItem key={testimonial.id}>
                <TestimonialCard testimonial={testimonial} />
              </RevealItem>
            ))}
          </RevealGroup>
        ) : (
          <p className="text-ink-600 mt-10 max-w-2xl text-pretty">
            No published review is tagged to {active?.label} yet. Reviews are
            tagged only when the client named the service, so this list grows
            as new reviews are added.{" "}
            <a href="/reviews" className="text-navy-800 font-semibold underline">
              See all reviews
            </a>
            .
          </p>
        )}
      </Container>

      <CtaBanner
        title="Want to be our next approval?"
        body="Book a free consultation and tell us about your case. We'll assess it honestly and tell you where you stand."
        ctaLabel="Book your free consultation"
      />
    </>
  );
}
