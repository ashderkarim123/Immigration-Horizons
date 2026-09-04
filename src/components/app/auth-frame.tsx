import { CheckCircle2, LockKeyhole, ShieldCheck } from "lucide-react";

import { Container } from "@/components/ui/container";

export function AuthFrame({
  eyebrow,
  title,
  description,
  points,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  description: string;
  points: string[];
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Container width="wide" className="py-8 sm:py-12 lg:py-16">
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-[2rem] border border-white bg-white shadow-[0_30px_90px_rgba(15,31,61,0.14)] lg:min-h-[38rem] lg:grid-cols-[0.92fr_1.08fr]">
        <aside className="bg-navy-950 relative hidden overflow-hidden p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:52px_52px] [mask-image:linear-gradient(to_bottom,black,transparent_90%)]"
          />
          <div aria-hidden className="bg-gold-500/15 absolute -top-24 -left-24 h-72 w-72 rounded-full blur-3xl" />
          <div aria-hidden className="bg-navy-500/25 absolute -right-24 -bottom-24 h-72 w-72 rounded-full blur-3xl" />

          <div className="relative">
            <span className="border-gold-400/25 bg-gold-400/10 text-gold-200 inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[0.66rem] font-bold tracking-[0.14em] uppercase">
              <ShieldCheck size={14} aria-hidden /> Secure access
            </span>
            <h2 className="font-display mt-8 text-4xl leading-tight font-semibold text-white">
              Your work stays organised, protected, and within reach.
            </h2>
            <p className="text-navy-200 mt-5 max-w-sm leading-relaxed">
              A focused workspace for the information, updates, and next steps
              that matter to your immigration journey.
            </p>
          </div>

          <ul className="relative space-y-4 border-t border-white/10 pt-7">
            {points.map((point) => (
              <li key={point} className="text-navy-100 flex items-center gap-3 text-sm">
                <span className="bg-gold-400/12 text-gold-300 flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
                  <CheckCircle2 size={16} aria-hidden />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </aside>

        <div className="flex items-center px-6 py-10 sm:px-10 lg:px-14">
          <div className="mx-auto w-full max-w-md">
            <span className="text-gold-700 inline-flex items-center gap-2 text-[0.68rem] font-bold tracking-[0.15em] uppercase">
              <LockKeyhole size={14} aria-hidden /> {eyebrow}
            </span>
            <h1 className="font-display text-navy-900 mt-3 text-3xl font-semibold sm:text-4xl">
              {title}
            </h1>
            <p className="text-ink-600 mt-3 text-[0.95rem] leading-relaxed">
              {description}
            </p>

            <div className="mt-8">{children}</div>

            {footer ? (
              <div className="text-ink-500 mt-7 border-t border-ink-200 pt-6 text-sm">
                {footer}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </Container>
  );
}
