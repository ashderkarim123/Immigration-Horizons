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
      className="rounded-card border-ink-200 bg-ink-50 border p-6 lg:sticky lg:top-28"
    >
      <p className="text-navy-800 mb-4 inline-flex items-center gap-2 font-sans text-xs font-bold tracking-[0.14em] uppercase">
        <List size={14} aria-hidden />
        On this page
      </p>
      <ol className="flex flex-col gap-2.5">
        {items.map((item, index) => (
          <li key={item.id} className="flex gap-2.5">
            <span
              aria-hidden
              className="text-gold-600 font-sans text-xs font-semibold tabular-nums"
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <a
              href={`#${item.id}`}
              className="text-ink-600 hover:text-navy-800 font-sans text-sm underline-offset-4 transition-colors duration-200 hover:underline"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
