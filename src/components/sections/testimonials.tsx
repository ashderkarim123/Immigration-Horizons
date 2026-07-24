import { ExternalLink, Star } from "lucide-react";

import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RevealGroup, RevealItem } from "@/components/ui/reveal";
import { Section, SectionHeading } from "@/components/ui/section";
import { testimonials, type Testimonial } from "@/lib/content/testimonials";

function Stars({ rating }: { rating: number }) {
  return (
    <span
      className="flex items-center gap-0.5"
      role="img"
      aria-label={`${rating} out of 5 stars`}
    >
      {Array.from({ length: rating }, (_, i) => (
        <Star
          key={i}
          size={15}
          className="fill-gold-500 text-gold-500"
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

      <blockquote className="text-ink-700 flex-1 text-[0.9375rem] leading-relaxed text-pretty">
        &ldquo;{testimonial.text}&rdquo;
      </blockquote>

      <footer className="border-ink-200 mt-2 flex items-end justify-between gap-3 border-t pt-4">
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
          className="text-navy-700 hover:text-navy-900 inline-flex shrink-0 items-center gap-1.5 font-sans text-xs font-semibold"
        >
          Verify
          <ExternalLink size={12} aria-hidden />
        </a>
      </footer>
    </Card>
  );
}

export function Testimonials({ limit = 3 }: { limit?: number }) {
  return (
    <Section>
      <SectionHeading
        eyebrow="Client reviews"
        title="Verifiable, not just quotable"
        description="Every review below links to our public Fiverr profile so you can confirm it yourself. We do not publish testimonials that cannot be checked."
      />

      <RevealGroup className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {testimonials.slice(0, limit).map((testimonial) => (
          <RevealItem key={testimonial.id}>
            <TestimonialCard testimonial={testimonial} />
          </RevealItem>
        ))}
      </RevealGroup>

      <div className="mt-12 text-center">
        <Button href="/reviews" variant="outline">
          Read all reviews
        </Button>
      </div>
    </Section>
  );
}
