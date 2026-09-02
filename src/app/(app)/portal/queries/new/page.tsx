import type { Metadata } from "next";

import { Container } from "@/components/ui/container";
import { PageHeader } from "@/components/app/page-header";
import { NewQueryForm } from "@/components/portal/new-query-form";
import { requireClient } from "@/lib/auth/current-client";
import { getDb } from "@/lib/db";
import { Consultation } from "@/lib/models/Consultation";
import { listAccessibleCases } from "@/lib/auth/case-policy";
import { CaseWorkspace } from "@/lib/models/CaseWorkspace";

export const metadata: Metadata = {
  title: "Ask a Question",
  robots: { index: false, follow: false },
};

export default async function NewQueryPage() {
  const client = await requireClient("/portal/queries/new");

  const db = getDb();
  if (db) await db;

  const [consultations, cases] = await Promise.all([
    db
      ? Consultation.find({ clientUser: client._id }).select("service createdAt").sort({ createdAt: -1 }).lean()
      : Promise.resolve([]),
    listAccessibleCases(String(client._id)),
  ]);

  const caseWorkspaces = cases.length
    ? await CaseWorkspace.find({ case: { $in: cases.map((c) => c._id) }, workspaceType: "primary" }).lean()
    : [];
  const workspaceByCase = new Map(caseWorkspaces.map((w) => [String(w.case), String(w._id)]));

  const consultationOptions = consultations.map((c) => ({
    id: String(c._id),
    label: `${c.service} — ${new Date(c.createdAt as unknown as string).toLocaleDateString()}`,
  }));
  const caseOptions = cases
    .filter((c) => workspaceByCase.has(String(c._id)))
    .map((c) => ({
      id: String(c._id),
      workspaceId: workspaceByCase.get(String(c._id))!,
      label: `${c.caseNumber} — ${c.title}`,
    }));

  return (
    <Container width="default" className="py-10 sm:py-14">
      <div className="mx-auto max-w-xl">
        <PageHeader
          title="Ask a question"
          description="Submit a question or request a consultation. Our team will respond as soon as possible."
          breadcrumbs={[
            { name: "Portal", href: "/portal" },
            { name: "Questions", href: "/portal/queries" },
            { name: "Ask", href: "/portal/queries/new" },
          ]}
        />

        <div className="rounded-panel border-ink-200 border bg-white p-6 shadow-subtle sm:p-8">
          {consultationOptions.length === 0 && caseOptions.length === 0 ? (
            <p className="text-ink-600 text-sm">
              You don&apos;t have any consultations or cases to ask about yet.
            </p>
          ) : (
            <NewQueryForm consultations={consultationOptions} cases={caseOptions} />
          )}
        </div>
      </div>
    </Container>
  );
}
