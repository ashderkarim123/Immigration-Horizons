import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Container } from "@/components/ui/container";
import { Breadcrumbs } from "@/components/service/breadcrumbs";
import { MessageComposer } from "@/components/portal/message-composer";
import { MessageActions } from "@/components/portal/message-actions";
import { requireClient } from "@/lib/auth/current-client";
import { getAccessibleChannel } from "@/lib/auth/collaboration-policy";
import { serializeMessage } from "@/lib/collaboration/message-service";
import { WorkspaceMessage } from "@/lib/models/WorkspaceMessage";
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

  const rootDoc = await WorkspaceMessage.findOne({ _id: messageId, channel: channel._id }).lean();
  if (!rootDoc) notFound();

  const caseDoc = await ClientCase.findById(caseId).select("caseNumber").lean();
  if (!caseDoc) notFound();

  const repliesDocs = await WorkspaceMessage.find({ threadRoot: rootDoc._id }).sort({ createdAt: 1, _id: 1 }).limit(50).lean();

  const rootMessage = serializeMessage(rootDoc);
  const replies = repliesDocs.map(serializeMessage);

  const trail = [
    { name: "Portal", path: "/portal" },
    { name: "Cases", path: "/portal/cases" },
    { name: caseDoc.caseNumber, path: `/portal/cases/${caseId}` },
    { name: "Messages", path: `/portal/cases/${caseId}/messages` },
    { name: channel.name, path: `/portal/cases/${caseId}/messages/${channelId}` },
    { name: "Thread", path: `/portal/cases/${caseId}/messages/${channelId}/threads/${messageId}` },
  ];

  return (
    <Container width="default" className="py-16 sm:py-20">
      <Breadcrumbs trail={trail} className="mb-8" />

      <h1 className="font-display text-navy-900 text-2xl font-semibold sm:text-3xl">Thread</h1>

      <div className="rounded-panel border-ink-200 mt-6 border bg-white p-5 shadow-subtle">
        <p className="text-navy-800 text-sm font-semibold">{rootMessage.senderDisplayName}</p>
        <p className="text-ink-700 mt-2 whitespace-pre-wrap text-sm">{rootMessage.body}</p>
      </div>

      <div className="mt-6 flex flex-col gap-4">
        {replies.map((message) => (
          <div key={message.id} className="rounded-panel border-ink-200 ml-6 border bg-white p-4 shadow-subtle">
            <div className="flex items-center justify-between">
              <p className="text-navy-800 text-sm font-semibold">{message.senderDisplayName}</p>
              <span className="text-ink-400 text-xs">{new Date(message.createdAt).toLocaleString()}</span>
            </div>
            <p className="text-ink-700 mt-2 whitespace-pre-wrap text-sm">{message.body}</p>
            {message.senderType === "client" && !message.deletedAt ? (
              <div className="mt-2">
                <MessageActions messageId={message.id} />
              </div>
            ) : null}
          </div>
        ))}
        {replies.length === 0 ? <p className="text-ink-500 ml-6 text-sm">No replies yet.</p> : null}
      </div>

      <div className="mt-6 ml-6">
        <MessageComposer parentMessageId={rootMessage.id} placeholder="Reply…" />
      </div>
    </Container>
  );
}
