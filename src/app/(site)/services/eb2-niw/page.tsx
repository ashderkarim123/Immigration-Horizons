import type { Metadata } from "next";

import { CtaBanner } from "@/components/sections/cta-banner";
import { Faqs } from "@/components/sections/faqs";
import { InlineCta } from "@/components/service/inline-cta";
import { OfficialSources } from "@/components/service/official-sources";
import {
  Callout,
  ContentSection,
  DefinitionList,
  Prose,
  SubSection,
} from "@/components/service/prose";
import { RelatedServices } from "@/components/service/related-services";
import { ServiceHero } from "@/components/service/service-hero";
import { TableOfContents } from "@/components/service/table-of-contents";
import {
  JsonLd,
  breadcrumbSchema,
  faqSchema,
} from "@/components/seo/json-ld";
import { articleOpenGraph } from "@/lib/seo/og";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import {
  advancedDegreeRoute,
  benefits,
  commonMistakes,
  dhanasarIntro,
  dhanasarProngs,
  eb2NiwFaqs,
  eb2NiwMeta,
  evidenceStrategy,
  exceptionalAbilityCriteria,
  exceptionalAbilityRoute,
  keyFacts,
  officialSources,
  processStages,
  requiredDocuments,
  tableOfContents,
  whatItIs,
} from "@/lib/content/eb2-niw";
import { findCaseCategory } from "@/lib/content/services";
import { site } from "@/lib/content/site";

export const metadata: Metadata = {
  title: { absolute: eb2NiwMeta.metaTitle },
  description: eb2NiwMeta.metaDescription,
  keywords: [
    "EB2 NIW",
    "EB-2 NIW",
    "National Interest Waiver",
    "EB2 National Interest Waiver",
    "EB2 NIW requirements",
    "EB2 NIW eligibility",
    "EB2 NIW petition",
    "EB2 NIW evidence",
    "Matter of Dhanasar",
    "US immigration consultant",
  ],
  alternates: { canonical: "/services/eb2-niw" },
  openGraph: {
    ...articleOpenGraph,
    title: eb2NiwMeta.metaTitle,
    description: eb2NiwMeta.metaDescription,
    url: "/services/eb2-niw",
  },
};

const trail = [
  { name: "Home", path: "/" },
  { name: "Services", path: "/services" },
  { name: "EB-2 NIW", path: "/services/eb2-niw" },
];

export default function Eb2NiwPage() {
  const service = findCaseCategory("eb2-niw");

  return (
    <>
      <JsonLd data={[breadcrumbSchema(trail), faqSchema(eb2NiwFaqs)]} />

      <ServiceHero
        eyebrow="National Interest Waiver"
        headline={eb2NiwMeta.heroHeadline}
        subhead={eb2NiwMeta.heroSubhead}
        definition={eb2NiwMeta.definition}
        trail={trail}
        keyFacts={keyFacts}
        ctaLabel="Get a free EB-2 NIW assessment"
      />

      <Section space="compact">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-16">
          {/* Article column */}
          <article className="flex max-w-3xl flex-col gap-16">
            <ContentSection
              id="what-is-eb2-niw"
              eyebrow="The basics"
              heading="What is the EB-2 NIW?"
            >
              <Prose paragraphs={whatItIs} />
            </ContentSection>

            <ContentSection
              id="benefits"
              eyebrow="Why applicants choose it"
              heading="Benefits of the EB-2 National Interest Waiver"
            >
              <DefinitionList items={benefits} />
            </ContentSection>

            <ContentSection
              id="eligibility"
              eyebrow="Step one"
              heading="Eligibility: qualifying for EB-2 in the first place"
            >
              <Prose
                paragraphs={[
                  "EB-2 NIW eligibility is assessed in two stages, and conflating them is the most common source of confusion. First you must qualify for the EB-2 category itself. Only then does USCIS consider whether the national interest waiver should be granted.",
                  "There are two independent routes into EB-2. You need one of them, not both.",
                ]}
              />

              <div className="mt-10 flex flex-col gap-10">
                <SubSection
                  heading="Route one: advanced degree"
                  paragraphs={advancedDegreeRoute}
                />

                <SubSection
                  heading="Route two: exceptional ability"
                  paragraphs={exceptionalAbilityRoute}
                >
                  <DefinitionList
                    items={exceptionalAbilityCriteria}
                    className="mt-2"
                  />
                </SubSection>
              </div>

              <Callout title="Meeting the threshold is not the same as winning the case">
                Qualifying for EB-2 makes you eligible to be considered. The
                petition is then decided entirely on the three-prong Dhanasar
                analysis below. Strong credentials with a weakly argued endeavor
                is the most common profile we see in petitions that receive a
                Request for Evidence.
              </Callout>
            </ContentSection>

            <InlineCta
              title="Not sure which route you qualify under?"
              body="We assess your degree, experience, and record against both EB-2 routes and tell you which one your profile actually supports — before any drafting begins."
              ctaLabel="Book a free assessment"
            />

            <ContentSection
              id="dhanasar"
              eyebrow="Step two"
              heading="The Dhanasar three-prong test"
            >
              <Prose paragraphs={dhanasarIntro} />

              <div className="mt-10 flex flex-col gap-8">
                {dhanasarProngs.map((prong) => (
                  <div
                    key={prong.number}
                    className="rounded-card border-ink-200 border bg-white p-7"
                  >
                    <div className="flex items-start gap-4">
                      <span
                        aria-hidden
                        className="bg-navy-800 font-display inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-semibold text-white"
                      >
                        {prong.number}
                      </span>
                      <div className="flex flex-col gap-1">
                        <span className="text-gold-700 font-sans text-[0.6875rem] font-bold tracking-[0.14em] uppercase">
                          {prong.label}
                        </span>
                        <h3 className="font-display text-navy-800 text-xl font-semibold text-pretty">
                          {prong.title}
                        </h3>
                      </div>
                    </div>
                    <Prose paragraphs={prong.body} className="mt-5" />
                  </div>
                ))}
              </div>
            </ContentSection>

            <ContentSection
              id="documents"
              eyebrow="What a filing contains"
              heading="Required documents for an EB-2 NIW petition"
            >
              <Prose
                paragraphs={[
                  "There is no single official checklist, because what a petition needs depends on the endeavor and the record supporting it. In practice, a complete EB-2 NIW filing contains the following.",
                ]}
              />
              <DefinitionList items={requiredDocuments} className="mt-8" />
            </ContentSection>

            <ContentSection
              id="evidence"
              eyebrow="Where cases are won"
              heading="EB-2 NIW evidence strategy"
            >
              <Prose
                paragraphs={[
                  "Two applicants with near-identical records can receive different outcomes, and the difference is usually not the evidence itself but how it was selected, framed, and connected to the argument. What follows is how each evidence type is actually weighed.",
                ]}
              />

              <div className="mt-10 flex flex-col gap-10">
                {evidenceStrategy.map((item) => (
                  <SubSection
                    key={item.title}
                    heading={item.title}
                    paragraphs={item.body}
                  />
                ))}
              </div>

              <Callout title="One principle underneath all of it">
                Evidence must be connected to a prong. A document that sits in
                the exhibit set without the petition letter explaining which
                part of the test it supports is doing far less work than it
                could. Volume is not the objective; mapping is.
              </Callout>
            </ContentSection>

            <InlineCta
              title="Want your evidence reviewed before you file?"
              body="We map your existing record against all three prongs and tell you where the case is strong and where it needs reinforcement — including if our answer is that it is not ready yet."
              ctaLabel="Get your documents reviewed"
            />

            <ContentSection
              id="process"
              eyebrow="What happens"
              heading="The EB-2 NIW process, step by step"
            >
              <Prose
                paragraphs={[
                  "The stages below describe what happens and in what order. We do not publish processing-time estimates: USCIS timelines change continuously and vary by service centre and case type, so any figure printed here would be misleading by the time you read it. The official USCIS processing times tool is the authority, and we walk through what it means for your filing at the consultation.",
                ]}
              />
              <DefinitionList items={processStages} numbered className="mt-8" />
            </ContentSection>

            <ContentSection
              id="mistakes"
              eyebrow="What goes wrong"
              heading="Common EB-2 NIW mistakes"
            >
              <Prose
                paragraphs={[
                  "These are the recurring failure patterns we see, most often in petitions that arrive at our door after a Request for Evidence has already issued.",
                ]}
              />
              <DefinitionList items={commonMistakes} className="mt-8" />
            </ContentSection>

            <ContentSection
              id="how-we-help"
              eyebrow="Working with us"
              heading="How we prepare EB-2 NIW petitions"
            >
              <Prose
                paragraphs={[
                  "Immigration Horizons is an immigration consulting and paralegal services practice. We are not attorneys and do not provide legal representation or legal advice. What we do is prepare petitions: defining the endeavor, mapping evidence to the Dhanasar prongs, drafting every document from scratch, and organising exhibits so an adjudicator can follow the argument.",
                  "You can engage us for a full petition package or for a single deliverable. Many clients working with their own attorney use us for one piece of the case, and we regularly act as additional drafting capacity for immigration attorneys and paralegals under deadline.",
                ]}
              />

              {service ? (
                <div className="mt-8 grid gap-5 sm:grid-cols-2">
                  {service.engagementOptions.map((option) => (
                    <div
                      key={option.type}
                      className="rounded-card border-ink-200 flex flex-col gap-2 border bg-white p-6"
                    >
                      <h3 className="font-display text-navy-800 text-lg font-semibold">
                        {option.label}
                      </h3>
                      <p className="text-ink-600 text-[0.9375rem] leading-relaxed text-pretty">
                        {option.description}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="mt-8">
                <OfficialSources sources={officialSources} />
              </div>
            </ContentSection>
          </article>

          {/* Sidebar */}
          <aside className="order-first lg:order-last">
            <div className="flex flex-col gap-6 lg:sticky lg:top-28">
              <TableOfContents items={tableOfContents} />

              <div className="rounded-card bg-navy-900 hidden flex-col gap-3 p-6 lg:flex">
                <p className="font-display text-base font-semibold text-white">
                  Free EB-2 NIW assessment
                </p>
                <p className="text-navy-200 text-[0.8125rem] leading-relaxed">
                  Tell us about your background and we will tell you honestly
                  whether your profile supports an NIW filing today.
                </p>
                <Button href="/consultation" variant="gold" size="sm" block>
                  Book a consultation
                </Button>
              </div>
            </div>
          </aside>
        </div>
      </Section>

      <Faqs
        id="faqs"
        faqs={eb2NiwFaqs}
        eyebrow="EB-2 NIW questions"
        title="EB-2 NIW frequently asked questions"
        description="The questions we are asked most often about National Interest Waiver eligibility, evidence, and process."
      />

      <RelatedServices exclude="eb2-niw" />

      <Container width="wide" className="pb-4">
        <p className="text-ink-500 border-ink-200 border-t pt-8 text-xs leading-relaxed">
          This page is general educational information about the EB-2 National
          Interest Waiver category, not legal advice about any individual case.
          {" "}
          {site.disclaimer}
        </p>
      </Container>

      <CtaBanner
        title="Ready to find out if you qualify?"
        body="Book a free consultation. We will assess your record against all three Dhanasar prongs and tell you where your case genuinely stands."
        ctaLabel="Book your free consultation"
      />
    </>
  );
}
