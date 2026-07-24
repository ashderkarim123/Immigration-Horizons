import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/section";
import { contact, whatsappLink } from "@/lib/content/site";

import { Breadcrumbs, type Crumb } from "./breadcrumbs";

/** Shared hero for every service page. */
export function ServiceHero({
  eyebrow,
  headline,
  subhead,
  definition,
  trail,
  keyFacts,
  ctaLabel = "Book a free consultation",
}: {
  eyebrow: string;
  headline: string;
  subhead: string;
  /** Standalone snippet-optimised definition, ~40–60 words. */
  definition?: string;
  trail: Crumb[];
  keyFacts?: { label: string; value: string }[];
  ctaLabel?: string;
}) {
  return (
    <section className="bg-navy-900 relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(201,153,46,0.15),transparent_58%)]"
      />

      <Container width="wide" className="relative py-14 sm:py-20">
        <Breadcrumbs trail={trail} tone="dark" className="mb-8" />

        <div className="grid gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
          <div className="flex flex-col gap-5">
            <Eyebrow className="text-gold-300">{eyebrow}</Eyebrow>
            <h1 className="text-display-lg sm:text-display-xl font-semibold text-white">
              {headline}
            </h1>
            <p className="text-lead text-navy-200 max-w-2xl text-pretty">
              {subhead}
            </p>

            {definition ? (
              <p className="border-gold-400 mt-2 max-w-2xl border-l-3 py-1 pl-5 text-[1.0625rem] leading-relaxed font-medium text-white text-pretty">
                {definition}
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-3">
              <Button href="/consultation" variant="gold" size="lg">
                {ctaLabel}
              </Button>
              <Button
                href={whatsappLink(contact.whatsappPrimary)}
                variant="inverse"
                size="lg"
              >
                Chat on WhatsApp
              </Button>
            </div>
          </div>

          {keyFacts?.length ? (
            <div className="rounded-panel h-fit border border-white/12 bg-white/[0.06] p-7 backdrop-blur-sm">
              <h2 className="text-gold-300 mb-5 font-sans text-[0.6875rem] font-bold tracking-[0.14em] uppercase">
                At a glance
              </h2>
              <dl className="flex flex-col gap-4">
                {keyFacts.map((fact) => (
                  <div
                    key={fact.label}
                    className="flex items-baseline justify-between gap-4 border-b border-white/10 pb-3 last:border-0 last:pb-0"
                  >
                    <dt className="text-navy-300 font-sans text-[0.8125rem]">
                      {fact.label}
                    </dt>
                    <dd className="text-right font-sans text-[0.8125rem] font-semibold text-white">
                      {fact.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
        </div>
      </Container>
    </section>
  );
}
