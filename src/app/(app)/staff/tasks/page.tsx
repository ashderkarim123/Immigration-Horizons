import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";

import { Container } from "@/components/ui/container";
import { requireEmployee } from "@/lib/auth/current-employee";
import { getMyTasks } from "@/lib/dashboard/employee-dashboard";

export const metadata: Metadata = {
  title: "Your tasks",
  robots: { index: false, follow: false },
};

/**
 * Tasks assigned to the signed-in employee. No capability gate: ownership
 * *is* the scope — `Task.assignee` is the filter, so this can only ever
 * show your own work regardless of role.
 */
export default async function StaffTasksPage() {
  const { actor } = await requireEmployee("/staff/tasks");
  const tasks = await getMyTasks(actor, 100);

  return (
    <Container width="default" className="py-10 sm:py-14">
      <div>
        <h1 className="font-display text-navy-900 text-2xl font-semibold sm:text-3xl">Your tasks</h1>
        <p className="text-ink-600 mt-1 text-[0.9375rem]">
          {tasks.length} open task{tasks.length === 1 ? "" : "s"} assigned to you
        </p>
      </div>

      <div className="rounded-panel border-ink-200 shadow-subtle mt-8 border bg-white">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <ClipboardList className="text-ink-400" size={32} aria-hidden />
            <p className="text-navy-800 font-semibold">Nothing assigned</p>
            <p className="text-ink-600 max-w-sm text-sm">
              Tasks assigned to you in the admin system appear here.
            </p>
          </div>
        ) : (
          <ul className="divide-ink-200 divide-y">
            {tasks.map((t) => {
              const due = t.dueDate ? new Date(t.dueDate as unknown as string) : null;
              const overdue = due !== null && due < new Date();
              return (
                <li key={String(t._id)} className="flex items-center justify-between gap-4 px-6 py-4">
                  <div className="min-w-0">
                    <p className="text-navy-800 truncate text-sm font-semibold">{String(t.title)}</p>
                    <p className="text-ink-500 mt-0.5 text-xs">
                      {String(t.type)}
                      {due ? ` · due ${due.toLocaleDateString()}` : " · no due date"}
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
      </div>
    </Container>
  );
}
