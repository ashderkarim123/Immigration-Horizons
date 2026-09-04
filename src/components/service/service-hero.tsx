import { ArrowRight, CheckCircle2, MessageCircle } from "lucide-react";

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
    <section className="bg-navy-950 relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(201,153,46,0.15),transparent_58%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:68px_68px] [mask-image:linear-gradient(to_bottom,black,transparent_90%)]"
      />
      <div
        aria-hidden
        className="bg-navy-500/20 pointer-events-none absolute -right-28 -bottom-48 h-[30rem] w-[30rem] rounded-full blur-3xl"
      />

      <Container width="wide" className="relative py-14 sm:py-20 lg:py-24">
        <Breadcrumbs trail={trail} tone="dark" className="mb-8" />

        <div className="grid min-w-0 items-center gap-12 lg:grid-cols-[1.12fr_0.88fr] lg:gap-20">
          <div className="flex min-w-0 flex-col gap-5">
            <Eyebrow className="text-gold-200 flex w-fit max-w-full items-center gap-2 rounded-full border border-gold-400/25 bg-gold-400/10 px-4 py-2">
              <CheckCircle2 size={14} aria-hidden />
              {eyebrow}
            </Eyebrow>
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
                {ctaLabel} <ArrowRight size={17} aria-hidden />
              </Button>
              <Button
                href={whatsappLink(contact.whatsappPrimary)}
                variant="inverse"
                size="lg"
              >
                <MessageCircle size={17} aria-hidden /> Chat on WhatsApp
              </Button>
            </div>
          </div>

          {keyFacts?.length ? (
            <div className="rounded-panel relative h-fit overflow-hidden border border-white/12 bg-white/[0.065] p-7 shadow-[0_30px_80px_rgba(0,0,0,0.22)] backdrop-blur-sm sm:p-8">
              <span aria-hidden className="bg-gold-500 absolute top-0 left-8 h-1 w-14 rounded-b-full" />
              <div className="mb-6 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-gold-300 font-sans text-[0.6875rem] font-bold tracking-[0.14em] uppercase">
                    At a glance
                  </h2>
                  <p className="text-navy-300 mt-1 text-xs">Key points for this service</p>
                </div>
                <span className="border-gold-400/25 bg-gold-400/10 text-gold-300 flex h-10 w-10 items-center justify-center rounded-xl border">
                  <CheckCircle2 size={18} aria-hidden />
                </span>
              </div>
              <dl className="flex flex-col gap-2">
                {keyFacts.map((fact) => (
                  <div
                    key={fact.label}
                    className="flex items-start justify-between gap-4 rounded-xl border border-white/8 bg-navy-950/25 px-4 py-3.5"
                  >
                    <dt className="text-navy-300 font-sans text-[0.8125rem]">
                      {fact.label}
                    </dt>
                    <dd className="text-right font-sans text-[0.8125rem] font-semibold text-white">
                      <span className="inline-flex items-start gap-2">
                        <span className="bg-gold-400 mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" aria-hidden />
                        {fact.value}
                      </span>
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
