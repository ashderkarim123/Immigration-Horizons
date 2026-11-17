import Link from "next/link";

import { cn } from "@/lib/utils";

export type Crumb = { name: string; path: string };

/**
 * Visible breadcrumb trail, light surfaces only (every hero is ivory or sage
 * now). Pair with `breadcrumbSchema(trail)` from components/seo/json-ld so
 * the visible trail and the structured data always describe the same path.
 */
export function Breadcrumbs({
  trail,
  className,
}: {
  trail: Crumb[];
  className?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="text-ink-600 flex flex-wrap items-center gap-1.5 font-sans text-[0.8125rem]">
        {trail.map((crumb, index) => {
          const isLast = index === trail.length - 1;
          return (
            <li key={crumb.path} className="flex items-center gap-1.5">
              {index > 0 ? (
                <span aria-hidden className="text-navy-800/28">
                  /
                </span>
              ) : null}
              {isLast ? (
                <span aria-current="page" className="font-medium">
                  {crumb.name}
                </span>
              ) : (
                <Link
                  href={crumb.path}
                  className={cn(
                    "hover:text-navy-800 underline-offset-4 transition-colors duration-200 hover:underline",
                  )}
                >
                  {crumb.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
