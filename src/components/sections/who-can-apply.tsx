import { Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RevealGroup, RevealItem } from "@/components/ui/reveal";
import { Section, SectionHeading } from "@/components/ui/section";
import { SnippetAnswer } from "@/components/ui/snippet-answer";
import { whoCanApply, whoWeDontHelp } from "@/lib/content/brand";

export function WhoCanApply() {
  return (
    <Section>
      <SectionHeading
        eyebrow="Who can apply"
        title="Who qualifies for employment-based immigration?"
      />

      <div className="mx-auto mt-6 max-w-2xl text-center">
        <SnippetAnswer className="border-l-0 pl-0 text-center sm:border-l-3 sm:pl-5 sm:text-left">
          Employment-based immigration categories are open to professionals who
          can document their achievements against specific USCIS criteria —
          including engineers, researchers, physicians, AI specialists,
          professors, entrepreneurs, and executives. What matters is the
          strength of the evidence, not the industry you work in.
        </SnippetAnswer>
      </div>

      <div className="mt-14">
        <h3 className="text-navy-800 mb-8 inline-flex items-center gap-2.5 font-sans text-sm font-bold tracking-[0.14em] uppercase">
          <span className="bg-navy-50 text-navy-700 inline-flex h-7 w-7 items-center justify-center rounded-full">
            <Check size={15} aria-hidden />
          </span>
          Who we help
        </h3>

        <RevealGroup className="grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-4">
          {whoCanApply.map((audience) => (
            <RevealItem key={audience.title}>
              <div className="flex flex-col gap-2.5">
                <h4 className="font-display text-navy-800 text-lg font-semibold">
                  {audience.title}
                </h4>
                <p className="text-ink-600 text-[0.9375rem] leading-relaxed text-pretty">
                  {audience.body}
                </p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>

      {/* Stating who we turn away is a stronger credibility signal than any
          claim about who we serve. */}
      <div className="border-ink-200 mt-16 border-t pt-14">
        <h3 className="text-navy-800 mb-8 inline-flex items-center gap-2.5 font-sans text-sm font-bold tracking-[0.14em] uppercase">
          <span className="bg-ink-100 text-ink-600 inline-flex h-7 w-7 items-center justify-center rounded-full">
            <X size={15} aria-hidden />
          </span>
          Who we don&apos;t help
        </h3>

        <RevealGroup className="grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-4">
          {whoWeDontHelp.map((audience) => (
            <RevealItem key={audience.title}>
              <div className="flex flex-col gap-2.5">
                <h4 className="font-display text-ink-800 text-lg font-semibold">
                  {audience.title}
                </h4>
                <p className="text-ink-600 text-[0.9375rem] leading-relaxed text-pretty">
                  {audience.body}
                </p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>

      <div className="mt-14 text-center">
        <p className="text-ink-600 mb-5 text-[0.9375rem]">
          Not sure which side of that line you fall on?
        </p>
        <Button href="/consultation" variant="primary" size="lg">
          Get a free eligibility assessment
        </Button>
      </div>
    </Section>
  );
}
