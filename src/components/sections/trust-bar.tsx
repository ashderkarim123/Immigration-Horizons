import { CheckCircle2 } from "lucide-react";

import { Container } from "@/components/ui/container";
import { RatingBadge } from "@/components/ui/rating-badge";
import { proofFacts } from "@/lib/content/home";
import { ratings } from "@/lib/content/site";

/**
 * Sage proof strip under the hero: the real marketplace rating, linked and
 * dated, beside three facts. A platform without a figure renders nothing.
 */
export function TrustBar() {
  return (
    <section aria-label="Verified reviews" className="border-navy-800/14 bg-ink-100 border-y">
      <Container width="wide" className="flex flex-wrap items-center gap-x-10 gap-y-4 py-5">
        {Object.entries(ratings).map(([platform, rating]) => (
          <RatingBadge key={platform} platform={platform} rating={rating} />
        ))}
        <ul className="text-ink-600 flex flex-wrap gap-x-7 gap-y-2 font-sans text-sm sm:ml-auto">
          {proofFacts.map((fact) => (
            <li key={fact} className="inline-flex items-center gap-2">
              <CheckCircle2 size={16} className="text-navy-800 shrink-0" aria-hidden />
              {fact}
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
