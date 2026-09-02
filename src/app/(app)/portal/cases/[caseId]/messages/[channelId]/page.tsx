import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Container } from "@/components/ui/container";
import { PageHeader } from "@/components/app/page-header";
import { MessageComposer } from "@/components/portal/message-composer";
import { MessageActions } from "@/components/portal/message-actions";
import { requireClient } from "@/lib/auth/current-client";
import { getAccessibleChannel } from "@/lib/auth/collaboration-policy";
import { markChannelRead } from "@/lib/collaboration/read-state-service";
import { serializeMessage } from "@/lib/collaboration/message-service";
import { WorkspaceMessage } from "@/lib/models/WorkspaceMessage";
import { ClientCase } from "@/lib/models/ClientCase";

export const metadata: Metadata = {
  title: "Channel",
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

  const rawMessages = await WorkspaceMessage.find({ channel: channel._id, parentMessage: null })
    .sort({ createdAt: -1, _id: -1 })
    .limit(50)
    .lean();
  const messages = rawMessages.map(serializeMessage).reverse();

  if (rawMessages[0]) {
    await markChannelRead({ channel, workspaceMemberId: String(membership._id), lastReadMessageId: String(rawMessages[0]._id) });
  }

  const trail = [
    { name: "Portal", href: "/portal" },
    { name: "Cases", href: "/portal/cases" },
    { name: caseDoc.caseNumber, href: `/portal/cases/${caseId}` },
    { name: "Messages", href: `/portal/cases/${caseId}/messages` },
    { name: channel.name, href: `/portal/cases/${caseId}/messages/${channelId}` },
  ];

  return (
    <Container width="default" className="py-10 sm:py-14">
      <PageHeader title={channel.name} description={channel.description} breadcrumbs={trail} />

      <div className="mt-8 flex flex-col gap-4">
        {messages.map((message) => (
          <div key={message.id} className="rounded-panel border-ink-200 border bg-white p-5 shadow-subtle">
            <div className="flex items-center justify-between">
              <p className="text-navy-800 text-sm font-semibold">
                {message.senderDisplayName}
                {message.senderType === "system" ? <span className="text-ink-400 ml-2 text-xs">System</span> : null}
              </p>
              <span className="text-ink-400 text-xs">
                {new Date(message.createdAt).toLocaleString()}
                {message.editedAt ? " (edited)" : null}
              </span>
            </div>
            <p className="text-ink-700 mt-2 whitespace-pre-wrap text-sm">{message.body}</p>

            {message.attachments.length > 0 ? (
              <div className="mt-3 flex flex-col gap-1">
                {message.attachments.map((a) => (
                  <a key={a.documentId} href={`/portal/documents/${a.documentId}/download`} className="text-navy-700 text-xs font-medium hover:underline">
                    📎 {a.displayName}
                  </a>
                ))}
              </div>
            ) : null}

            <div className="mt-3 flex items-center gap-3">
              <Link href={`/portal/cases/${caseId}/messages/${channelId}/threads/${message.threadRoot ?? message.id}`} className="text-navy-700 text-xs font-medium hover:underline">
                {message.replyCount > 0 ? `${message.replyCount} ${message.replyCount === 1 ? "reply" : "replies"}` : "Reply"}
              </Link>
              {message.senderType === "client" && !message.deletedAt ? <MessageActions messageId={message.id} /> : null}
            </div>
          </div>
        ))}
        {messages.length === 0 ? <p className="text-ink-500 text-sm">No messages yet.</p> : null}
      </div>

      <div className="mt-6">
        <MessageComposer channelId={String(channel._id)} />
      </div>
    </Container>
  );
}
