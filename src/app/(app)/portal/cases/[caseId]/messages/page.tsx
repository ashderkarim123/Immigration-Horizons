import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Container } from "@/components/ui/container";
import { PageHeader } from "@/components/app/page-header";
import { requireClient } from "@/lib/auth/current-client";
import { getAccessibleMessageCenter } from "@/lib/auth/collaboration-policy";
import { getUnreadCountsForChannels } from "@/lib/collaboration/read-state-service";

export const metadata: Metadata = {
  title: "Case Messages",
  robots: { index: false, follow: false },
};

export default async function PortalCaseMessagesPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const client = await requireClient(`/portal/cases/${caseId}/messages`);

  const center = await getAccessibleMessageCenter(caseId, String(client._id));
  if (!center) notFound();
  const { caseDoc, channels, membership } = center;

  const unreadCounts = await getUnreadCountsForChannels({
    channelIds: channels.map((c) => c._id),
    workspaceMemberId: String(membership._id),
    selfClientId: String(client._id),
  });

  const trail = [
    { name: "Portal", href: "/portal" },
    { name: "Cases", href: "/portal/cases" },
    { name: caseDoc.caseNumber, href: `/portal/cases/${caseId}` },
    { name: "Messages", href: `/portal/cases/${caseId}/messages` },
  ];

  return (
    <Container width="default" className="py-10 sm:py-14">
      <PageHeader
        title="Messages"
        description={`Conversations with your team about ${caseDoc.caseNumber}.`}
        breadcrumbs={trail}
      />

      <div className="mt-8 flex flex-col gap-3">
        {channels.map((channel) => {
          const unread = unreadCounts[String(channel._id)] ?? 0;
          return (
            <Link
              key={String(channel._id)}
              href={`/portal/cases/${caseId}/messages/${channel._id}`}
              className="rounded-panel border-ink-200 flex items-center justify-between border bg-white p-5 shadow-subtle hover:border-navy-200"
            >
              <div>
                <p className="text-navy-800 font-semibold">{channel.name}</p>
                {channel.description ? <p className="text-ink-500 mt-1 text-sm">{channel.description}</p> : null}
              </div>
              {unread > 0 ? (
                <span className="bg-gold-500 text-navy-900 rounded-full px-2.5 py-0.5 text-xs font-bold">{unread}</span>
              ) : null}
            </Link>
          );
        })}

        {channels.length === 0 ? <p className="text-ink-500 text-sm">No channels are set up for this case yet.</p> : null}
      </div>
    </Container>
  );
}
