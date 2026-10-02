import "server-only";
import { listAccessibleCases } from "../auth/case-policy";
import { getAccessibleDocumentCenter } from "../auth/document-policy";
import { getAccessibleMessageCenter } from "../auth/collaboration-policy";
import { getUnreadCountsForChannels } from "../collaboration/read-state-service";
import { CaseSmartForm } from "../models/CaseSmartForm";

export type ClientAction = { key: string; label: string; detail: string; href: string; dueDate: string | null };

/** Reuses live membership/channel policy. This DTO contains no answers, staff
 * notes, private channels, storage keys, or internal review comments. */
export async function listClientActions(clientUserId: string): Promise<ClientAction[]> {
  const cases = await listAccessibleCases(clientUserId);
  const groups = await Promise.all(cases.filter(c => !c.archivedAt).map(async c => {
    const caseId = String(c._id);
    const [documents, messages, forms] = await Promise.all([
      getAccessibleDocumentCenter(caseId, clientUserId),
      getAccessibleMessageCenter(caseId, clientUserId),
      CaseSmartForm.find({ case: c._id, status: { $in: ['draft', 'needs_changes'] } }).select('templateTitleSnapshot status clientReviewNote').lean(),
    ]);
    const actions: ClientAction[] = [];
    for (const request of documents?.requests ?? []) {
      if (!['open', 'replacement_required'].includes(request.status)) continue;
      actions.push({ key: `request-${request._id}`, label: `Upload ${request.title}`, detail: request.clientVisibleComment || request.instructions || c.title, href: `/portal/cases/${caseId}/documents#request-${request._id}`, dueDate: request.dueDate ? new Date(request.dueDate).toISOString() : null });
    }
    for (const document of documents?.documents ?? []) {
      if (document.status !== 'needs_replacement') continue;
      actions.push({ key: `replacement-${document._id}`, label: `Replace ${document.displayName}`, detail: document.clientVisibleReviewComment || 'Your team needs an updated copy.', href: `/portal/cases/${caseId}/documents/${document._id}`, dueDate: null });
    }
    for (const form of forms) {
      actions.push({ key: `form-${form._id}`, label: `${form.status === 'needs_changes' ? 'Update' : 'Complete'} ${form.templateTitleSnapshot}`, detail: form.clientReviewNote || c.title, href: `/portal/cases/${caseId}/forms/${form._id}`, dueDate: null });
    }
    if (messages) {
      const counts = await getUnreadCountsForChannels({ channelIds: messages.channels.map(channel => channel._id), workspaceMemberId: String(messages.membership._id), selfClientId: clientUserId });
      for (const channel of messages.channels) {
        const count = counts[String(channel._id)] || 0;
        if (count) actions.push({ key: `message-${channel._id}`, label: `Read ${count} new ${count === 1 ? 'message' : 'messages'}`, detail: `${c.title} · ${channel.name}`, href: `/portal/cases/${caseId}/messages/${channel._id}`, dueDate: null });
      }
    }
    return actions;
  }));
  return groups.flat().sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
}
