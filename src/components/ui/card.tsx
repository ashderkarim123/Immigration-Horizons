import Link from "next/link";

import { cn } from "@/lib/utils";

const tones = {
  default: "border-ink-200 bg-white",
  tint: "border-ink-200 bg-ink-50",
  /** For use inside navy sections. */
  inverse: "border-white/12 bg-white/[0.06] text-navy-100",
  /** Draws the eye to a single recommended option. */
  featured: "border-gold-300 bg-white ring-1 ring-gold-200",
} as const;

/**
 * Base surface. Pass `href` to make the whole card an accessible link;
 * hover elevation is applied only in that interactive case.
 */
export function Card({
  tone = "default",
  href,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  tone?: keyof typeof tones;
  href?: string;
}) {
  const classes = cn(
    "rounded-card border p-7 shadow-subtle",
    tones[tone],
    href &&
      "block transition-[box-shadow,transform,border-color] duration-200 ease-(--ease-out-soft) hover:shadow-lifted motion-safe:hover:-translate-y-1",
    href && tone === "default" && "hover:border-navy-200",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({
  as: Heading = "h3",
  className,
  children,
}: {
  as?: "h2" | "h3" | "h4";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Heading className={cn("text-display-sm font-semibold", className)}>
      {children}
    </Heading>
  );
}

export function CardBody({
  className,
  children,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p className={cn("text-ink-600 text-pretty", className)} {...props}>
      {children}
    </p>
  );
}

/** Small categorical label — service type, case category, platform. */
export function Badge({
  tone = "navy",
  className,
  children,
}: {
  tone?: "navy" | "gold" | "neutral";
  className?: string;
  children: React.ReactNode;
}) {
  const toneClasses = {
    navy: "bg-navy-50 text-navy-700",
    gold: "bg-gold-50 text-gold-700",
    neutral: "bg-ink-100 text-ink-600",
  } as const;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 font-sans text-xs font-semibold tracking-wide",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
