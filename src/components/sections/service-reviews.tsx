import { Button } from "@/components/ui/button";
import { RevealGroup, RevealItem } from "@/components/ui/reveal";
import { Section, SectionHeading } from "@/components/ui/section";
import { testimonialsFor } from "@/lib/content/testimonials";

import { TestimonialCard } from "./testimonials";

/**
 * Reviews tagged to one service, placed between the main content and the
 * FAQs on every service page. Renders nothing when no review is tagged, so a
 * page never shows an empty "reviews" band or borrowed, unrelated praise.
 */
export function ServiceReviews({ slug, name }: { slug: string; name: string }) {
  const reviews = testimonialsFor(slug).slice(0, 5);

  if (reviews.length === 0) return null;

  return (
    <Section id="reviews" tone="tint" space="compact">
      <SectionHeading
        eyebrow="Client reviews"
        title={`${name} client reviews`}
        description="Every review links to our public profile so you can confirm it yourself. We do not publish testimonials that cannot be checked."
      />

      <RevealGroup className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {reviews.map((testimonial) => (
          <RevealItem key={testimonial.id}>
            <TestimonialCard testimonial={testimonial} />
          </RevealItem>
        ))}
      </RevealGroup>

      <div className="mt-10 text-center">
        <Button href={`/reviews?service=${slug}`} variant="outline">
          Read all reviews
        </Button>
      </div>
    </Section>
  );
}
