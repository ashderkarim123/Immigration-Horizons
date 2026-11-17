import { ArrowRight, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/section";
import { hero } from "@/lib/content/home";

import { HeroVisual } from "./hero-visual";

/**
 * Ivory split hero. Two CTAs only: WhatsApp is the floating button, because
 * a third button wraps badly at 360px. The explicit {" "} between the H1
 * lines matters: without it the two lines concatenate to
 * "petitions,prepared" for a screen reader and for a crawler.
 */
export function Hero() {
  return (
    <section data-cta-placement="hero" className="bg-ink-50 overflow-hidden">
      <Container width="wide" className="py-14 sm:py-20 lg:py-22">
        <div className="grid min-w-0 items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div className="flex min-w-0 flex-col gap-6">
            <Eyebrow>{hero.eyebrow}</Eyebrow>

            <h1 className="text-display-lg sm:text-display-xl max-w-[14ch]">
              {hero.headline[0]}{" "}
              <span className="block">{hero.headline[1]}</span>
            </h1>

            <p className="text-lead text-ink-600 max-w-xl text-pretty">
              {hero.subline}
            </p>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button href={hero.primaryCta.href} variant="primary" size="lg">
                {hero.primaryCta.label} <ArrowRight size={17} aria-hidden />
              </Button>
              <Button href={hero.secondaryCta.href} variant="outline" size="lg">
                {hero.secondaryCta.label}
              </Button>
            </div>

            <ul className="text-ink-600 flex flex-wrap gap-x-5 gap-y-2 font-sans text-sm">
              {hero.checks.map((check) => (
                <li key={check} className="inline-flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-navy-800 shrink-0" aria-hidden />
                  {check}
                </li>
              ))}
            </ul>
          </div>

          <div className="mx-auto w-full max-w-[520px] lg:max-w-none">
            <HeroVisual alt={hero.artAlt} />
          </div>
        </div>
      </Container>
    </section>
  );
}
