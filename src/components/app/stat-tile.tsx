import Link from "next/link";

/**
 * Dashboard metric tile (ADR-009 §5).
 *
 * Three deliberately distinct states, because they mean different things
 * and collapsing them would mislead:
 *   - a number         → this many items need you
 *   - "Nothing waiting" → genuinely clear, and worth showing as a
 *                          trustworthy state rather than hiding the tile
 *   - "Not your remit"  → the role holds no capability for this widget,
 *                          which is not the same as zero
 */
export function StatTile({
  label,
  hint,
  value,
  href,
  tone = "neutral",
}: {
  label: string;
  hint: string;
  value: number | null;
  href: string;
  tone?: "neutral" | "attention";
}) {
  const unavailable = value === null;
  const needsAttention = tone === "attention" && typeof value === "number" && value > 0;

  const body = (
    <div className="relative">
      <p className="text-ink-500 font-sans text-xs font-semibold tracking-wide uppercase">{label}</p>
      {unavailable ? (
        <p className="text-ink-400 mt-2 font-sans text-sm">Not your remit</p>
      ) : (
        <>
          <p
            className={`font-display mt-2 text-3xl font-semibold tabular-nums ${
              needsAttention ? "text-gold-700" : "text-navy-900"
            }`}
          >
            {value}
          </p>
          <p className="text-ink-500 mt-1 text-xs">{value === 0 ? "Nothing waiting" : hint}</p>
        </>
      )}
    </div>
  );

  if (unavailable) {
    return (
      <div className="rounded-panel border-ink-200 border bg-white/60 p-5 backdrop-blur-sm">{body}</div>
    );
  }

  return (
    <Link
      href={href}
      className="rounded-panel border-ink-200 shadow-subtle hover:border-navy-300 group relative block overflow-hidden border bg-white p-5 transition-[border-color,box-shadow,transform] duration-300 ease-(--ease-out-soft) hover:shadow-card motion-safe:hover:-translate-y-0.5"
    >
      <span
        aria-hidden
        className={`absolute top-0 right-0 h-20 w-20 translate-x-8 -translate-y-8 rounded-full transition-transform duration-500 motion-safe:group-hover:scale-125 ${
          needsAttention ? "bg-gold-100/70" : "bg-navy-50"
        }`}
      />
      {body}
    </Link>
  );
}
