import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

/**
 * Layout primitives shared by both halves of the SaaS app (ADR-011 §2).
 *
 * One card shape, one row treatment, one empty state — so a panel on a
 * client's case page and a panel on the staff console read as the same
 * product rather than two hand-rolled boxes that drifted apart.
 *
 * Capability-specific states deliberately live in `components/staff/`
 * instead: their copy names internal roles, which must never reach a
 * client surface.
 */

export function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-panel border-ink-200 shadow-subtle overflow-hidden border bg-white/95 transition-[border-color,box-shadow] duration-300 hover:border-navy-200 hover:shadow-card">
      <div className="border-ink-200 relative flex flex-wrap items-start justify-between gap-3 border-b bg-gradient-to-r from-white to-navy-50/40 px-5 py-4 sm:px-6">
        <span aria-hidden className="bg-gold-500 absolute top-0 left-6 h-0.5 w-10 rounded-b-full" />
        <div className="min-w-0">
          <h2 className="font-display text-navy-800 text-lg font-semibold">{title}</h2>
          {description ? <p className="text-ink-500 mt-0.5 text-xs">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function PanelLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group text-navy-700 hover:text-navy-900 inline-flex items-center gap-1.5 text-sm font-semibold transition-colors"
    >
      {children}
      <ArrowUpRight
        size={14}
        aria-hidden
        className="transition-transform motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5"
      />
    </Link>
  );
}

/**
 * The one empty state. `body` is not optional in spirit: an empty panel
 * that says only "No documents" leaves a client wondering whether
 * something is broken, so every call site should say what will eventually
 * appear here and why it has not yet.
 */
export function EmptyState({
  title,
  body,
  icon,
  action,
}: {
  title: string;
  body?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 bg-gradient-to-b from-white to-ink-50/55 px-6 py-12 text-center">
      {icon ? (
        <span className="bg-navy-50 text-navy-600 mb-1 inline-flex h-12 w-12 items-center justify-center rounded-2xl" aria-hidden>
          {icon}
        </span>
      ) : null}
      <p className="text-navy-800 text-sm font-semibold">{title}</p>
      {body ? <p className="text-ink-600 mx-auto max-w-sm text-sm">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** Bordered rows sharing one divider treatment. */
export function RowList({ children }: { children: React.ReactNode }) {
  return <ul className="divide-ink-200 divide-y">{children}</ul>;
}

export function Row({
  href,
  primary,
  secondary,
  trailing,
  icon,
}: {
  href?: string | null;
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  trailing?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  const body = (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        {icon ? (
          <span
            aria-hidden
            className="bg-navy-50 text-navy-700 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          >
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <p className="text-navy-800 truncate text-sm font-semibold">{primary}</p>
          {secondary ? <p className="text-ink-500 mt-0.5 truncate text-xs">{secondary}</p> : null}
        </div>
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );

  return (
    <li>
      {href ? (
        <Link href={href} className="hover:bg-navy-50/70 block transition-colors">
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
  );
}

export function DefinitionList({
  items,
}: {
  items: { label: string; value: React.ReactNode }[];
}) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 px-5 py-5 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-ink-500 font-sans text-xs font-semibold tracking-wide uppercase">
            {item.label}
          </dt>
          <dd className="text-navy-800 mt-1 text-sm">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
