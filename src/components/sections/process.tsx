import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { Section, SectionHeading } from "@/components/ui/section";
import { processSteps } from "@/lib/content/about";

/**
 * Visual process timeline. A continuous gold spine threads numbered nodes,
 * so the eight stages read as one connected journey rather than a plain list.
 * Pure CSS/SVG — the spine is a bordered pseudo-column, nodes are flex items.
 */
export function Process() {
  return (
    <Section tone="navy" space="spacious">
      <SectionHeading
        eyebrow="How it works"
        title="A structured process, not a document dump"
        description="Every case moves through the same eight stages. You work with the same point of contact throughout."
        className="[&_p]:text-navy-200 [&_span]:text-gold-300"
      />

      <ol className="relative mx-auto mt-16 max-w-3xl">
        {/* Continuous spine */}
        <span
          aria-hidden
          className="from-gold-400/60 via-gold-400/30 absolute top-2 bottom-2 left-[1.4rem] w-px bg-gradient-to-b to-transparent"
        />

        {processSteps.map((step, index) => (
          <Reveal key={step.title} delay={index * 0.05}>
            <li className="relative flex gap-6 pb-9 last:pb-0">
              <span
                aria-hidden
                className="border-gold-400/40 bg-navy-800 text-gold-300 font-display relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-sm font-semibold"
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="pt-1.5">
                <h3 className="font-display text-lg font-semibold text-white">
                  {step.title}
                </h3>
                <p className="text-navy-200 mt-1.5 text-[0.9375rem] leading-relaxed text-pretty">
                  {step.body}
                </p>
              </div>
            </li>
          </Reveal>
        ))}
      </ol>

      <div className="mt-14 text-center">
        <Button href="/consultation" variant="gold" size="lg">
          Start with step one — book a consultation
        </Button>
      </div>
    </Section>
  );
}
