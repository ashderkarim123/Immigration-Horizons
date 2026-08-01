import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";
import { contact, whatsappLink } from "@/lib/content/site";

import { HeroVisual } from "./hero-visual";

export function Hero() {
  return (
    <section className="bg-navy-900 relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(201,153,46,0.16),transparent_55%)]"
      />

      <Container
        width="wide"
        className="relative px-6 py-10 sm:px-10 sm:py-14 lg:px-16 lg:py-16"
      >
        <div className="grid items-start gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <Reveal className="flex flex-col gap-5">
            <Eyebrow className="text-gold-300">
              Employment-Based U.S. Immigration
            </Eyebrow>

            <h1 className="text-display-md sm:text-display-lg lg:text-display-xl font-semibold text-white">
              EB-2 NIW &amp; EB-1 petition preparation for professionals
              worldwide
            </h1>

            {/* Kept to ~50 words and written as a standalone definition so it
                can be lifted as a featured snippet. */}
            <p className="text-lead text-navy-200 max-w-xl text-pretty">
              Immigration Horizons is an immigration consulting and paralegal
              services practice. We prepare EB-2 NIW, EB-1A, EB-1B, EB-1C and
              O-1 petitions — building case strategy, drafting every document
              from scratch, organising evidence, and preparing USCIS RFE
              responses for professionals and law firms worldwide.
            </p>

            <div className="flex flex-wrap gap-3">
              <Button href="/consultation" variant="gold" size="lg">
                Book a free consultation
              </Button>
              <Button
                href={whatsappLink(contact.whatsappPrimary)}
                variant="inverse"
                size="lg"
              >
                Chat on WhatsApp
              </Button>
            </div>
          </Reveal>

          <Reveal
            delay={0.14}
            className="flex justify-center lg:justify-end lg:pt-6"
          >
            <HeroVisual className="max-w-[15rem] sm:max-w-xs lg:max-w-sm" />
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
