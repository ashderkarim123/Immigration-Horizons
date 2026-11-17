import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Eyebrow, Section } from "@/components/ui/section";
import { packageIncludes, packageSection } from "@/lib/content/home";

/** Deep-forest module: what a full package contains, as a numbered list. */
export function PackageIncludes() {
  return (
    <Section tone="navy" id="package">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
        <div className="flex flex-col items-start gap-5">
          <Eyebrow className="text-gold-200">{packageSection.eyebrow}</Eyebrow>
          <h2 className="text-display-md">{packageSection.heading}</h2>
          <p className="text-lead text-pretty">{packageSection.lead}</p>
          <Button href={packageSection.cta.href} variant="onDark" className="mt-2">
            {packageSection.cta.label}
          </Button>
          <Link
            href={packageSection.compare.href}
            className="inline-flex items-center gap-1.5 font-sans text-sm font-semibold text-white underline-offset-4 hover:underline"
          >
            {packageSection.compare.label} <ArrowRight size={16} aria-hidden />
          </Link>
        </div>

        <dl className="grid gap-x-12 md:grid-cols-2">
          {packageIncludes.map((item, index) => (
            <div
              key={item.title}
              className="grid grid-cols-[2.5rem_1fr] gap-4 border-t border-white/14 py-5"
            >
              <span aria-hidden className="font-display text-gold-500 text-xl leading-snug">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <dt className="font-display text-xl text-white">{item.title}</dt>
                <dd className="text-ink-50/80 mt-1 text-[0.9375rem] leading-relaxed">{item.body}</dd>
              </div>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  );
}
