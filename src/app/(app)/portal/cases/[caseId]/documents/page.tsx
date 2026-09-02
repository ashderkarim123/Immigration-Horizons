import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Container } from "@/components/ui/container";
import { PageHeader } from "@/components/app/page-header";
import { DocumentUploadForm } from "@/components/portal/document-upload-form";
import { requireClient } from "@/lib/auth/current-client";
import { getAccessibleDocumentCenter } from "@/lib/auth/document-policy";

export const metadata: Metadata = {
  title: "Case Documents",
  robots: { index: false, follow: false },
};

const STATUS_LABELS: Record<string, string> = {
  uploaded: "Submitted",
  pending_review: "Under review",
  accepted: "Accepted",
  needs_replacement: "Needs replacement",
  rejected: "Rejected",
  superseded: "Superseded",
};

export default async function PortalCaseDocumentsPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const client = await requireClient(`/portal/cases/${caseId}/documents`);

  const center = await getAccessibleDocumentCenter(caseId, String(client._id));
  if (!center) notFound();
  const { caseDoc, categories, documents, requests } = center;

  const documentsByCategory = new Map<string, typeof documents>();
  for (const doc of documents) {
    const key = String(doc.category);
    if (!documentsByCategory.has(key)) documentsByCategory.set(key, []);
    documentsByCategory.get(key)!.push(doc);
  }

  const trail = [
    { name: "Portal", href: "/portal" },
    { name: "Cases", href: "/portal/cases" },
    { name: caseDoc.caseNumber, href: `/portal/cases/${caseId}` },
    { name: "Documents", href: `/portal/cases/${caseId}/documents` },
  ];

  return (
    <Container width="default" className="py-10 sm:py-14">
      <PageHeader
        title="Documents"
        description={`Everything shared on ${caseDoc.caseNumber}, and anything we still need from you.`}
        breadcrumbs={trail}
      />

      {requests.length > 0 ? (
        <div className="rounded-panel border-ink-200 mt-8 border bg-white p-6 shadow-subtle">
          <h2 className="font-display text-navy-800 text-base font-semibold">Requested from you</h2>
          <ul className="mt-3 flex flex-col gap-4">
            {requests.map((request) => {
              const overdue =
                request.dueDate &&
                new Date(request.dueDate as unknown as string) < new Date() &&
                request.status !== "fulfilled";
              return (
                <li key={String(request._id)} className="border-ink-100 border-t pt-4 first:border-t-0 first:pt-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-navy-800 text-sm font-semibold">{request.title}</p>
                    {overdue ? (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                        Overdue
                      </span>
                    ) : null}
                  </div>
                  {request.instructions ? (
                    <p className="text-ink-500 mt-1 text-sm">{request.instructions}</p>
                  ) : null}
                  {request.status !== "fulfilled" ? (
                    <div className="mt-3">
                      <DocumentUploadForm caseId={caseId} requestId={String(request._id)} label="Fulfill request" />
                    </div>
                  ) : (
                    <p className="mt-2 text-sm font-medium text-green-700">Fulfilled</p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="mt-8 flex flex-col gap-6">
        {categories.map((category) => {
          const docs = documentsByCategory.get(String(category._id)) ?? [];
          const canUpload = category.allowedUploaderTypes === "both" || category.allowedUploaderTypes === "client";
          return (
            <div key={String(category._id)} className="rounded-panel border-ink-200 border bg-white p-6 shadow-subtle">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-navy-800 text-base font-semibold">
                  {category.name}
                  {category.required ? (
                    <span className="text-gold-700 ml-2 text-xs font-semibold">Required</span>
                  ) : null}
                </h2>
              </div>
              {category.description ? <p className="text-ink-500 mt-1 text-sm">{category.description}</p> : null}

              {docs.length > 0 ? (
                <ul className="mt-4 flex flex-col gap-2">
                  {docs.map((doc) => (
                    <li key={String(doc._id)} className="flex items-center justify-between gap-2 text-sm">
                      <Link
                        href={`/portal/cases/${caseId}/documents/${doc._id}`}
                        className="text-navy-700 font-medium hover:underline"
                      >
                        {doc.displayName}
                      </Link>
                      <span className="text-ink-500 text-xs">{STATUS_LABELS[doc.status] ?? doc.status}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-ink-400 mt-3 text-sm">No documents yet.</p>
              )}

              {canUpload ? (
                <div className="mt-4">
                  <DocumentUploadForm caseId={caseId} categoryId={String(category._id)} />
                </div>
              ) : null}
            </div>
          );
        })}

        {categories.length === 0 ? (
          <p className="text-ink-500 text-sm">No document categories are set up for this case yet.</p>
        ) : null}
      </div>
    </Container>
  );
}
