import { Button } from "@/components/ui/button";

/**
 * Mid-article conversion prompt. Long pages need a way to act without
 * scrolling to the end, so one of these sits between major sections.
 */
export function InlineCta({
  title,
  body,
  ctaLabel = "Book a free consultation",
  ctaHref = "/consultation",
}: {
  title: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  return (
    <aside className="rounded-panel bg-navy-800 relative overflow-hidden p-8 sm:p-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_right,rgba(201,153,46,0.16),transparent_60%)]"
      />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
        <div className="max-w-lg">
          <p className="font-display text-xl font-semibold text-white text-pretty">
            {title}
          </p>
          <p className="text-navy-200 mt-2 text-[0.9375rem] leading-relaxed text-pretty">
            {body}
          </p>
        </div>
        <Button href={ctaHref} variant="gold" className="shrink-0">
          {ctaLabel}
        </Button>
      </div>
    </aside>
  );
}
