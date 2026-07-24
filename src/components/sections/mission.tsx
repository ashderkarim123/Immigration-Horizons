import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Reveal, RevealGroup, RevealItem } from "@/components/ui/reveal";
import { Section, SectionHeading } from "@/components/ui/section";
import { coreValues, mission, vision } from "@/lib/content/brand";
import { stats } from "@/lib/content/site";

export function Mission() {
  return (
    <Section>
      <div className="grid gap-14 lg:grid-cols-[0.95fr_1.05fr] lg:gap-20">
        <Reveal>
          <SectionHeading
            align="left"
            eyebrow="Trusted immigration consulting"
            title="Petition preparation built around one person's record"
            description="Immigration Horizons is an immigration consulting and paralegal services practice specialising in employment-based U.S. petitions. Over 5+ years and 200+ cases, we have prepared EB-2 NIW, EB-1A, EB-1B and EB-1C filings for professionals worldwide — and provided drafting support to immigration attorneys and paralegals who needed extra capacity on a case."
          />

          <dl className="border-ink-200 mt-10 flex flex-wrap gap-x-12 gap-y-6 border-t pt-8">
            <div>
              <dt className="text-ink-500 font-sans text-xs tracking-wide uppercase">
                Cases handled
              </dt>
              <dd className="font-display text-navy-800 mt-1 text-3xl font-semibold">
                {stats.casesHandled}
              </dd>
            </div>
            <div>
              <dt className="text-ink-500 font-sans text-xs tracking-wide uppercase">
                Years experience
              </dt>
              <dd className="font-display text-navy-800 mt-1 text-3xl font-semibold">
                {stats.yearsExperience}
              </dd>
            </div>
            <div>
              <dt className="text-ink-500 font-sans text-xs tracking-wide uppercase">
                Client base
              </dt>
              <dd className="font-display text-navy-800 mt-1 text-3xl font-semibold">
                Global
              </dd>
            </div>
          </dl>

          <Button href="/about" variant="outline" className="mt-9">
            Learn more about us
          </Button>
        </Reveal>

        <div className="flex flex-col gap-6">
          <Reveal delay={0.08}>
            <Card tone="tint" className="flex flex-col gap-3">
              <h3 className="font-display text-navy-800 text-xl font-semibold">
                {mission.heading}
              </h3>
              <p className="text-ink-600 text-[0.9375rem] leading-relaxed text-pretty">
                {mission.body}
              </p>
            </Card>
          </Reveal>

          <Reveal delay={0.14}>
            <Card tone="tint" className="flex flex-col gap-3">
              <h3 className="font-display text-navy-800 text-xl font-semibold">
                {vision.heading}
              </h3>
              <p className="text-ink-600 text-[0.9375rem] leading-relaxed text-pretty">
                {vision.body}
              </p>
            </Card>
          </Reveal>
        </div>
      </div>

      <div className="border-ink-200 mt-20 border-t pt-16">
        <h3 className="font-display text-navy-800 text-center text-2xl font-semibold">
          Core values
        </h3>
        <RevealGroup className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {coreValues.map((value) => (
            <RevealItem key={value.title}>
              <div className="border-gold-500 flex flex-col gap-2.5 border-t-2 pt-5">
                <h4 className="font-display text-navy-800 text-lg font-semibold">
                  {value.title}
                </h4>
                <p className="text-ink-600 text-[0.9375rem] leading-relaxed text-pretty">
                  {value.body}
                </p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </Section>
  );
}
