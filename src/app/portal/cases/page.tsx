import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase } from "lucide-react";

import { Container } from "@/components/ui/container";
import { requireClient } from "@/lib/auth/current-client";
import { listAccessibleCases } from "@/lib/auth/case-policy";
import { CASE_TYPES, CLIENT_STAGE_LABELS, type CaseStage } from "@/lib/content/case-constants";

export const metadata: Metadata = {
  title: "Your Cases",
  robots: { index: false, follow: false },
};

const CASE_TYPE_LABELS = Object.fromEntries(CASE_TYPES.map((t) => [t.value, t.label]));

export default async function PortalCasesPage() {
  const client = await requireClient("/portal/cases");
  const cases = await listAccessibleCases(String(client._id));

  return (
    <Container width="default" className="py-16 sm:py-20">
      <h1 className="font-display text-navy-900 text-2xl font-semibold sm:text-3xl">
        Your cases
      </h1>

      <div className="rounded-panel border-ink-200 mt-8 border bg-white shadow-subtle">
        {cases.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <Briefcase className="text-ink-400" size={32} aria-hidden />
            <p className="text-ink-600 text-sm">No active cases yet.</p>
          </div>
        ) : (
          <ul className="divide-ink-200 divide-y">
            {cases.map((c) => (
              <li key={String(c._id)}>
                <Link
                  href={`/portal/cases/${c._id}`}
                  className="hover:bg-navy-50/50 flex items-center justify-between gap-4 px-6 py-4 transition-colors"
                >
                  <div>
                    <p className="text-navy-800 text-sm font-semibold">
                      {c.caseNumber} — {c.title}
                    </p>
                    <p className="text-ink-500 mt-0.5 text-xs">
                      {CASE_TYPE_LABELS[c.caseType as string] ?? c.caseType} · Opened{" "}
                      {new Date(c.openedAt as unknown as string).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="bg-navy-50 text-navy-700 rounded-full px-3 py-1 text-xs font-semibold">
                    {CLIENT_STAGE_LABELS[c.currentStage as CaseStage] ?? c.currentStage}
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
