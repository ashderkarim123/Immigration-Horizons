import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { CtaBanner } from "@/components/sections/cta-banner";
import { Breadcrumbs } from "@/components/service/breadcrumbs";
import { JsonLd, breadcrumbSchema, faqSchema } from "@/components/seo/json-ld";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/section";
import { homepageFaqs, type Faq } from "@/lib/content/faqs";
import { eb2NiwFaqs } from "@/lib/content/eb2-niw";
import { getServicePage } from "@/lib/content/service-pages";

export const metadata: Metadata = {
  title: "Frequently Asked Questions",
  description:
    "Answers on EB-2 NIW, EB-1A, EB-1B, EB-1C and O-1 eligibility, evidence, RFE support, scope, and what an immigration consulting practice can and cannot do.",
  alternates: { canonical: "/faqs" },
  openGraph: {
    type: "website",
    title: "Frequently Asked Questions | Immigration Horizons",
    description:
      "Straight answers on employment-based immigration eligibility, evidence, and process.",
    url: "/faqs",
  },
};

const trail = [
  { name: "Home", path: "/" },
  { name: "FAQs", path: "/faqs" },
];

/** Grouped so a visitor can jump to the topic they care about. */
const groups: { id: string; title: string; link?: string; faqs: Faq[] }[] = [
  { id: "general", title: "General & scope", faqs: homepageFaqs.slice(6) },
  {
    id: "eb2-niw",
    title: "EB-2 NIW",
    link: "/services/eb2-niw",
    faqs: eb2NiwFaqs.slice(0, 6),
  },
  {
    id: "eb1a",
    title: "EB-1A",
    link: "/services/eb1a",
    faqs: getServicePage("eb1a")!.faqs.slice(0, 4),
  },
  {
    id: "eb1b",
    title: "EB-1B",
    link: "/services/eb1b",
    faqs: getServicePage("eb1b")!.faqs.slice(0, 4),
  },
  {
    id: "eb1c",
    title: "EB-1C",
    link: "/services/eb1c",
    faqs: getServicePage("eb1c")!.faqs.slice(0, 4),
  },
  {
    id: "o1",
    title: "O-1 Visa",
    link: "/services/o1-visa",
    faqs: getServicePage("o1-visa")!.faqs.slice(0, 4),
  },
  {
    id: "rfe",
    title: "RFE & NOID support",
    link: "/services/rfe-response",
    faqs: getServicePage("rfe-response")!.faqs.slice(0, 4),
  },
];

const allFaqs = groups.flatMap((group) => group.faqs);

export default function FaqsPage() {
  return (
    <>
      <JsonLd data={[breadcrumbSchema(trail), faqSchema(allFaqs)]} />

      <section className="bg-navy-900 relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(201,153,46,0.15),transparent_58%)]"
        />
        <Container width="wide" className="relative py-16 sm:py-20">
          <Breadcrumbs trail={trail} tone="dark" className="mb-8" />
          <div className="max-w-3xl">
            <Eyebrow className="text-gold-300">FAQs</Eyebrow>
            <h1 className="text-display-lg sm:text-display-xl mt-4 font-semibold text-white">
              Frequently asked questions
            </h1>
            <p className="text-lead text-navy-200 mt-5 text-pretty">
              Straight answers on eligibility, evidence, scope, and what we can
              and cannot do. For depth on any category, follow the link at the
              top of each section.
            </p>
          </div>

          <nav aria-label="FAQ topics" className="mt-10">
            <ul className="flex flex-wrap gap-2.5">
              {groups.map((group) => (
                <li key={group.id}>
                  <a
                    href={`#${group.id}`}
                    className="inline-flex rounded-full border border-white/20 px-4 py-1.5 font-sans text-xs font-semibold text-white transition-colors duration-200 hover:border-white/50 hover:bg-white/10"
                  >
                    {group.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </Container>
      </section>

      <Container width="default" className="py-16 sm:py-20">
        <div className="flex flex-col gap-14">
          {groups.map((group) => (
            <section key={group.id} id={group.id} className="scroll-mt-28">
              <div className="mb-6 flex items-baseline justify-between gap-4">
                <h2 className="font-display text-navy-800 text-2xl font-semibold">
                  {group.title}
                </h2>
                {group.link ? (
                  <Link
                    href={group.link}
                    className="text-navy-700 hover:text-navy-900 shrink-0 font-sans text-sm font-semibold underline-offset-4 hover:underline"
                  >
                    Full guide →
                  </Link>
                ) : null}
              </div>

              <dl className="flex flex-col gap-3">
                {group.faqs.map((faq) => (
                  <div
                    key={faq.question}
                    className="rounded-card border-ink-200 overflow-hidden border bg-white"
                  >
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 p-6 [&::-webkit-details-marker]:hidden">
                        <dt className="font-display text-navy-800 text-lg font-semibold text-pretty">
                          {faq.question}
                        </dt>
                        <Plus
                          size={20}
                          aria-hidden
                          className="text-navy-500 mt-0.5 shrink-0 transition-transform duration-200 ease-(--ease-out-soft) group-open:rotate-45"
                        />
                      </summary>
                      <dd className="text-ink-600 px-6 pb-6 text-[0.9375rem] leading-relaxed text-pretty">
                        {faq.answer}
                      </dd>
                    </details>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </Container>

      <CtaBanner
        title="Still have a question about your case?"
        body="Book a free consultation and ask us directly. We'll give you a straight answer about your specific situation."
        ctaLabel="Book your free consultation"
      />
    </>
  );
}
