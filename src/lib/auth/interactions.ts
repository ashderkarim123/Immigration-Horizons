import "server-only";

import mongoose from "mongoose";

import { getDb } from "../db";
import { ConsultationInteraction } from "../models/ConsultationInteraction";
import { InteractionHistory } from "../models/InteractionHistory";
import { InteractionUpdate } from "../models/InteractionUpdate";
import { WorkspaceMember } from "../models/WorkspaceMember";
import { generateInteractionNumber } from "./interaction-number";
import { notifyEmployee } from "../notifications/notification-service";
import type { InteractionType } from "../content/interaction-constants";

const MAX_ATTEMPTS = 5;

async function generateUniqueInteractionNumber(): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const candidate = generateInteractionNumber();
    const exists = await ConsultationInteraction.exists({ interactionNumber: candidate });
    if (!exists) return candidate;
  }
  throw new Error("Failed to generate a unique interaction number after several attempts.");
}

export type CreateInitialOutcome = "created" | "already_exists" | "deferred_no_client" | "failed";

/**
 * Called after a public consultation is persisted (module doc §14) — either
 * immediately (existing active client) or later, at activation time, once
 * a client account exists to attach it to (module doc: "the interaction
 * remains valid and is linked when the client relationship becomes
 * available" — mirrors ADR-002's WorkspaceMember activation pattern).
 * Idempotent: the unique partial index on (consultation, type:
 * 'initial_consultation') is the real guard.
 */
export async function createInitialConsultationInteraction(params: {
  consultationId: string;
  clientUserId: string | null;
  subject?: string;
  description?: string;
}): Promise<CreateInitialOutcome> {
  const db = getDb();
  if (!db) return "failed";
  await db;

  try {
    const existing = await ConsultationInteraction.findOne({
      consultation: params.consultationId,
      type: "initial_consultation",
    });
    if (existing) return "already_exists";

    if (!params.clientUserId) return "deferred_no_client";

    const interactionNumber = await generateUniqueInteractionNumber();
    const interaction = await ConsultationInteraction.create({
      interactionNumber,
      scopeType: "consultation",
      clientUser: params.clientUserId,
      consultation: params.consultationId,
      subject: params.subject || "Initial consultation request",
      description: params.description || "Submitted via the public consultation form.",
      type: "initial_consultation",
      status: "submitted",
      priority: "normal",
      createdByType: "system",
    });

    await InteractionHistory.create({
      interaction: interaction._id,
      eventType: "created",
      actorType: "system",
      actorName: "System",
      newStatus: "submitted",
      clientVisibleSummary: "Your consultation request was received.",
    });

    return "created";
  } catch (err: unknown) {
    const mongoErr = err as { code?: number };
    if (mongoErr && mongoErr.code === 11000) {
      // Lost a race to a concurrent call — the interaction now exists either way.
      return "already_exists";
    }
    console.error("[interactions] Failed to create initial interaction:", err);
    return "failed";
  }
}

export type CreateInteractionResult =
  | { outcome: "created"; interactionId: string }
  | { outcome: "validation_error"; message: string }
  | { outcome: "not_authorized" }
  | { outcome: "failed" };

/**
 * Client-facing query/scheduling-request submission. Validates scope
 * ownership server-side (never trusts a client-supplied case/consultation
 * id without checking it) — see ADR-003 §7.
 */
export async function createClientInteraction(params: {
  clientUserId: string;
  clientName: string;
  scopeType: "consultation" | "case";
  consultationId?: string;
  caseId?: string;
  workspaceId?: string;
  subject: string;
  description: string;
  type: InteractionType;
}): Promise<CreateInteractionResult> {
  const db = getDb();
  if (!db) return { outcome: "failed" };
  await db;

  if (!params.subject.trim() || !params.description.trim()) {
    return { outcome: "validation_error", message: "Subject and description are required." };
  }

  if (params.scopeType === "consultation") {
    if (!params.consultationId || !mongoose.Types.ObjectId.isValid(params.consultationId)) {
      return { outcome: "validation_error", message: "Invalid consultation reference." };
    }
    const { Consultation } = await import("../models/Consultation");
    const consultation = await Consultation.findOne({
      _id: params.consultationId,
      clientUser: params.clientUserId,
    }).select("_id");
    if (!consultation) return { outcome: "not_authorized" };
  } else {
    if (
      !params.caseId ||
      !params.workspaceId ||
      !mongoose.Types.ObjectId.isValid(params.caseId) ||
      !mongoose.Types.ObjectId.isValid(params.workspaceId)
    ) {
      return { outcome: "validation_error", message: "Invalid case reference." };
    }
    const membership = await WorkspaceMember.findOne({
      workspace: params.workspaceId,
      clientUser: params.clientUserId,
      memberType: "client",
      status: "active",
    });
    if (!membership) return { outcome: "not_authorized" };
  }

  try {
    const interactionNumber = await generateUniqueInteractionNumber();
    const interaction = await ConsultationInteraction.create({
      interactionNumber,
      scopeType: params.scopeType,
      clientUser: params.clientUserId,
      consultation: params.consultationId || null,
      case: params.scopeType === "case" ? params.caseId : null,
      workspace: params.scopeType === "case" ? params.workspaceId : null,
      subject: params.subject.trim(),
      description: params.description.trim(),
      type: params.type,
      status: "submitted",
      priority: "normal",
      createdByType: "client",
      createdByClient: params.clientUserId,
    });

    await InteractionHistory.create({
      interaction: interaction._id,
      eventType: "created",
      actorType: "client",
      actorClient: params.clientUserId,
      actorName: params.clientName,
      newStatus: "submitted",
      clientVisibleSummary: "Your request was submitted.",
    });

    return { outcome: "created", interactionId: String(interaction._id) };
  } catch (err) {
    console.error("[interactions] Failed to create client interaction:", err);
    return { outcome: "failed" };
  }
}

export type FollowUpResult = { outcome: "added" | "not_authorized" | "validation_error" | "failed"; message?: string };

/** Client follow-up — reopens an `awaiting_client` interaction back to `submitted` (module doc §13). */
export async function addClientFollowUp(
  interactionId: string,
  clientUserId: string,
  clientName: string,
  body: string,
): Promise<FollowUpResult> {
  const db = getDb();
  if (!db) return { outcome: "failed" };
  await db;

  if (!body || !body.trim()) {
    return { outcome: "validation_error", message: "Follow-up text is required." };
  }
  if (!mongoose.Types.ObjectId.isValid(interactionId)) return { outcome: "not_authorized" };

  const interaction = await ConsultationInteraction.findOne({
    _id: interactionId,
    clientUser: clientUserId,
  });
  if (!interaction) return { outcome: "not_authorized" };

  try {
    await InteractionUpdate.create({
      interaction: interaction._id,
      authorType: "client",
      authorClient: clientUserId,
      authorName: clientName,
      updateType: "client_follow_up",
      body: body.trim(),
      visibility: "client_visible",
    });

    const reopened = interaction.status === "awaiting_client";
    const previousStatus = interaction.status;
    if (reopened) {
      interaction.status = "submitted";
      await interaction.save();
    }

    await InteractionHistory.create({
      interaction: interaction._id,
      eventType: "client_follow_up",
      actorType: "client",
      actorClient: clientUserId,
      actorName: clientName,
      previousStatus: reopened ? previousStatus : undefined,
      newStatus: reopened ? "submitted" : undefined,
      clientVisibleSummary: "You added a follow-up.",
    });

    // Cycle 7 (ADR-006 §6) — mirrors server/services/interactionService.js's
    // identical notify() call for the employee-initiated path. recipientName
    // stays empty (AdminUser isn't mirrored in this app), same posture as
    // message-service.ts's client-authored employee notifications.
    if (interaction.assignedTo) {
      await notifyEmployee({
        adminUserId: interaction.assignedTo,
        title: `Client follow-up: ${interaction.interactionNumber}`,
        message: `${clientName} added a follow-up to "${interaction.subject}".`,
        type: "query_client_follow_up",
        relatedInteraction: interaction._id,
      });
    }

    return { outcome: "added" };
  } catch (err) {
    console.error("[interactions] Failed to add client follow-up:", err);
    return { outcome: "failed" };
  }
}

export type ResolutionResult = { outcome: "updated" | "not_authorized" | "failed" };

/** Client resolution confirmation — "Resolved" closes the interaction; "I need more help" reopens it (module doc §15). */
export async function confirmClientResolution(
  interactionId: string,
  clientUserId: string,
  clientName: string,
  resolved: boolean,
  note?: string,
): Promise<ResolutionResult> {
  const db = getDb();
  if (!db) return { outcome: "failed" };
  await db;

  if (!mongoose.Types.ObjectId.isValid(interactionId)) return { outcome: "not_authorized" };
  const interaction = await ConsultationInteraction.findOne({
    _id: interactionId,
    clientUser: clientUserId,
  });
  if (!interaction) return { outcome: "not_authorized" };

  try {
    const previousStatus = interaction.status;
    if (resolved) {
      interaction.clientResolutionStatus = "resolved";
      interaction.clientResolvedAt = new Date();
      interaction.clientResolutionNote = note || "";
      interaction.status = "closed";
      interaction.closedAt = new Date();
      await interaction.save();
      await InteractionHistory.create({
        interaction: interaction._id,
        eventType: "resolution_confirmed",
        actorType: "client",
        actorClient: clientUserId,
        actorName: clientName,
        previousStatus,
        newStatus: "closed",
        clientVisibleSummary: "You confirmed this was resolved.",
      });
    } else {
      interaction.clientResolutionStatus = "needs_more_help";
      interaction.clientResolutionNote = note || "";
      interaction.status = "in_progress";
      await interaction.save();
      await InteractionUpdate.create({
        interaction: interaction._id,
        authorType: "client",
        authorClient: clientUserId,
        authorName: clientName,
        updateType: "resolution_confirmation",
        body: note || "I need more help with this.",
        visibility: "client_visible",
      });
      await InteractionHistory.create({
        interaction: interaction._id,
        eventType: "resolution_reopened",
        actorType: "client",
        actorClient: clientUserId,
        actorName: clientName,
        previousStatus,
        newStatus: "in_progress",
        clientVisibleSummary: "You indicated you need more help.",
      });
      if (interaction.assignedTo) {
        await notifyEmployee({
          adminUserId: interaction.assignedTo,
          title: `Client needs more help: ${interaction.interactionNumber}`,
          message: `${clientName} indicated they still need help with "${interaction.subject}".`,
          type: "query_needs_more_help",
          relatedInteraction: interaction._id,
        });
      }
    }
    return { outcome: "updated" };
  } catch (err) {
    console.error("[interactions] Failed to confirm resolution:", err);
    return { outcome: "failed" };
  }
}
