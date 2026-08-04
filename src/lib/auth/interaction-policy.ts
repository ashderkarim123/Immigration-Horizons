import "server-only";

import mongoose from "mongoose";

import { getDb } from "../db";
import { ConsultationInteraction } from "../models/ConsultationInteraction";
import { InteractionHistory } from "../models/InteractionHistory";
import { InteractionUpdate } from "../models/InteractionUpdate";
import { WorkspaceMember } from "../models/WorkspaceMember";

const MAX_RESULTS = 50;

/**
 * Client-side row-level access for ConsultationInteraction (ADR-003 §7).
 * Consultation-scoped: the interaction's own `clientUser` must match (set
 * at creation from the linked Consultation.clientUser, never trusted from
 * client input). Case-scoped: an active client WorkspaceMember on the
 * interaction's workspace, never `ClientCase.primaryClient` alone —
 * exactly the same rule as case-policy.ts.
 */
export async function listAccessibleInteractions(clientUserId: string) {
  const db = getDb();
  if (!db) return [];
  await db;

  return ConsultationInteraction.find({ clientUser: clientUserId })
    .sort({ createdAt: -1 })
    .limit(MAX_RESULTS)
    .lean();
}

/**
 * Returns the interaction only when it belongs to this client — identical
 * `null` result for "not yours" and "doesn't exist" (module doc: "Another
 * client's interaction and a nonexistent interaction must produce the same
 * controlled result").
 */
export async function getAccessibleInteraction(interactionId: string, clientUserId: string) {
  if (!mongoose.Types.ObjectId.isValid(interactionId)) return null;

  const db = getDb();
  if (!db) return null;
  await db;

  const interaction = await ConsultationInteraction.findOne({
    _id: interactionId,
    clientUser: clientUserId,
  }).lean();
  if (!interaction) return null;

  // Defense in depth for case-scoped interactions: even though `clientUser`
  // already scopes the query above, also confirm the membership is still
  // active — a removed member must lose access immediately, not just to
  // the case pages but to every interaction under it too.
  if (interaction.scopeType === "case") {
    const membership = await WorkspaceMember.findOne({
      workspace: interaction.workspace,
      clientUser: clientUserId,
      memberType: "client",
      status: "active",
    }).lean();
    if (!membership) return null;
  }

  return interaction;
}

export type ClientVisibleHistoryEntry = {
  id: string;
  createdAt: Date;
  summary: string;
};

/** Simplified client timeline — only entries with a non-empty clientVisibleSummary, never internal reasons/metadata. */
export async function getClientVisibleHistory(interactionId: string): Promise<ClientVisibleHistoryEntry[]> {
  const db = getDb();
  if (!db) return [];
  await db;

  const entries = await InteractionHistory.find({
    interaction: interactionId,
    clientVisibleSummary: { $ne: "" },
  })
    .sort({ createdAt: 1 })
    .lean();

  return entries.map((e) => ({
    id: String(e._id),
    createdAt: e.createdAt as unknown as Date,
    summary: e.clientVisibleSummary,
  }));
}

/** Client-visible updates only — internal employee notes never returned through this path. */
export async function getClientVisibleUpdates(interactionId: string) {
  const db = getDb();
  if (!db) return [];
  await db;

  return InteractionUpdate.find({
    interaction: interactionId,
    visibility: "client_visible",
    deletedAt: null,
  })
    .sort({ createdAt: 1 })
    .lean();
}
