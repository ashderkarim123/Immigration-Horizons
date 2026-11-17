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
    <aside className="rounded-panel bg-navy-950 p-8 sm:p-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
        <div className="max-w-lg">
          <p className="font-display text-2xl text-white text-pretty">
            {title}
          </p>
          <p className="text-ink-50/82 mt-2 text-[0.9375rem] leading-relaxed text-pretty">
            {body}
          </p>
        </div>
        <Button href={ctaHref} variant="onDark" className="shrink-0">
          {ctaLabel}
        </Button>
      </div>
    </aside>
  );
}
