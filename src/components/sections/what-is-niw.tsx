import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Reveal, RevealGroup, RevealItem } from "@/components/ui/reveal";
import { Section, SectionHeading } from "@/components/ui/section";
import { SnippetAnswer } from "@/components/ui/snippet-answer";

/**
 * Educational overview of the practice's primary search term. The three
 * prongs below are the framework USCIS applies under Matter of Dhanasar,
 * 26 I&N Dec. 884 (AAO 2016) — stated as the test, not as advice about any
 * individual case.
 */
const dhanasarProngs = [
  {
    number: "1",
    label: "Prong one",
    title: "Substantial merit and national importance",
    body: "The proposed endeavor itself must have substantial merit — which can be in business, entrepreneurship, science, technology, culture, health, or education — and its potential impact must extend beyond a single employer or locality.",
  },
  {
    number: "2",
    label: "Prong two",
    title: "Well positioned to advance it",
    body: "Your education, skills, record of success, and any progress already made must show that you specifically are well positioned to move that endeavor forward. Note that this does not require proof that you will ultimately succeed.",
  },
  {
    number: "3",
    label: "Prong three",
    title: "Beneficial to waive the requirement",
    body: "On balance, it must benefit the United States to waive the job offer and labor certification requirements — for example, where the endeavor's urgency or your self-directed nature makes the standard route impractical.",
  },
];

export function WhatIsNiw() {
  return (
    <Section tone="tint">
      <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <Reveal>
          <SectionHeading
            align="left"
            eyebrow="Education"
            title="What is the EB-2 NIW?"
          />

          {/* Standalone 55-word definition, positioned directly under the
              question heading so it can be lifted as a featured snippet. */}
          <SnippetAnswer className="mt-6">
            The EB-2 National Interest Waiver (NIW) is a U.S. employment-based
            immigration route that allows a qualified applicant to request that
            USCIS waive the standard job offer and labor certification
            requirements. Because those requirements can be waived, an EB-2 NIW
            is a self-petition — no employer sponsorship is required to file.
          </SnippetAnswer>

          <div className="text-ink-600 mt-8 flex flex-col gap-4 text-[0.9375rem] leading-relaxed text-pretty">
            <p>
              To qualify you must first meet the underlying EB-2 requirement:
              either an advanced degree, or a bachelor&apos;s degree plus five
              years of progressive post-baccalaureate experience, or a
              demonstration of exceptional ability in the sciences, arts, or
              business.
            </p>
            <p>
              Meeting that threshold is the entry ticket, not the case. The
              petition is decided on the three-prong framework USCIS applies
              under <em>Matter of Dhanasar</em> — and the difference between a
              strong filing and a weak one is almost always how well the
              evidence is mapped to those three prongs.
            </p>
          </div>

          <Button href="/services/eb2-niw" variant="primary" className="mt-9">
            Read the full EB-2 NIW guide
            <ArrowRight size={16} aria-hidden />
          </Button>
        </Reveal>

        <RevealGroup className="flex flex-col gap-4">
          {dhanasarProngs.map((prong) => (
            <RevealItem key={prong.label}>
              <div className="rounded-card border-ink-200 flex gap-5 border bg-white p-6">
                <span
                  aria-hidden
                  className="bg-navy-800 font-display inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                >
                  {prong.number}
                </span>
                <div className="flex flex-col gap-2">
                  <span className="text-gold-700 font-sans text-[0.6875rem] font-bold tracking-[0.14em] uppercase">
                    {prong.label}
                  </span>
                  <h3 className="font-display text-navy-800 text-lg font-semibold">
                    {prong.title}
                  </h3>
                  <p className="text-ink-600 text-[0.9375rem] leading-relaxed text-pretty">
                    {prong.body}
                  </p>
                </div>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </Section>
  );
}
