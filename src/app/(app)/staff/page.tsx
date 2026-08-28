import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, ClipboardList } from "lucide-react";

import { Container } from "@/components/ui/container";
import { StatTile } from "@/components/app/stat-tile";
import { requireEmployee } from "@/lib/auth/current-employee";
import { roleLabel } from "@/lib/auth/capabilities";
import { getEmployeeDashboard, getDashboardCases, getMyTasks } from "@/lib/dashboard/employee-dashboard";
import { widgetOrderForRole } from "@/lib/dashboard/dashboard-presets";
import { CASE_TYPES, CLIENT_STAGE_LABELS, type CaseStage } from "@/lib/content/case-constants";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

const CASE_TYPE_LABELS = Object.fromEntries(CASE_TYPES.map((t) => [t.value, t.label]));

export default async function StaffDashboardPage() {
  const { actor, role } = await requireEmployee("/staff");

  const [data, cases, tasks] = await Promise.all([
    getEmployeeDashboard(actor),
    getDashboardCases(actor),
    getMyTasks(actor),
  ]);

  const widgets = widgetOrderForRole(role);

  return (
    <Container width="default" className="py-10 sm:py-14">
      <div>
        <h1 className="font-display text-navy-900 text-2xl font-semibold sm:text-3xl">Your dashboard</h1>
        <p className="text-ink-600 mt-1 text-[0.9375rem]">
          {roleLabel(role)} · what needs your attention right now
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {widgets.map((widget) => (
          <StatTile
            key={widget.key}
            label={widget.label}
            hint={widget.hint}
            value={data[widget.key]}
            href={widget.href}
            tone={widget.tone}
          />
        ))}
      </div>

      <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-panel border-ink-200 shadow-subtle border bg-white">
          <div className="border-ink-200 flex items-center justify-between border-b px-6 py-4">
            <h2 className="font-display text-navy-800 text-lg font-semibold">Your cases</h2>
            {data.myCases !== null ? (
              <Link href="/staff/cases" className="text-navy-700 text-sm font-semibold hover:underline">
                View all
              </Link>
            ) : null}
          </div>

          {data.myCases === null ? (
            <div className="px-6 py-12 text-center">
              <p className="text-ink-500 text-sm">
                Your role doesn&apos;t include case access. Ask an administrator if you need it.
              </p>
            </div>
          ) : cases.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <Briefcase className="text-ink-400" size={28} aria-hidden />
              <p className="text-ink-600 text-sm">No cases assigned to you yet.</p>
            </div>
          ) : (
            <ul className="divide-ink-200 divide-y">
              {cases.map((c) => (
                <li key={String(c._id)}>
                  <Link
                    href={`/staff/cases/${c._id}`}
                    className="hover:bg-navy-50/50 flex items-center justify-between gap-4 px-6 py-4 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-navy-800 truncate text-sm font-semibold">
                        {c.caseNumber} — {c.title}
                      </p>
                      <p className="text-ink-500 mt-0.5 text-xs">
                        {CASE_TYPE_LABELS[c.caseType as string] ?? c.caseType}
                        {c.targetFilingDate
                          ? ` · files ${new Date(c.targetFilingDate as unknown as string).toLocaleDateString()}`
                          : ""}
                      </p>
                    </div>
                    <span className="bg-navy-50 text-navy-700 shrink-0 rounded-full px-3 py-1 text-xs font-semibold">
                      {CLIENT_STAGE_LABELS[c.currentStage as CaseStage] ?? String(c.currentStage)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-panel border-ink-200 shadow-subtle border bg-white">
          <div className="border-ink-200 flex items-center justify-between border-b px-6 py-4">
            <h2 className="font-display text-navy-800 text-lg font-semibold">Your tasks</h2>
            <Link href="/staff/tasks" className="text-navy-700 text-sm font-semibold hover:underline">
              View all
            </Link>
          </div>

          {tasks.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <ClipboardList className="text-ink-400" size={28} aria-hidden />
              <p className="text-ink-600 text-sm">Nothing assigned to you right now.</p>
            </div>
          ) : (
            <ul className="divide-ink-200 divide-y">
              {tasks.map((t) => {
                const due = t.dueDate ? new Date(t.dueDate as unknown as string) : null;
                const overdue = due !== null && due < new Date();
                return (
                  <li key={String(t._id)} className="flex items-center justify-between gap-4 px-6 py-4">
                    <div className="min-w-0">
                      <p className="text-navy-800 truncate text-sm font-semibold">{t.title}</p>
                      <p className="text-ink-500 mt-0.5 text-xs">
                        {String(t.type)}
                        {due ? ` · due ${due.toLocaleDateString()}` : ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                        overdue ? "bg-red-50 text-red-700" : "bg-navy-50 text-navy-700"
                      }`}
                    >
                      {overdue ? "Overdue" : String(t.status).replace(/_/g, " ")}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </Container>
  );
}
