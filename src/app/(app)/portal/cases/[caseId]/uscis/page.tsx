import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Container } from "@/components/ui/container";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/app/badge";
import { requireClient } from "@/lib/auth/current-client";
import { getAccessibleCase } from "@/lib/auth/case-policy";
import { getClientTracking } from "@/lib/uscis/client-view";

export const metadata: Metadata = {
  title: "USCIS Status",
  robots: { index: false, follow: false },
};

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

export default async function PortalCaseUscisPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const client = await requireClient(`/portal/cases/${caseId}/uscis`);

  const accessible = await getAccessibleCase(caseId, String(client._id));
  if (!accessible) notFound();
  const { caseDoc } = accessible;

  const filings = await getClientTracking(String(caseDoc._id));

  const trail = [
    { name: "Portal", href: "/portal" },
    { name: "Cases", href: "/portal/cases" },
    { name: caseDoc.caseNumber, href: `/portal/cases/${caseId}` },
    { name: "USCIS status", href: `/portal/cases/${caseId}/uscis` },
  ];

  return (
    <Container width="default" className="py-10 sm:py-14">
      <PageHeader
        title="USCIS Status"
        description={`Updates your team has shared about ${caseDoc.caseNumber}. This is information from USCIS notices and status checks, not legal advice.`}
        breadcrumbs={trail}
      />

      {filings.length === 0 ? (
        <div className="rounded-panel border-ink-200 mt-8 border border-dashed bg-white p-8 text-center text-sm">
          <p className="text-ink-500">No USCIS tracking updates are available for this case yet.</p>
        </div>
      ) : (
        <ul className="mt-8 flex flex-col gap-5">
          {filings.map((filing) => {
            const current = filing.currentStatus;
            return (
              <li key={filing.id} className="rounded-panel border-ink-200 shadow-subtle border bg-white p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-display text-navy-800 text-base font-semibold">{filing.formType}</h2>
                    {filing.title !== filing.formType ? <p className="text-ink-500 mt-0.5 text-xs">{filing.title}</p> : null}
                    {filing.receiptNumber ? (
                      <p className="text-ink-600 mt-2 text-sm">
                        Receipt: <span className="font-mono tracking-wide">{filing.receiptNumber}</span>
                      </p>
                    ) : null}
                    {filing.filedAt || filing.receiptDate ? (
                      <p className="text-ink-500 mt-1 text-xs">
                        {filing.filedAt ? `Filed ${formatDate(filing.filedAt)}` : null}
                        {filing.filedAt && filing.receiptDate ? " · " : null}
                        {filing.receiptDate ? `Receipt date ${formatDate(filing.receiptDate)}` : null}
                      </p>
                    ) : null}
                  </div>
                  {current?.actionRequired ? <Badge tone="warning">Action needed</Badge> : null}
                </div>

                {current ? (
                  <div className="bg-navy-50 mt-4 rounded-md p-4">
                    <p className="text-ink-500 text-xs font-semibold tracking-wide uppercase">Current status</p>
                    <p className="text-navy-800 mt-1 text-base font-semibold">{current.title}</p>
                    <p className="text-ink-500 mt-0.5 text-xs">Updated {formatDate(current.occurredAt)}</p>
                    {current.description ? <p className="text-ink-700 mt-2 text-sm whitespace-pre-line">{current.description}</p> : null}
                    {current.actionRequired && current.responseDueAt ? (
                      <p className="mt-3 text-sm font-semibold text-amber-800">Response due {formatDate(current.responseDueAt)}</p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-ink-500 mt-4 text-sm">No status update has been shared for this filing yet.</p>
                )}

                {filing.timeline.length > 1 ? (
                  <div className="mt-5">
                    <h3 className="text-navy-800 text-sm font-semibold">History</h3>
                    <ol className="border-ink-200 mt-2 flex flex-col gap-3 border-l pl-4">
                      {filing.timeline.map((event) => (
                        <li key={event.id} className="text-sm">
                          <p className="text-navy-800 font-medium">{event.title}</p>
                          <p className="text-ink-500 text-xs">
                            <time dateTime={event.occurredAt}>{formatDate(event.occurredAt)}</time>
                            {event.actionRequired ? " · Action needed" : null}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Container>
  );
}
