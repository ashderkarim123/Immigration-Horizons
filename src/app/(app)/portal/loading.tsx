import { Container } from "@/components/ui/container";

/**
 * Portal loading state, shared by every `/portal/**` segment that does not
 * declare its own.
 *
 * Portal pages fan out into several queries each (cases, consultations,
 * unread counts), so a first paint can take a moment. A skeleton shaped
 * like the real page keeps the layout from jumping when the data lands.
 *
 * The visual skeleton is `aria-hidden`; the status message beside it is
 * what a screen reader announces, because a pile of empty grey boxes is
 * noise rather than information.
 */
export default function PortalLoading() {
  return (
    <Container width="default" className="py-10 sm:py-14">
      <div className="animate-pulse" aria-hidden>
        <div className="bg-ink-200 h-8 w-56 rounded" />
        <div className="bg-ink-200/70 mt-3 h-4 w-72 rounded" />

        <div className="mt-8 flex flex-col gap-6">
          {Array.from({ length: 2 }).map((_, panel) => (
            <div key={panel} className="rounded-panel border-ink-200 border bg-white">
              <div className="border-ink-200 border-b px-6 py-4">
                <div className="bg-ink-200/70 h-4 w-40 rounded" />
              </div>
              <div className="divide-ink-200 divide-y">
                {Array.from({ length: 3 }).map((_, row) => (
                  <div key={row} className="flex items-center justify-between gap-4 px-6 py-4">
                    <div className="w-full">
                      <div className="bg-ink-200 h-3.5 w-1/3 rounded" />
                      <div className="bg-ink-200/70 mt-2 h-3 w-1/4 rounded" />
                    </div>
                    <div className="bg-ink-200/70 h-6 w-20 shrink-0 rounded-full" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <span className="sr-only" role="status">
        Loading…
      </span>
    </Container>
  );
}
