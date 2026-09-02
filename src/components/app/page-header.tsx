import Link from "next/link";
import { ChevronRight } from "lucide-react";

/**
 * The one page header every portal screen uses (ADR-011 §2).
 *
 * Before this, each page hand-rolled its own heading block: three
 * different vertical rhythms, breadcrumbs on two pages out of eleven, and
 * the dashboard carrying its own notification link and sign-out button
 * that duplicated the shell's. One component means a client sees the same
 * structure on every screen and always knows where they are.
 *
 * The breadcrumb markup is intentionally NOT the marketing site's
 * `components/service/breadcrumbs`: that one is paired with
 * `breadcrumbSchema()` JSON-LD for search engines, and emitting structured
 * data describing a client's private case URLs would be exactly wrong on a
 * noindex surface.
 */

export type Crumb = { name: string; href: string };

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  badge,
}: {
  title: string;
  description?: React.ReactNode;
  breadcrumbs?: Crumb[];
  actions?: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav aria-label="Breadcrumb" className="mb-4">
          <ol className="text-ink-500 flex flex-wrap items-center gap-1.5 font-sans text-xs">
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                <li key={crumb.href} className="flex items-center gap-1.5">
                  {isLast ? (
                    <span aria-current="page" className="text-ink-600 font-medium">
                      {crumb.name}
                    </span>
                  ) : (
                    <>
                      <Link
                        href={crumb.href}
                        className="hover:text-navy-800 underline-offset-4 transition-colors hover:underline"
                      >
                        {crumb.name}
                      </Link>
                      <ChevronRight size={12} aria-hidden className="text-ink-400" />
                    </>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-navy-900 text-2xl font-semibold sm:text-3xl">
              {title}
            </h1>
            {badge}
          </div>
          {description ? (
            <p className="text-ink-600 mt-1.5 max-w-2xl text-[0.9375rem]">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-3">{actions}</div> : null}
      </div>
    </div>
  );
}
