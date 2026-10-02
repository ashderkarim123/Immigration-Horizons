/**
 * Evidence checklist domain (ADR-018).
 *
 * Every function takes an already-authorized `{ caseDoc, workspace }` context
 * resolved by the route through `caseManagement.loadCaseAndWorkspace`. ClientCase
 * does not own a workspace field — the authoritative workspace is the case's
 * primary CaseWorkspace — so nothing here reads `caseDoc.workspace`, and a
 * requirement is never persisted with a null workspace.
 *
 * Failures are returned as outcomes (`validation_error` / `not_found`), never
 * thrown, so the route maps them to 4xx instead of an unhandled 500.
 */
const mongoose = require('mongoose');

const EvidenceTemplate = require('../models/EvidenceTemplate');
const EvidenceRequirement = require('../models/EvidenceRequirement');
const CaseDocument = require('../models/CaseDocument');

const MAX_TITLE = 200;
const MAX_SECTION = 100;
const MAX_TEXT = 2000;

const id = (value) => (value ? String(value._id || value) : null);
const isId = (value) => mongoose.Types.ObjectId.isValid(value) && String(new mongoose.Types.ObjectId(value)) === String(value);
const text = (value) => (typeof value === 'string' ? value.trim() : '');
const invalid = (errors) => ({ outcome: 'validation_error', errors });

// ─── DTOs ────────────────────────────────────────────────────────────────────

function serializeRequirement(r) {
  return {
    id: id(r),
    caseId: id(r.case),
    workspaceId: id(r.workspace),
    source: r.source,
    templateKey: r.templateKey || null,
    templateVersion: r.templateVersion ?? null,
    templateItemKey: r.templateItemKey || null,
    section: r.section,
    order: r.order,
    title: r.title,
    description: r.description || '',
    importance: r.importance,
    status: r.status,
    clientVisible: !!r.clientVisible,
    clientGuidance: r.clientGuidance || '',
    staffGuidance: r.staffGuidance || '',
    internalNotes: r.internalNotes || '',
    linkedDocuments: (r.linkedDocuments || []).map((d) => ({
      id: id(d),
      displayName: d.displayName || '',
      status: d.status || '',
    })),
    waivedReason: r.waivedReason || null,
    notApplicableReason: r.notApplicableReason || null,
    satisfiedAt: r.satisfiedAt || null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function serializeTemplate(t) {
  return {
    key: t.key,
    name: t.name,
    description: t.description || '',
    caseType: t.caseType,
    version: t.version,
    itemCount: (t.items || []).length,
  };
}

// ─── Templates ───────────────────────────────────────────────────────────────

/** Latest active version of every template that applies to the case's type. */
async function listActiveTemplates({ caseDoc }) {
  const templates = await EvidenceTemplate.find({ status: 'active', caseType: caseDoc.caseType }).sort({ key: 1, version: -1 }).lean();
  const latest = new Map();
  for (const t of templates) if (!latest.has(t.key)) latest.set(t.key, t);
  return [...latest.values()].map(serializeTemplate);
}

/**
 * Provisions a template's items as requirements. Idempotent: an item already
 * provisioned (matched by template key + version + item key) is skipped, and a
 * concurrent duplicate is absorbed by the partial unique index.
 */
async function provisionChecklist({ caseDoc, workspace, templateKey, version, actor }) {
  if (!text(templateKey)) return invalid({ templateKey: 'Template is required.' });
  if (version !== undefined && !Number.isInteger(version)) return invalid({ version: 'Version must be a whole number.' });

  const query = { key: templateKey, status: 'active' };
  if (version) query.version = version;
  const template = await EvidenceTemplate.findOne(query).sort({ version: -1 }).lean();
  if (!template) return invalid({ templateKey: 'No active evidence template with that key.' });
  if (template.caseType !== caseDoc.caseType) return invalid({ templateKey: 'That template does not apply to this case type.' });

  let created = 0;
  let skipped = 0;
  for (const item of template.items) {
    const identity = { case: caseDoc._id, templateKey: template.key, templateVersion: template.version, templateItemKey: item.key };
    if (await EvidenceRequirement.exists(identity)) {
      skipped += 1;
      continue;
    }
    try {
      await EvidenceRequirement.create({
        ...identity,
        workspace: workspace._id,
        source: 'template',
        section: item.section,
        order: item.order,
        title: item.title,
        description: item.description,
        importance: item.importance,
        clientGuidance: item.clientGuidance,
        staffGuidance: item.staffGuidance,
        status: 'missing',
        createdBy: actor.id,
      });
      created += 1;
    } catch (err) {
      if (err && err.code === 11000) skipped += 1;
      else throw err;
    }
  }

  return { outcome: 'provisioned', created, skipped, template: { key: template.key, version: template.version } };
}

// ─── Requirements ────────────────────────────────────────────────────────────

async function createCustomRequirement({ caseDoc, workspace, data, actor }) {
  const errors = {};
  const title = text(data.title);
  if (!title) errors.title = 'Title is required.';
  else if (title.length > MAX_TITLE) errors.title = `Title must not exceed ${MAX_TITLE} characters.`;

  const importance = data.importance === undefined ? 'required' : data.importance;
  if (!EvidenceRequirement.IMPORTANCE.includes(importance)) errors.importance = 'Invalid importance.';

  const section = data.section === undefined ? 'General' : text(data.section);
  if (!section || section.length > MAX_SECTION) errors.section = `Section is required (max ${MAX_SECTION} characters).`;

  const description = data.description === undefined ? '' : text(data.description);
  if (description.length > MAX_TEXT) errors.description = `Description must not exceed ${MAX_TEXT} characters.`;

  if (Object.keys(errors).length > 0) return invalid(errors);

  // New requirements always start as missing; moving one to waived / not
  // applicable needs a reason, so that goes through updateRequirementStatus.
  const requirement = await EvidenceRequirement.create({
    case: caseDoc._id,
    workspace: workspace._id,
    source: 'custom',
    section,
    order: Number.isFinite(data.order) ? data.order : 999,
    title,
    description,
    importance,
    status: 'missing',
    createdBy: actor.id,
    internalNotes: text(data.internalNotes).slice(0, MAX_TEXT),
    clientVisible: data.clientVisible === true,
    clientGuidance: text(data.clientGuidance).slice(0, MAX_TEXT),
    staffGuidance: text(data.staffGuidance).slice(0, MAX_TEXT),
  });

  return { outcome: 'created', requirement: await loadRequirement(requirement._id) };
}

/** Lists a case's requirements with summary metrics. */
async function listCaseRequirements({ caseDoc }) {
  const requirements = await EvidenceRequirement.find({ case: caseDoc._id })
    .populate('linkedDocuments', 'displayName status')
    .sort({ section: 1, order: 1 })
    .lean();

  const counts = { missing: 0, in_progress: 0, satisfied: 0, waived: 0, not_applicable: 0 };
  let requiredTotal = 0;
  let requiredSatisfied = 0;

  for (const r of requirements) {
    counts[r.status] += 1;
    if (r.importance === 'required' && r.status !== 'waived' && r.status !== 'not_applicable') {
      requiredTotal += 1;
      if (r.status === 'satisfied') requiredSatisfied += 1;
    }
  }

  return {
    requirements: requirements.map(serializeRequirement),
    summary: {
      total: requirements.length,
      requiredTotal,
      requiredSatisfied,
      missing: counts.missing,
      inProgress: counts.in_progress,
      satisfied: counts.satisfied,
      waived: counts.waived,
      notApplicable: counts.not_applicable,
      completionPercent: requiredTotal > 0 ? Math.round((requiredSatisfied / requiredTotal) * 100) : 0,
    },
  };
}

/** Non-archived documents of this case that can be linked as evidence. */
async function listEligibleDocuments({ caseDoc }) {
  const documents = await CaseDocument.find({ case: caseDoc._id, archivedAt: null })
    .select('displayName status')
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
  return documents.map((d) => ({ id: id(d), displayName: d.displayName, status: d.status }));
}

/** Loads a requirement by id, or null for a malformed / unknown id. */
async function loadRequirement(requirementId) {
  if (!isId(requirementId)) return null;
  const requirement = await EvidenceRequirement.findById(requirementId).populate('linkedDocuments', 'displayName status').lean();
  return requirement ? serializeRequirement(requirement) : null;
}

/** Raw (unpopulated) requirement, used by routes to authorize against its workspace. */
async function findRequirementForAuth(requirementId) {
  if (!isId(requirementId)) return null;
  return EvidenceRequirement.findById(requirementId).select('case workspace').lean();
}

async function updateRequirementStatus({ requirementId, status, reason, actor }) {
  if (!EvidenceRequirement.STATUSES.includes(status)) return invalid({ status: 'Invalid status.' });

  const trimmedReason = text(reason);
  if ((status === 'waived' || status === 'not_applicable') && !trimmedReason) {
    return invalid({ reason: `A reason is required when status is ${status.replace('_', ' ')}.` });
  }
  if (trimmedReason.length > MAX_TEXT) return invalid({ reason: `Reason must not exceed ${MAX_TEXT} characters.` });

  const requirement = await EvidenceRequirement.findById(requirementId);
  if (!requirement) return { outcome: 'not_found' };

  requirement.status = status;
  if (status === 'waived') requirement.waivedReason = trimmedReason;
  else if (status === 'not_applicable') requirement.notApplicableReason = trimmedReason;
  else if (status === 'satisfied' && !requirement.satisfiedAt) {
    requirement.satisfiedAt = new Date();
    requirement.satisfiedBy = actor.id;
  }
  await requirement.save();

  return { outcome: 'updated', requirement: await loadRequirement(requirementId) };
}

/** Links a same-case document. Idempotent; a document of another case is reported as not found. */
async function linkDocument({ requirementId, documentId }) {
  if (!isId(documentId)) return invalid({ documentId: 'A valid document is required.' });

  const requirement = await EvidenceRequirement.findById(requirementId).select('case').lean();
  if (!requirement) return { outcome: 'not_found' };

  const document = await CaseDocument.findOne({ _id: documentId, case: requirement.case }).select('_id').lean();
  if (!document) return { outcome: 'document_not_found' };

  await EvidenceRequirement.updateOne({ _id: requirementId }, { $addToSet: { linkedDocuments: document._id } });
  return { outcome: 'linked', requirement: await loadRequirement(requirementId) };
}

async function unlinkDocument({ requirementId, documentId }) {
  if (!isId(documentId)) return invalid({ documentId: 'A valid document is required.' });

  const result = await EvidenceRequirement.updateOne({ _id: requirementId }, { $pull: { linkedDocuments: documentId } });
  if (result.matchedCount === 0) return { outcome: 'not_found' };
  return { outcome: 'unlinked', requirement: await loadRequirement(requirementId) };
}

module.exports = {
  listActiveTemplates,
  provisionChecklist,
  createCustomRequirement,
  listCaseRequirements,
  listEligibleDocuments,
  findRequirementForAuth,
  loadRequirement,
  updateRequirementStatus,
  linkDocument,
  unlinkDocument,
};
