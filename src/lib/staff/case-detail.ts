import "server-only";

import { CaseDocument } from "../models/CaseDocument";
import { DocumentRequest } from "../models/DocumentRequest";
import { DocumentCategory } from "../models/DocumentCategory";
import { ConsultationInteraction } from "../models/ConsultationInteraction";
import { WorkspaceChannel } from "../models/WorkspaceChannel";
import { WorkspaceMessage } from "../models/WorkspaceMessage";
import { Task } from "../models/Task";
import { CaseActivity } from "../models/CaseActivity";
import { AdminUser } from "../models/AdminUser";
import { ClientUser } from "../models/ClientUser";
import { roleHasCapability } from "../auth/capabilities";
import { listWorkspaceMembers, type WorkspaceMemberRow } from "../auth/employee-case-policy";
import type { EmployeeActor } from "../auth/actors";

/**
 * The staff case workspace read model (ADR-010 §5).
 *
 * Called only after `getAccessibleCaseWorkspace` has already granted
 * access to this case — so this module's job is the *second* gate: each
 * panel is additionally gated on the capability that governs it, and
 * returns `null` (not `[]`) when the role does not hold it. The UI renders
 * "not your remit" for null and an honest empty state for `[]`; collapsing
 * the two would tell a specialist a case has no documents when really
 * they just cannot see documents.
 *
 * Every query is bounded. A case with a thousand messages must not render
 * a thousand rows.
 */

const PANEL_LIMIT = 20;
const ACTIVITY_LIMIT = 30;

export type CaseDetailBundle = {
  members: WorkspaceMemberRow[];
  projectManagerName: string | null;
  primaryClientName: string | null;
  documents: Record<string, unknown>[] | null;
  documentRequests: Record<string, unknown>[] | null;
  categoryNames: Map<string, string>;
  queries: Record<string, unknown>[] | null;
  channels: Record<string, unknown>[] | null;
  recentMessages: Record<string, unknown>[] | null;
  tasks: Record<string, unknown>[];
  activity: Record<string, unknown>[] | null;
  /** Team members who could be added or made project manager. */
  assignableEmployees: { id: string; name: string; role: string }[];
};

export async function getCaseDetailForEmployee(
  caseDoc: Record<string, unknown>,
  workspace: Record<string, unknown>,
  actor: EmployeeActor,
): Promise<CaseDetailBundle> {
  const can = (capability: string) => roleHasCapability(actor.role, capability);

  const canSeeDocuments = can("documents.view");
  const canSeeQueries = can("queries.view");
  const canSeeChannels = can("channels.view");
  // The timeline names who did what to this case. It is management
  // information, so it follows `cases.manage` rather than `cases.view`.
  const canSeeActivity = can("cases.manage");
  const canAssign = can("cases.assign") || can("workspace.members.manage");

  const [
    members,
    documents,
    documentRequests,
    queries,
    channels,
    recentMessages,
    tasks,
    activity,
    assignable,
    primaryClient,
    projectManager,
  ] = await Promise.all([
    listWorkspaceMembers(workspace._id, caseDoc.projectManager),

    canSeeDocuments
      ? CaseDocument.find({ case: caseDoc._id, archivedAt: null })
          .select("displayName status category uploadedAt uploadedByType size versionCount scanStatus")
          .sort({ uploadedAt: -1 })
          .limit(PANEL_LIMIT)
          .lean()
      : Promise.resolve(null),

    canSeeDocuments
      ? DocumentRequest.find({ case: caseDoc._id, status: { $ne: "cancelled" } })
          .select("title status dueDate category fulfilledAt createdAt")
          .sort({ dueDate: 1, createdAt: -1 })
          .limit(PANEL_LIMIT)
          .lean()
      : Promise.resolve(null),

    canSeeQueries
      ? ConsultationInteraction.find({ case: caseDoc._id })
          .select("interactionNumber subject type status priority scheduledFor assignedTo createdAt")
          .sort({ createdAt: -1 })
          .limit(PANEL_LIMIT)
          .lean()
      : Promise.resolve(null),

    // Employees who can reach this case see its INTERNAL channels too —
    // that is the difference between this and the client message centre,
    // which filters to CLIENT_ACCESSIBLE_VISIBILITY. Access to the case
    // was already established; visibility here is channel-level.
    canSeeChannels
      ? WorkspaceChannel.find({ workspace: workspace._id, archivedAt: null })
          .select("name slug channelType visibility description order")
          .sort({ order: 1 })
          .lean()
      : Promise.resolve(null),

    canSeeChannels
      ? WorkspaceMessage.find({ case: caseDoc._id, deletedAt: null })
          .select("body senderType senderDisplayName channel createdAt messageType clientVisible")
          .sort({ createdAt: -1 })
          .limit(PANEL_LIMIT)
          .lean()
      : Promise.resolve(null),

    // Tasks are lead-scoped, not case-scoped (ADR-009 §"Not built"):
    // `Task.lead` references the originating Consultation. A case with no
    // originating consultation therefore has no tasks, which is honest
    // rather than a bug to paper over.
    caseDoc.consultation
      ? Task.find({ lead: caseDoc.consultation })
          .select("title type status priority dueDate assigneeName")
          .sort({ dueDate: 1, createdAt: -1 })
          .limit(PANEL_LIMIT)
          .lean()
      : Promise.resolve([]),

    canSeeActivity
      ? CaseActivity.find({ case: caseDoc._id })
          .select("type message actorName createdAt")
          .sort({ createdAt: -1 })
          .limit(ACTIVITY_LIMIT)
          .lean()
      : Promise.resolve(null),

    canAssign
      ? AdminUser.find({ isActive: true }).select("name role").sort({ name: 1 }).limit(100).lean()
      : Promise.resolve([]),

    ClientUser.findById(caseDoc.primaryClient).select("firstName lastName email").lean(),

    caseDoc.projectManager
      ? AdminUser.findById(caseDoc.projectManager).select("name").lean()
      : Promise.resolve(null),
  ]);

  const categoryIds = [
    ...(documents ?? []).map((d) => d.category),
    ...(documentRequests ?? []).map((r) => r.category),
  ].filter(Boolean);

  const categories = categoryIds.length
    ? await DocumentCategory.find({ _id: { $in: categoryIds } }).select("name").lean()
    : [];

  const clientRecord = primaryClient as Record<string, unknown> | null;
  const clientName = clientRecord
    ? [clientRecord.firstName, clientRecord.lastName].filter(Boolean).join(" ").trim() ||
      String(clientRecord.email || "")
    : null;

  return {
    members,
    projectManagerName: (projectManager as { name?: string } | null)?.name ?? null,
    primaryClientName: clientName,
    documents: documents as Record<string, unknown>[] | null,
    documentRequests: documentRequests as Record<string, unknown>[] | null,
    categoryNames: new Map(
      (categories as Record<string, unknown>[]).map((c) => [String(c._id), String(c.name)]),
    ),
    queries: queries as Record<string, unknown>[] | null,
    channels: channels as Record<string, unknown>[] | null,
    recentMessages: recentMessages as Record<string, unknown>[] | null,
    tasks: tasks as Record<string, unknown>[],
    activity: activity as Record<string, unknown>[] | null,
    assignableEmployees: (assignable as Record<string, unknown>[]).map((u) => ({
      id: String(u._id),
      name: String(u.name),
      role: String(u.role || ""),
    })),
  };
}
