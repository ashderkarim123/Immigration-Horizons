/**
 * In-page navigation for long-form pages. Plain anchor links — no scroll
 * spying, no client JS. `scroll-padding-top` in globals.css keeps the sticky
 * header from covering the target heading. A sage-deep rail on the left;
 * ≤lg it becomes a wrapping inline list under the hero.
 */
export function TableOfContents({
  items,
}: {
  items: { id: string; label: string }[];
}) {
  return (
    <nav aria-label="On this page">
      <p className="text-ink-500 mb-3 font-sans text-xs font-bold tracking-[0.14em] uppercase">
        On this page
      </p>
      <ol className="border-ink-200 flex flex-wrap gap-x-5 gap-y-1 lg:flex-col lg:gap-0 lg:border-l-2">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="text-ink-600 hover:text-navy-800 hover:border-gold-500 -ml-0.5 block border-l-2 border-transparent py-1.5 font-sans text-sm font-medium transition-colors duration-200 lg:pl-4"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
