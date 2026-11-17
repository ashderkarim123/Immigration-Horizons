import type { Metadata } from "next";

import { AudienceRouter } from "@/components/sections/audience-router";
import { CaseOutcomes } from "@/components/sections/case-outcomes";
import { CoreServices } from "@/components/sections/core-services";
import { CtaBanner } from "@/components/sections/cta-banner";
import { Differentiators } from "@/components/sections/differentiators";
import { Faqs } from "@/components/sections/faqs";
import { Hero } from "@/components/sections/hero";
import { OtherVisasRow } from "@/components/sections/other-visas-row";
import { PackageIncludes } from "@/components/sections/package-includes";
import { Process } from "@/components/sections/process";
import { Testimonials } from "@/components/sections/testimonials";
import { TrustBar } from "@/components/sections/trust-bar";
import { WhatIsNiw } from "@/components/sections/what-is-niw";
import {
  JsonLd,
  faqSchema,
  organizationSchema,
  websiteSchema,
} from "@/components/seo/json-ld";
import { homepageFaqs } from "@/lib/content/faqs";
import { baseOpenGraph } from "@/lib/seo/og";

export const metadata: Metadata = {
  title: {
    absolute: "EB-2 NIW Petition Preparation | Immigration Horizons",
  },
  description:
    "EB-2 NIW and EB-1 petition preparation, RFE and NOID responses, recommendation letters and business plans. We prepare the package; you file it.",
  alternates: { canonical: "/" },
  openGraph: {
    ...baseOpenGraph,
    title: "EB-2 NIW Petition Preparation | Immigration Horizons",
    description:
      "EB-2 NIW and EB-1 petition preparation, RFE and NOID responses, recommendation letters and business plans.",
    url: "/",
  },
  // twitter:* falls back to the openGraph values above.
};

/**
 * Section order follows docs/revamp/03-homepage-and-components.md §2, with
 * verifiable client outcomes in the slot the founder section would take
 * (owner decision, 2026-11-17). Surfaces rotate so no two adjacent sections
 * share one: ivory → sage → white → forest → ivory → white → sage → ivory →
 * white → sage → ivory → white → forest.
 */
export default function HomePage() {
  return (
    <>
      <JsonLd
        data={[organizationSchema, websiteSchema, faqSchema(homepageFaqs)]}
      />

      <Hero />
      <TrustBar />
      <CoreServices />
      <PackageIncludes />
      <AudienceRouter />
      <WhatIsNiw />
      <CaseOutcomes />
      <Process />
      <Differentiators />
      <Testimonials />
      <OtherVisasRow />
      <Faqs faqs={homepageFaqs} tone="white" />
      <CtaBanner />
    </>
  );
}
