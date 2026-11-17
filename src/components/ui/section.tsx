import { cn } from "@/lib/utils";

import { Container } from "./container";

/**
 * Surfaces rotate ivory → white → sage → deep forest; no two adjacent
 * sections share one. `ivory` is the page background, so it is also what a
 * bare `<section>` gets.
 */
const tones = {
  ivory: "bg-ink-50",
  white: "bg-white",
  /** Quiet alternating band — keeps long pages from flattening out. */
  tint: "bg-ink-100",
  /** Cool brand wash. */
  navyTint: "bg-navy-50",
  /** Deep forest. Sets light-on-dark defaults for descendants. */
  navy: "bg-navy-950 text-ink-50/82 [&_h2]:text-white [&_h3]:text-white",
} as const;

const spacing = {
  compact: "py-16 sm:py-20",
  default: "py-16 sm:py-24",
  /** Generous whitespace for hero-adjacent and closing sections. */
  spacious: "py-20 sm:py-30",
} as const;

export function Section({
  tone = "white",
  space = "default",
  container = "default",
  className,
  children,
  ...props
}: React.ComponentProps<"section"> & {
  tone?: keyof typeof tones;
  space?: keyof typeof spacing;
  container?: React.ComponentProps<typeof Container>["width"] | "none";
}) {
  return (
    <section className={cn(tones[tone], spacing[space], className)} {...props}>
      {container === "none" ? (
        children
      ) : (
        <Container width={container}>{children}</Container>
      )}
    </section>
  );
}

export function Eyebrow({
  className,
  children,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "font-sans text-xs font-bold tracking-[0.14em] text-gold-700 uppercase",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/**
 * Standard section intro. `as` keeps the heading level correct per page
 * outline without changing the visual scale.
 */
export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  as: Heading = "h2",
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  align?: "left" | "center";
  as?: "h1" | "h2" | "h3";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4",
        align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl",
        className,
      )}
    >
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <Heading className="text-display-md">{title}</Heading>
      {description ? (
        <p className="text-lead text-ink-600 text-pretty">{description}</p>
      ) : null}
    </div>
  );
}
