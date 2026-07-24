import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const button = cva(
  [
    "inline-flex items-center justify-center gap-2 rounded-full font-sans font-semibold",
    "transition-[background-color,color,box-shadow,transform] duration-200 ease-(--ease-out-soft)",
    "disabled:pointer-events-none disabled:opacity-55",
    // Lift is decorative only, so reduced-motion users simply don't get it.
    "motion-safe:hover:-translate-y-0.5",
  ],
  {
    variants: {
      variant: {
        /** Default action. Navy on light surfaces. */
        primary:
          "bg-navy-800 text-white shadow-subtle hover:bg-navy-900 hover:shadow-card",
        /** High-intent conversion CTA. Navy text on gold clears AA comfortably. */
        gold: "bg-gold-500 text-navy-900 shadow-subtle hover:bg-gold-400 hover:shadow-card",
        /** Secondary action on light surfaces. */
        outline:
          "border border-ink-300 bg-white text-navy-800 hover:border-navy-300 hover:bg-navy-50",
        /** Secondary action on navy surfaces. */
        inverse:
          "border border-white/30 text-white hover:border-white/60 hover:bg-white/10",
        /** Tertiary / inline action. */
        ghost: "text-navy-800 hover:bg-navy-50",
      },
      size: {
        sm: "h-10 px-4 text-sm",
        md: "h-12 px-6 text-[0.9375rem]",
        lg: "h-14 px-8 text-base",
      },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", block: false },
  },
);

type ButtonVariants = VariantProps<typeof button>;

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
  const classes = cn(button({ variant, size, block }), className);

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

export { button as buttonVariants };
