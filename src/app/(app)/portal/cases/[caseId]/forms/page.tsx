import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { Container } from "@/components/ui/container";
import { PageHeader } from "@/components/app/page-header";
import { Badge, type BadgeTone } from "@/components/app/badge";
import { requireClient } from "@/lib/auth/current-client";
import { getAccessibleCase } from "@/lib/auth/case-policy";
import { listClientForms } from "@/lib/forms/form-queries";
import { toClientListItem } from "@/lib/forms/form-service";

export const metadata: Metadata = {
  title: "Case Forms",
  robots: { index: false, follow: false },
};

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: "To complete", tone: "neutral" },
  needs_changes: { label: "Changes requested", tone: "warning" },
  submitted: { label: "Submitted", tone: "gold" },
  approved: { label: "Approved", tone: "positive" },
  locked: { label: "Final", tone: "positive" },
};

export default async function PortalCaseFormsPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const client = await requireClient(`/portal/cases/${caseId}/forms`);

  const accessible = await getAccessibleCase(caseId, String(client._id));
  if (!accessible) notFound();
  const { caseDoc } = accessible;

  const forms = (await listClientForms(String(caseDoc._id))).map(toClientListItem);

  const trail = [
    { name: "Portal", href: "/portal" },
    { name: "Cases", href: "/portal/cases" },
    { name: caseDoc.caseNumber, href: `/portal/cases/${caseId}` },
    { name: "Forms", href: `/portal/cases/${caseId}/forms` },
  ];

  return (
    <Container width="default" className="py-10 sm:py-14">
      <PageHeader
        title="Forms"
        description={`Questions our team needs answered to prepare ${caseDoc.caseNumber}. Your answers save as you go.`}
        breadcrumbs={trail}
      />

      {forms.length === 0 ? (
        <div className="rounded-panel border-ink-200 mt-8 border border-dashed bg-white p-8 text-center text-sm">
          <p className="text-navy-800 font-semibold">No forms yet</p>
          <p className="text-ink-500 mt-1">Your case team will add forms here when they are ready for you to complete.</p>
        </div>
      ) : (
        <ul className="mt-8 flex flex-col gap-4">
          {forms.map((form) => {
            const status = STATUS[form.status] ?? STATUS.draft;
            return (
              <li key={form.id} className="rounded-panel border-ink-200 shadow-subtle border bg-white p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-display text-navy-800 text-base font-semibold">{form.title}</h2>
                    <p className="text-ink-500 mt-1 text-xs">
                      {form.progress.completedRequired} of {form.progress.totalRequired} required questions answered
                    </p>
                  </div>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </div>
                <div
                  role="progressbar"
                  aria-label={`${form.title} progress`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={form.progress.percent}
                  className="bg-navy-50 mt-3 h-1.5 overflow-hidden rounded-full"
                >
                  <div className="bg-gold-500 h-full rounded-full" style={{ width: `${form.progress.percent}%` }} />
                </div>
                <Link href={`/portal/cases/${caseId}/forms/${form.id}`} className="text-navy-700 mt-4 inline-flex items-center gap-1 text-sm font-semibold hover:underline">
                  {form.status === "draft" || form.status === "needs_changes" ? "Open form" : "View form"}
                  <ArrowRight size={14} aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Container>
  );
}
