import { Button } from "@/components/ui/button";
import { RevealGroup, RevealItem } from "@/components/ui/reveal";
import { Section, SectionHeading } from "@/components/ui/section";
import { processSteps } from "@/lib/content/about";

/**
 * Eight steps, four across, numbered in terracotta DM Serif. No timings
 * anywhere: the lead says who files, not how long anything takes.
 */
export function Process() {
  return (
    <Section tone="ivory">
      <SectionHeading
        eyebrow="How it works"
        title="A structured process, not a document dump"
        description="Every case moves through the same eight stages with one point of contact. We prepare. You, or your attorney, file."
      />

      <RevealGroup className="mt-14 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
        {processSteps.map((step, index) => (
          <RevealItem key={step.title}>
            <div className="border-ink-200 border-t-2 pt-5">
              <span aria-hidden className="font-display text-gold-500 block text-[2rem] leading-none">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3 text-xl">{step.title}</h3>
              <p className="text-ink-600 mt-1.5 text-[0.9375rem] leading-relaxed text-pretty">
                {step.body}
              </p>
            </div>
          </RevealItem>
        ))}
      </RevealGroup>

      <div className="mt-14 text-center">
        <Button href="/consultation" variant="primary" size="lg">
          Start with step one — book a consultation
        </Button>
      </div>
    </Section>
  );
}
