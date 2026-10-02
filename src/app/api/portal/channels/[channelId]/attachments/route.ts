import "server-only";

import { getDb } from "../../../../../../lib/db";
import { ClientUser } from "../../../../../../lib/models/ClientUser";
import { CaseDocument } from "../../../../../../lib/models/CaseDocument";
import { getSessionActor } from "../../../../../../lib/auth/session";
import { verifyOrigin } from "../../../../../../lib/auth/csrf";
import { isRateLimited } from "../../../../../../lib/rate-limit";
import { jsonError, jsonOk } from "../../../../../../lib/auth/http";
import { getAccessibleChannel } from "../../../../../../lib/auth/collaboration-policy";
import { extensionOf } from "../../../../../../lib/documents/document-validation";
import { getStorageProvider, uploadDocument } from "../../../../../../lib/documents/document-upload-service";
import { ensureChatAttachmentsCategory } from "../../../../../../lib/documents/chat-attachments";

/**
 * Direct file attach from the chat composer (ADR-020 §9). Authorises the
 * channel, then runs the SAME secure pipeline as the Documents page
 * (size / extension / magic-byte validation, private storage, CaseDocument +
 * DocumentVersion). The message is sent separately and only references the
 * stored document, so a failed send never re-uploads and a retried upload of
 * the same bytes reuses the document instead of duplicating it.
 */
export async function POST(request: Request, { params }: { params: Promise<{ channelId: string }> }): Promise<Response> {
  if (!verifyOrigin(request)) return jsonError("forbidden", "Request rejected.");
  if (await isRateLimited("portal-chat-attach", request, 15)) {
    return jsonError("rate_limited", "Too many requests. Please try again later.");
  }

  const actor = await getSessionActor(request);
  if (!actor) return jsonError("unauthenticated", "Please log in.");

  const db = getDb();
  if (!db) return jsonError("server_error", "Service temporarily unavailable.");
  await db;

  const client = await ClientUser.findById(actor.clientUserId);
  if (!client || client.status !== "active") return jsonError("unauthenticated", "Please log in.");

  const { channelId } = await params;
  const accessible = await getAccessibleChannel(channelId, String(client._id));
  if (!accessible) return jsonError("not_found", "That channel could not be found.");
  const { channel } = accessible;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("invalid_input", "Invalid form data.");
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return jsonError("invalid_input", "A file is required.");

  const provider = getStorageProvider();
  const storageKey = provider.generateStorageKey();
  try {
    await provider.writeTempFile(file.stream(), storageKey);

    const category = await ensureChatAttachmentsCategory({ caseId: channel.case, workspaceId: channel.workspace });
    const result = await uploadDocument({
      caseId: String(channel.case),
      workspaceId: String(channel.workspace),
      categoryId: String(category._id),
      storageKey,
      originalName: file.name,
      declaredMimeType: file.type,
      extension: extensionOf(file.name),
      clientUserId: String(client._id),
    });

    if (result.outcome === "validation_error") return jsonError("unprocessable", Object.values(result.errors)[0]);

    let document;
    let reused = false;
    if (result.outcome === "duplicate_detected") {
      // Same bytes already stored in this category. Reuse only the client's own, still-visible upload;
      // anything else gets the generic refusal so it cannot confirm another party's file exists.
      const existing = await CaseDocument.findById(result.documentId).lean();
      if (!existing || existing.visibility !== "client_visible" || String(existing.uploadedByClient) !== String(client._id)) {
        return jsonError("conflict", "This file has already been uploaded to this case.");
      }
      document = existing;
      reused = true;
    } else if (result.quarantined) {
      return jsonError("unprocessable", "The file failed the security scan and was not attached.");
    } else {
      document = result.document;
    }

    return jsonOk(
      {
        reused,
        attachment: {
          documentId: String(document._id),
          displayName: document.displayName,
          mimeType: document.detectedMimeType || document.mimeType,
          extension: document.extension,
          size: document.size,
        },
      },
      { status: reused ? 200 : 201 },
    );
  } finally {
    // uploadDocument consumes the temp file on every path it handles; this covers a throw before/inside it.
    await provider.deleteTemp(storageKey).catch(() => {});
  }
}
