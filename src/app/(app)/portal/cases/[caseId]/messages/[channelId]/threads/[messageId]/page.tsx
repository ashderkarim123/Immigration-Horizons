import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Container } from "@/components/ui/container";
import { PageHeader } from "@/components/app/page-header";
import { ChatPanel } from "@/components/portal/chat-panel";
import { requireClient } from "@/lib/auth/current-client";
import { getAccessibleChannel } from "@/lib/auth/collaboration-policy";
import { getAccessibleDocumentCenter } from "@/lib/auth/document-policy";
import { loadClientThread } from "@/lib/collaboration/chat-queries";
import { ClientCase } from "@/lib/models/ClientCase";

export const metadata: Metadata = {
  title: "Thread",
  robots: { index: false, follow: false },
};

export default async function PortalThreadPage({
  params,
}: {
  params: Promise<{ caseId: string; channelId: string; messageId: string }>;
}) {
  const { caseId, channelId, messageId } = await params;
  const client = await requireClient(`/portal/cases/${caseId}/messages/${channelId}/threads/${messageId}`);

  const accessible = await getAccessibleChannel(channelId, String(client._id));
  if (!accessible) notFound();
  const { channel } = accessible;
  if (String(channel.case) !== caseId) notFound();

  const [thread, caseDoc, documentCenter] = await Promise.all([
    loadClientThread(channel._id, messageId, String(client._id)),
    ClientCase.findById(caseId).select("caseNumber").lean(),
    getAccessibleDocumentCenter(caseId, String(client._id)),
  ]);
  if (!thread || !caseDoc) notFound();

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
    { name: "Thread", href: `/portal/cases/${caseId}/messages/${channelId}/threads/${messageId}` },
  ];

  return (
    <Container width="default" className="py-10 sm:py-14">
      <PageHeader title="Thread" description="This conversation and every reply to it." breadcrumbs={trail} />

      <div className="mt-8">
        <ChatPanel
          caseId={caseId}
          channelId={String(channel._id)}
          threadRootId={thread.root.id}
          initialMessages={[thread.root, ...thread.replies]}
          initialNextCursor={null}
          initialSyncCursor={thread.syncCursor}
          attachableDocuments={attachableDocuments}
          placeholder="Reply…"
        />
      </div>
    </Container>
  );
}
