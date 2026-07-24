import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * A place a real photograph will go.
 *
 * Until a real asset is supplied, this renders a tasteful, on-brand branded
 * placeholder — never a fake stock person. When `src` is provided it renders
 * an optimised, lazy-loaded, responsive next/image with the alt text already
 * in place. Dropping a WebP into /public and passing its path is the only
 * change needed to go live.
 *
 * `alt` is required precisely because these slots must never ship without it.
 */
export function PhotoSlot({
  src,
  alt,
  label,
  aspect = "landscape",
  priority = false,
  className,
}: {
  src?: string;
  alt: string;
  /** Shown on the placeholder only, to indicate what belongs here. */
  label?: string;
  aspect?: "landscape" | "portrait" | "square";
  priority?: boolean;
  className?: string;
}) {
  const ratio = {
    landscape: "aspect-[4/3]",
    portrait: "aspect-[3/4]",
    square: "aspect-square",
  }[aspect];

  if (src) {
    return (
      <div
        className={cn(
          "rounded-panel bg-ink-100 relative overflow-hidden",
          ratio,
          className,
        )}
      >
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-cover"
          priority={priority}
          loading={priority ? undefined : "lazy"}
        />
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label={alt}
      className={cn(
        "rounded-panel border-navy-200/60 bg-navy-50 relative flex items-center justify-center overflow-hidden border",
        ratio,
        className,
      )}
    >
      {/* Subtle brand motif so the empty slot still reads as premium. */}
      <svg
        aria-hidden
        viewBox="0 0 200 150"
        className="absolute inset-0 h-full w-full opacity-[0.5]"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern
            id="ps-grid"
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M20 0H0V20"
              fill="none"
              stroke="#c6d5e9"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width="200" height="150" fill="url(#ps-grid)" />
      </svg>
      <div className="relative flex flex-col items-center gap-2 px-4 text-center">
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="text-navy-300 h-8 w-8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>
        {label ? (
          <span className="text-navy-400 font-sans text-xs font-medium">
            {label}
          </span>
        ) : null}
      </div>
    </div>
  );
}
