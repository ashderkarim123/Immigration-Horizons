import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CtaBanner } from "@/components/sections/cta-banner";
import { Faqs } from "@/components/sections/faqs";
import { ServiceReviews } from "@/components/sections/service-reviews";
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
import { JsonLd, breadcrumbSchema, faqSchema } from "@/components/seo/json-ld";
import { articleOpenGraph } from "@/lib/seo/og";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import {
  getServicePage,
  servicePageSlugs,
  type ServicePageContent,
} from "@/lib/content/service-pages";
import type { PageSection } from "@/lib/content/service-pages/types";
import { publishedServices } from "@/lib/content/published-services";
import { site } from "@/lib/content/site";

type RouteProps = { params: Promise<{ slug: string }> };

/** Prerender every registered service page at build time. */
export function generateStaticParams() {
  return servicePageSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: RouteProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getServicePage(slug);

  if (!page) return {};

  return {
    title: { absolute: page.metaTitle },
    description: page.metaDescription,
    keywords: page.keywords,
    alternates: { canonical: `/services/${page.slug}` },
    openGraph: {
      ...articleOpenGraph,
      title: page.metaTitle,
      description: page.metaDescription,
      url: `/services/${page.slug}`,
    },
  };
}

/** Renders one content section. Section kinds map to layout, not to styling. */
function RenderSection({ section }: { section: PageSection }) {
  if (section.kind === "cta") {
    return (
      <InlineCta
        title={section.title}
        body={section.body}
        ctaLabel={section.ctaLabel}
      />
    );
  }

  return (
    <ContentSection
      id={section.id}
      eyebrow={section.eyebrow}
      heading={section.heading}
    >
      {section.kind === "prose" ? (
        <Prose paragraphs={section.paragraphs} />
      ) : null}

      {section.kind === "list" || section.kind === "criteria" ? (
        <>
          {section.intro ? <Prose paragraphs={section.intro} /> : null}
          <DefinitionList
            items={section.items}
            numbered={section.kind === "criteria" || section.numbered}
            className={section.intro ? "mt-8" : undefined}
          />
        </>
      ) : null}

      {section.kind === "subsections" ? (
        <>
          {section.intro ? <Prose paragraphs={section.intro} /> : null}
          <div
            className={`flex flex-col gap-10 ${section.intro ? "mt-10" : ""}`}
          >
            {section.subsections.map((sub) => (
              <SubSection
                key={sub.heading}
                heading={sub.heading}
                paragraphs={sub.paragraphs}
              />
            ))}
          </div>
        </>
      ) : null}

      {section.callout ? (
        <div className="mt-8">
          <Callout title={section.callout.title}>{section.callout.body}</Callout>
        </div>
      ) : null}

      {section.links?.length ? (
        <div className="mt-8 flex flex-wrap gap-3">
          {section.links.map((link) => (
            <Button key={link.href} href={link.href} variant="outline" size="sm">
              {link.label}
            </Button>
          ))}
        </div>
      ) : null}
    </ContentSection>
  );
}

export default async function ServiceDetailPage({ params }: RouteProps) {
  const { slug } = await params;
  const page = getServicePage(slug);

  if (!page) notFound();

  return <ServicePage page={page} />;
}

function ServicePage({ page }: { page: ServicePageContent }) {
  const tier = publishedServices.find((s) => s.slug === page.slug)?.tier ?? "core";
  const hasPackage = page.sections.some((s) => s.kind !== "cta" && s.id === "package");
  const trail = [
    { name: "Home", path: "/" },
    { name: "Services", path: "/services" },
    { name: page.name, path: `/services/${page.slug}` },
  ];

  return (
    <>
      <JsonLd data={[breadcrumbSchema(trail), faqSchema(page.faqs)]} />

      <ServiceHero
        eyebrow={page.eyebrow}
        headline={page.headline}
        subhead={page.subhead}
        definition={page.definition}
        trail={trail}
        keyFacts={page.keyFacts}
        badgeTone={tier === "secondary" ? "neutral" : hasPackage ? "navy" : "gold"}
        secondaryCta={hasPackage ? { label: "What's in the package", href: "#package" } : undefined}
      />

      <Section space="compact">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-16">
          <article className="flex max-w-3xl flex-col gap-16">
            {page.sections.map((section) => (
              <RenderSection
                key={section.kind === "cta" ? section.title : section.id}
                section={section}
              />
            ))}

            <OfficialSources sources={page.sources} />
          </article>

          <aside className="order-first lg:order-last">
            <div className="flex flex-col gap-6 lg:sticky lg:top-27">
              <TableOfContents items={page.toc} />

              <div className="rounded-card bg-ink-100 hidden flex-col gap-3 p-6 lg:flex">
                <p className="font-display text-navy-800 text-lg">
                  Free {page.name} assessment
                </p>
                <p className="text-ink-600 text-[0.8125rem] leading-relaxed">
                  Tell us about your background and we will tell you honestly
                  whether your profile supports this route today.
                </p>
                <Button href="/consultation" variant="primary" size="sm" block>
                  Book a consultation
                </Button>
              </div>
            </div>
          </aside>
        </div>
      </Section>

      <ServiceReviews slug={page.slug} name={page.name} />

      <Faqs
        id="faqs"
        faqs={page.faqs}
        eyebrow={`${page.name} questions`}
        title={page.faqTitle}
        description={page.faqDescription}
      />

      <RelatedServices exclude={page.slug} />

      <Container width="wide" className="pb-4">
        <p className="text-ink-600 border-navy-800/14 border-t pt-8 text-xs leading-relaxed">
          {page.scopeNote} {site.disclaimer}
        </p>
      </Container>

      <CtaBanner
        title="Ready to find out where you stand?"
        body="Book a free consultation. We will assess your record against the requirements for this category and tell you honestly whether it is the right route for you."
        ctaLabel="Book your free consultation"
      />
    </>
  );
}
