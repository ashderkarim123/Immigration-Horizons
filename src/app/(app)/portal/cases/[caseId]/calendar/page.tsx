import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Container } from "@/components/ui/container";
import { PageHeader } from "@/components/app/page-header";
import { UpcomingDates } from "@/components/portal/upcoming-dates";
import { requireClient } from "@/lib/auth/current-client";
import { getAccessibleCase } from "@/lib/auth/case-policy";
import { getClientCalendar } from "@/lib/calendar/client-view";

export const metadata: Metadata = {
  title: "Upcoming dates",
  robots: { index: false, follow: false },
};

export default async function PortalCaseCalendarPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const client = await requireClient(`/portal/cases/${caseId}/calendar`);

  const accessible = await getAccessibleCase(caseId, String(client._id));
  if (!accessible) notFound();
  const { caseDoc, workspace } = accessible;

  const items = await getClientCalendar({ caseId: String(caseDoc._id), workspaceId: String(workspace._id), clientUserId: String(client._id) });

  const trail = [
    { name: "Portal", href: "/portal" },
    { name: "Cases", href: "/portal/cases" },
    { name: caseDoc.caseNumber, href: `/portal/cases/${caseId}` },
    { name: "Upcoming dates", href: `/portal/cases/${caseId}/calendar` },
  ];

  return (
    <Container width="default" className="py-10 sm:py-14">
      <PageHeader
        title="Upcoming dates"
        description={`Dates your team has shared for ${caseDoc.caseNumber}. Calendar days are shown as they are; appointment times show the time zone they were scheduled in.`}
        breadcrumbs={trail}
      />
      <div className="rounded-panel border-ink-200 shadow-subtle mt-8 border bg-white p-5 sm:p-6">
        <UpcomingDates items={items} />
      </div>
    </Container>
  );
}
