import "server-only";

import mongoose from "mongoose";

import { getDb } from "../db";
import { ClientCase } from "../models/ClientCase";
import { CaseWorkspace } from "../models/CaseWorkspace";
import { WorkspaceMember } from "../models/WorkspaceMember";
import { DocumentCategory } from "../models/DocumentCategory";
import { CaseDocument } from "../models/CaseDocument";
import { DocumentRequest } from "../models/DocumentRequest";

/**
 * Row-level document access for the client portal — same shape as
 * case-policy.ts (ADR-004 §14): the authorization boundary is an active
 * `WorkspaceMember`, re-checked on every read, never `ClientCase.primaryClient`
 * alone and never cached. A different client's document and a nonexistent
 * one return the identical `null`.
 */

async function activeMembership(workspaceId: string, clientUserId: string) {
  return WorkspaceMember.findOne({
    workspace: workspaceId,
    clientUser: clientUserId,
    memberType: "client",
    status: "active",
  }).lean();
}

export async function getAccessibleDocumentCenter(caseId: string, clientUserId: string) {
  if (!mongoose.Types.ObjectId.isValid(caseId)) return null;

  const db = getDb();
  if (!db) return null;
  await db;

  const caseDoc = await ClientCase.findById(caseId).lean();
  if (!caseDoc) return null;

  const workspace = await CaseWorkspace.findOne({ case: caseDoc._id, workspaceType: "primary" }).lean();
  if (!workspace) return null;

  const membership = await activeMembership(String(workspace._id), clientUserId);
  if (!membership) return null;

  const [categories, documents, requests] = await Promise.all([
    DocumentCategory.find({ case: caseDoc._id, active: true, visibility: "client_visible" })
      .sort({ order: 1 })
      .lean(),
    CaseDocument.find({
      case: caseDoc._id,
      visibility: "client_visible",
      status: { $nin: ["quarantined", "archived"] },
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean(),
    DocumentRequest.find({ case: caseDoc._id, requestedFrom: membership._id, status: { $ne: "cancelled" } })
      .sort({ dueDate: 1 })
      .lean(),
  ]);

  return { caseDoc, workspace, membership, categories, documents, requests };
}

/**
 * Single document, only when it's client-visible, not quarantined, and the
 * client holds an active membership on its workspace. Knowing the document
 * id alone is never sufficient — every field of this chain is re-verified.
 */
export async function getAccessibleDocument(documentId: string, clientUserId: string) {
  if (!mongoose.Types.ObjectId.isValid(documentId)) return null;

  const db = getDb();
  if (!db) return null;
  await db;

  const document = await CaseDocument.findById(documentId).lean();
  if (!document) return null;
  if (document.visibility !== "client_visible") return null;
  if (document.status === "quarantined") return null;

  const membership = await activeMembership(String(document.workspace), clientUserId);
  if (!membership) return null;

  return { document, membership };
}

/** Used by the upload API route to verify a category accepts a client upload before running the pipeline. */
export async function getUploadableCategory(categoryId: string, caseId: string, clientUserId: string) {
  const center = await getAccessibleDocumentCenter(caseId, clientUserId);
  if (!center) return null;
  const category = center.categories.find((c) => String(c._id) === categoryId);
  if (!category) return null;
  if (category.allowedUploaderTypes !== "both" && category.allowedUploaderTypes !== "client") return null;
  return { category, workspace: center.workspace, membership: center.membership };
}

/** Used by the request-fulfillment upload route — the request must belong to THIS client's own membership. */
export async function getFulfillableRequest(requestId: string, clientUserId: string) {
  if (!mongoose.Types.ObjectId.isValid(requestId)) return null;

  const db = getDb();
  if (!db) return null;
  await db;

  const request = await DocumentRequest.findById(requestId).lean();
  if (!request) return null;

  const membership = await WorkspaceMember.findOne({
    _id: request.requestedFrom,
    clientUser: clientUserId,
    memberType: "client",
    status: "active",
  }).lean();
  if (!membership) return null;

  const workspace = await CaseWorkspace.findById(request.workspace).lean();
  if (!workspace) return null;

  return { request, workspace };
}
