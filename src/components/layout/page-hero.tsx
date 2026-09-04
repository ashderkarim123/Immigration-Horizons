import { Compass } from "lucide-react";

import { Breadcrumbs, type Crumb } from "@/components/service/breadcrumbs";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/section";
import { cn } from "@/lib/utils";

/** Shared branded introduction for public pages outside the homepage. */
export function PageHero({
  trail,
  eyebrow,
  title,
  description,
  children,
  className,
}: {
  trail: Crumb[];
  eyebrow: string;
  title: React.ReactNode;
  description: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className="bg-navy-950 relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(201,153,46,0.16),transparent_56%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:68px_68px] [mask-image:linear-gradient(to_bottom,black,transparent_92%)]"
      />
      <div
        aria-hidden
        className="bg-navy-500/20 pointer-events-none absolute -right-32 -bottom-48 h-[30rem] w-[30rem] rounded-full blur-3xl"
      />

      <Container width="wide" className="relative py-14 sm:py-20 lg:py-24">
        <Breadcrumbs trail={trail} tone="dark" className="mb-8" />
        <div className={cn("max-w-3xl", className)}>
          <Eyebrow className="text-gold-200 inline-flex items-center gap-2 rounded-full border border-gold-400/25 bg-gold-400/10 px-4 py-2">
            <Compass size={14} aria-hidden />
            {eyebrow}
          </Eyebrow>
          <h1 className="text-display-lg sm:text-display-xl mt-5 font-semibold text-white">
            {title}
          </h1>
          <div className="text-lead text-navy-200 mt-5 text-pretty">
            {description}
          </div>
          {children ? <div className="mt-8">{children}</div> : null}
        </div>
      </Container>
    </section>
  );
}
