import "server-only";

import { getDb } from "../../../../../../lib/db";
import { ClientUser } from "../../../../../../lib/models/ClientUser";
import { getSessionActor } from "../../../../../../lib/auth/session";
import { verifyOrigin } from "../../../../../../lib/auth/csrf";
import { isRateLimited } from "../../../../../../lib/rate-limit";
import { jsonError, jsonOk } from "../../../../../../lib/auth/http";
import { getFulfillableRequest } from "../../../../../../lib/auth/document-policy";
import { extensionOf } from "../../../../../../lib/documents/document-validation";
import { getStorageProvider, uploadDocument } from "../../../../../../lib/documents/document-upload-service";

/**
 * Fulfills a specific, named document request — module doc §21's dedicated
 * request-fulfillment route, distinct from the general per-category upload
 * (POST /api/portal/cases/[caseId]/documents) so a client on a "please
 * upload X" screen doesn't need to separately know the case id or category.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
): Promise<Response> {
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

  const { requestId } = await params;

  // A different client's request and a nonexistent one return the
  // identical not_found — never confirm/deny another client's request id.
  const fulfillable = await getFulfillableRequest(requestId, String(client._id));
  if (!fulfillable) return jsonError("not_found", "That request could not be found.");

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

  const storageKey = getStorageProvider().generateStorageKey();
  await getStorageProvider().writeTempFile(file.stream(), storageKey);

  const result = await uploadDocument({
    caseId: String(fulfillable.request.case),
    workspaceId: String(fulfillable.workspace._id),
    categoryId: String(fulfillable.request.category),
    documentRequestId: requestId,
    storageKey,
    originalName: file.name,
    declaredMimeType: file.type,
    extension: extensionOf(file.name),
    clientUserId: String(client._id),
  });

  if (result.outcome === "validation_error") return jsonError("unprocessable", Object.values(result.errors)[0]);
  if (result.outcome === "duplicate_detected") {
    return jsonError("conflict", "This exact file has already been uploaded for this request.");
  }

  return jsonOk({
    documentId: String(result.document._id),
    redirectTo: `/portal/cases/${fulfillable.request.case}/documents/${result.document._id}`,
  });
}
