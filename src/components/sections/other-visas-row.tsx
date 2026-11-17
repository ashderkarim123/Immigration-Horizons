import Link from "next/link";

import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/section";
import { otherVisasSection } from "@/lib/content/home";
import { publishedOtherVisas } from "@/lib/content/published-services";

/**
 * Compact secondary-tier row. Visually quieter than the core grid: H3, not
 * H2 (the section is subordinate to the page outline), chips, not cards.
 * Only slugs with a page are listed, via the publication gate.
 */
export function OtherVisasRow() {
  if (publishedOtherVisas.length === 0) return null;

  return (
    <section id="other-visas" className="bg-ink-50 py-14 sm:py-16">
      <Container width="wide" className="flex flex-col gap-5">
        <Eyebrow className="text-ink-500">{otherVisasSection.eyebrow}</Eyebrow>
        <h3 className="text-display-sm">{otherVisasSection.heading}</h3>
        <p className="text-ink-600 max-w-2xl text-pretty">{otherVisasSection.lead}</p>
        <ul className="flex flex-wrap gap-2.5">
          {publishedOtherVisas.map((visa) => (
            <li key={visa.slug}>
              <Link
                href={`/services/${visa.slug}`}
                className="border-navy-800/28 text-navy-800 hover:border-navy-800 hover:bg-navy-50 inline-flex items-center gap-2 rounded-full border bg-white px-4 py-2.5 font-sans text-[0.9375rem] font-medium transition-colors duration-200"
              >
                {visa.name}
                <span className="text-ink-600 font-normal">{visa.tagline}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
