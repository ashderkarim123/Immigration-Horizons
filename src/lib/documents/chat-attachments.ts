import "server-only";

import { DocumentCategory } from "../models/DocumentCategory";

const CHAT_ATTACHMENTS = {
  templateKey: "chat_attachments",
  name: "Chat Attachments",
  slug: "chat-attachments",
  description: "Files attached directly from case chat.",
} as const;

/**
 * Idempotently provisions the per-case "Chat Attachments" category the first
 * time a file is attached from chat (ADR-020 §10). Mirrors
 * server/services/documentCategoryService.js: a normal client-visible
 * category open to both uploader types, created lazily so existing cases
 * need no backfill. A concurrent first use loses the unique-index race and
 * re-reads the winner.
 */
export async function ensureChatAttachmentsCategory(params: { caseId: unknown; workspaceId: unknown }) {
  const { caseId, workspaceId } = params;
  const find = () => DocumentCategory.findOne({ case: caseId, templateKey: CHAT_ATTACHMENTS.templateKey, active: true });

  const existing = await find();
  if (existing) return existing;

  const highest = await DocumentCategory.findOne({ case: caseId }).sort({ order: -1 }).select("order").lean();
  try {
    return await DocumentCategory.create({
      case: caseId,
      workspace: workspaceId,
      ...CHAT_ATTACHMENTS,
      order: (highest ? (highest as { order: number }).order : 0) + 1,
      visibility: "client_visible",
      allowedUploaderTypes: "both",
      required: false,
      active: true,
      createdBy: null,
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      const winner = await find();
      if (winner) return winner;
    }
    throw err;
  }
}
