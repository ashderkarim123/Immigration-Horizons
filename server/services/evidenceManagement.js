const EvidenceTemplate = require('../models/EvidenceTemplate');
const EvidenceRequirement = require('../models/EvidenceRequirement');
const CaseDocument = require('../models/CaseDocument');
const ClientCase = require('../models/ClientCase');

/**
 * Validates if the case exists and fetches it.
 */
async function getCaseOrThrow(caseId) {
  const clientCase = await ClientCase.findById(caseId).lean();
  if (!clientCase) throw new Error('Case not found');
  return clientCase;
}

/**
 * Provisions an evidence checklist for a given case using a specific template.
 * Safe to run multiple times (idempotent).
 */
async function provisionChecklist(caseId, templateKey, version) {
  const clientCase = await getCaseOrThrow(caseId);
  const workspaceId = clientCase.workspace || null;

  // Find the exact version of the template
  let query = { key: templateKey, status: 'active' };
  if (version) query.version = version;

  const template = await EvidenceTemplate.findOne(query).sort({ version: -1 }).lean();
  if (!template) {
    throw new Error('Active evidence template not found');
  }

  // Idempotently create requirements from template items
  let created = 0;
  let skipped = 0;

  for (const item of template.items) {
    const existing = await EvidenceRequirement.findOne({
      case: caseId,
      templateKey: template.key,
      templateVersion: template.version,
      templateItemKey: item.key
    }).lean();

    if (existing) {
      skipped++;
      continue;
    }

    await EvidenceRequirement.create({
      case: caseId,
      workspace: workspaceId,
      source: 'template',
      templateKey: template.key,
      templateVersion: template.version,
      templateItemKey: item.key,
      section: item.section,
      order: item.order,
      title: item.title,
      description: item.description,
      importance: item.importance,
      clientGuidance: item.clientGuidance,
      staffGuidance: item.staffGuidance,
      status: 'missing',
      createdBy: template.createdBy || null,
    });
    created++;
  }

  return { created, skipped, template: { key: template.key, version: template.version } };
}

/**
 * Creates a custom evidence requirement for a case.
 */
async function createCustomRequirement(caseId, adminUserId, data) {
  const clientCase = await getCaseOrThrow(caseId);
  const workspaceId = clientCase.workspace || null;

  const req = await EvidenceRequirement.create({
    case: caseId,
    workspace: workspaceId,
    source: 'custom',
    section: data.section || 'General',
    order: data.order || 999,
    title: data.title,
    description: data.description || '',
    importance: data.importance || 'required',
    status: data.status || 'missing',
    createdBy: adminUserId,
    internalNotes: data.internalNotes || '',
    clientVisible: !!data.clientVisible,
    clientGuidance: data.clientGuidance || '',
    staffGuidance: data.staffGuidance || ''
  });

  return req;
}

/**
 * Lists all evidence requirements for a case, computing summary metrics.
 */
async function listCaseRequirements(caseId) {
  const requirements = await EvidenceRequirement.find({ case: caseId })
    .populate('linkedDocuments', '_id name status')
    .sort({ section: 1, order: 1 })
    .lean();

  let total = requirements.length;
  let requiredTotal = 0;
  let requiredSatisfied = 0;
  let missing = 0;
  let inProgress = 0;
  let satisfied = 0;
  let waived = 0;
  let notApplicable = 0;

  requirements.forEach((req) => {
    switch (req.status) {
      case 'missing':
        missing++;
        break;
      case 'in_progress':
        inProgress++;
        break;
      case 'satisfied':
        satisfied++;
        break;
      case 'waived':
        waived++;
        break;
      case 'not_applicable':
        notApplicable++;
        break;
    }

    if (req.importance === 'required') {
      if (req.status !== 'waived' && req.status !== 'not_applicable') {
        requiredTotal++;
        if (req.status === 'satisfied') {
          requiredSatisfied++;
        }
      }
    }
  });

  const completionPercent = requiredTotal > 0 ? Math.round((requiredSatisfied / requiredTotal) * 100) : 0;

  return {
    requirements,
    summary: {
      total,
      requiredTotal,
      requiredSatisfied,
      missing,
      inProgress,
      satisfied,
      waived,
      notApplicable,
      completionPercent
    }
  };
}

/**
 * Updates a requirement's status and enforces reason checks.
 */
async function updateRequirementStatus(reqId, status, adminUserId, reason = null) {
  const requirement = await EvidenceRequirement.findById(reqId);
  if (!requirement) throw new Error('Evidence requirement not found');

  if (status === 'waived' || status === 'not_applicable') {
    if (!reason || reason.trim().length === 0) {
      throw new Error(`A reason is required when status is ${status}`);
    }
  }

  requirement.status = status;
  if (status === 'waived') {
    requirement.waivedReason = reason;
  } else if (status === 'not_applicable') {
    requirement.notApplicableReason = reason;
  } else if (status === 'satisfied') {
    if (!requirement.satisfiedAt) {
      requirement.satisfiedAt = new Date();
      requirement.satisfiedBy = adminUserId;
    }
  }

  await requirement.save();
  return requirement;
}

/**
 * Links a CaseDocument to an EvidenceRequirement.
 */
async function linkDocument(reqId, documentId) {
  const requirement = await EvidenceRequirement.findById(reqId);
  if (!requirement) throw new Error('Evidence requirement not found');

  const document = await CaseDocument.findById(documentId).lean();
  if (!document) throw new Error('CaseDocument not found');

  if (String(document.case) !== String(requirement.case)) {
    throw new Error('Cannot link a document from a different case');
  }

  if (!requirement.linkedDocuments.includes(documentId)) {
    requirement.linkedDocuments.push(documentId);
    await requirement.save();
  }

  return requirement;
}

/**
 * Unlinks a CaseDocument from an EvidenceRequirement.
 */
async function unlinkDocument(reqId, documentId) {
  const requirement = await EvidenceRequirement.findById(reqId);
  if (!requirement) throw new Error('Evidence requirement not found');

  requirement.linkedDocuments = requirement.linkedDocuments.filter((id) => String(id) !== String(documentId));
  await requirement.save();

  return requirement;
}

module.exports = {
  provisionChecklist,
  createCustomRequirement,
  listCaseRequirements,
  updateRequirementStatus,
  linkDocument,
  unlinkDocument
};
