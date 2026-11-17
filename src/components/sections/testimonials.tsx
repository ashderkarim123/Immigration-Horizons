import { ExternalLink, Star } from "lucide-react";

import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RevealGroup, RevealItem } from "@/components/ui/reveal";
import { Section, SectionHeading } from "@/components/ui/section";
import { featuredTestimonials, type Testimonial } from "@/lib/content/testimonials";

function Stars({ rating }: { rating: number }) {
  return (
    <span
      className="text-gold-500 flex items-center gap-0.5"
      role="img"
      aria-label={`${rating} out of 5 stars`}
    >
      {Array.from({ length: rating }, (_, i) => (
        <Star
          key={i}
          size={15}
          className="fill-current"
          aria-hidden
        />
      ))}
    </span>
  );
}

export function TestimonialCard({ testimonial }: { testimonial: Testimonial }) {
  return (
    <Card className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Badge tone="navy">{testimonial.service}</Badge>
        <Stars rating={testimonial.rating} />
      </div>

      <blockquote className="text-ink-700 flex-1 text-base leading-relaxed text-pretty">
        &ldquo;{testimonial.text}&rdquo;
      </blockquote>

      <footer className="border-navy-800/14 mt-2 flex items-end justify-between gap-3 border-t pt-4">
        <div>
          <p className="text-navy-800 font-sans text-sm font-semibold">
            {testimonial.name}
          </p>
          <p className="text-ink-500 font-sans text-xs">
            {testimonial.location}
          </p>
        </div>
        <a
          href={testimonial.verifyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-navy-800 inline-flex shrink-0 items-center gap-1.5 font-sans text-xs font-semibold underline-offset-4 hover:underline"
        >
          Verify on {testimonial.source}
          <ExternalLink size={12} aria-hidden />
        </a>
      </footer>
    </Card>
  );
}

export function Testimonials({ limit = 3 }: { limit?: number }) {
  return (
    <Section tone="tint">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <SectionHeading
          align="left"
          eyebrow="Client reviews"
          title="Verifiable, not just quotable"
          description="Every review links to the public profile it came from so you can confirm it yourself. We do not publish testimonials that cannot be checked."
        />
        <Button href="/reviews" variant="outline" className="shrink-0">
          All reviews
        </Button>
      </div>

      <RevealGroup className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {featuredTestimonials.slice(0, limit).map((testimonial) => (
          <RevealItem key={testimonial.id}>
            <TestimonialCard testimonial={testimonial} />
          </RevealItem>
        ))}
      </RevealGroup>

    </Section>
  );
}
