import "server-only";

import { WorkspaceChannel } from "../models/WorkspaceChannel";
import { WorkspaceMessage } from "../models/WorkspaceMessage";

/**
 * Durable system-message emission for staff-initiated case changes
 * (ADR-010 §6). Mirrors `server/services/systemMessageService.js` — the
 * same channel template keys, the same idempotency keys, the same bodies —
 * so a stage change made in the SaaS app and one made in the admin CMS
 * produce an identical client-facing message.
 *
 * Two properties are deliberate and load-bearing:
 *
 *  - **It never throws.** A workspace whose collaboration channels were
 *    never provisioned (a pre-Cycle-6 case) must not fail the case
 *    mutation that triggered this call.
 *  - **It is idempotent** on `(channel, idempotencyKey)`, which is a
 *    unique index. A double-submitted stage change emits one message.
 *
 * The client message service (`collaboration/message-service.ts`) is not
 * reused here: it hard-codes `senderType: "client"` because that is the
 * only sender a client route can ever be. Widening it to take a sender
 * type would put an employee/system code path inside the module that
 * serves client input, which is the wrong place for it.
 */
async function emitSystemMessage(params: {
  workspaceId: unknown;
  channelTemplateKey: string;
  body: string;
  clientVisible: boolean;
  idempotencyKey: string;
}) {
  try {
    const channel = await WorkspaceChannel.findOne({
      workspace: params.workspaceId,
      templateKey: params.channelTemplateKey,
      archivedAt: null,
    })
      .select("_id workspace case")
      .lean();
    if (!channel) return null;

    const record = channel as Record<string, unknown>;

    const existing = await WorkspaceMessage.findOne({
      channel: record._id,
      idempotencyKey: params.idempotencyKey,
    })
      .select("_id")
      .lean();
    if (existing) return existing;

    return await WorkspaceMessage.create({
      workspace: record.workspace,
      case: record.case,
      channel: record._id,
      senderType: "system",
      senderDisplayName: "System",
      body: params.body,
      messageType: "case_update",
      clientVisible: params.clientVisible,
      idempotencyKey: params.idempotencyKey,
    });
  } catch (err) {
    console.error(
      `[staff-collaboration] system message emission failed (${params.channelTemplateKey}):`,
      (err as Error).message,
    );
    return null;
  }
}

/** Case stage changed — case-updates channel, client-visible. */
export async function emitCaseStageChangedMessage(params: {
  workspaceId: unknown;
  caseId: unknown;
  clientStageLabel: string;
  changedAtIso: string;
}) {
  return emitSystemMessage({
    workspaceId: params.workspaceId,
    channelTemplateKey: "case_updates",
    body: `Case status updated: ${params.clientStageLabel}.`,
    clientVisible: true,
    idempotencyKey: `stage_changed:${params.caseId}:${params.changedAtIso}`,
  });
}

/** Workspace member added — general channel, client-visible. */
export async function emitMemberAddedMessage(params: {
  workspaceId: unknown;
  workspaceMemberId: unknown;
  memberDisplayName: string;
}) {
  return emitSystemMessage({
    workspaceId: params.workspaceId,
    channelTemplateKey: "general",
    body: `${params.memberDisplayName} was added to this case.`,
    clientVisible: true,
    idempotencyKey: `member_added:${params.workspaceMemberId}`,
  });
}
