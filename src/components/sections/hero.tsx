import { ArrowRight, CheckCircle2, Globe2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";
import { contact, whatsappLink } from "@/lib/content/site";

import { HeroVisual } from "./hero-visual";

export function Hero() {
  return (
    <section className="bg-navy-950 relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(201,153,46,0.16),transparent_55%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
      />
      <div
        aria-hidden
        className="bg-gold-500/10 pointer-events-none absolute -top-48 right-[12%] h-96 w-96 rounded-full blur-3xl"
      />

      <Container
        width="wide"
        className="relative px-6 py-16 sm:px-10 sm:py-20 lg:px-12 lg:py-24"
      >
        <div className="grid min-w-0 items-center gap-14 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16">
          <Reveal className="flex min-w-0 flex-col gap-6">
            <Eyebrow className="text-gold-200 flex w-fit max-w-full items-center gap-2 rounded-full border border-gold-400/25 bg-gold-400/10 px-3 py-2 text-[0.62rem] tracking-[0.1em] sm:px-4 sm:text-xs sm:tracking-[0.14em]">
              <Globe2 size={14} aria-hidden />
              Employment-Based U.S. Immigration
            </Eyebrow>

            <h1 className="text-[2rem] leading-[1.12] font-semibold text-white sm:text-display-lg lg:text-display-xl">
              Your immigration case,
              <span className="text-gold-300 block">prepared with precision.</span>
            </h1>

            <p className="text-lead text-navy-200 max-w-xl text-pretty">
              Strategic EB-2 NIW, EB-1A, EB-1B, EB-1C and O-1 petition support
              for professionals and law firms worldwide — from case strategy
              and original drafting to evidence organisation and RFE responses.
            </p>

            <div className="flex flex-wrap gap-3">
              <Button href="/consultation" variant="gold" size="lg">
                Book a free consultation <ArrowRight size={17} aria-hidden />
              </Button>
              <Button
                href={whatsappLink(contact.whatsappPrimary)}
                variant="inverse"
                size="lg"
              >
                Chat on WhatsApp
              </Button>
            </div>

            <ul className="text-navy-200 grid max-w-2xl gap-3 border-t border-white/10 pt-6 text-sm sm:grid-cols-3">
              <li className="flex items-center gap-2.5">
                <CheckCircle2 size={17} className="text-gold-400 shrink-0" aria-hidden />
                Original drafting
              </li>
              <li className="flex items-center gap-2.5">
                <ShieldCheck size={17} className="text-gold-400 shrink-0" aria-hidden />
                Confidential handling
              </li>
              <li className="flex items-center gap-2.5">
                <Globe2 size={17} className="text-gold-400 shrink-0" aria-hidden />
                Worldwide service
              </li>
            </ul>
          </Reveal>

          <Reveal delay={0.14} className="flex justify-center lg:justify-end">
            <div className="relative min-w-0 w-full max-w-md rounded-[2rem] border border-white/12 bg-white/[0.055] p-6 shadow-[0_40px_90px_rgba(0,0,0,0.28)] backdrop-blur-sm sm:p-8">
              <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <p className="text-gold-300 text-[0.65rem] font-bold tracking-[0.16em] uppercase">
                    Preparation workspace
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white">Every detail, connected</p>
                </div>
                <span
                  className="bg-gold-400 h-2.5 w-2.5 rounded-full shadow-[0_0_0_5px_rgba(214,172,70,0.12)]"
                  aria-hidden
                />
              </div>
              <HeroVisual className="max-w-[15rem] sm:max-w-xs lg:max-w-sm" />
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
