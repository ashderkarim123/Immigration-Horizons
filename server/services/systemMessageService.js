const WorkspaceChannel = require('../models/WorkspaceChannel');
const { createMessage } = require('./messageService');

/**
 * Durable system-message generation — a small, explicit set of real
 * integration points, not a generic event bus (ADR-005 §18). Silently
 * no-ops (never throws) when the target channel isn't provisioned for
 * this workspace (e.g. a pre-Cycle-6 case that hasn't been backfilled
 * yet) — a missing collaboration channel must never fail the case/
 * document/consultation mutation that triggered this call.
 */
async function emitSystemMessage({ workspaceId, channelTemplateKey, messageType, body, clientVisible, idempotencyKey }) {
  try {
    const channel = await WorkspaceChannel.findOne({
      workspace: workspaceId,
      templateKey: channelTemplateKey,
      archivedAt: null,
    });
    if (!channel) return null;

    const result = await createMessage({
      channel,
      senderType: 'system',
      senderDisplayName: 'System',
      body,
      messageType,
      idempotencyKey,
      clientVisible,
    });
    return result.outcome === 'created' ? result.message : null;
  } catch (err) {
    console.error(`[collaboration] system message emission failed (${channelTemplateKey}/${messageType}):`, err.message);
    return null;
  }
}

/** Workspace member added — general channel, client-visible. */
async function emitMemberAddedMessage({ workspaceId, workspaceMemberId, memberDisplayName }) {
  return emitSystemMessage({
    workspaceId,
    channelTemplateKey: 'general',
    messageType: 'case_update',
    body: `${memberDisplayName} was added to this case.`,
    clientVisible: true,
    idempotencyKey: `member_added:${workspaceMemberId}`,
  });
}

/** Case stage changed — case updates channel, client-visible (client-facing stage label is the caller's job). */
async function emitCaseStageChangedMessage({ workspaceId, caseId, clientStageLabel, changedAtIso }) {
  return emitSystemMessage({
    workspaceId,
    channelTemplateKey: 'case_updates',
    messageType: 'case_update',
    body: `Case status updated: ${clientStageLabel}.`,
    clientVisible: true,
    idempotencyKey: `stage_changed:${caseId}:${changedAtIso}`,
  });
}

/** Document uploaded (initial or replacement) — documents channel, client-visible only when the document itself is. */
async function emitDocumentUploadedMessage({ workspaceId, documentId, versionNumber, displayName, clientVisible }) {
  return emitSystemMessage({
    workspaceId,
    channelTemplateKey: 'documents',
    messageType: 'document_update',
    body: `"${displayName}" was uploaded${versionNumber > 1 ? ' (replacement)' : ''}.`,
    clientVisible,
    idempotencyKey: `document_uploaded:${documentId}:v${versionNumber}`,
  });
}

/** Document reviewed (accepted or needs_replacement) — documents channel, always client-visible (a client must be told the outcome of their own submission). */
async function emitDocumentReviewedMessage({ workspaceId, documentId, displayName, decision, reviewedAtIso }) {
  const verb = decision === 'accepted' ? 'accepted' : decision === 'needs_replacement' ? 'flagged for replacement' : 'reviewed';
  return emitSystemMessage({
    workspaceId,
    channelTemplateKey: 'documents',
    messageType: 'document_update',
    body: `"${displayName}" was ${verb}.`,
    clientVisible: true,
    idempotencyKey: `document_reviewed:${documentId}:${reviewedAtIso}`,
  });
}

/**
 * A staff-authored, deliberately published client-visible update (Cycle 8 —
 * ADR-007 §6). Unlike every emitter above, this one carries operator-typed
 * text rather than a generated sentence, so the idempotency key is derived
 * from the publish timestamp: two identical updates published minutes apart
 * are two legitimately distinct updates, not a retry to collapse.
 */
async function emitClientUpdateMessage({ workspaceId, caseId, body, publishedAtIso }) {
  return emitSystemMessage({
    workspaceId,
    channelTemplateKey: 'case_updates',
    messageType: 'case_update',
    body,
    clientVisible: true,
    idempotencyKey: `client_update:${caseId}:${publishedAtIso}`,
  });
}

module.exports = {
  emitSystemMessage,
  emitMemberAddedMessage,
  emitCaseStageChangedMessage,
  emitDocumentUploadedMessage,
  emitDocumentReviewedMessage,
  emitClientUpdateMessage,
};
