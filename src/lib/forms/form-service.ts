import "server-only";

import mongoose from "mongoose";

import { CaseSmartForm } from "../models/CaseSmartForm";
import { SmartFormAudit } from "../models/SmartFormAudit";
import { CaseActivity } from "../models/CaseActivity";
import {
  CLIENT_EDITABLE_STATUSES,
  type AuditEventType,
  type FormStatus,
} from "../content/smart-form-constants";
import {
  computeProgress,
  normalizePatch,
  sectionsForClient,
  topLevelFields,
  validateForSubmit,
  type Answers,
  type FieldErrors,
  type FormSection,
  type Progress,
} from "./engine";

/**
 * Client side of Smart Forms (ADR-021 §11, §23). The portal may save its own
 * answers and submit; provisioning, staff edits and the review lifecycle are
 * Express. Mirrors server/services/smartForms/smartFormService.js for the
 * paths a client can reach: every write is `updateOne({ _id, revision, status })`
 * so a stale tab gets a conflict instead of overwriting.
 */

export type StoredForm = {
  _id: unknown;
  case: unknown;
  workspace: unknown;
  template: unknown;
  templateKey: string;
  templateVersion: number;
  templateTitleSnapshot: string;
  answers?: Answers;
  status: FormStatus;
  revision: number;
  progress?: Progress;
  lastSavedAt?: Date | null;
  submittedAt?: Date | null;
  approvedAt?: Date | null;
  lockedAt?: Date | null;
  clientReviewNote?: string;
  updatedAt?: Date;
};
export type StoredTemplate = { sections: FormSection[] };

export type ClientActor = { id: string; name: string };

export type FormOutcome =
  | { outcome: "saved"; form: StoredForm }
  | { outcome: "unchanged"; form: StoredForm }
  | { outcome: "validation_error"; errors: FieldErrors }
  | { outcome: "conflict" | "invalid_state"; current: { revision: number; status: FormStatus } | null };

const iso = (value?: Date | null) => (value ? new Date(value).toISOString() : null);

// ---------------------------------------------------------------------------
// DTOs — explicit, never the raw document. Staff-only definitions, staff-only
// answers and the internal review note are removed here and nowhere else.
// ---------------------------------------------------------------------------

export function toClientListItem(form: StoredForm) {
  return {
    id: String(form._id),
    caseId: String(form.case),
    title: form.templateTitleSnapshot,
    status: form.status,
    progress: form.progress ?? { completedRequired: 0, totalRequired: 0, percent: 0 },
    updatedAt: iso(form.updatedAt),
    submittedAt: iso(form.submittedAt),
  };
}

export function toClientDto(form: StoredForm, template: StoredTemplate) {
  const staffKeys = new Set(topLevelFields(template).filter((f) => f.staffOnly).map((f) => f.key));
  const answers = Object.fromEntries(Object.entries(form.answers ?? {}).filter(([key]) => !staffKeys.has(key)));
  const editable = CLIENT_EDITABLE_STATUSES.includes(form.status);
  return {
    ...toClientListItem(form),
    templateKey: form.templateKey,
    templateVersion: form.templateVersion,
    revision: form.revision,
    sections: sectionsForClient(template),
    answers,
    lastSavedAt: iso(form.lastSavedAt),
    approvedAt: iso(form.approvedAt),
    lockedAt: iso(form.lockedAt),
    // Shown only while the form is waiting on the client.
    clientReviewNote: form.status === "needs_changes" ? (form.clientReviewNote ?? "") : "",
    actions: { canEdit: editable, canSubmit: editable },
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

function precondition(form: StoredForm, expectedRevision: unknown): FormOutcome | null {
  if (!Number.isInteger(expectedRevision)) return { outcome: "validation_error", errors: { revision: "The current revision is required." } };
  const current = { revision: form.revision, status: form.status };
  if (form.revision !== expectedRevision) return { outcome: "conflict", current };
  if (!CLIENT_EDITABLE_STATUSES.includes(form.status)) return { outcome: "invalid_state", current };
  return null;
}

async function conflict(form: StoredForm): Promise<FormOutcome> {
  const current = (await CaseSmartForm.findById(form._id).select("revision status").lean()) as { revision: number; status: FormStatus } | null;
  return { outcome: "conflict", current: current ? { revision: current.revision, status: current.status } : null };
}

async function persist(form: StoredForm, expectedRevision: number, update: Record<string, unknown>): Promise<boolean> {
  const result = await CaseSmartForm.updateOne(
    { _id: form._id, revision: expectedRevision, status: { $in: CLIENT_EDITABLE_STATUSES } },
    { ...update, $inc: { revision: 1 } },
  );
  return result.matchedCount === 1;
}

async function recordAudit(form: StoredForm, eventType: AuditEventType, actor: ClientActor, details: { fromStatus: FormStatus; toStatus: FormStatus; revision: number; changedFieldKeys?: string[] }) {
  // Fail-open like the server recorder: an audit write must never undo the change it describes.
  try {
    await SmartFormAudit.create({
      caseSmartForm: form._id,
      case: form.case,
      workspace: form.workspace,
      eventType,
      ...details,
      actorType: "client",
      actorId: actor.id,
      actorName: actor.name,
    });
  } catch (err) {
    console.error("[smart-forms] audit write failed", (err as Error).message);
  }
}

/** Autosave of the client's own answers. */
export async function saveClientAnswers(params: {
  form: StoredForm;
  template: StoredTemplate;
  patch: unknown;
  expectedRevision: unknown;
  actor: ClientActor;
}): Promise<FormOutcome> {
  const { form, template, patch, actor } = params;
  const stop = precondition(form, params.expectedRevision);
  if (stop) return stop;
  const expectedRevision = params.expectedRevision as number;

  const { values, errors } = normalizePatch(template, patch, "client");
  if (Object.keys(errors).length) return { outcome: "validation_error", errors };
  const keys = Object.keys(values);
  if (!keys.length) return { outcome: "unchanged", form };

  const merged: Answers = { ...(form.answers ?? {}) };
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, ""> = {};
  for (const key of keys) {
    if (values[key] === undefined) {
      delete merged[key];
      $unset[`answers.${key}`] = "";
    } else {
      merged[key] = values[key];
      $set[`answers.${key}`] = values[key];
    }
  }
  Object.assign($set, {
    progress: computeProgress(template, merged),
    lastSavedAt: new Date(),
    lastSavedByType: "client",
    lastSavedById: new mongoose.Types.ObjectId(actor.id),
    lastSavedByName: actor.name,
  });

  const update: Record<string, unknown> = { $set };
  if (Object.keys($unset).length) update.$unset = $unset;
  if (!(await persist(form, expectedRevision, update))) return conflict(form);

  await recordAudit(form, "answers_saved", actor, { fromStatus: form.status, toStatus: form.status, revision: expectedRevision + 1, changedFieldKeys: keys });
  return { outcome: "saved", form: (await CaseSmartForm.findById(form._id).lean()) as StoredForm };
}

/** Client submit: authoritative validation first, then draft|needs_changes -> submitted. */
export async function submitClientForm(params: {
  form: StoredForm;
  template: StoredTemplate;
  expectedRevision: unknown;
  actor: ClientActor;
}): Promise<FormOutcome> {
  const { form, template, actor } = params;
  const stop = precondition(form, params.expectedRevision);
  if (stop) return stop;
  const expectedRevision = params.expectedRevision as number;

  const errors = validateForSubmit(template, form.answers);
  if (Object.keys(errors).length) return { outcome: "validation_error", errors };

  const update = { $set: { status: "submitted", submittedAt: new Date() } };
  if (!(await persist(form, expectedRevision, update))) return conflict(form);

  await recordAudit(form, "submitted", actor, { fromStatus: form.status, toStatus: "submitted", revision: expectedRevision + 1 });
  try {
    await CaseActivity.create({
      case: form.case,
      workspace: form.workspace,
      type: "form_submitted",
      message: `${actor.name} submitted "${form.templateTitleSnapshot}".`,
      // CaseActivity has no `client` actor type; the name still attributes the action.
      actorType: "system",
      actorName: actor.name,
    });
  } catch (err) {
    console.error("[smart-forms] activity write failed", (err as Error).message);
  }
  return { outcome: "saved", form: (await CaseSmartForm.findById(form._id).lean()) as StoredForm };
}
