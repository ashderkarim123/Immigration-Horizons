import { BadgeCheck, Globe2, ScaleIcon, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";
import { contact, social, stats, whatsappLink } from "@/lib/content/site";

import { HeroVisual } from "./hero-visual";

const trustBadges = [
  { label: `${stats.casesHandled} cases handled`, icon: BadgeCheck },
  { label: `${stats.yearsExperience} years experience`, icon: ShieldCheck },
  { label: "Clients across the globe", icon: Globe2 },
  { label: "Consultants, not attorneys", icon: ScaleIcon },
];

export function Hero() {
  return (
    <section className="bg-navy-900 relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(201,153,46,0.16),transparent_55%)]"
      />

      <Container width="wide" className="relative py-20 sm:py-24 lg:py-28">
        <div className="grid items-center gap-16 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
          <Reveal className="flex flex-col gap-6">
            <Eyebrow className="text-gold-300">
              Employment-Based U.S. Immigration
            </Eyebrow>

            <h1 className="text-display-lg sm:text-display-xl lg:text-display-2xl font-semibold text-white">
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

            <div className="mt-1 flex flex-wrap gap-3">
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

            <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-3 border-t border-white/10 pt-7">
              {trustBadges.map((badge) => (
                <li
                  key={badge.label}
                  className="text-navy-200 inline-flex items-center gap-2 font-sans text-[0.8125rem] font-medium"
                >
                  <badge.icon
                    size={15}
                    className="text-gold-400 shrink-0"
                    aria-hidden
                  />
                  {badge.label}
                </li>
              ))}
            </ul>

            <a
              href={social.fiverrProfile}
              target="_blank"
              rel="noopener noreferrer"
              className="text-navy-300 inline-flex w-fit items-center gap-2 font-sans text-sm underline-offset-4 transition-colors duration-200 hover:text-white hover:underline"
            >
              Every review on this site is verifiable on our public profile
            </a>
          </Reveal>

          <Reveal delay={0.14} className="lg:pl-4">
            <HeroVisual />
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
