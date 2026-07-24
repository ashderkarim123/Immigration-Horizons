import type { Metadata } from "next";

import { LegalPage } from "@/components/legal-page";
import { JsonLd, breadcrumbSchema } from "@/components/seo/json-ld";
import { legalUpdated, privacyContent } from "@/lib/content/legal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Immigration Horizons collects, uses, and protects the information you share through the website, consultation form, and contact form.",
  alternates: { canonical: "/privacy" },
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Privacy Policy", path: "/privacy" },
        ])}
      />
      <LegalPage
        title="Privacy Policy"
        intro="How we collect, use, and protect the information you share with us through this website."
        updated={legalUpdated}
        blocks={privacyContent}
        crumbName="Privacy Policy"
        crumbPath="/privacy"
      />
    </>
  );
}
