import "server-only";

import mongoose from "mongoose";

import { getDb } from "../db";
import { WorkspaceMember } from "../models/WorkspaceMember";
import { CaseSmartForm } from "../models/CaseSmartForm";
import { SmartFormTemplate } from "../models/SmartFormTemplate";
import type { StoredForm, StoredTemplate } from "../forms/form-service";

/**
 * Row-level Smart Forms access for the client portal (ADR-021 §14). Same shape
 * as document-policy.ts: the boundary is an active client `WorkspaceMember` on
 * the form's workspace, re-checked on every request, never `primaryClient`
 * alone. A form that is missing, malformed-id, or on someone else's case
 * returns the identical `null`.
 */
export async function getAccessibleForm(
  formId: string,
  clientUserId: string,
): Promise<{ form: StoredForm; template: StoredTemplate } | null> {
  if (!mongoose.Types.ObjectId.isValid(formId)) return null;

  const db = getDb();
  if (!db) return null;
  await db;

  const form = (await CaseSmartForm.findById(formId).lean()) as StoredForm | null;
  if (!form) return null;

  const membership = await WorkspaceMember.findOne({
    workspace: form.workspace,
    clientUser: clientUserId,
    memberType: "client",
    status: "active",
  }).lean();
  if (!membership) return null;

  const template = (await SmartFormTemplate.findById(form.template).lean()) as StoredTemplate | null;
  return template ? { form, template } : null;
}
