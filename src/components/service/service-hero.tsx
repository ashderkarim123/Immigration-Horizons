import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { contact, whatsappLink } from "@/lib/content/site";

import { Breadcrumbs, type Crumb } from "./breadcrumbs";

/**
 * Shared ivory hero for every service page: badge, H1, lead, definition
 * callout, two CTAs, the "we prepare, you file" line, and the key-facts
 * panel. The secondary CTA defaults to WhatsApp (deadline-bound RFE/NOID
 * visitors); core petition pages pass an anchor to their package section.
 */
export function ServiceHero({
  eyebrow,
  badgeTone = "navy",
  headline,
  subhead,
  definition,
  trail,
  keyFacts,
  ctaLabel = "Book a free consultation",
  secondaryCta = { label: "Chat on WhatsApp", href: whatsappLink(contact.whatsappPrimary) },
}: {
  eyebrow: string;
  badgeTone?: "navy" | "gold" | "neutral";
  headline: string;
  subhead: string;
  /** Standalone snippet-optimised definition, ~40–60 words. */
  definition?: string;
  trail: Crumb[];
  keyFacts?: { label: string; value: string }[];
  ctaLabel?: string;
  secondaryCta?: { label: string; href: string };
}) {
  return (
    <section
      data-cta-placement="hero"
      data-cta-id="service_consultation"
      className="border-navy-800/14 bg-ink-50 border-b"
    >
      <Container width="wide" className="py-12 sm:py-16 lg:py-20">
        <Breadcrumbs trail={trail} className="mb-8" />

        <div className="grid min-w-0 items-start gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
          <div className="flex min-w-0 flex-col gap-5">
            <div>
              <Badge tone={badgeTone}>{eyebrow}</Badge>
            </div>
            <h1 className="text-display-lg sm:text-display-xl max-w-[18ch]">
              {headline}
            </h1>
            <p className="text-lead text-ink-600 max-w-2xl text-pretty">
              {subhead}
            </p>

            {definition ? (
              <p className="border-gold-500 text-navy-800 rounded-r-lg border-l-4 bg-white px-5 py-4 text-[1.0625rem] leading-relaxed text-pretty">
                {definition}
              </p>
            ) : null}

            <div className="mt-2 flex flex-wrap gap-3">
              <Button href="/consultation" variant="primary" size="lg">
                {ctaLabel} <ArrowRight size={17} aria-hidden />
              </Button>
              <Button href={secondaryCta.href} variant="outline" size="lg">
                {secondaryCta.label}
              </Button>
            </div>
            <p className="text-ink-500 font-sans text-sm">
              We prepare the documents. You, or your attorney, file them.
            </p>
          </div>

          {keyFacts?.length ? (
            <div className="rounded-card border-navy-800/14 shadow-card h-fit border bg-white p-6 sm:p-7">
              <h2 className="text-ink-500 font-sans text-xs font-bold tracking-[0.14em] uppercase">
                At a glance
              </h2>
              <dl className="divide-navy-800/14 mt-3 divide-y">
                {keyFacts.map((fact) => (
                  <div
                    key={fact.label}
                    className="flex items-start justify-between gap-6 py-3"
                  >
                    <dt className="text-ink-600 font-sans text-sm">{fact.label}</dt>
                    <dd className="text-navy-800 text-right font-sans text-sm font-semibold">
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
