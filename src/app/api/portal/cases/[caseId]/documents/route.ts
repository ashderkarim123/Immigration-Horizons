import "server-only";

import { getDb } from "../../../../../../lib/db";
import { ClientUser } from "../../../../../../lib/models/ClientUser";
import { getSessionActor } from "../../../../../../lib/auth/session";
import { verifyOrigin } from "../../../../../../lib/auth/csrf";
import { isRateLimited } from "../../../../../../lib/rate-limit";
import { jsonError, jsonOk } from "../../../../../../lib/auth/http";
import { getUploadableCategory, getAccessibleDocument } from "../../../../../../lib/auth/document-policy";
import { extensionOf, maxFilesPerRequest } from "../../../../../../lib/documents/document-validation";
import { getStorageProvider, uploadDocument, replaceDocumentVersion } from "../../../../../../lib/documents/document-upload-service";

/**
 * Client document upload — handles both a brand-new upload into a category
 * and a replacement of an existing document (when `replaceDocumentId` is
 * present), matching module doc §21's minimal client route list rather than
 * adding a second endpoint for what is, from the storage/versioning layer's
 * point of view, the same operation with a different target.
 */
export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }): Promise<Response> {
  if (!verifyOrigin(request)) return jsonError("forbidden", "Request rejected.");
  if (await isRateLimited("portal-document-upload", request)) {
    return jsonError("rate_limited", "Too many requests. Please try again later.");
  }

  const actor = await getSessionActor(request);
  if (!actor) return jsonError("unauthenticated", "Please log in.");

  const db = getDb();
  if (!db) return jsonError("server_error", "Service temporarily unavailable.");
  await db;

  const client = await ClientUser.findById(actor.clientUserId);
  if (!client || client.status !== "active") return jsonError("unauthenticated", "Please log in.");

  const { caseId } = await params;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("invalid_input", "Invalid form data.");
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return jsonError("invalid_input", "A file is required.");
  }
  // Bounded — a single-file form only ever produces one entry, but this
  // guards against a future multi-file form field without a matching
  // server-side limit (module doc §8).
  if (formData.getAll("file").length > maxFilesPerRequest()) {
    return jsonError("invalid_input", "Too many files in one request.");
  }

  const categoryId = formData.get("categoryId");
  const documentRequestId = formData.get("documentRequestId");
  const replaceDocumentId = formData.get("replaceDocumentId");

  const storageKey = getStorageProvider().generateStorageKey();
  await getStorageProvider().writeTempFile(file.stream(), storageKey);

  const extension = extensionOf(file.name);

  if (typeof replaceDocumentId === "string" && replaceDocumentId) {
    const accessible = await getAccessibleDocument(replaceDocumentId, String(client._id));
    if (!accessible) {
      await getStorageProvider().deleteTemp(storageKey).catch(() => {});
      return jsonError("not_found", "That document could not be found.");
    }

    const result = await replaceDocumentVersion({
      documentId: replaceDocumentId,
      storageKey,
      originalName: file.name,
      declaredMimeType: file.type,
      extension,
      clientUserId: String(client._id),
    });

    if (result.outcome === "not_found") return jsonError("not_found", "That document could not be found.");
    if (result.outcome === "validation_error") return jsonError("unprocessable", Object.values(result.errors)[0]);
    if (result.outcome === "duplicate_detected") {
      return jsonError("conflict", "This exact file has already been uploaded for this category.");
    }
    return jsonOk({ documentId: String(result.document._id), redirectTo: `/portal/cases/${caseId}/documents/${result.document._id}` });
  }

  if (typeof categoryId !== "string" || !categoryId) {
    await getStorageProvider().deleteTemp(storageKey).catch(() => {});
    return jsonError("invalid_input", "A category is required.");
  }

  const uploadable = await getUploadableCategory(categoryId, caseId, String(client._id));
  if (!uploadable) {
    await getStorageProvider().deleteTemp(storageKey).catch(() => {});
    return jsonError("not_found", "That category could not be found.");
  }

  const result = await uploadDocument({
    caseId,
    workspaceId: String(uploadable.workspace._id),
    categoryId,
    documentRequestId: typeof documentRequestId === "string" ? documentRequestId : null,
    storageKey,
    originalName: file.name,
    declaredMimeType: file.type,
    extension,
    clientUserId: String(client._id),
  });

  if (result.outcome === "validation_error") return jsonError("unprocessable", Object.values(result.errors)[0]);
  if (result.outcome === "duplicate_detected") {
    return jsonError("conflict", "This exact file has already been uploaded for this category.");
  }

  return jsonOk({ documentId: String(result.document._id), redirectTo: `/portal/cases/${caseId}/documents/${result.document._id}` });
}
