import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Badge } from "@/components/app/badge";
import { requireEmployee } from "@/lib/auth/current-employee";
import { roleLabel } from "@/lib/auth/capabilities";
import { getOperationsBoard } from "@/lib/staff/operations";

export const metadata: Metadata = {
  title: "Operations",
  robots: { index: false, follow: false },
};

/**
 * The unified operations console.
 *
 * No capability gate on the page itself: every queue inside is gated
 * individually, so a role with only their own overdue tasks still gets a
 * useful page rather than a 404. What they cannot hold is listed honestly
 * at the bottom instead of silently disappearing.
 */
export default async function StaffOperationsPage() {
  const { actor, role } = await requireEmployee("/staff/operations");
  const board = await getOperationsBoard(actor);

  const totalOutstanding = board.queues.reduce((sum, queue) => sum + queue.count, 0);

  return (
    <Container width="default" className="py-10 sm:py-14">
      <div className="relative flex flex-wrap items-end justify-between gap-4 overflow-hidden rounded-[1.35rem] border border-white bg-white/72 px-6 py-6 shadow-subtle backdrop-blur-sm sm:px-7">
        <span aria-hidden className="bg-gold-500 absolute top-0 left-6 h-1 w-12 rounded-b-full" />
        <div>
          <h1 className="font-display text-navy-900 text-2xl font-semibold sm:text-3xl">
            Operations
          </h1>
          <p className="text-ink-600 mt-1 text-[0.9375rem]">
            {roleLabel(role)} ·{" "}
            {board.scopedToMemberships
              ? "scoped to the cases you are a member of"
              : "across the whole practice"}
          </p>
        </div>
        <Link href="/staff" className="text-navy-700 text-sm font-semibold hover:underline">
          Your dashboard
        </Link>
      </div>

      {totalOutstanding === 0 && board.queues.length > 0 ? (
        <div className="rounded-panel border-ink-200 shadow-subtle mt-8 flex items-center gap-3 border bg-white px-6 py-5">
          <CheckCircle2 className="text-emerald-600" size={22} aria-hidden />
          <p className="text-navy-800 text-sm font-semibold">
            Every queue you can see is clear.
          </p>
        </div>
      ) : null}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {board.queues.map((queue) => (
          <section
            key={queue.key}
            className="rounded-panel border-ink-200 shadow-subtle flex flex-col overflow-hidden border bg-white transition-[border-color,box-shadow,transform] duration-300 hover:border-navy-200 hover:shadow-card motion-safe:hover:-translate-y-0.5"
          >
            <div className="border-ink-200 relative flex items-start justify-between gap-3 border-b bg-gradient-to-r from-white to-navy-50/40 px-5 py-4 sm:px-6">
              <span aria-hidden className="bg-gold-500 absolute top-0 left-6 h-0.5 w-10 rounded-b-full" />
              <div className="min-w-0">
                <h2 className="font-display text-navy-800 text-lg font-semibold">
                  {queue.href ? (
                    <Link href={queue.href} className="hover:underline">
                      {queue.label}
                    </Link>
                  ) : (
                    queue.label
                  )}
                </h2>
                <p className="text-ink-500 mt-0.5 text-xs">{queue.hint}</p>
              </div>
              <span
                className={`font-display shrink-0 text-2xl font-semibold tabular-nums ${
                  queue.count > 0 ? "text-gold-700" : "text-ink-400"
                }`}
              >
                {queue.count}
              </span>
            </div>

            {queue.rows.length === 0 ? (
              <p className="text-ink-500 px-5 py-8 text-center text-sm sm:px-6">Nothing waiting.</p>
            ) : (
              <ul className="divide-ink-200 divide-y">
                {queue.rows.map((row) => {
                  const body = (
                    <div className="flex items-center justify-between gap-3 px-5 py-3 sm:px-6">
                      <div className="min-w-0">
                        <p className="text-navy-800 truncate text-sm font-medium">{row.primary}</p>
                        <p className="text-ink-500 mt-0.5 truncate text-xs">{row.secondary}</p>
                      </div>
                      {row.flag ? (
                        <Badge tone={row.flag === "Overdue" ? "danger" : "warning"}>{row.flag}</Badge>
                      ) : null}
                    </div>
                  );
                  return (
                    <li key={row.id}>
                      {row.href ? (
                        <Link href={row.href} className="hover:bg-navy-50/50 block transition-colors">
                          {body}
                        </Link>
                      ) : (
                        body
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {queue.count > queue.rows.length ? (
              <p className="text-ink-500 border-ink-200 border-t px-5 py-3 text-xs sm:px-6">
                Showing {queue.rows.length} of {queue.count}.
              </p>
            ) : null}
          </section>
        ))}
      </div>

      {board.unavailable.length > 0 ? (
        <div className="border-ink-200 mt-8 rounded-xl border border-dashed bg-white/60 px-5 py-4">
          <p className="text-ink-500 text-xs">
            Not part of your role: {board.unavailable.join(" · ")}. Ask an administrator if you need
            one of these.
          </p>
        </div>
      ) : null}
    </Container>
  );
}
