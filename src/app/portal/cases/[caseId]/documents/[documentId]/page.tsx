import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Container } from "@/components/ui/container";
import { Breadcrumbs } from "@/components/service/breadcrumbs";
import { DocumentUploadForm } from "@/components/portal/document-upload-form";
import { requireClient } from "@/lib/auth/current-client";
import { getAccessibleDocument } from "@/lib/auth/document-policy";
import { ClientCase } from "@/lib/models/ClientCase";

export const metadata: Metadata = {
  title: "Document",
  robots: { index: false, follow: false },
};

const STATUS_LABELS: Record<string, string> = {
  uploaded: "Submitted — awaiting review",
  pending_review: "Under review",
  accepted: "Accepted",
  needs_replacement: "Needs replacement",
  rejected: "Rejected",
  superseded: "Superseded",
};

export default async function PortalDocumentDetailPage({
  params,
}: {
  params: Promise<{ caseId: string; documentId: string }>;
}) {
  const { caseId, documentId } = await params;
  const client = await requireClient(`/portal/cases/${caseId}/documents/${documentId}`);

  const accessible = await getAccessibleDocument(documentId, String(client._id));
  if (!accessible) notFound();
  const { document } = accessible;
  if (String(document.case) !== caseId) notFound();

  const caseDoc = await ClientCase.findById(caseId).select("caseNumber").lean();
  if (!caseDoc) notFound();

  const trail = [
    { name: "Portal", path: "/portal" },
    { name: "Cases", path: "/portal/cases" },
    { name: caseDoc.caseNumber, path: `/portal/cases/${caseId}` },
    { name: "Documents", path: `/portal/cases/${caseId}/documents` },
    { name: document.displayName, path: `/portal/cases/${caseId}/documents/${documentId}` },
  ];

  const needsReplacement = document.status === "needs_replacement";

  return (
    <Container width="default" className="py-16 sm:py-20">
      <Breadcrumbs trail={trail} className="mb-8" />

      <h1 className="font-display text-navy-900 text-2xl font-semibold sm:text-3xl">{document.displayName}</h1>
      <p className="text-ink-500 mt-1 text-sm">{STATUS_LABELS[document.status] ?? document.status}</p>

      {document.clientVisibleReviewComment ? (
        <div className="rounded-panel border-ink-200 mt-6 border bg-white p-6 shadow-subtle">
          <h2 className="font-display text-navy-800 text-base font-semibold">
            {needsReplacement ? "Why a replacement is needed" : "Review note"}
          </h2>
          <p className="text-ink-600 mt-2 text-sm">{document.clientVisibleReviewComment}</p>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <a
          href={`/portal/documents/${documentId}/download`}
          className="border-navy-200 text-navy-800 hover:bg-navy-50 rounded-full border px-4 py-2 text-sm font-semibold"
        >
          Download current version
        </a>
      </div>

      {needsReplacement ? (
        <div className="rounded-panel border-ink-200 mt-6 border bg-white p-6 shadow-subtle">
          <h2 className="font-display text-navy-800 text-base font-semibold">Upload a replacement</h2>
          <div className="mt-3">
            <DocumentUploadForm caseId={caseId} replaceDocumentId={documentId} label="Upload replacement" />
          </div>
        </div>
      ) : null}
    </Container>
  );
}
