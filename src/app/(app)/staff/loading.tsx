import { Container } from "@/components/ui/container";

/**
 * Staff-area loading state. Dashboard widgets each run their own count
 * query, so a first paint can take a moment — a skeleton that matches the
 * real layout avoids the page jumping when data lands.
 */
export default function StaffLoading() {
  return (
    <Container width="default" className="py-10 sm:py-14">
      <div className="animate-pulse" aria-hidden>
        <div className="bg-ink-200 h-8 w-64 rounded" />
        <div className="bg-ink-200/70 mt-3 h-4 w-80 rounded" />
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-panel border-ink-200 border bg-white p-5">
              <div className="bg-ink-200/70 h-3 w-24 rounded" />
              <div className="bg-ink-200 mt-3 h-8 w-14 rounded" />
              <div className="bg-ink-200/70 mt-2 h-3 w-32 rounded" />
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only" role="status">
        Loading your dashboard…
      </span>
    </Container>
  );
}
