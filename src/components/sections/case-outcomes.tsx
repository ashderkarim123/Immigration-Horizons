import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/card";
import { RevealGroup, RevealItem } from "@/components/ui/reveal";
import { Section, SectionHeading } from "@/components/ui/section";
import { testimonials } from "@/lib/content/testimonials";

/**
 * Outcome highlights built strictly from testimonials the practice already
 * has, each one linking back to the public profile it came from. No invented
 * client profiles, no aggregate approval rates, no outcomes we cannot point
 * a visitor at.
 */
const outcomeIds = [
  "niw-rfe-approval-2025",
  "niw-rfe-approval-2024",
  "ashwin-sankaran",
  "henry-lindpere",
];

const outcomeHeadlines: Record<string, string> = {
  "niw-rfe-approval-2025":
    "EB-2 NIW approved after an RFE on a petition filed by another firm",
  "niw-rfe-approval-2024": "EB-2 NIW approved following an RFE response",
  "ashwin-sankaran": "I-140 approved",
  "henry-lindpere": "RFE response prepared as contract support for a law firm",
};

export function CaseOutcomes() {
  const outcomes = outcomeIds
    .map((id) => testimonials.find((testimonial) => testimonial.id === id))
    .filter((testimonial) => testimonial !== undefined);

  return (
    <Section tone="tint">
      <SectionHeading
        eyebrow="Why clients trust us"
        title="Outcomes you can check yourself"
        description="Each of these is a real client message from our marketplace profile, linked so you can verify it. We do not publish case studies that cannot be traced back to a source."
      />

      <RevealGroup className="mt-14 grid gap-6 md:grid-cols-2">
        {outcomes.map((outcome) => (
          <RevealItem key={outcome.id}>
            <figure className="rounded-card border-navy-800/14 shadow-card flex h-full flex-col gap-4 border bg-white p-7">
              <div className="flex items-center gap-3">
                <Badge tone="gold">{outcome.service}</Badge>
                <span className="text-ink-500 font-sans text-xs">
                  {outcome.date}
                </span>
              </div>

              <h3 className="text-xl text-pretty">
                {outcomeHeadlines[outcome.id]}
              </h3>

              <blockquote className="text-ink-700 flex-1 text-[0.9375rem] leading-relaxed text-pretty">
                &ldquo;{outcome.text}&rdquo;
              </blockquote>

              <figcaption className="border-navy-800/14 flex items-end justify-between gap-3 border-t pt-4">
                <div>
                  <p className="text-navy-800 font-sans text-sm font-semibold">
                    {outcome.name}
                  </p>
                  <p className="text-ink-500 font-sans text-xs">
                    {outcome.location}
                  </p>
                </div>
                <a
                  href={outcome.verifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-navy-800 inline-flex shrink-0 items-center gap-1.5 font-sans text-xs font-semibold underline-offset-4 hover:underline"
                >
                  Verify on {outcome.source}
                  <ExternalLink size={12} aria-hidden />
                </a>
              </figcaption>
            </figure>
          </RevealItem>
        ))}
      </RevealGroup>
    </Section>
  );
}
