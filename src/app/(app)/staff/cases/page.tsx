import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase } from "lucide-react";

import { Container } from "@/components/ui/container";
import { requireCapability } from "@/lib/auth/current-employee";
import { listAccessibleCasesForEmployee } from "@/lib/auth/employee-case-policy";
import { roleHasCapability } from "@/lib/auth/capabilities";
import { CASE_TYPES, CLIENT_STAGE_LABELS, type CaseStage } from "@/lib/content/case-constants";

export const metadata: Metadata = {
  title: "Cases",
  robots: { index: false, follow: false },
};

const CASE_TYPE_LABELS = Object.fromEntries(CASE_TYPES.map((t) => [t.value, t.label]));

export default async function StaffCasesPage() {
  // Capability first; the row-level scope is applied inside the policy.
  const { actor, role } = await requireCapability("cases.view", "/staff/cases");
  const cases = await listAccessibleCasesForEmployee(actor, { limit: 100 });
  const seesEverything = roleHasCapability(role, "cases.view_all");

  return (
    <Container width="default" className="py-10 sm:py-14">
      <div>
        <h1 className="font-display text-navy-900 text-2xl font-semibold sm:text-3xl">Cases</h1>
        <p className="text-ink-600 mt-1 text-[0.9375rem]">
          {seesEverything
            ? `${cases.length} active case${cases.length === 1 ? "" : "s"} across the practice`
            : `${cases.length} active case${cases.length === 1 ? "" : "s"} assigned to you`}
        </p>
      </div>

      <div className="rounded-panel border-ink-200 shadow-subtle mt-8 border bg-white">
        {cases.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <Briefcase className="text-ink-400" size={32} aria-hidden />
            <p className="text-navy-800 font-semibold">No cases yet</p>
            <p className="text-ink-600 max-w-sm text-sm">
              {seesEverything
                ? "No active cases exist. Convert a lead in the admin system to create one."
                : "You'll see a case here as soon as you're added to its workspace."}
            </p>
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
      </div>
    </Container>
  );
}
