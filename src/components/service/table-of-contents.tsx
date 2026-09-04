import { List } from "lucide-react";

/**
 * In-page navigation for long-form pages. Plain anchor links — no scroll
 * spying, no client JS. `scroll-padding-top` in globals.css keeps the sticky
 * header from covering the target heading.
 */
export function TableOfContents({
  items,
}: {
  items: { id: string; label: string }[];
}) {
  return (
    <nav
      aria-label="On this page"
      className="rounded-panel border-ink-200 relative overflow-hidden border bg-white p-6 shadow-subtle lg:sticky lg:top-36"
    >
      <span aria-hidden className="bg-gold-500 absolute top-0 left-6 h-1 w-10 rounded-b-full" />
      <p className="text-navy-800 mb-4 inline-flex items-center gap-2 font-sans text-xs font-bold tracking-[0.14em] uppercase">
        <List size={14} aria-hidden />
        On this page
      </p>
      <ol className="flex flex-col gap-2.5">
        {items.map((item, index) => (
          <li key={item.id} className="group flex gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-navy-50">
            <span
              aria-hidden
              className="text-gold-600 font-sans text-xs font-semibold tabular-nums"
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <a
              href={`#${item.id}`}
              className="text-ink-600 group-hover:text-navy-800 font-sans text-sm font-medium transition-colors duration-200"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
