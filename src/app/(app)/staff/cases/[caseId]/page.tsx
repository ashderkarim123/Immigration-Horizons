import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Container } from "@/components/ui/container";
import { requireCapability } from "@/lib/auth/current-employee";
import { getAccessibleCaseForEmployee } from "@/lib/auth/employee-case-policy";
import { roleHasCapability } from "@/lib/auth/capabilities";
import { getDb } from "@/lib/db";
import { CaseDocument } from "@/lib/models/CaseDocument";
import { CASE_TYPES, CLIENT_STAGE_LABELS, type CaseStage } from "@/lib/content/case-constants";

export const metadata: Metadata = {
  title: "Case",
  robots: { index: false, follow: false },
};

const CASE_TYPE_LABELS = Object.fromEntries(CASE_TYPES.map((t) => [t.value, t.label]));

export default async function StaffCaseDetailPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const { actor, role } = await requireCapability("cases.view", `/staff/cases/${caseId}`);

  // Row-level check: a case this employee isn't a member of returns null,
  // and a non-existent one returns null too — indistinguishable by design.
  const caseDoc = await getAccessibleCaseForEmployee(caseId, actor);
  if (!caseDoc) notFound();

  const db = getDb();
  if (db) await db;

  const canSeeDocuments = roleHasCapability(role, "documents.view");
  const documents = canSeeDocuments
    ? await CaseDocument.find({ case: caseDoc._id, archivedAt: null })
        .select("displayName status category uploadedAt")
        .sort({ uploadedAt: -1 })
        .limit(25)
        .lean()
    : [];

  return (
    <Container width="default" className="py-10 sm:py-14">
      <Link
        href="/staff/cases"
        className="text-navy-700 inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
      >
        <ArrowLeft size={14} aria-hidden />
        All cases
      </Link>

      <div className="mt-4">
        <h1 className="font-display text-navy-900 text-2xl font-semibold sm:text-3xl">
          {String(caseDoc.caseNumber)} — {String(caseDoc.title)}
        </h1>
        <p className="text-ink-600 mt-1 text-[0.9375rem]">
          {CASE_TYPE_LABELS[caseDoc.caseType as string] ?? String(caseDoc.caseType)} ·{" "}
          {CLIENT_STAGE_LABELS[caseDoc.currentStage as CaseStage] ?? String(caseDoc.currentStage)}
          {caseDoc.targetFilingDate
            ? ` · target filing ${new Date(caseDoc.targetFilingDate as unknown as string).toLocaleDateString()}`
            : ""}
        </p>
      </div>

      <section className="rounded-panel border-ink-200 shadow-subtle mt-8 border bg-white">
        <div className="border-ink-200 border-b px-6 py-4">
          <h2 className="font-display text-navy-800 text-lg font-semibold">Documents</h2>
        </div>

        {!canSeeDocuments ? (
          <div className="px-6 py-12 text-center">
            <p className="text-ink-500 text-sm">Your role doesn&apos;t include document access.</p>
          </div>
        ) : documents.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-ink-600 text-sm">No documents on this case yet.</p>
          </div>
        ) : (
          <ul className="divide-ink-200 divide-y">
            {documents.map((d) => (
              <li key={String(d._id)} className="flex items-center justify-between gap-4 px-6 py-3.5">
                <p className="text-navy-800 min-w-0 truncate text-sm font-medium">{String(d.displayName)}</p>
                <span className="bg-navy-50 text-navy-700 shrink-0 rounded-full px-3 py-1 text-xs font-semibold">
                  {String(d.status).replace(/_/g, " ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-ink-500 mt-6 text-xs">
        Document review, messaging, and case actions are in the admin system for now — this cycle
        adds the staff shell and read access.
      </p>
    </Container>
  );
}
