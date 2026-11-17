import type { Metadata } from "next";
import { ExternalLink, ShieldCheck } from "lucide-react";

import { PageHero } from "@/components/layout/page-hero";
import { CtaBanner } from "@/components/sections/cta-banner";
import { TestimonialCard } from "@/components/sections/testimonials";
import { JsonLd, breadcrumbSchema } from "@/components/seo/json-ld";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { RatingBadge } from "@/components/ui/rating-badge";
import { RevealGroup, RevealItem } from "@/components/ui/reveal";
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
const chipOn = "border-navy-800 bg-navy-800 text-white";
const chipOff = "border-navy-800/28 text-navy-800 hover:border-navy-800 hover:bg-navy-50 bg-white";

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

      <PageHero
        trail={trail}
        eyebrow="Verifiable, not just quotable"
        title="Client Reviews"
        description="Every review below is a real client message from our public marketplace profile. Each one links back to its source, so you can confirm it yourself. We don't publish testimonials that can't be checked."
      >
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          {Object.entries(ratings).map(([platform, rating]) => (
            <RatingBadge key={platform} platform={platform} rating={rating} />
          ))}
          <Button href={social.fiverrProfile} variant="outline">
            <ShieldCheck size={16} aria-hidden />
            View our public profile
            <ExternalLink size={14} aria-hidden />
          </Button>
        </div>
      </PageHero>

      <Container width="wide" className="py-16 sm:py-20">
        <nav aria-label="Filter reviews by service" className="flex flex-wrap gap-2">
          <a
            href="/reviews"
            aria-current={active ? undefined : "page"}
            className={cn(chipBase, active ? chipOff : chipOn)}
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
                className={cn(chipBase, selected ? chipOn : chipOff)}
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

        <div className="rounded-card bg-ink-100 mt-14 flex flex-col gap-2 p-6 sm:p-7">
          <h2 className="text-xl">How to verify a review</h2>
          <p className="text-ink-600 max-w-[66ch] text-[0.9375rem] leading-relaxed">
            Follow the source link on any card to the public marketplace profile
            where it was left. The rating above is read from that profile on the
            date shown and is never rounded up.
          </p>
        </div>
      </Container>

      <CtaBanner
        title="Want to be our next approval?"
        body="Book a free consultation and tell us about your case. We'll assess it honestly and tell you where you stand."
      />
    </>
  );
}
