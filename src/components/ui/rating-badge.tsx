import { ExternalLink, Star } from "lucide-react";

import type { PlatformRating } from "@/lib/content/site";

/**
 * Aggregate marketplace rating, linked to the profile it was read from.
 * Renders nothing until the owner supplies a figure, and never rounds a
 * 4.8 up to "5-star": the number shown must match what the visitor sees.
 */
export function RatingBadge({
  platform,
  rating,
  tone = "light",
}: {
  platform: string;
  rating: PlatformRating;
  tone?: "light" | "dark";
}) {
  if (rating.score === null || rating.count === null) return null;

  const dark = tone === "dark";

  return (
    <a
      href={rating.url}
      target="_blank"
      rel="noopener noreferrer"
      className={
        dark
          ? "inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 font-sans text-sm text-white hover:bg-white/10"
          : "border-ink-200 text-navy-800 hover:border-navy-200 inline-flex items-center gap-2 rounded-full border bg-white px-4 py-2 font-sans text-sm"
      }
    >
      <Star size={15} className="fill-gold-500 text-gold-500" aria-hidden />
      <span className="font-semibold">{rating.score.toFixed(1)} / 5</span>
      <span className={dark ? "text-navy-200" : "text-ink-500"}>
        {rating.count} reviews on {platform}
      </span>
      <ExternalLink size={13} aria-hidden />
    </a>
  );
}
