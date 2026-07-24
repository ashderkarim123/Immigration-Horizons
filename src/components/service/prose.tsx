import { Info } from "lucide-react";

import { cn } from "@/lib/utils";

/** A long-form section with a heading anchor the table of contents targets. */
export function ContentSection({
  id,
  heading,
  eyebrow,
  children,
  className,
}: {
  id: string;
  heading: string;
  eyebrow?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("scroll-mt-28", className)}>
      {eyebrow ? (
        <p className="text-gold-700 mb-3 font-sans text-[0.6875rem] font-bold tracking-[0.14em] uppercase">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="text-display-md font-semibold text-pretty">{heading}</h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** Renders an array of paragraphs at a consistent reading rhythm. */
export function Prose({
  paragraphs,
  className,
}: {
  paragraphs: string[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {paragraphs.map((paragraph) => (
        <p
          key={paragraph.slice(0, 48)}
          className="text-ink-600 text-[1.0625rem] leading-[1.75] text-pretty"
        >
          {paragraph}
        </p>
      ))}
    </div>
  );
}

/**
 * Title + body list used for criteria, benefits, documents, and mistakes.
 * `numbered` renders an ordered list where sequence carries meaning.
 */
export function DefinitionList({
  items,
  numbered = false,
  className,
}: {
  items: { title: string; body: string }[];
  numbered?: boolean;
  className?: string;
}) {
  const List = numbered ? "ol" : "ul";

  return (
    <List className={cn("flex flex-col gap-6", className)}>
      {items.map((item, index) => (
        <li key={item.title} className="flex gap-4">
          <span
            aria-hidden
            className={cn(
              "mt-0.5 inline-flex shrink-0 items-center justify-center font-sans text-xs font-bold",
              numbered
                ? "bg-navy-800 h-7 w-7 rounded-full text-white"
                : "bg-gold-500 mt-2.5 h-1.5 w-1.5 rounded-full",
            )}
          >
            {numbered ? index + 1 : ""}
          </span>
          <div className="flex flex-col gap-1.5">
            <h3 className="font-display text-navy-800 text-lg font-semibold">
              {item.title}
            </h3>
            <p className="text-ink-600 text-[0.9375rem] leading-relaxed text-pretty">
              {item.body}
            </p>
          </div>
        </li>
      ))}
    </List>
  );
}

/** Sub-topic within a section — sits at h3, below the section h2. */
export function SubSection({
  heading,
  paragraphs,
  children,
}: {
  heading: string;
  paragraphs?: string[];
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-display text-navy-800 text-xl font-semibold">
        {heading}
      </h3>
      {paragraphs ? <Prose paragraphs={paragraphs} /> : null}
      {children}
    </div>
  );
}

/** Set-apart note for a caveat or emphasis worth pulling out of the flow. */
export function Callout({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <aside className="rounded-card border-navy-200 bg-navy-50 flex gap-4 border p-6">
      <Info size={20} className="text-navy-600 mt-0.5 shrink-0" aria-hidden />
      <div className="flex flex-col gap-2">
        <p className="font-display text-navy-800 text-base font-semibold">
          {title}
        </p>
        <div className="text-ink-600 text-[0.9375rem] leading-relaxed text-pretty">
          {children}
        </div>
      </div>
    </aside>
  );
}
