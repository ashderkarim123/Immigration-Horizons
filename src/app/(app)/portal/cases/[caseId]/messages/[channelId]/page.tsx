import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Container } from "@/components/ui/container";
import { PageHeader } from "@/components/app/page-header";
import { ChatPanel } from "@/components/portal/chat-panel";
import { requireClient } from "@/lib/auth/current-client";
import { getAccessibleChannel } from "@/lib/auth/collaboration-policy";
import { getAccessibleDocumentCenter } from "@/lib/auth/document-policy";
import { markChannelRead } from "@/lib/collaboration/read-state-service";
import { loadClientMessagesPage } from "@/lib/collaboration/chat-queries";
import { ClientCase } from "@/lib/models/ClientCase";

export const metadata: Metadata = {
  title: "Chat",
  robots: { index: false, follow: false },
};

export default async function PortalChannelPage({
  params,
}: {
  params: Promise<{ caseId: string; channelId: string }>;
}) {
  const { caseId, channelId } = await params;
  const client = await requireClient(`/portal/cases/${caseId}/messages/${channelId}`);

  const accessible = await getAccessibleChannel(channelId, String(client._id));
  if (!accessible) notFound();
  const { channel, membership } = accessible;
  if (String(channel.case) !== caseId) notFound();

  const caseDoc = await ClientCase.findById(caseId).select("caseNumber").lean();
  if (!caseDoc) notFound();

  const [page, documentCenter] = await Promise.all([
    loadClientMessagesPage(channel._id, String(client._id)),
    getAccessibleDocumentCenter(caseId, String(client._id)),
  ]);

  const newestRoot = page.messages.filter((m) => !m.isOwn).at(-1);
  if (newestRoot) {
    await markChannelRead({ channel, workspaceMemberId: String(membership._id), lastReadMessageId: newestRoot.id });
  }

  const attachableDocuments = (documentCenter?.documents ?? [])
    .filter((d) => d.status !== "rejected" && d.currentVersion)
    .slice(0, 100)
    .map((d) => ({ documentId: String(d._id), displayName: d.displayName }));

  const trail = [
    { name: "Portal", href: "/portal" },
    { name: "Cases", href: "/portal/cases" },
    { name: caseDoc.caseNumber, href: `/portal/cases/${caseId}` },
    { name: "Chat", href: `/portal/cases/${caseId}/messages` },
    { name: channel.name, href: `/portal/cases/${caseId}/messages/${channelId}` },
  ];

  return (
    <Container width="default" className="py-10 sm:py-14">
      <PageHeader title={channel.name} description={channel.description} breadcrumbs={trail} />

      <div className="mt-8">
        <ChatPanel
          caseId={caseId}
          channelId={String(channel._id)}
          initialMessages={page.messages}
          initialNextCursor={page.nextCursor}
          initialSyncCursor={page.syncCursor}
          attachableDocuments={attachableDocuments}
        />
      </div>
    </Container>
  );
}
