const mongoose = require('mongoose');

const SmartFormTemplate = require('../../models/SmartFormTemplate');
const CaseSmartForm = require('../../models/CaseSmartForm');
const SmartFormAudit = require('../../models/SmartFormAudit');
const CaseActivity = require('../../models/CaseActivity');
const ClientUser = require('../../models/ClientUser');
const { CLIENT_EDITABLE_STATUSES, STAFF_EDITABLE_STATUSES, MAX_REVIEW_NOTE_LENGTH } = require('../../utils/smartFormConstants');
const engine = require('./engine');
const { seedTemplates } = require('./templateSeeder');

/**
 * Smart Forms domain service (ADR-021 §9–§18, §20–§21). Authorization is the
 * caller's job (route policy for staff, portal policy for clients); this file
 * owns what a change MEANS: normalise, validate, move state, bump the revision
 * atomically and leave an audit row. Every mutation takes `expectedRevision`
 * and writes with `updateOne({ _id, revision, status })` — never doc.save() —
 * so a stale write is reported as a conflict instead of overwriting.
 *
 * Outcomes: 'saved' | 'unchanged' | 'validation_error' | 'conflict' | 'invalid_state'.
 */

/** Deterministic, low-risk prefill (ADR-021 §21): ClientUser value -> template field key. */
const PREFILL = {
  given_name: (client) => client.firstName,
  family_name: (client) => client.lastName,
  email: (client) => client.email,
  phone: (client) => client.phone,
};

/** What each lifecycle action does. `from` is the only place a state transition is defined. */
const TRANSITIONS = {
  submit: { from: ['draft', 'needs_changes'], to: 'submitted', audit: 'submitted', stamp: 'submittedAt', activity: 'form_submitted', verb: 'submitted', validate: true },
  return: { from: ['submitted', 'approved'], to: 'needs_changes', audit: 'returned_for_changes', stamp: 'returnedAt', activity: 'form_returned', verb: 'returned for changes', needsNote: true },
  approve: { from: ['submitted'], to: 'approved', audit: 'approved', stamp: 'approvedAt', activity: 'form_approved', verb: 'approved', validate: true },
  lock: { from: ['approved'], to: 'locked', audit: 'locked', stamp: 'lockedAt', activity: 'form_locked', verb: 'locked' },
};

const asObjectId = (value) => (mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(String(value)) : null);

async function recordAudit(form, eventType, { fromStatus = null, toStatus = null, revision, changedFieldKeys = [], actor }) {
  // Fail-open like SecurityEvent: an audit write must never undo the change it describes.
  try {
    await SmartFormAudit.create({
      caseSmartForm: form._id,
      case: form.case,
      workspace: form.workspace,
      eventType,
      fromStatus,
      toStatus,
      revision,
      changedFieldKeys,
      actorType: actor.type,
      actorId: actor.id || null,
      actorName: actor.name || '',
    });
  } catch (err) {
    console.error('[smart-forms] audit write failed', err.message);
  }
}

async function recordActivity(form, type, message, actor) {
  try {
    await CaseActivity.record({
      caseId: form.case,
      workspaceId: form.workspace,
      type,
      message,
      // CaseActivity has no `client` actor type; the name still attributes the action.
      actor: { type: actor.type === 'employee' ? 'admin_user' : 'system', id: actor.type === 'employee' ? actor.id : null, name: actor.name },
    });
  } catch (err) {
    console.error('[smart-forms] activity write failed', err.message);
  }
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

async function loadForm(formId) {
  if (!mongoose.Types.ObjectId.isValid(formId)) return null;
  const form = await CaseSmartForm.findById(formId).lean();
  if (!form) return null;
  const template = await SmartFormTemplate.findById(form.template).lean();
  return template ? { form, template } : null;
}

const listCaseForms = (caseId) => CaseSmartForm.find({ case: caseId }).sort({ templateKey: 1 }).lean();

// ---------------------------------------------------------------------------
// Provisioning (idempotent per case + template key)
// ---------------------------------------------------------------------------

function prefillAnswers(template, client) {
  const answers = {};
  if (!client) return answers;
  for (const field of engine.topLevelFields(template)) {
    const source = PREFILL[field.key];
    if (!source || field.staffOnly) continue;
    const { value } = engine.normalizeValue(field, source(client), false);
    if (value !== undefined) answers[field.key] = value;
  }
  return answers;
}

async function provisionForms({ caseDoc, workspace, actor }) {
  await seedTemplates();
  const eligible = await SmartFormTemplate.find({ status: 'published', caseTypes: caseDoc.caseType }).sort({ key: 1, version: -1 }).lean();
  const latest = new Map();
  for (const template of eligible) if (!latest.has(template.key)) latest.set(template.key, template);

  const client = await ClientUser.findById(caseDoc.primaryClient).select('firstName lastName email phone').lean();
  const created = [];
  const existing = [];

  for (const template of latest.values()) {
    // One instance per template key per case: a later template version only applies to new cases.
    if (await CaseSmartForm.exists({ case: caseDoc._id, templateKey: template.key })) {
      existing.push(template.key);
      continue;
    }
    const answers = prefillAnswers(template, client);
    try {
      const form = await CaseSmartForm.create({
        case: caseDoc._id,
        workspace: workspace._id,
        template: template._id,
        templateKey: template.key,
        templateVersion: template.version,
        templateTitleSnapshot: template.title,
        answers,
        progress: engine.computeProgress(template, answers),
        lastSavedByType: 'system',
      });
      created.push(template.key);
      await recordAudit(form, 'form_provisioned', { toStatus: 'draft', revision: 1, changedFieldKeys: Object.keys(answers), actor });
      await recordActivity(form, 'form_provisioned', `Form "${template.title}" was added to the case.`, actor);
    } catch (err) {
      if (!(err && err.code === 11000)) throw err; // lost a concurrent provision: the winner already created it
      existing.push(template.key);
    }
  }
  return { created, existing };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

async function conflict(form) {
  const current = await CaseSmartForm.findById(form._id).select('revision status').lean();
  return { outcome: 'conflict', current: current ? { revision: current.revision, status: current.status } : null };
}

/** Preconditions shared by every mutation. Returns an outcome to stop on, or null to proceed. */
function precondition(form, expectedRevision, allowedStatuses) {
  if (!Number.isInteger(expectedRevision)) return { outcome: 'validation_error', errors: { revision: 'The current revision is required.' } };
  if (form.revision !== expectedRevision) return { outcome: 'conflict', current: { revision: form.revision, status: form.status } };
  if (!allowedStatuses.includes(form.status)) return { outcome: 'invalid_state', current: { revision: form.revision, status: form.status } };
  return null;
}

async function persist(form, expectedRevision, allowedStatuses, update) {
  const result = await CaseSmartForm.updateOne(
    { _id: form._id, revision: expectedRevision, status: { $in: allowedStatuses } },
    { ...update, $inc: { revision: 1 } },
  );
  return result.matchedCount === 1;
}

/** Autosave / staff edit. `actor.type` is 'client' or 'employee'. */
async function saveAnswers({ form, template, patch, expectedRevision, actor }) {
  const allowed = actor.type === 'client' ? CLIENT_EDITABLE_STATUSES : STAFF_EDITABLE_STATUSES;
  const stop = precondition(form, expectedRevision, allowed);
  if (stop) return stop;

  const { values, errors } = engine.normalizePatch(template, patch, actor.type);
  if (Object.keys(errors).length) return { outcome: 'validation_error', errors };
  const keys = Object.keys(values);
  if (!keys.length) return { outcome: 'unchanged', form };

  const merged = { ...(form.answers || {}) };
  const $set = {};
  const $unset = {};
  for (const key of keys) {
    if (values[key] === undefined) {
      delete merged[key];
      $unset[`answers.${key}`] = '';
    } else {
      merged[key] = values[key];
      $set[`answers.${key}`] = values[key];
    }
  }
  Object.assign($set, {
    progress: engine.computeProgress(template, merged),
    lastSavedAt: new Date(),
    lastSavedByType: actor.type,
    lastSavedById: asObjectId(actor.id),
    lastSavedByName: actor.name || '',
  });

  const update = { $set };
  if (Object.keys($unset).length) update.$unset = $unset;
  if (!(await persist(form, expectedRevision, allowed, update))) return conflict(form);

  await recordAudit(form, 'answers_saved', { fromStatus: form.status, toStatus: form.status, revision: expectedRevision + 1, changedFieldKeys: keys, actor });
  return { outcome: 'saved', form: await CaseSmartForm.findById(form._id).lean() };
}

/** submit | return | approve | lock. `note` is the client-visible review note (return) — `internalNote` is staff-only. */
async function transition(action, { form, template, expectedRevision, actor, note = '', internalNote = '' }) {
  const rule = TRANSITIONS[action];
  const stop = precondition(form, expectedRevision, rule.from);
  if (stop) return stop;

  const clientNote = String(note || '').trim();
  const staffNote = String(internalNote || '').trim();
  if (rule.needsNote && !clientNote) return { outcome: 'validation_error', errors: { clientReviewNote: 'Tell the client what to change.' } };
  if (clientNote.length > MAX_REVIEW_NOTE_LENGTH || staffNote.length > MAX_REVIEW_NOTE_LENGTH) {
    return { outcome: 'validation_error', errors: { note: `Use at most ${MAX_REVIEW_NOTE_LENGTH} characters.` } };
  }
  if (rule.validate) {
    const errors = engine.validateForSubmit(template, form.answers);
    if (Object.keys(errors).length) return { outcome: 'validation_error', errors };
  }

  const now = new Date();
  const $set = { status: rule.to, [rule.stamp]: now };
  if (actor.type === 'employee') $set.reviewedBy = asObjectId(actor.id);
  if (action === 'return') Object.assign($set, { clientReviewNote: clientNote, internalReviewNote: staffNote || form.internalReviewNote || '' });
  if (action === 'approve') Object.assign($set, { clientReviewNote: '', internalReviewNote: staffNote || form.internalReviewNote || '' });
  if (action === 'lock') $set.lockedRevision = expectedRevision + 1;

  if (!(await persist(form, expectedRevision, rule.from, { $set }))) return conflict(form);

  await recordAudit(form, rule.audit, { fromStatus: form.status, toStatus: rule.to, revision: expectedRevision + 1, actor });
  await recordActivity(form, rule.activity, `${actor.name} ${rule.verb} "${form.templateTitleSnapshot}".`, actor);
  return { outcome: 'saved', form: await CaseSmartForm.findById(form._id).lean() };
}

const listAudit = (formId) => SmartFormAudit.find({ caseSmartForm: formId }).sort({ createdAt: -1 }).limit(100).lean();

// ---------------------------------------------------------------------------
// DTOs (staff). Never hand a Mongoose document or raw audit row to a route.
// ---------------------------------------------------------------------------

const iso = (value) => (value ? new Date(value).toISOString() : null);

function toListItem(form) {
  return {
    id: String(form._id),
    caseId: String(form.case),
    title: form.templateTitleSnapshot,
    templateKey: form.templateKey,
    templateVersion: form.templateVersion,
    status: form.status,
    revision: form.revision,
    progress: form.progress,
    updatedAt: iso(form.updatedAt),
    submittedAt: iso(form.submittedAt),
    approvedAt: iso(form.approvedAt),
    lockedAt: iso(form.lockedAt),
  };
}

/** `actions` is computed by the route from capabilities + status, so the UI never infers permission. */
function toStaffDto(form, template, actions) {
  return {
    ...toListItem(form),
    sections: template.sections,
    answers: form.answers || {},
    lastSavedAt: iso(form.lastSavedAt),
    lastSavedByName: form.lastSavedByName || '',
    returnedAt: iso(form.returnedAt),
    clientReviewNote: form.clientReviewNote || '',
    internalReviewNote: form.internalReviewNote || '',
    lockedRevision: form.lockedRevision,
    actions,
  };
}

function toAuditDto(row) {
  return {
    id: String(row._id),
    eventType: row.eventType,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    revision: row.revision,
    changedFieldKeys: row.changedFieldKeys || [],
    actorType: row.actorType,
    actorName: row.actorName || '',
    createdAt: iso(row.createdAt),
  };
}

module.exports = {
  TRANSITIONS,
  loadForm,
  listCaseForms,
  provisionForms,
  saveAnswers,
  transition,
  listAudit,
  toListItem,
  toStaffDto,
  toAuditDto,
};
