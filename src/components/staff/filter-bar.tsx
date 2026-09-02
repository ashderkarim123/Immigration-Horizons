import Link from "next/link";
import { Search } from "lucide-react";

import { Select, TextInput } from "@/components/forms/fields";

/**
 * Search and filter controls for the staff list views.
 *
 * A plain GET form on purpose. It needs no JavaScript, it keeps the list
 * pages server components, the resulting URL is shareable and
 * bookmarkable, and the browser's own back button behaves correctly — all
 * of which an onChange-driven client filter would give up in exchange for
 * saving one click.
 */

export type FilterSelect = {
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
};

export function FilterBar({
  action,
  searchName = "q",
  searchValue,
  searchPlaceholder,
  selects,
  hasActiveFilters,
}: {
  action: string;
  searchName?: string;
  searchValue: string;
  searchPlaceholder: string;
  selects: FilterSelect[];
  hasActiveFilters: boolean;
}) {
  return (
    <form
      method="get"
      action={action}
      className="rounded-panel border-ink-200 shadow-subtle border bg-white p-4 sm:p-5"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="min-w-0 flex-1">
          <label
            htmlFor="staff-filter-search"
            className="text-ink-500 font-sans text-xs font-semibold tracking-wide uppercase"
          >
            Search
          </label>
          <div className="relative mt-1.5">
            <Search
              size={16}
              aria-hidden
              className="text-ink-400 pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2"
            />
            <TextInput
              id="staff-filter-search"
              name={searchName}
              type="search"
              defaultValue={searchValue}
              placeholder={searchPlaceholder}
              className="!py-2.5 pl-10"
            />
          </div>
        </div>

        {selects.map((select) => (
          <div key={select.name} className="lg:w-44">
            <label
              htmlFor={`staff-filter-${select.name}`}
              className="text-ink-500 font-sans text-xs font-semibold tracking-wide uppercase"
            >
              {select.label}
            </label>
            <Select
              id={`staff-filter-${select.name}`}
              name={select.name}
              defaultValue={select.value}
              className="mt-1.5 !py-2.5"
            >
              {select.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        ))}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="bg-navy-900 hover:bg-navy-800 rounded-xl px-5 py-2.5 font-sans text-sm font-semibold text-white transition-colors"
          >
            Apply
          </button>
          {hasActiveFilters ? (
            <Link href={action} className="text-navy-700 text-sm font-semibold hover:underline">
              Clear
            </Link>
          ) : null}
        </div>
      </div>
    </form>
  );
}

/** Page links that preserve the current filters. */
export function Pagination({
  basePath,
  params,
  page,
  totalPages,
  total,
  noun,
}: {
  basePath: string;
  params: Record<string, string>;
  page: number;
  totalPages: number;
  total: number;
  noun: string;
}) {
  if (totalPages <= 1) {
    return (
      <p className="text-ink-500 mt-4 text-xs">
        {total} {noun}
        {total === 1 ? "" : "s"}
      </p>
    );
  }

  const linkTo = (target: number) => {
    const query = new URLSearchParams(params);
    query.set("page", String(target));
    return `${basePath}?${query.toString()}`;
  };

  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-4">
      <p className="text-ink-500 text-xs">
        Page {page} of {totalPages} · {total} {noun}
        {total === 1 ? "" : "s"}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link
            href={linkTo(page - 1)}
            rel="prev"
            className="border-ink-300 text-navy-700 hover:border-navy-400 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors"
          >
            Previous
          </Link>
        ) : null}
        {page < totalPages ? (
          <Link
            href={linkTo(page + 1)}
            rel="next"
            className="border-ink-300 text-navy-700 hover:border-navy-400 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors"
          >
            Next
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
