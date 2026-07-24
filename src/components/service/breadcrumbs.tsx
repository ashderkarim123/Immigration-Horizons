import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export type Crumb = { name: string; path: string };

/**
 * Visible breadcrumb trail. Pair with `breadcrumbSchema(trail)` from
 * components/seo/json-ld so the visible trail and the structured data always
 * describe the same path.
 */
export function Breadcrumbs({
  trail,
  tone = "light",
  className,
}: {
  trail: Crumb[];
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1.5 font-sans text-xs">
        {trail.map((crumb, index) => {
          const isLast = index === trail.length - 1;
          return (
            <li key={crumb.path} className="flex items-center gap-1.5">
              {isLast ? (
                <span
                  aria-current="page"
                  className={cn(
                    "font-medium",
                    tone === "dark" ? "text-navy-200" : "text-ink-500",
                  )}
                >
                  {crumb.name}
                </span>
              ) : (
                <>
                  <Link
                    href={crumb.path}
                    className={cn(
                      "underline-offset-4 transition-colors duration-200 hover:underline",
                      tone === "dark"
                        ? "text-navy-300 hover:text-white"
                        : "text-ink-500 hover:text-navy-800",
                    )}
                  >
                    {crumb.name}
                  </Link>
                  <ChevronRight
                    size={12}
                    aria-hidden
                    className={
                      tone === "dark" ? "text-navy-400" : "text-ink-400"
                    }
                  />
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
