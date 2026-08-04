import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Breadcrumbs } from "@/components/service/breadcrumbs";
import { requireClient } from "@/lib/auth/current-client";
import { getAccessibleCase } from "@/lib/auth/case-policy";
import { AdminUser } from "@/lib/models/AdminUser";
import { CASE_TYPES, CLIENT_STAGE_LABELS, type CaseStage } from "@/lib/content/case-constants";

export const metadata: Metadata = {
  title: "Case Overview",
  robots: { index: false, follow: false },
};

const CASE_TYPE_LABELS = Object.fromEntries(CASE_TYPES.map((t) => [t.value, t.label]));

export default async function PortalCaseDetailPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const client = await requireClient(`/portal/cases/${caseId}`);

  const accessible = await getAccessibleCase(caseId, String(client._id));
  if (!accessible) notFound();
  const { caseDoc } = accessible;

  const projectManager = caseDoc.projectManager
    ? await AdminUser.findById(caseDoc.projectManager).select("name").lean()
    : null;

  const trail = [
    { name: "Portal", path: "/portal" },
    { name: "Cases", path: "/portal/cases" },
    { name: caseDoc.caseNumber, path: `/portal/cases/${caseId}` },
  ];

  return (
    <Container width="default" className="py-16 sm:py-20">
      <Breadcrumbs trail={trail} className="mb-8" />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-navy-900 text-2xl font-semibold sm:text-3xl">
            {caseDoc.caseNumber} — {caseDoc.title}
          </h1>
          <p className="text-ink-500 mt-1 text-sm">
            {CASE_TYPE_LABELS[caseDoc.caseType as string] ?? caseDoc.caseType} · Opened{" "}
            {new Date(caseDoc.openedAt as unknown as string).toLocaleDateString()}
          </p>
        </div>
        <span className="bg-navy-50 text-navy-700 rounded-full px-3 py-1 text-xs font-semibold">
          {CLIENT_STAGE_LABELS[caseDoc.currentStage as CaseStage] ?? caseDoc.currentStage}
        </span>
      </div>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <div className="rounded-panel border-ink-200 border bg-white p-6 shadow-subtle">
          <h2 className="font-display text-navy-800 text-base font-semibold">Case details</h2>
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-500">Project manager</dt>
              <dd className="text-navy-800 font-medium">{projectManager?.name ?? "Not yet assigned"}</dd>
            </div>
            {caseDoc.targetFilingDate ? (
              <div className="flex justify-between">
                <dt className="text-ink-500">Target filing date</dt>
                <dd className="text-navy-800 font-medium">
                  {new Date(caseDoc.targetFilingDate as unknown as string).toLocaleDateString()}
                </dd>
              </div>
            ) : null}
          </dl>
          <Link
            href={`/portal/cases/${caseId}/team`}
            className="text-navy-700 mt-4 inline-flex items-center gap-1 text-sm font-semibold hover:underline"
          >
            View your team
            <ArrowRight size={14} aria-hidden />
          </Link>
        </div>

        <div className="rounded-panel border-ink-200 flex flex-col gap-2 border bg-white p-6 shadow-subtle text-sm">
          <h2 className="font-display text-navy-800 text-base font-semibold">Documents</h2>
          <p className="text-ink-500">
            Upload and review your case documents, and respond to document requests.
          </p>
          <Link
            href={`/portal/cases/${caseId}/documents`}
            className="text-navy-700 mt-2 inline-flex items-center gap-1 text-sm font-semibold hover:underline"
          >
            View documents
            <ArrowRight size={14} aria-hidden />
          </Link>
        </div>

        <div className="rounded-panel border-ink-200 flex flex-col gap-2 border bg-white p-6 shadow-subtle text-sm">
          <h2 className="font-display text-navy-800 text-base font-semibold">Messages</h2>
          <p className="text-ink-500">
            Message your team, ask questions, and keep track of case updates.
          </p>
          <Link
            href={`/portal/cases/${caseId}/messages`}
            className="text-navy-700 mt-2 inline-flex items-center gap-1 text-sm font-semibold hover:underline"
          >
            View messages
            <ArrowRight size={14} aria-hidden />
          </Link>
        </div>

        <div className="rounded-panel border-ink-200 flex flex-col gap-2 border border-dashed bg-white p-6 text-sm">
          <h2 className="font-display text-navy-800 text-base font-semibold">Coming soon</h2>
          <p className="text-ink-500">
            Scheduled consultations for this case will appear here in a future update.
          </p>
        </div>
      </div>
    </Container>
  );
}
