import Image from "next/image";
import { FileCheck2, ShieldCheck } from "lucide-react";

/**
 * Human-led hero visual generated for this project and stored locally.
 * The image remains decorative because the adjacent copy carries the full
 * meaning; the overlaid cards reinforce the service without adding noise for
 * screen-reader users. Motion is CSS-only and suppressed by the global
 * reduced-motion rule.
 */
export function HeroVisual({ className }: { className?: string }) {
  return (
    <div
      className={`relative mx-auto w-full max-w-md ${className ?? ""}`}
      aria-hidden
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-[1.35rem] border border-white/10 bg-navy-900 shadow-lifted sm:aspect-[5/4]">
        <Image
          src="/images/immigration-consultation-hero-v1.png"
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 360px, (min-width: 640px) 320px, 240px"
          className="object-cover object-[68%_center]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-navy-950 via-navy-950/5 to-transparent" />

        <div className="absolute inset-x-3 bottom-3 flex items-center gap-3 rounded-xl border border-white/12 bg-navy-950/82 px-3.5 py-3 shadow-card backdrop-blur-md sm:inset-x-4 sm:bottom-4">
          <span className="bg-gold-400/15 text-gold-300 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
            <ShieldCheck size={17} />
          </span>
          <div>
            <p className="font-sans text-xs font-semibold text-white">
              Thoughtfully prepared
            </p>
            <p className="text-navy-300 mt-0.5 font-sans text-[0.625rem]">
              Strategy, evidence, and drafting in one process
            </p>
          </div>
        </div>
      </div>

      <div className="motion-safe:animate-(--animate-float-slow) absolute -top-3 -left-3 hidden sm:block">
        <div className="flex items-center gap-2.5 rounded-xl border border-white/15 bg-navy-800/90 px-3.5 py-2.5 shadow-lifted backdrop-blur-md">
          <FileCheck2 size={15} className="text-gold-400 shrink-0" />
          <div>
            <p className="font-sans text-xs font-semibold whitespace-nowrap text-white">
              Evidence organised
            </p>
            <p className="text-navy-300 font-sans text-[0.625rem] whitespace-nowrap">
              Clear, review-ready structure
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
