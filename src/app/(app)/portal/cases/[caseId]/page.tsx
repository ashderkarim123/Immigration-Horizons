import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { Container } from "@/components/ui/container";
import { PageHeader } from "@/components/app/page-header";
import { Badge, stageTone } from "@/components/app/badge";
import { requireClient } from "@/lib/auth/current-client";
import { getAccessibleCase } from "@/lib/auth/case-policy";
import { getAccessibleMessageCenter } from "@/lib/auth/collaboration-policy";
import { getUnreadCountsForChannels } from "@/lib/collaboration/read-state-service";
import { AdminUser } from "@/lib/models/AdminUser";
import { CaseSmartForm } from "@/lib/models/CaseSmartForm";
import { USCISFiling } from "@/lib/models/USCISFiling";
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

  const messageCenter = await getAccessibleMessageCenter(caseId, String(client._id));
  const unreadByChannel = messageCenter
    ? await getUnreadCountsForChannels({
        channelIds: messageCenter.channels.map((c) => c._id),
        workspaceMemberId: String(messageCenter.membership._id),
        selfClientId: String(client._id),
      })
    : {};
  const chatUnread = Object.values(unreadByChannel).reduce((sum, n) => sum + n, 0);
  const formsToComplete = await CaseSmartForm.countDocuments({
    case: caseDoc._id,
    status: { $in: ["draft", "needs_changes"] },
  });

  const trackedFilings = await USCISFiling.countDocuments({ case: caseDoc._id, clientVisible: true, archivedAt: null });

  const trail = [
    { name: "Portal", href: "/portal" },
    { name: "Cases", href: "/portal/cases" },
    { name: caseDoc.caseNumber, href: `/portal/cases/${caseId}` },
  ];

  return (
    <Container width="default" className="py-10 sm:py-14">
      <PageHeader
        title={`${caseDoc.caseNumber} — ${caseDoc.title}`}
        description={`${CASE_TYPE_LABELS[caseDoc.caseType as string] ?? caseDoc.caseType} · Opened ${new Date(caseDoc.openedAt as unknown as string).toLocaleDateString()}`}
        breadcrumbs={trail}
        badge={
          <Badge tone={stageTone(caseDoc.currentStage)}>
            {CLIENT_STAGE_LABELS[caseDoc.currentStage as CaseStage] ?? String(caseDoc.currentStage)}
          </Badge>
        }
      />

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
          <h2 className="font-display text-navy-800 text-base font-semibold">
            Chat
            {chatUnread > 0 ? (
              <span className="bg-gold-500 text-navy-900 ml-2 rounded-full px-2.5 py-0.5 text-xs font-bold">
                {chatUnread}
                <span className="sr-only"> unread</span>
              </span>
            ) : null}
          </h2>
          <p className="text-ink-500">
            Message your team, ask questions, and keep track of case updates.
          </p>
          <Link
            href={`/portal/cases/${caseId}/messages`}
            className="text-navy-700 mt-2 inline-flex items-center gap-1 text-sm font-semibold hover:underline"
          >
            Open chat
            <ArrowRight size={14} aria-hidden />
          </Link>
        </div>

        <div className="rounded-panel border-ink-200 flex flex-col gap-2 border bg-white p-6 shadow-subtle text-sm">
          <h2 className="font-display text-navy-800 text-base font-semibold">
            Forms
            {formsToComplete > 0 ? (
              <span className="bg-gold-500 text-navy-900 ml-2 rounded-full px-2.5 py-0.5 text-xs font-bold">
                {formsToComplete}
                <span className="sr-only"> to complete</span>
              </span>
            ) : null}
          </h2>
          <p className="text-ink-500">
            Answer the questions our team needs to prepare your case. Your answers save as you go.
          </p>
          <Link
            href={`/portal/cases/${caseId}/forms`}
            className="text-navy-700 mt-2 inline-flex items-center gap-1 text-sm font-semibold hover:underline"
          >
            Open forms
            <ArrowRight size={14} aria-hidden />
          </Link>
        </div>

        {trackedFilings > 0 ? (
          <div className="rounded-panel border-ink-200 flex flex-col gap-2 border bg-white p-6 shadow-subtle text-sm">
            <h2 className="font-display text-navy-800 text-base font-semibold">USCIS status</h2>
            <p className="text-ink-500">See the latest USCIS updates your team has shared for this case.</p>
            <Link
              href={`/portal/cases/${caseId}/uscis`}
              className="text-navy-700 mt-2 inline-flex items-center gap-1 text-sm font-semibold hover:underline"
            >
              View USCIS status
              <ArrowRight size={14} aria-hidden />
            </Link>
          </div>
        ) : null}

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
