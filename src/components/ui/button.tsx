import Link from "next/link";

import { cn } from "@/lib/utils";

const BASE = [
  "inline-flex items-center justify-center gap-2 rounded-full font-sans font-semibold",
  "transition-[background-color,color,box-shadow,transform,border-color] duration-200 ease-(--ease-out-soft)",
  "disabled:pointer-events-none disabled:opacity-55",
  // Lift is decorative only, so reduced-motion users simply don't get it.
  "motion-safe:hover:-translate-y-px",
];

/**
 * Terracotta is never a button fill: white on it is 3.4:1. Primary CTAs are
 * forest on light surfaces and white on deep forest (`onDark`).
 */
const VARIANTS = {
  /** Default action on light surfaces. */
  primary: "bg-navy-800 text-white shadow-card hover:bg-navy-950 hover:shadow-lifted",
  /** Primary action on deep-forest surfaces. */
  onDark: "bg-white text-navy-800 hover:bg-ink-50",
  /** Secondary action on light surfaces. */
  outline: "border border-navy-800/28 text-navy-800 hover:border-navy-800 hover:bg-navy-50",
  /** Secondary action on deep-forest surfaces. */
  inverse: "border border-white/35 text-white hover:border-white hover:bg-white/8",
  /** Tertiary / inline action. */
  ghost: "text-navy-800 hover:bg-navy-50",
};

const SIZES = {
  sm: "h-10 px-4 text-sm",
  md: "h-12 px-6 text-[0.9375rem]",
  lg: "h-14 px-8 text-base",
};

type ButtonVariants = {
  variant?: keyof typeof VARIANTS | null;
  size?: keyof typeof SIZES | null;
  block?: boolean | null;
};

/**
 * Renders a `<Link>` when `href` is supplied, otherwise a `<button>`, so
 * navigation and actions stay visually identical but semantically correct.
 */
export function Button({
  variant,
  size,
  block,
  className,
  href,
  ...props
}: ButtonVariants &
  Omit<React.ComponentProps<"button">, "color"> & { href?: string }) {
  const classes = cn(BASE, VARIANTS[variant ?? "primary"], SIZES[size ?? "md"], block && "w-full", className);

  if (href) {
    // Button-only props have no meaning on an anchor, so they are dropped
    // rather than forwarded into the DOM.
    const { type: _type, disabled: _disabled, ...rest } = props;
    const external = /^(https?:|mailto:|tel:)/.test(href);

    return (
      <Link
        {...(rest as Omit<React.ComponentProps<typeof Link>, "href">)}
        href={href}
        className={classes}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      />
    );
  }

  return <button className={classes} {...props} />;
}
