import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Card } from "@/components/ui/card";
import { FeatureIcon } from "@/components/ui/feature-icon";
import { RevealGroup, RevealItem } from "@/components/ui/reveal";
import { Section, SectionHeading } from "@/components/ui/section";
import { audienceSection, audiences } from "@/lib/content/home";

/**
 * Four core audiences. The cards become links to `/for/<slug>` in Phase 5;
 * until those pages exist they carry no href, so nothing here can 404.
 */
export function AudienceRouter() {
  return (
    <Section tone="ivory">
      <SectionHeading
        align="left"
        eyebrow={audienceSection.eyebrow}
        title={audienceSection.heading}
        description={audienceSection.lead}
      />

      <RevealGroup className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {audiences.map((audience) => (
          <RevealItem key={audience.slug}>
            <Card className="flex h-full flex-col gap-4">
              <FeatureIcon name={audience.icon} />
              <h3 className="text-xl">{audience.title}</h3>
              <p className="text-ink-600 text-[0.9375rem] leading-relaxed text-pretty">
                {audience.body}
              </p>
            </Card>
          </RevealItem>
        ))}
      </RevealGroup>

      <p className="text-ink-600 mt-8 font-sans text-sm">
        <Link
          href="#other-visas"
          className="text-navy-800 inline-flex items-center gap-1.5 font-semibold underline-offset-4 hover:underline"
        >
          {audienceSection.otherVisas} <ArrowRight size={15} aria-hidden />
        </Link>
      </p>
    </Section>
  );
}
