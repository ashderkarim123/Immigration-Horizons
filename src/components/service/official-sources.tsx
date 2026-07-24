import { ExternalLink } from "lucide-react";

/**
 * Outbound links to primary sources. Citing the statute, the regulation, and
 * USCIS directly is both an EEAT signal and the honest way to present
 * regulatory claims — the reader can check every one.
 */
export function OfficialSources({
  sources,
}: {
  sources: { label: string; href: string }[];
}) {
  return (
    <aside className="rounded-card border-ink-200 border bg-white p-7">
      <h2 className="font-display text-navy-800 text-lg font-semibold">
        Official sources
      </h2>
      <p className="text-ink-600 mt-2 text-[0.9375rem] leading-relaxed">
        Every regulatory statement on this page can be checked against a
        primary source. These are the authorities it relies on.
      </p>
      <ul className="mt-5 flex flex-col gap-3">
        {sources.map((source) => (
          <li key={source.href}>
            <a
              href={source.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-navy-700 hover:text-navy-900 inline-flex items-start gap-2 font-sans text-sm font-medium underline-offset-4 hover:underline"
            >
              <ExternalLink size={14} className="mt-0.5 shrink-0" aria-hidden />
              {source.label}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}
