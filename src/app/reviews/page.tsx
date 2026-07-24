import type { Metadata } from "next";
import { ExternalLink, ShieldCheck } from "lucide-react";

import { CtaBanner } from "@/components/sections/cta-banner";
import { TestimonialCard } from "@/components/sections/testimonials";
import { Breadcrumbs } from "@/components/service/breadcrumbs";
import { JsonLd, breadcrumbSchema } from "@/components/seo/json-ld";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { RevealGroup, RevealItem } from "@/components/ui/reveal";
import { Eyebrow } from "@/components/ui/section";
import { social } from "@/lib/content/site";
import { testimonials } from "@/lib/content/testimonials";

export const metadata: Metadata = {
  title: "Client Reviews",
  description:
    "Verified client reviews and case-approval messages from Immigration Horizons. Every review links to our public marketplace profile so you can confirm it yourself.",
  alternates: { canonical: "/reviews" },
  openGraph: {
    type: "website",
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

export default function ReviewsPage() {
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
            <Eyebrow className="text-gold-300">Client reviews</Eyebrow>
            <h1 className="text-display-lg sm:text-display-xl mt-4 font-semibold text-white">
              Verifiable, not just quotable
            </h1>
            <p className="text-lead text-navy-200 mt-5 text-pretty">
              Every review below is a real client message from our public
              marketplace profile. Each one links back to its source, so you can
              confirm it yourself. We don&apos;t publish testimonials that
              can&apos;t be checked.
            </p>
            <div className="mt-6">
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
        <RevealGroup className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {testimonials.map((testimonial) => (
            <RevealItem key={testimonial.id}>
              <TestimonialCard testimonial={testimonial} />
            </RevealItem>
          ))}
        </RevealGroup>
      </Container>

      <CtaBanner
        title="Want to be our next approval?"
        body="Book a free consultation and tell us about your case. We'll assess it honestly and tell you where you stand."
        ctaLabel="Book your free consultation"
      />
    </>
  );
}
