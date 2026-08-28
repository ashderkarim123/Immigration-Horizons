import type { Metadata } from "next";

import { LegalPage } from "@/components/legal-page";
import { JsonLd, breadcrumbSchema } from "@/components/seo/json-ld";
import { legalUpdated, termsContent } from "@/lib/content/legal";

export const metadata: Metadata = {
  title: "Terms of Use",
  description:
    "The terms governing use of the Immigration Horizons website, including our scope as an immigration consulting and paralegal services practice — not a law firm.",
  alternates: { canonical: "/terms" },
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Terms of Use", path: "/terms" },
        ])}
      />
      <LegalPage
        title="Terms of Use"
        intro="The terms that govern your use of this website and our services."
        updated={legalUpdated}
        blocks={termsContent}
        crumbName="Terms of Use"
        crumbPath="/terms"
      />
    </>
  );
}
