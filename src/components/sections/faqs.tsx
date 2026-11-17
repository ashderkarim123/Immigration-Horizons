import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Section, SectionHeading } from "@/components/ui/section";
import type { Faq } from "@/lib/content/faqs";

// The FAQ hub led this list by omission: the homepage showed a handful of
// questions and then pointed everywhere except the full set, leaving a
// 2,300-word page with a single inbound link from here.
const onwardLinks = [
  { label: "All immigration FAQs", href: "/faqs" },
  { label: "Immigration blog", href: "/blog" },
  { label: "Resources", href: "/resources" },
  { label: "Client reviews", href: "/reviews" },
  { label: "About us", href: "/about" },
  { label: "All services", href: "/services" },
];

/**
 * Native <details>/<summary> accordion — keyboard accessible, screen-reader
 * correct, findable by in-page search, and works with JavaScript disabled.
 * The first item is open. Visible answer text must equal the FAQPage schema
 * string, so the answer is rendered verbatim with no reflow.
 */
export function Faqs({
  faqs,
  eyebrow = "Questions",
  title = "Frequently asked questions",
  description = "Straight answers on eligibility, scope, and what we can and cannot do. If yours is not here, ask us directly.",
  tone = "tint",
  id,
}: {
  faqs: Faq[];
  eyebrow?: string;
  title?: string;
  description?: string;
  /** Set to "white" when the preceding section is already sage. */
  tone?: "tint" | "white";
  id?: string;
}) {
  return (
    <Section id={id} tone={tone}>
      <div className="grid gap-10 lg:grid-cols-[1fr_1.8fr] lg:gap-16">
        <div className="flex flex-col items-start gap-6">
          <SectionHeading align="left" eyebrow={eyebrow} title={title} description={description} />
          <Button href="/faqs" variant="outline">
            All FAQs
          </Button>
        </div>

        <dl className="border-navy-800/14 border-t">
          {faqs.map((faq, index) => (
            <details
              key={faq.question}
              open={index === 0}
              className="group border-navy-800/14 border-b"
            >
              <summary className="text-navy-800 flex cursor-pointer list-none items-center justify-between gap-6 py-5 font-sans text-[1.0625rem] leading-snug font-semibold [&::-webkit-details-marker]:hidden">
                <dt>{faq.question}</dt>
                <span aria-hidden className="font-display text-gold-500 shrink-0 text-2xl leading-none">
                  <span className="group-open:hidden">+</span>
                  <span className="hidden group-open:inline">–</span>
                </span>
              </summary>
              <dd className="text-ink-600 max-w-[66ch] pb-6 text-[0.9375rem] leading-relaxed">
                {faq.answer}
              </dd>
            </details>
          ))}
        </dl>
      </div>

      {/* Onward links. Each passes authority to a page that would otherwise
          only be reachable from the header and footer. */}
      <nav
        aria-label="Continue exploring"
        className="border-navy-800/14 mt-14 border-t pt-8"
      >
        <ul className="flex flex-wrap justify-center gap-x-6 gap-y-3">
          {onwardLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="text-navy-800 hover:text-gold-700 font-sans text-sm font-semibold underline-offset-4 transition-colors duration-200 hover:underline"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </Section>
  );
}
