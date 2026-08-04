import "server-only";

import { CaseDocument } from "../models/CaseDocument";
import { DocumentVersion } from "../models/DocumentVersion";
import { DocumentAccessLog } from "../models/DocumentAccessLog";
import { getStorageProvider } from "./document-upload-service";

/**
 * Mirrors server/services/documentDownloadService.js — every portal
 * download goes through this one, audited path (ADR-004 §14/§16). The
 * caller (the download Route Handler) must already have verified the
 * document is client-accessible via document-policy.ts's
 * `getAccessibleDocument()` before calling this.
 */
export async function resolveDownload(params: {
  documentId: string;
  clientUserId: string;
  clientName: string;
}) {
  const { documentId, clientUserId, clientName } = params;

  const document = await CaseDocument.findById(documentId);
  if (!document) return { outcome: "not_found" as const };

  const version = await DocumentVersion.findById(document.currentVersion);
  if (!version) {
    await DocumentAccessLog.create({
      document: document._id,
      case: document.case,
      actorType: "client",
      actorClient: clientUserId,
      actorName: clientName,
      result: "not_found",
    });
    return { outcome: "not_found" as const };
  }

  if (document.status === "quarantined") {
    await DocumentAccessLog.create({
      document: document._id,
      version: version._id,
      case: document.case,
      actorType: "client",
      actorClient: clientUserId,
      actorName: clientName,
      result: "denied",
    });
    return { outcome: "denied" as const };
  }

  let stream;
  try {
    stream = await getStorageProvider().getStream(version.storageKey);
  } catch {
    await DocumentAccessLog.create({
      document: document._id,
      version: version._id,
      case: document.case,
      actorType: "client",
      actorClient: clientUserId,
      actorName: clientName,
      result: "not_found",
    });
    return { outcome: "not_found" as const };
  }

  await DocumentAccessLog.create({
    document: document._id,
    version: version._id,
    case: document.case,
    actorType: "client",
    actorClient: clientUserId,
    actorName: clientName,
    result: "success",
  });

  return {
    outcome: "ok" as const,
    stream,
    filename: version.displayName as string,
    contentType: version.detectedMimeType as string,
  };
}
