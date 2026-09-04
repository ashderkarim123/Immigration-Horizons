import type { Metadata } from "next";

import { CaseCategories } from "@/components/sections/case-categories";
import { CaseOutcomes } from "@/components/sections/case-outcomes";
import { CtaBanner } from "@/components/sections/cta-banner";
import { Differentiators } from "@/components/sections/differentiators";
import { Faqs } from "@/components/sections/faqs";
import { Hero } from "@/components/sections/hero";
import { Mission } from "@/components/sections/mission";
import { Process } from "@/components/sections/process";
import { SupportServices } from "@/components/sections/support-services";
import { Testimonials } from "@/components/sections/testimonials";
import { TrustBar } from "@/components/sections/trust-bar";
import { WhatIsNiw } from "@/components/sections/what-is-niw";
import { WhoCanApply } from "@/components/sections/who-can-apply";
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
    "EB-2 NIW petition preparation, USCIS RFE support, and employment-based US immigration consulting for professionals building stronger petitions.",
  alternates: { canonical: "/" },
  openGraph: {
    ...baseOpenGraph,
    title: "EB-2 NIW Petition Preparation | Immigration Horizons",
    description:
      "EB-2 NIW petition preparation, USCIS RFE support, and employment-based US immigration consulting.",
    url: "/",
  },
  // twitter:* falls back to the openGraph values above.
};

/**
 * Section order follows the journey in the content strategy: landing →
 * who we are → what we do → why us → education → who qualifies → process →
 * proof → questions → conversion. Background tones alternate so no two
 * adjacent sections read as a single block.
 *
 * Not yet present: the "Latest Articles" section. It depends on the blog
 * data layer, which is ported in Phase 6 — stubbing it now would mean
 * shipping fake posts.
 */
export default function HomePage() {
  return (
    <>
      <JsonLd
        data={[organizationSchema, websiteSchema, faqSchema(homepageFaqs)]}
      />

      {/* Tones run navy → white → tint → white → tint → white → navy → tint →
          navy → white → tint → white, so no two adjacent sections share a
          background and the page never reads as one slab. */}
      <Hero />
      <TrustBar />
      <Mission />
      <CaseCategories />
      <SupportServices />
      <WhatIsNiw />
      <WhoCanApply />
      <Process />
      <Differentiators />
      <CaseOutcomes />
      <Testimonials />
      <Faqs faqs={homepageFaqs} />
      <CtaBanner />
    </>
  );
}
