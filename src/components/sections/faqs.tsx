import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { Section, SectionHeading } from "@/components/ui/section";
import type { Faq } from "@/lib/content/faqs";

const onwardLinks = [
  { label: "Immigration blog", href: "/blog" },
  { label: "Resources", href: "/resources" },
  { label: "Client reviews", href: "/reviews" },
  { label: "About us", href: "/about" },
  { label: "All services", href: "/services" },
];

/**
 * Native <details>/<summary> accordion — keyboard accessible, screen-reader
 * correct, findable by in-page search, and works with JavaScript disabled.
 * No client component and no JS payload.
 */
export function Faqs({
  faqs,
  eyebrow = "Questions",
  title = "Frequently asked questions",
  description = "Straight answers on eligibility, scope, and what we can and cannot do. If yours is not here, ask us directly.",
}: {
  faqs: Faq[];
  eyebrow?: string;
  title?: string;
  description?: string;
}) {
  return (
    <Section tone="tint">
      <SectionHeading eyebrow={eyebrow} title={title} description={description} />

      <div className="mx-auto mt-14 max-w-3xl">
        <Reveal>
          <dl className="flex flex-col gap-3">
            {faqs.map((faq) => (
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
        </Reveal>

        <div className="mt-10 text-center">
          <p className="text-ink-600 mb-5 text-[0.9375rem]">
            Still have a question about your own case?
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button href="/consultation" variant="primary">
              Talk to an immigration specialist
            </Button>
            <Button href="/contact" variant="outline">
              Contact us
            </Button>
          </div>
        </div>

        {/* Onward links. Each passes authority to a page that would otherwise
            only be reachable from the header and footer. */}
        <nav
          aria-label="Continue exploring"
          className="border-ink-200 mt-12 border-t pt-8"
        >
          <p className="text-ink-500 mb-4 text-center font-sans text-xs font-bold tracking-[0.14em] uppercase">
            Continue exploring
          </p>
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
      </div>
    </Section>
  );
}
