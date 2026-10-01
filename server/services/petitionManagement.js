const mongoose = require('mongoose');

const CasePetition = require('../models/CasePetition');
const PetitionVersion = require('../models/PetitionVersion');
const CaseActivity = require('../models/CaseActivity');
const AdminUser = require('../models/admin/User');
const Task = require('../models/admin/Task');
const EvidenceRequirement = require('../models/EvidenceRequirement');
const CaseSmartForm = require('../models/CaseSmartForm');
const CaseDocument = require('../models/CaseDocument');
const DocumentVersion = require('../models/DocumentVersion');
const { CASE_TYPES } = require('../utils/caseConstants');
const C = require('../utils/petitionConstants');
const { hasActiveEmployeeMembership } = require('./casePolicy');
const { canDraftSection, isEligibleAssignee } = require('./petitionPolicy');
const { templateFor, sectionsFor, withOrder } = require('./petitionTemplates');

/**
 * Petition Work application service (ADR-022). Authorization of the CAPABILITY
 * and case membership is the route's job (petitionPolicy); this file owns what
 * a change means: section ownership, state machines, dependency integrity and
 * readiness, and the immutable version snapshot. Every mutation takes the
 * expected petition `revision` and writes with `updateOne({ _id, revision,
 * status: { $in } }, { …, $inc: { revision: 1 } })` — never document.save() —
 * so a stale write is reported as a conflict instead of overwriting.
 *
 * Outcomes: 'saved' | 'unchanged' | 'validation_error' | 'conflict' |
 * 'invalid_state' | 'forbidden' | 'not_found'.
 *
 * Petition text is plain text and is never placed in CaseActivity, logs or
 * notifications; content history is PetitionVersion.
 */

const id = (value) => (value ? String(value._id || value) : null);
const isId = (value) => mongoose.Types.ObjectId.isValid(value);
const iso = (value) => (value ? new Date(value).toISOString() : null);
const trimText = (value) => String(value ?? '').replace(/\r\n/g, '\n').trim();
const caseTypeLabel = (caseType) => (CASE_TYPES.find((t) => t.value === caseType) || {}).label || caseType;
const stamp = (actor) => ({ lastEditedBy: actor.id, lastEditedByName: actor.name });

async function recordActivity(petition, type, message, actor) {
  // Fail-open: an activity write must never undo the petition change it describes.
  try {
    await CaseActivity.record({
      caseId: petition.case,
      workspaceId: petition.workspace,
      type,
      message,
      actor: { type: 'admin_user', id: actor.id, name: actor.name },
    });
  } catch (err) {
    console.error('[petitions] activity write failed', err.message);
  }
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

async function loadPetition(petitionId) {
  if (!isId(petitionId)) return null;
  return CasePetition.findById(petitionId).lean();
}

const listCasePetitions = (caseId) => CasePetition.find({ case: caseId }).sort({ sequence: 1 }).lean();

// ---------------------------------------------------------------------------
// Preconditions and the one atomic write
// ---------------------------------------------------------------------------

function precondition(petition, expectedRevision, allowedStatuses) {
  if (!Number.isInteger(expectedRevision)) return { outcome: 'validation_error', errors: { revision: 'The current revision is required.' } };
  const current = { revision: petition.revision, status: petition.status };
  if (petition.revision !== expectedRevision) return { outcome: 'conflict', current };
  if (!allowedStatuses.includes(petition.status)) return { outcome: 'invalid_state', current };
  return null;
}

async function mutate(petition, expectedRevision, allowedStatuses, update, extraFilter = {}, options = {}) {
  const result = await CasePetition.updateOne(
    { _id: petition._id, revision: expectedRevision, status: { $in: allowedStatuses }, ...extraFilter },
    { ...update, $inc: { revision: 1 } },
    options,
  );
  return result.matchedCount === 1;
}

async function conflict(petition) {
  const current = await CasePetition.findById(petition._id).select('revision status').lean();
  return { outcome: 'conflict', current: current ? { revision: current.revision, status: current.status } : null };
}

const fresh = (petition) => CasePetition.findById(petition._id).lean();
const sectionOf = (petition, key) => petition.sections.find((s) => s.key === key) || null;
const sectionPath = (key) => ({ arrayFilters: [{ 's.key': key }] });

// ---------------------------------------------------------------------------
// Create / provision
// ---------------------------------------------------------------------------

async function createPetition({ caseDoc, workspace, kind = 'primary', title, description = '', actor, sequence = null }) {
  if (!C.PETITION_KINDS.includes(kind)) return { outcome: 'validation_error', errors: { kind: 'Choose a valid petition kind.' } };
  const name = trimText(title) || `${caseTypeLabel(caseDoc.caseType)} — ${kind === 'primary' ? 'Petition' : kind.replace(/_/g, ' ')}`;
  if (name.length > C.MAX_TITLE_LENGTH) return { outcome: 'validation_error', errors: { title: `Use at most ${C.MAX_TITLE_LENGTH} characters.` } };
  const text = trimText(description);
  if (text.length > C.MAX_DESCRIPTION_LENGTH) return { outcome: 'validation_error', errors: { description: `Use at most ${C.MAX_DESCRIPTION_LENGTH} characters.` } };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const next = sequence || ((await CasePetition.findOne({ case: caseDoc._id }).sort({ sequence: -1 }).select('sequence').lean())?.sequence || 0) + 1;
    try {
      const created = await CasePetition.create({
        case: caseDoc._id,
        workspace: workspace._id,
        sequence: next,
        kind,
        title: name,
        description: text,
        sections: withOrder(sectionsFor(caseDoc.caseType, kind)),
        createdBy: actor.id,
        createdByName: actor.name,
        lastEditedBy: actor.id,
        lastEditedByName: actor.name,
      });
      await recordActivity(created, 'petition_created', `Petition "${name}" was created by ${actor.name}.`, actor);
      return { outcome: 'saved', petition: created.toObject() };
    } catch (err) {
      if (!(err && err.code === 11000)) throw err;
      if (sequence) break; // a fixed sequence that already exists is the caller's idempotency case
    }
  }
  return { outcome: 'conflict', current: null };
}

/** Idempotent primary petition: case + kind=primary + sequence=1. */
async function provisionPrimaryPetition({ caseDoc, workspace, actor }) {
  const existing = await CasePetition.findOne({ case: caseDoc._id, kind: 'primary', sequence: 1 }).lean();
  if (existing) return { outcome: 'unchanged', petition: existing };
  if (!templateFor(caseDoc.caseType).auto) {
    return { outcome: 'validation_error', errors: { caseType: 'No petition is created automatically for this case type. Create one manually if the work needs it.' } };
  }
  const created = await createPetition({ caseDoc, workspace, kind: 'primary', actor, sequence: 1 });
  if (created.outcome === 'conflict') {
    // Lost a concurrent provision: the winner's petition is the answer.
    const winner = await CasePetition.findOne({ case: caseDoc._id, kind: 'primary', sequence: 1 }).lean();
    if (winner) return { outcome: 'unchanged', petition: winner };
  }
  return created;
}

async function updateMetadata({ petition, revision, title, description, actor }) {
  const stop = precondition(petition, revision, [...C.REVIEWABLE_STATUSES, 'approved']);
  if (stop) return stop;
  const $set = { ...stamp(actor) };
  if (title !== undefined) {
    const name = trimText(title);
    if (!name || name.length > C.MAX_TITLE_LENGTH) return { outcome: 'validation_error', errors: { title: `Enter a title of up to ${C.MAX_TITLE_LENGTH} characters.` } };
    $set.title = name;
  }
  if (description !== undefined) {
    const text = trimText(description);
    if (text.length > C.MAX_DESCRIPTION_LENGTH) return { outcome: 'validation_error', errors: { description: `Use at most ${C.MAX_DESCRIPTION_LENGTH} characters.` } };
    $set.description = text;
  }
  if (!(await mutate(petition, revision, [...C.REVIEWABLE_STATUSES, 'approved'], { $set }))) return conflict(petition);
  return { outcome: 'saved', petition: await fresh(petition) };
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

/** Autosave. Only drafting statuses; a ready/approved section drops back to draft because its approved text just changed. */
async function saveSection({ petition, sectionKey, body, revision, actor, caps }) {
  const stop = precondition(petition, revision, C.DRAFTING_STATUSES);
  if (stop) return stop;
  const section = sectionOf(petition, sectionKey);
  if (!section) return { outcome: 'not_found' };
  if (!canDraftSection(caps, actor.id, section)) return { outcome: 'forbidden', message: 'You can only edit sections assigned to you.' };

  if (typeof body !== 'string') return { outcome: 'validation_error', errors: { body: 'Enter text.' } };
  const text = body.replace(/\r\n/g, '\n');
  if (text.length > C.MAX_SECTION_BODY_LENGTH) return { outcome: 'validation_error', errors: { body: `Use at most ${C.MAX_SECTION_BODY_LENGTH} characters.` } };
  if (text === section.body) return { outcome: 'unchanged', petition };

  const $set = {
    'sections.$[s].body': text,
    'sections.$[s].lastEditedAt': new Date(),
    'sections.$[s].lastEditedBy': actor.id,
    'sections.$[s].lastEditedByName': actor.name,
    ...stamp(actor),
  };
  if (['ready_for_review', 'approved'].includes(section.reviewStatus)) {
    Object.assign($set, {
      'sections.$[s].reviewStatus': 'draft',
      'sections.$[s].reviewedAt': null,
      'sections.$[s].reviewedBy': null,
      'sections.$[s].reviewedByName': '',
    });
  }
  if (!(await mutate(petition, revision, C.DRAFTING_STATUSES, { $set }, {}, sectionPath(sectionKey)))) return conflict(petition);
  return { outcome: 'saved', petition: await fresh(petition) };
}

/** Section review state machine. `action`: ready | return | approve. */
const SECTION_RULES = {
  ready: { from: ['draft', 'changes_requested'], to: 'ready_for_review', statuses: C.DRAFTING_STATUSES },
  return: { from: ['ready_for_review', 'approved'], to: 'changes_requested', statuses: C.REVIEWABLE_STATUSES },
  approve: { from: ['ready_for_review'], to: 'approved', statuses: C.REVIEWABLE_STATUSES },
};

async function reviewSection(action, { petition, sectionKey, revision, note = '', actor, caps }) {
  const rule = SECTION_RULES[action];
  const stop = precondition(petition, revision, rule.statuses);
  if (stop) return stop;
  const section = sectionOf(petition, sectionKey);
  if (!section) return { outcome: 'not_found' };

  if (action === 'ready' && !canDraftSection(caps, actor.id, section)) return { outcome: 'forbidden', message: 'You can only submit sections assigned to you.' };
  if (action !== 'ready' && !caps.review) return { outcome: 'forbidden', message: 'Reviewing petition sections requires review permission.' };

  if (!rule.from.includes(section.reviewStatus)) return { outcome: 'invalid_state', current: { revision: petition.revision, status: section.reviewStatus } };
  if (action === 'ready' && !section.body.trim()) return { outcome: 'validation_error', errors: { body: 'Write something before marking this section ready.' } };
  const reason = trimText(note);
  if (action === 'return' && !reason) return { outcome: 'validation_error', errors: { reviewNote: 'Tell the writer what to change.' } };
  if (reason.length > C.MAX_NOTE_LENGTH) return { outcome: 'validation_error', errors: { reviewNote: `Use at most ${C.MAX_NOTE_LENGTH} characters.` } };

  const $set = { 'sections.$[s].reviewStatus': rule.to, ...stamp(actor) };
  if (action !== 'ready') {
    Object.assign($set, {
      'sections.$[s].reviewedAt': new Date(),
      'sections.$[s].reviewedBy': actor.id,
      'sections.$[s].reviewedByName': actor.name,
      'sections.$[s].reviewNote': action === 'return' ? reason : '',
    });
  }
  if (!(await mutate(petition, revision, rule.statuses, { $set }, {}, sectionPath(sectionKey)))) return conflict(petition);
  return { outcome: 'saved', petition: await fresh(petition) };
}

/** Assign (or clear) a section's writer. Never creates workspace membership. */
async function assignSection({ petition, sectionKey, assigneeId, revision, actor }) {
  const stop = precondition(petition, revision, C.REVIEWABLE_STATUSES);
  if (stop) return stop;
  if (!sectionOf(petition, sectionKey)) return { outcome: 'not_found' };

  let $set = { 'sections.$[s].assignedTo': null, 'sections.$[s].assignedToName': '', ...stamp(actor) };
  if (assigneeId) {
    if (!isId(assigneeId)) return { outcome: 'validation_error', errors: { assigneeId: 'Choose a valid employee.' } };
    const user = await AdminUser.findOne({ _id: assigneeId, isActive: true }).select('name role').lean();
    if (!user) return { outcome: 'validation_error', errors: { assigneeId: 'Assignee must be an active employee.' } };
    if (!(await hasActiveEmployeeMembership({ staff: { _id: user._id } }, petition.workspace))) {
      return { outcome: 'validation_error', errors: { assigneeId: 'Add this employee to the case team before assigning petition work.' } };
    }
    if (!isEligibleAssignee(user.role)) return { outcome: 'validation_error', errors: { assigneeId: 'This role does not do petition work.' } };
    $set = { ...$set, 'sections.$[s].assignedTo': user._id, 'sections.$[s].assignedToName': user.name };
  }
  if (!(await mutate(petition, revision, C.REVIEWABLE_STATUSES, { $set }, {}, sectionPath(sectionKey)))) return conflict(petition);
  return { outcome: 'saved', petition: await fresh(petition) };
}

// ---------------------------------------------------------------------------
// Dependencies: integrity (same case) and readiness (one resolver)
// ---------------------------------------------------------------------------

const DEPENDENCY_STATUSES = [...C.REVIEWABLE_STATUSES, 'approved'];
const UNLINKABLE_DOCUMENT_STATUSES = ['archived', 'quarantined', 'rejected', 'superseded'];

/** The linked record when it belongs to THIS case (and workspace where the model has one), else null — cross-case ids are indistinguishable from missing. */
async function loadSameCaseRef(petition, type, refId) {
  const scope = { _id: refId, case: petition.case };
  const withWorkspace = { ...scope, workspace: petition.workspace };
  if (type === 'evidence_requirement') return EvidenceRequirement.findOne(withWorkspace).select('title status').lean();
  if (type === 'smart_form') return CaseSmartForm.findOne(withWorkspace).select('templateTitleSnapshot status').lean();
  if (type === 'case_document') return CaseDocument.findOne(withWorkspace).select('displayName status').lean();
  return Task.findOne(scope).select('title status').lean();
}

const labelOf = (type, ref) => ({ evidence_requirement: ref.title, smart_form: ref.templateTitleSnapshot, case_document: ref.displayName, task: ref.title }[type]);

async function addDependency({ petition, revision, type, refId, role = null, requiredForFinalization = true, actor }) {
  const stop = precondition(petition, revision, DEPENDENCY_STATUSES);
  if (stop) return stop;
  if (!C.DEPENDENCY_TYPES.includes(type)) return { outcome: 'validation_error', errors: { type: 'Choose a valid dependency type.' } };
  if (!isId(refId)) return { outcome: 'not_found' };
  if (role !== null && role !== undefined && (type !== 'case_document' || !C.DOCUMENT_DEPENDENCY_ROLES.includes(role))) {
    return { outcome: 'validation_error', errors: { role: 'A role is only valid for documents.' } };
  }
  if (petition.dependencies.length >= C.MAX_DEPENDENCIES) return { outcome: 'validation_error', errors: { type: `A petition can link at most ${C.MAX_DEPENDENCIES} items.` } };

  if (petition.dependencies.some((d) => d.type === type && String(d.refId) === String(refId))) return { outcome: 'unchanged', petition };
  const ref = await loadSameCaseRef(petition, type, refId);
  if (!ref) return { outcome: 'not_found' }; // missing and cross-case are the same answer
  if (type === 'case_document' && UNLINKABLE_DOCUMENT_STATUSES.includes(ref.status)) {
    return { outcome: 'validation_error', errors: { refId: 'This document is archived, rejected or unavailable.' } };
  }

  const dependency = {
    type,
    refId: ref._id,
    labelSnapshot: labelOf(type, ref) || '',
    role: type === 'case_document' ? role || 'supporting_document' : null,
    requiredForFinalization: requiredForFinalization !== false,
    order: petition.dependencies.reduce((max, d) => Math.max(max, d.order), 0) + 1,
  };
  // The filter also refuses a concurrent duplicate link of the same record.
  const ok = await mutate(petition, revision, DEPENDENCY_STATUSES, { $push: { dependencies: dependency }, $set: stamp(actor) }, { dependencies: { $not: { $elemMatch: { type, refId: ref._id } } } });
  if (!ok) return conflict(petition);
  return { outcome: 'saved', petition: await fresh(petition) };
}

async function removeDependency({ petition, revision, dependencyId, actor }) {
  const stop = precondition(petition, revision, DEPENDENCY_STATUSES);
  if (stop) return stop;
  if (!isId(dependencyId) || !petition.dependencies.some((d) => id(d) === String(dependencyId))) return { outcome: 'not_found' };
  if (!(await mutate(petition, revision, DEPENDENCY_STATUSES, { $pull: { dependencies: { _id: dependencyId } }, $set: stamp(actor) }))) return conflict(petition);
  return { outcome: 'saved', petition: await fresh(petition) };
}

/**
 * The one readiness resolver (ADR-022 §13). Returns, per dependency, `{ ready,
 * status, reason, label, provenance }`. Provenance holds identifiers and
 * statuses only — never storage keys, checksums or document bytes — and is what
 * a PetitionVersion freezes. No scoring: ready is a boolean fact per item.
 */
async function resolveDependencies(petition) {
  const byType = (type) => petition.dependencies.filter((d) => d.type === type).map((d) => d.refId);
  const scope = { case: petition.case };

  const [evidence, forms, documents, tasks] = await Promise.all([
    EvidenceRequirement.find({ _id: { $in: byType('evidence_requirement') }, ...scope }).select('title status').lean(),
    CaseSmartForm.find({ _id: { $in: byType('smart_form') }, ...scope }).select('templateKey templateVersion templateTitleSnapshot status revision lockedRevision').lean(),
    CaseDocument.find({ _id: { $in: byType('case_document') }, ...scope }).select('displayName status scanStatus currentVersion').lean(),
    Task.find({ _id: { $in: byType('task') }, case: petition.case }).select('title status completedAt').lean(),
  ]);
  const versionIds = documents.map((d) => d.currentVersion).filter(Boolean);
  const versions = versionIds.length ? await DocumentVersion.find({ _id: { $in: versionIds } }).select('versionNumber displayName').lean() : [];

  const index = (rows) => new Map(rows.map((row) => [String(row._id), row]));
  const lookup = { evidence_requirement: index(evidence), smart_form: index(forms), case_document: index(documents), task: index(tasks) };
  const versionById = index(versions);

  return petition.dependencies.map((dep) => {
    const ref = lookup[dep.type].get(String(dep.refId));
    const base = { dependencyId: id(dep), ready: false, status: 'missing', reason: 'This item is no longer available.', label: dep.labelSnapshot, provenance: null };
    if (!ref) return base;

    if (dep.type === 'evidence_requirement') {
      const ready = ['satisfied', 'waived', 'not_applicable'].includes(ref.status);
      return { ...base, ready, status: ref.status, reason: ready ? '' : 'Not yet satisfied, waived or marked not applicable.', label: ref.title, provenance: { requirementId: id(ref), title: ref.title, status: ref.status } };
    }
    if (dep.type === 'smart_form') {
      const ready = ['approved', 'locked'].includes(ref.status);
      return {
        ...base,
        ready,
        status: ref.status,
        reason: ready ? '' : 'The form is not yet approved.',
        label: ref.templateTitleSnapshot,
        provenance: { caseSmartFormId: id(ref), templateKey: ref.templateKey, templateVersion: ref.templateVersion, revision: ref.revision, status: ref.status, lockedRevision: ref.lockedRevision ?? null },
      };
    }
    if (dep.type === 'case_document') {
      const version = ref.currentVersion ? versionById.get(String(ref.currentVersion)) : null;
      let reason = '';
      if (UNLINKABLE_DOCUMENT_STATUSES.includes(ref.status)) reason = `The document is ${ref.status}.`;
      else if (ref.scanStatus === 'infected') reason = 'The document failed the security scan.';
      else if (!version) reason = 'The document has no current version.';
      else if (ref.status !== 'accepted') reason = 'The document has not been accepted yet.';
      return {
        ...base,
        ready: reason === '',
        status: ref.status,
        reason,
        label: ref.displayName,
        provenance: { caseDocumentId: id(ref), documentVersionId: version ? id(version) : null, displayName: version ? version.displayName : ref.displayName, versionNumber: version ? version.versionNumber : null, status: ref.status },
      };
    }
    const ready = ref.status === 'completed';
    return { ...base, ready, status: ref.status, reason: ready ? '' : 'The task is not completed.', label: ref.title, provenance: { taskId: id(ref), title: ref.title, status: ref.status, completedAt: iso(ref.completedAt) } };
  });
}

const candidateQueries = {
  evidence_requirement: (p) => EvidenceRequirement.find({ case: p.case, workspace: p.workspace }).sort({ section: 1, order: 1 }).limit(100).select('title status').lean().then((rows) => rows.map((r) => ({ refId: id(r), label: r.title, status: r.status }))),
  smart_form: (p) => CaseSmartForm.find({ case: p.case, workspace: p.workspace }).sort({ templateKey: 1 }).limit(100).select('templateTitleSnapshot status').lean().then((rows) => rows.map((r) => ({ refId: id(r), label: r.templateTitleSnapshot, status: r.status }))),
  case_document: (p) => CaseDocument.find({ case: p.case, workspace: p.workspace, status: { $nin: UNLINKABLE_DOCUMENT_STATUSES } }).sort({ createdAt: -1 }).limit(100).select('displayName status').lean().then((rows) => rows.map((r) => ({ refId: id(r), label: r.displayName, status: r.status }))),
  task: (p) => Task.find({ case: p.case }).sort({ createdAt: -1 }).limit(100).select('title status').lean().then((rows) => rows.map((r) => ({ refId: id(r), label: r.title, status: r.status }))),
};

/** Bounded picker data for one dependency type; same-case only, so it can never leak another case. */
async function listCandidates(petition, type) {
  if (!candidateQueries[type]) return null;
  const linked = new Set(petition.dependencies.filter((d) => d.type === type).map((d) => String(d.refId)));
  return (await candidateQueries[type](petition)).map((row) => ({ ...row, linked: linked.has(row.refId) }));
}

// ---------------------------------------------------------------------------
// Petition lifecycle
// ---------------------------------------------------------------------------

const requiredSections = (petition) => petition.sections.filter((s) => s.required);

function sectionProblems(petition, acceptable) {
  const errors = {};
  for (const section of requiredSections(petition)) {
    if (!section.body.trim()) errors[section.key] = 'This required section is empty.';
    else if (!acceptable.includes(section.reviewStatus)) errors[section.key] = `This required section is not ${acceptable.length === 1 ? 'approved' : 'ready for review'} yet.`;
  }
  return errors;
}

/** Writes the immutable snapshot. `petition` is the post-transition document. Retries a lost version-number race. */
async function createVersion({ petition, reason, resolved, actor }) {
  const snapshot = {
    petition: petition._id,
    case: petition.case,
    workspace: petition.workspace,
    reason,
    sourceRevision: petition.revision,
    kind: petition.kind,
    titleSnapshot: petition.title,
    statusSnapshot: petition.status,
    sections: petition.sections.map((s) => ({ key: s.key, title: s.title, order: s.order, required: s.required, body: s.body, reviewStatus: s.reviewStatus, assignedToName: s.assignedToName, reviewedByName: s.reviewedByName, reviewNote: s.reviewNote })),
    dependencies: petition.dependencies.map((dep, i) => ({ type: dep.type, refId: dep.refId, label: resolved[i].label, role: dep.role, requiredForFinalization: dep.requiredForFinalization, ready: resolved[i].ready, status: resolved[i].status, provenance: resolved[i].provenance })),
    createdBy: actor.id,
    createdByName: actor.name,
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const last = await PetitionVersion.findOne({ petition: petition._id }).sort({ versionNumber: -1 }).select('versionNumber').lean();
    try {
      return await PetitionVersion.create({ ...snapshot, versionNumber: (last ? last.versionNumber : 0) + 1 });
    } catch (err) {
      if (!(err && err.code === 11000)) throw err;
    }
  }
  throw new Error('Could not allocate a petition version number.');
}

async function submitPetition({ petition, revision, actor }) {
  const stop = precondition(petition, revision, C.DRAFTING_STATUSES);
  if (stop) return stop;
  if (!petition.sections.length) return { outcome: 'validation_error', errors: { sections: 'This petition has no sections.' } };
  const errors = sectionProblems(petition, ['ready_for_review', 'approved']);
  if (Object.keys(errors).length) return { outcome: 'validation_error', errors };

  const $set = { status: 'internal_review', submittedForReviewAt: new Date(), ...stamp(actor) };
  if (!(await mutate(petition, revision, C.DRAFTING_STATUSES, { $set }))) return conflict(petition);
  await recordActivity(petition, 'petition_submitted', `Petition "${petition.title}" was submitted for internal review by ${actor.name}.`, actor);
  return { outcome: 'saved', petition: await fresh(petition) };
}

async function returnPetition({ petition, revision, note, actor }) {
  const stop = precondition(petition, revision, ['internal_review', 'approved']);
  if (stop) return stop;
  const reason = trimText(note);
  if (!reason) return { outcome: 'validation_error', errors: { internalReviewNote: 'Tell the team what to change.' } };
  if (reason.length > C.MAX_NOTE_LENGTH) return { outcome: 'validation_error', errors: { internalReviewNote: `Use at most ${C.MAX_NOTE_LENGTH} characters.` } };

  const $set = { status: 'needs_changes', internalReviewNote: reason, approvedAt: null, approvedBy: null, ...stamp(actor) };
  if (!(await mutate(petition, revision, ['internal_review', 'approved'], { $set }))) return conflict(petition);
  await recordActivity(petition, 'petition_returned', `Petition "${petition.title}" was returned for changes by ${actor.name}.`, actor);
  return { outcome: 'saved', petition: await fresh(petition) };
}

/**
 * Status flips first (atomic, revision-guarded) and the immutable version is
 * written second; if the version cannot be written the status is put back, so
 * a petition is never left reporting a milestone that has no snapshot.
 * (No multi-document transaction: the deployment's Mongo may be standalone.)
 */
async function transitionWithVersion({ petition, revision, from, update, reason, resolved, actor, activity }) {
  if (!(await mutate(petition, revision, from, update))) return conflict(petition);
  const next = await fresh(petition);
  try {
    await createVersion({ petition: next, reason, resolved, actor });
  } catch (err) {
    console.error('[petitions] version snapshot failed; reverting status', err.message);
    await CasePetition.updateOne({ _id: petition._id, revision: next.revision }, { $set: { status: petition.status, approvedAt: petition.approvedAt ?? null, approvedBy: petition.approvedBy ?? null, finalizedAt: null, finalizedBy: null }, $inc: { revision: 1 } });
    return { outcome: 'conflict', current: null, message: 'The snapshot could not be saved; nothing was changed. Please try again.' };
  }
  await recordActivity(next, activity, `Petition "${next.title}" was ${reason === 'approval' ? 'approved' : 'finalized'} by ${actor.name}.`, actor);
  return { outcome: 'saved', petition: next };
}

async function approvePetition({ petition, revision, actor }) {
  const stop = precondition(petition, revision, ['internal_review']);
  if (stop) return stop;
  const errors = sectionProblems(petition, ['approved']);
  if (Object.keys(errors).length) return { outcome: 'validation_error', errors };

  const resolved = await resolveDependencies(petition);
  const $set = { status: 'approved', approvedAt: new Date(), approvedBy: actor.id, internalReviewNote: '', ...stamp(actor) };
  return transitionWithVersion({ petition, revision, from: ['internal_review'], update: { $set }, reason: 'approval', resolved, actor, activity: 'petition_approved' });
}

async function finalizePetition({ petition, revision, actor }) {
  const stop = precondition(petition, revision, ['approved']);
  if (stop) return stop;
  const errors = sectionProblems(petition, ['approved']);
  const resolved = await resolveDependencies(petition);
  petition.dependencies.forEach((dep, i) => {
    if (dep.requiredForFinalization && !resolved[i].ready) errors[`dependency:${id(dep)}`] = `${resolved[i].label}: ${resolved[i].reason}`;
  });
  if (Object.keys(errors).length) return { outcome: 'validation_error', errors };

  const $set = { status: 'finalized', finalizedAt: new Date(), finalizedBy: actor.id, ...stamp(actor) };
  return transitionWithVersion({ petition, revision, from: ['approved'], update: { $set }, reason: 'finalization', resolved, actor, activity: 'petition_finalized' });
}

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

const listVersions = (petitionId) => PetitionVersion.find({ petition: petitionId }).sort({ versionNumber: -1 }).limit(100).lean();

async function getVersion(petitionId, versionId) {
  if (!isId(versionId)) return null;
  return PetitionVersion.findOne({ _id: versionId, petition: petitionId }).lean();
}

// ---------------------------------------------------------------------------
// DTOs. Never hand a Mongoose document, an AdminUser or a storage field to a route.
// ---------------------------------------------------------------------------

const sectionProgress = (petition) => {
  const required = requiredSections(petition);
  return { approved: required.filter((s) => s.reviewStatus === 'approved').length, total: required.length };
};

const dependencyProgress = (petition, resolved) => {
  const required = petition.dependencies.map((dep, i) => ({ dep, state: resolved[i] })).filter(({ dep }) => dep.requiredForFinalization);
  return { ready: required.filter(({ state }) => state.ready).length, total: required.length };
};

function petitionActions(petition, caps) {
  const open = !['finalized', 'archived'].includes(petition.status);
  return {
    canManage: caps.manage && open,
    canEdit: caps.edit && C.DRAFTING_STATUSES.includes(petition.status),
    canLink: caps.edit && DEPENDENCY_STATUSES.includes(petition.status),
    canSubmit: caps.manage && C.DRAFTING_STATUSES.includes(petition.status),
    canReturn: caps.review && ['internal_review', 'approved'].includes(petition.status),
    canApprove: caps.review && petition.status === 'internal_review',
    canFinalize: caps.finalize && petition.status === 'approved',
  };
}

function toSummary(petition, resolved, caps) {
  return {
    id: id(petition),
    caseId: id(petition.case),
    sequence: petition.sequence,
    kind: petition.kind,
    title: petition.title,
    status: petition.status,
    revision: petition.revision,
    sectionProgress: sectionProgress(petition),
    dependencyProgress: dependencyProgress(petition, resolved),
    updatedAt: iso(petition.updatedAt),
    actions: petitionActions(petition, caps),
  };
}

function toSectionDto(petition, section, caps, actorId) {
  const reviewable = C.REVIEWABLE_STATUSES.includes(petition.status);
  const canDraft = C.DRAFTING_STATUSES.includes(petition.status) && canDraftSection(caps, actorId, section);
  return {
    key: section.key,
    title: section.title,
    order: section.order,
    required: section.required,
    body: section.body,
    reviewStatus: section.reviewStatus,
    assignee: section.assignedTo ? { id: id(section.assignedTo), name: section.assignedToName } : null,
    lastEditedAt: iso(section.lastEditedAt),
    lastEditedByName: section.lastEditedByName,
    reviewedAt: iso(section.reviewedAt),
    reviewedByName: section.reviewedByName,
    reviewNote: section.reviewNote,
    actions: {
      canEdit: canDraft,
      canMarkReady: canDraft && ['draft', 'changes_requested'].includes(section.reviewStatus),
      canReturn: caps.review && reviewable && ['ready_for_review', 'approved'].includes(section.reviewStatus),
      canApprove: caps.review && reviewable && section.reviewStatus === 'ready_for_review',
      canAssign: caps.manage && reviewable,
    },
  };
}

const toDependencyDto = (dep, state) => ({
  id: id(dep),
  type: dep.type,
  refId: id(dep.refId),
  label: state.label,
  role: dep.role,
  requiredForFinalization: dep.requiredForFinalization,
  ready: state.ready,
  status: state.status,
  reason: state.reason,
});

const toVersionSummary = (version) => ({
  id: id(version),
  versionNumber: version.versionNumber,
  reason: version.reason,
  sourceRevision: version.sourceRevision,
  createdByName: version.createdByName,
  createdAt: iso(version.createdAt),
});

/** Full detail. `versions` is the (bounded) list from listVersions. */
function toDetail(petition, resolved, caps, actorId, versions = []) {
  return {
    ...toSummary(petition, resolved, caps),
    description: petition.description,
    sections: petition.sections.slice().sort((a, b) => a.order - b.order).map((s) => toSectionDto(petition, s, caps, actorId)),
    dependencies: petition.dependencies.map((dep, i) => toDependencyDto(dep, resolved[i])),
    internalReviewNote: petition.internalReviewNote,
    approvedAt: iso(petition.approvedAt),
    finalizedAt: iso(petition.finalizedAt),
    versions: versions.map(toVersionSummary),
  };
}

function toVersionDetail(version) {
  return {
    ...toVersionSummary(version),
    petitionId: id(version.petition),
    kind: version.kind,
    title: version.titleSnapshot,
    status: version.statusSnapshot,
    sections: version.sections.map((s) => ({ key: s.key, title: s.title, order: s.order, required: s.required, body: s.body, reviewStatus: s.reviewStatus, assignedToName: s.assignedToName, reviewedByName: s.reviewedByName, reviewNote: s.reviewNote })),
    dependencies: version.dependencies.map((d) => ({ type: d.type, refId: id(d.refId), label: d.label, role: d.role, requiredForFinalization: d.requiredForFinalization, ready: d.ready, status: d.status, provenance: d.provenance })),
  };
}

module.exports = {
  loadPetition,
  listCasePetitions,
  createPetition,
  provisionPrimaryPetition,
  updateMetadata,
  saveSection,
  reviewSection,
  assignSection,
  addDependency,
  removeDependency,
  resolveDependencies,
  listCandidates,
  submitPetition,
  returnPetition,
  approvePetition,
  finalizePetition,
  listVersions,
  getVersion,
  toSummary,
  toDetail,
  toVersionSummary,
  toVersionDetail,
};
