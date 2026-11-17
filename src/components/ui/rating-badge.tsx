import { ExternalLink, Star } from "lucide-react";

import type { PlatformRating } from "@/lib/content/site";
import { cn } from "@/lib/utils";

const checkedLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

/**
 * Aggregate marketplace rating, linked to the profile it was read from and
 * dated, so a stale figure is visible rather than silently wrong. Renders
 * nothing until the owner supplies a figure, and prints the real score: a
 * 4.8 is never rounded up to "5-star".
 */
export function RatingBadge({
  platform,
  rating,
  tone = "light",
  className,
}: {
  platform: string;
  rating: PlatformRating;
  tone?: "light" | "dark";
  className?: string;
}) {
  if (rating.score === null || rating.count === null) return null;

  const dark = tone === "dark";

  return (
    <a
      href={rating.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex flex-wrap items-center gap-x-3 gap-y-1 font-sans text-sm",
        dark ? "text-ink-50" : "text-ink-700",
        className,
      )}
    >
      <span className="text-gold-500 inline-flex gap-0.5" aria-hidden>
        {Array.from({ length: 5 }, (_, i) => (
          <Star key={i} size={18} className="fill-current" />
        ))}
      </span>
      <span className={cn("font-display text-2xl leading-none", dark ? "text-white" : "text-navy-800")}>
        {rating.score.toFixed(1)} / 5
      </span>
      <span>
        from <b className="font-semibold">{rating.count} reviews</b> on {platform}
        {rating.checkedOn ? (
          <span className={cn("text-xs", dark ? "text-ink-50/70" : "text-ink-500")}>
            {" "}· checked {checkedLabel(rating.checkedOn)} · view source
            <ExternalLink size={12} className="ml-1 inline" aria-hidden />
          </span>
        ) : null}
      </span>
    </a>
  );
}
