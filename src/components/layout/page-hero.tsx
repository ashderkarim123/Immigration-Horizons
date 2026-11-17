import { Breadcrumbs, type Crumb } from "@/components/service/breadcrumbs";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/section";
import { cn } from "@/lib/utils";

/**
 * Shared introduction for public pages outside the homepage. Ivory by
 * default; audience pages open on sage. Pass `aside` for a right column
 * (a form rail, a rating row) that stacks below the copy on small screens.
 */
export function PageHero({
  trail,
  eyebrow,
  title,
  description,
  children,
  aside,
  tone = "ivory",
  className,
}: {
  trail: Crumb[];
  eyebrow: string;
  title: React.ReactNode;
  description: React.ReactNode;
  children?: React.ReactNode;
  aside?: React.ReactNode;
  tone?: "ivory" | "sage";
  className?: string;
}) {
  return (
    <section className={cn(tone === "sage" ? "bg-ink-100" : "bg-ink-50", "border-navy-800/14 border-b")}>
      <Container width="wide" className="py-12 sm:py-16 lg:py-20">
        <Breadcrumbs trail={trail} className="mb-8" />
        <div className={cn("grid gap-10", aside && "lg:grid-cols-[1.1fr_0.9fr] lg:gap-16")}>
          <div className={cn("max-w-3xl", className)}>
            <Eyebrow>{eyebrow}</Eyebrow>
            <h1 className="text-display-lg sm:text-display-xl mt-4 max-w-[18ch]">
              {title}
            </h1>
            <div className="text-lead text-ink-600 mt-5 max-w-2xl text-pretty">
              {description}
            </div>
            {children ? <div className="mt-8">{children}</div> : null}
          </div>
          {aside}
        </div>
      </Container>
    </section>
  );
}
