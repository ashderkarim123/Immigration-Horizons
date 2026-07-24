import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { Section, SectionHeading } from "@/components/ui/section";
import { processSteps } from "@/lib/content/about";

export function Process() {
  return (
    <Section tone="navy" space="spacious">
      <SectionHeading
        eyebrow="How it works"
        title="A structured process, not a document dump"
        description="Every case moves through the same six stages. You work with the same point of contact throughout."
        className="[&_p]:text-navy-200 [&_span]:text-gold-300"
      />

      <ol className="mt-16 grid gap-x-10 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
        {processSteps.map((step, index) => (
          <Reveal key={step.title} delay={index * 0.06}>
            <li className="relative flex flex-col gap-3 border-t border-white/12 pt-6">
              <span
                aria-hidden
                className="text-gold-400/70 font-display absolute -top-3.5 right-0 text-sm font-semibold"
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="font-display text-xl font-semibold text-white">
                {step.title}
              </h3>
              <p className="text-navy-200 text-[0.9375rem] leading-relaxed text-pretty">
                {step.body}
              </p>
            </li>
          </Reveal>
        ))}
      </ol>

      <div className="mt-16 text-center">
        <Button href="/consultation" variant="gold" size="lg">
          Start with step one — book a consultation
        </Button>
      </div>
    </Section>
  );
}
