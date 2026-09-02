import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase } from "lucide-react";

import { Container } from "@/components/ui/container";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/panel";
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
    <Container width="default" className="py-10 sm:py-14">
      <PageHeader
        title="Your cases"
        description="Every case we are working on for you, and where each one currently stands."
        breadcrumbs={[
          { name: "Portal", href: "/portal" },
          { name: "Cases", href: "/portal/cases" },
        ]}
      />

      <div className="rounded-panel border-ink-200 border bg-white shadow-subtle">
        {cases.length === 0 ? (
          <EmptyState
            icon={<Briefcase size={28} aria-hidden />}
            title="No active cases yet"
            body="Once we begin work on your petition, your case appears here with its current status."
          />
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
