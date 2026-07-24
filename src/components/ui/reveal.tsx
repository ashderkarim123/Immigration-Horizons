import { cn } from "@/lib/utils";

/**
 * Scroll-triggered entrance implemented entirely in CSS via a scroll-driven
 * `animation-timeline: view()`.
 *
 * Why not an animation library: these wrappers appear in almost every
 * section, so a JS implementation forces the whole page into client
 * components and ships a runtime for what is decorative motion. This version
 * costs no JavaScript and lets the sections stay server-rendered.
 *
 * Progressive enhancement is the critical detail — the initial `opacity: 0`
 * lives *inside* an `@supports` guard, so browsers without scroll-driven
 * animation render the content immediately and fully visible. Content is
 * never hidden behind an unsupported feature.
 */
export function Reveal({
  delay = 0,
  className,
  children,
}: {
  delay?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn("ih-reveal", className)}
      style={delay ? { animationDelay: `${delay}s` } : undefined}
    >
      {children}
    </div>
  );
}

/**
 * Staggers entrances across a grid. The delay is applied by nth-child in CSS
 * so no per-item inline styles or client code are needed.
 */
export function RevealGroup({
  className,
  children,
}: {
  /** Accepted for API compatibility; stagger is handled in CSS. */
  stagger?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("ih-reveal-group", className)}>{children}</div>;
}

export function RevealItem({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("ih-reveal", className)}>{children}</div>;
}
