import type { Faq } from "@/lib/content/faqs";
import { contact, site, social } from "@/lib/content/site";

/**
 * Renders a JSON-LD block. `<` is escaped so a stray closing tag inside any
 * content string can never break out of the script element.
 */
export function JsonLd({ data }: { data: object | object[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}

export const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  "@id": `${site.url}/#organization`,
  name: site.name,
  url: site.url,
  logo: `${site.url}/images/logo-header.png`,
  image: `${site.url}/images/logo-header.png`,
  slogan: site.tagline,
  description:
    "Immigration consulting and paralegal services practice preparing EB-2 NIW, EB-1A, EB-1B, EB-1C and O-1 petitions, RFE responses, recommendation letters and business plans. Not a law firm.",
  // Stated explicitly so the disclaimer travels with the structured data.
  disambiguatingDescription: site.disclaimer,
  email: contact.email,
  telephone: `+${contact.whatsappPrimary}`,
  areaServed: "Worldwide",
  sameAs: [social.fiverrProfile, social.upworkProfile],
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: contact.email,
      telephone: `+${contact.whatsappPrimary}`,
      availableLanguage: ["en"],
    },
  ],
};

export const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${site.url}/#website`,
  name: site.name,
  url: site.url,
  description: site.description,
  publisher: { "@id": `${site.url}/#organization` },
};

export function faqSchema(faqs: Faq[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}

export function breadcrumbSchema(trail: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: `${site.url}${crumb.path}`,
    })),
  };
}
