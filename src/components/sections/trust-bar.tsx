import Link from "next/link";

import { Container } from "@/components/ui/container";

/**
 * Keyword-rich capability strip directly beneath the hero. Each item is also
 * an internal link, so the bar does double duty: it tells a visitor what we
 * do in their own search language, and passes authority to the pages that
 * target those terms.
 */
const capabilities = [
  { label: "4.8/5 on Fiverr", href: "/reviews" },
  { label: "44 Fiverr reviews", href: "/reviews" },
  { label: "EB-2 NIW & EB-1 packages", href: "/services" },
  { label: "RFE response support", href: "/services/rfe-response" },
  { label: "NOID response support", href: "/services/noid-response" },
];

export function TrustBar() {
  return (
    <div className="border-ink-200 bg-ink-50 border-b">
      <Container width="wide">
        <ul className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 py-5 sm:gap-x-6">
          {capabilities.map((capability, index) => (
            <li key={capability.href} className="flex items-center gap-3 sm:gap-6">
              <Link
                href={capability.href}
                className="text-navy-800 hover:text-gold-700 font-sans text-[0.8125rem] font-semibold tracking-wide transition-colors duration-200"
              >
                {capability.label}
              </Link>
              {index < capabilities.length - 1 ? (
                <span
                  aria-hidden
                  className="bg-gold-500/50 hidden h-1 w-1 rounded-full sm:block"
                />
              ) : null}
            </li>
          ))}
        </ul>
      </Container>
    </div>
  );
}
