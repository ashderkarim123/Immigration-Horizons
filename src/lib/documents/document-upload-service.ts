import "server-only";

import fsp from "fs/promises";
import mongoose from "mongoose";

import { CaseDocument } from "../models/CaseDocument";
import { DocumentVersion } from "../models/DocumentVersion";
import { DocumentCategory } from "../models/DocumentCategory";
import { DocumentRequest } from "../models/DocumentRequest";

import { withOptionalTransaction } from "../transaction";
import { LocalPrivateStorageProvider } from "./local-private-storage-provider";
import { scan } from "./scanner";
import { validateFileSignature, sanitizeDisplayName, maxFileSizeBytes } from "./document-validation";

// Lazy singleton — NOT constructed at module-evaluation time. Next.js's
// build step statically imports and evaluates every route module to
// collect page data, including in environments (like a local build without
// PRIVATE_DOCUMENT_ROOT set) that never actually serve a request. An eager
// `new LocalPrivateStorageProvider()` here made that build-time evaluation
// throw production's "must be set explicitly" guard before the app ever
// ran — found by `npm run build` failing on this exact route. Constructing
// lazily, on first real use, defers that guard to actual request handling,
// where it belongs.
let _provider: LocalPrivateStorageProvider | null = null;
export function getStorageProvider(): LocalPrivateStorageProvider {
  if (!_provider) _provider = new LocalPrivateStorageProvider();
  return _provider;
}

function isVersionConflict(err: unknown): boolean {
  return err instanceof mongoose.Error.VersionError;
}

/** Mirrors server/services/documentUploadService.js's saveGuarded (ADR-004 §20). */
export async function saveGuarded(doc: InstanceType<typeof CaseDocument>): Promise<void> {
  try {
    await doc.save();
  } catch (err) {
    if (isVersionConflict(err)) {
      const conflictError = new Error("This document was updated by someone else. Please reload and try again.") as Error & {
        isVersionConflict: boolean;
      };
      conflictError.isVersionConflict = true;
      throw conflictError;
    }
    throw err;
  }
}

async function cleanupOnRejection(storageKey: string) {
  await getStorageProvider().deleteTemp(storageKey).catch(() => {});
}

async function cleanupOnCommitFailure(storageKey: string, quarantined: boolean) {
  if (quarantined) {
    await getStorageProvider().deleteQuarantined(storageKey).catch(() => {});
  } else {
    await getStorageProvider().delete(storageKey).catch(() => {});
  }
}

type ValidatedCommit =
  | { outcome: "validation_error"; errors: Record<string, string> }
  | { outcome: "duplicate_detected"; documentId: string }
  | {
      outcome: "validated";
      size: number;
      checksum: string;
      quarantined: boolean;
      scanStatus: string;
      scanMessage: string;
      detectedMimeType: string;
    };

async function validateAndCommit(params: {
  storageKey: string;
  caseId: string;
  category: { _id: unknown; visibility: string };
  extension: string;
  declaredMimeType: string;
}): Promise<ValidatedCommit> {
  const { storageKey, caseId, category, extension, declaredMimeType } = params;
  const tempPath = getStorageProvider().resolveTempPath(storageKey);
  const stat = await fsp.stat(tempPath);
  const size = stat.size;

  if (size > maxFileSizeBytes()) {
    await cleanupOnRejection(storageKey);
    return {
      outcome: "validation_error",
      errors: { file: `File exceeds the maximum allowed size (${Math.floor(maxFileSizeBytes() / (1024 * 1024))}MB).` },
    };
  }

  const buffer = await fsp.readFile(tempPath);
  const signatureResult = await validateFileSignature({ declaredMimeType, extension, buffer });
  if (!signatureResult.valid) {
    await cleanupOnRejection(storageKey);
    return { outcome: "validation_error", errors: { file: signatureResult.reason } };
  }

  const crypto = await import("crypto");
  const checksum = crypto.createHash("sha256").update(buffer).digest("hex");

  const duplicate = await CaseDocument.findOne({
    case: caseId,
    checksum,
    category: category._id,
    status: { $ne: "archived" },
  }).lean();
  if (duplicate) {
    await cleanupOnRejection(storageKey);
    return { outcome: "duplicate_detected", documentId: String((duplicate as { _id: unknown })._id) };
  }

  const scanResult = await scan();
  const quarantined = scanResult.status === "infected" || scanResult.status === "error";
  if (quarantined) {
    await getStorageProvider().quarantine(storageKey);
  } else {
    await getStorageProvider().put(storageKey);
  }

  return {
    outcome: "validated",
    size,
    checksum,
    quarantined,
    scanStatus: scanResult.status,
    scanMessage: scanResult.message,
    detectedMimeType: signatureResult.detectedMimeType,
  };
}

export type UploadDocumentParams = {
  caseId: string;
  workspaceId: string;
  categoryId: string;
  documentRequestId?: string | null;
  storageKey: string;
  originalName: string;
  declaredMimeType: string;
  extension: string;
  clientUserId: string;
};

export async function uploadDocument(params: UploadDocumentParams) {
  const { caseId, workspaceId, categoryId, documentRequestId, storageKey, originalName, declaredMimeType, extension, clientUserId } =
    params;

  const category = await DocumentCategory.findOne({ _id: categoryId, case: caseId, active: true });
  if (!category) {
    await cleanupOnRejection(storageKey);
    return { outcome: "validation_error" as const, errors: { category: "This category is not available for this case." } };
  }
  if (category.allowedUploaderTypes !== "both" && category.allowedUploaderTypes !== "client") {
    await cleanupOnRejection(storageKey);
    return { outcome: "validation_error" as const, errors: { category: "This category does not accept client uploads." } };
  }

  let request: InstanceType<typeof DocumentRequest> | null = null;
  if (documentRequestId) {
    request = await DocumentRequest.findOne({ _id: documentRequestId, case: caseId, requestedFrom: { $exists: true } });
    if (!request) {
      await cleanupOnRejection(storageKey);
      return { outcome: "validation_error" as const, errors: { documentRequest: "Request not found for this case." } };
    }
    if (String(request.category) !== String(categoryId)) {
      await cleanupOnRejection(storageKey);
      return { outcome: "validation_error" as const, errors: { category: "This upload must use the requested category." } };
    }
  }

  const validated = await validateAndCommit({ storageKey, caseId, category, extension, declaredMimeType });
  if (validated.outcome !== "validated") return validated;

  const { size, checksum, quarantined, scanStatus, scanMessage, detectedMimeType } = validated;
  const displayName = sanitizeDisplayName(originalName);

  let document;
  let version;
  try {
    const { result } = await withOptionalTransaction(async (session) => {
      const createdDocument = (
        await CaseDocument.create(
          [
            {
              case: caseId,
              workspace: workspaceId,
              category: categoryId,
              uploadedByType: "client",
              uploadedByClient: clientUserId,
              originalName,
              displayName,
              storageKey,
              mimeType: declaredMimeType,
              detectedMimeType,
              extension,
              size,
              checksum,
              status: quarantined ? "quarantined" : "uploaded",
              visibility: category.visibility,
              scanStatus,
              scanProvider: "none",
              scanCompletedAt: new Date(),
              scanMessage: scanMessage || "",
              versionCount: 1,
              documentRequest: request ? request._id : null,
              uploadedAt: new Date(),
            },
          ],
          { session: session || undefined },
        )
      )[0];

      const createdVersion = (
        await DocumentVersion.create(
          [
            {
              document: createdDocument._id,
              versionNumber: 1,
              storageKey,
              originalName,
              displayName,
              mimeType: declaredMimeType,
              detectedMimeType,
              extension,
              size,
              checksum,
              uploadedByType: "client",
              uploadedByClient: clientUserId,
              scanStatus,
            },
          ],
          { session: session || undefined },
        )
      )[0];

      createdDocument.currentVersion = createdVersion._id;
      await createdDocument.save({ session: session || undefined });

      if (request && request.status !== "fulfilled") {
        request.status = "uploaded";
        await request.save({ session: session || undefined });
      }

      return { createdDocument, createdVersion };
    });
    document = result.createdDocument;
    version = result.createdVersion;
  } catch (err) {
    await cleanupOnCommitFailure(storageKey, quarantined);
    throw err;
  }

  return { outcome: "created" as const, document, version, quarantined };
}

export type ReplaceVersionParams = {
  documentId: string;
  storageKey: string;
  originalName: string;
  declaredMimeType: string;
  extension: string;
  clientUserId: string;
  changeNote?: string;
};

export async function replaceDocumentVersion(params: ReplaceVersionParams) {
  const { documentId, storageKey, originalName, declaredMimeType, extension, clientUserId, changeNote } = params;

  const document = await CaseDocument.findById(documentId);
  if (!document || document.status === "archived") {
    await cleanupOnRejection(storageKey);
    return { outcome: "not_found" as const };
  }
  // Only the client who uploaded the current chain, via an active
  // membership already verified by the caller (document-policy.ts), may
  // replace it — this function trusts the caller did that check.

  const category = await DocumentCategory.findById(document.category);
  if (!category) {
    await cleanupOnRejection(storageKey);
    return { outcome: "not_found" as const };
  }

  const validated = await validateAndCommit({ storageKey, caseId: String(document.case), category, extension, declaredMimeType });
  if (validated.outcome !== "validated") return validated;

  const { size, checksum, quarantined, scanStatus, scanMessage, detectedMimeType } = validated;
  const displayName = sanitizeDisplayName(originalName);
  const nextVersionNumber = document.versionCount + 1;

  let version;
  try {
    const { result } = await withOptionalTransaction(async (session) => {
      const createdVersion = (
        await DocumentVersion.create(
          [
            {
              document: document._id,
              versionNumber: nextVersionNumber,
              storageKey,
              originalName,
              displayName,
              mimeType: declaredMimeType,
              detectedMimeType,
              extension,
              size,
              checksum,
              uploadedByType: "client",
              uploadedByClient: clientUserId,
              changeNote: changeNote || "",
              scanStatus,
            },
          ],
          { session: session || undefined },
        )
      )[0];

      document.currentVersion = createdVersion._id;
      document.versionCount = nextVersionNumber;
      document.originalName = originalName;
      document.displayName = displayName;
      document.storageKey = storageKey;
      document.mimeType = declaredMimeType;
      document.detectedMimeType = detectedMimeType;
      document.extension = extension;
      document.size = size;
      document.checksum = checksum;
      document.status = quarantined ? "quarantined" : "pending_review";
      document.scanStatus = scanStatus;
      document.scanCompletedAt = new Date();
      document.scanMessage = scanMessage || "";
      document.reviewedBy = null;
      document.reviewedAt = null;
      document.clientVisibleReviewComment = "";
      document.internalReviewComment = "";

      await saveGuarded(document);

      if (document.documentRequest) {
        const request = await DocumentRequest.findById(document.documentRequest).session(session || null);
        if (request && request.status !== "fulfilled") {
          request.status = "uploaded";
          await request.save({ session: session || undefined });
        }
      }

      return { createdVersion };
    });
    version = result.createdVersion;
  } catch (err) {
    await cleanupOnCommitFailure(storageKey, quarantined);
    throw err;
  }

  return { outcome: "replaced" as const, document, version, quarantined };
}
