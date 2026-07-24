import { Button } from "@/components/ui/button";
import { FeatureIcon } from "@/components/ui/feature-icon";
import { RevealGroup, RevealItem } from "@/components/ui/reveal";
import { Section, SectionHeading } from "@/components/ui/section";
import { differentiators } from "@/lib/content/about";

export function Differentiators() {
  return (
    <Section tone="tint">
      <SectionHeading
        eyebrow="Why choose us"
        title="Eight reasons clients trust us with their case"
      />

      <RevealGroup className="mt-16 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        {differentiators.map((item) => (
          <RevealItem key={item.title}>
            <div className="flex flex-col gap-4">
              <FeatureIcon name={item.icon} />
              <h3 className="font-display text-lg font-semibold">
                {item.title}
              </h3>
              <p className="text-ink-600 text-[0.9375rem] leading-relaxed text-pretty">
                {item.body}
              </p>
            </div>
          </RevealItem>
        ))}
      </RevealGroup>

      <div className="mt-14 text-center">
        <Button href="/consultation" variant="primary" size="lg">
          Talk to an immigration specialist
        </Button>
      </div>
    </Section>
  );
}
