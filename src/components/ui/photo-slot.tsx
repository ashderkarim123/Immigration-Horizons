import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * A place a real photograph will go.
 *
 * Until a real asset is supplied, this renders a quiet branded placeholder
 * built on the approved symbol mark — never a fake stock person. When `src`
 * is provided it renders an optimised, lazy-loaded, responsive next/image
 * with the alt text already in place. Dropping a WebP into /public and
 * passing its path is the only change needed to go live.
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
        "rounded-panel border-navy-800/14 relative flex flex-col items-center justify-center gap-4 overflow-hidden border bg-white px-4 text-center",
        ratio,
        className,
      )}
    >
      <Image
        src="/images/open-horizons-symbol-full.svg"
        alt=""
        width={280}
        height={280}
        className="h-[120px] w-[120px] opacity-70"
      />
      {label ? (
        <span className="text-ink-500 font-sans text-xs font-medium">
          {label}
        </span>
      ) : null}
    </div>
  );
}
