const express = require('express');
const router = express.Router();
const evidenceManagement = require('../../../../services/evidenceManagement');
const { staffAuthMiddleware } = require('../../../../middleware/api/staffAuth');
const { can, requireCapability } = require('../../../../utils/permissions');
const { canViewEvidence, canManageEvidence } = require('../../../../services/casePolicy');

// Apply staff auth middleware
router.use(staffAuthMiddleware);

/**
 * Provision evidence checklist for a case
 * POST /api/v1/staff/cases/:caseId/evidence/provision
 */
router.post('/cases/:caseId/evidence/provision', async (req, res, next) => {
  try {
    const { caseId } = req.params;
    const { templateKey, version } = req.body;

    if (!templateKey) {
      return res.status(400).json({ error: 'templateKey is required' });
    }

    // Require case management permission
    const isAuthorized = await canManageEvidence(req, null); // We need the workspace ID to check correctly
    // Wait, let's fetch the case first or adapt to use accessibleCaseIdFilter
    const ClientCase = require('../../../../models/ClientCase');
    const clientCase = await ClientCase.findById(caseId).lean();
    if (!clientCase) return res.status(404).json({ error: 'Case not found' });
    
    if (!(await canManageEvidence(req, clientCase.workspace))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const result = await evidenceManagement.provisionChecklist(caseId, templateKey, version);
    res.json({ data: result, meta: { requestId: req.id } });
  } catch (err) {
    next(err);
  }
});

/**
 * Get case evidence summary and requirements
 * GET /api/v1/staff/cases/:caseId/evidence
 */
router.get('/cases/:caseId/evidence', async (req, res, next) => {
  try {
    const { caseId } = req.params;
    
    const ClientCase = require('../../../../models/ClientCase');
    const clientCase = await ClientCase.findById(caseId).lean();
    if (!clientCase) return res.status(404).json({ error: 'Case not found' });
    
    if (!(await canViewEvidence(req, clientCase.workspace))) {
      return res.status(404).json({ error: 'Case not found' }); // Conceal existence
    }

    const result = await evidenceManagement.listCaseRequirements(caseId);
    res.json({ data: result, meta: { requestId: req.id } });
  } catch (err) {
    next(err);
  }
});

/**
 * Create custom requirement
 * POST /api/v1/staff/cases/:caseId/evidence/requirements
 */
router.post('/cases/:caseId/evidence/requirements', async (req, res, next) => {
  try {
    const { caseId } = req.params;
    
    const ClientCase = require('../../../../models/ClientCase');
    const clientCase = await ClientCase.findById(caseId).lean();
    if (!clientCase) return res.status(404).json({ error: 'Case not found' });
    
    if (!(await canManageEvidence(req, clientCase.workspace))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const requirement = await evidenceManagement.createCustomRequirement(caseId, req.staff._id, req.body);
    res.json({ data: requirement, meta: { requestId: req.id } });
  } catch (err) {
    next(err);
  }
});

/**
 * Update requirement status
 * PATCH /api/v1/staff/evidence/requirements/:requirementId/status
 */
router.patch('/evidence/requirements/:requirementId/status', async (req, res, next) => {
  try {
    const { requirementId } = req.params;
    const { status, reason } = req.body;

    const EvidenceRequirement = require('../../../../models/EvidenceRequirement');
    const requirement = await EvidenceRequirement.findById(requirementId).populate('case').lean();
    if (!requirement) return res.status(404).json({ error: 'Requirement not found' });
    
    if (!(await canManageEvidence(req, requirement.workspace))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const updated = await evidenceManagement.updateRequirementStatus(requirementId, status, req.staff._id, reason);
    res.json({ data: updated, meta: { requestId: req.id } });
  } catch (err) {
    next(err);
  }
});

/**
 * Link document
 * POST /api/v1/staff/evidence/requirements/:requirementId/documents
 */
router.post('/evidence/requirements/:requirementId/documents', async (req, res, next) => {
  try {
    const { requirementId } = req.params;
    const { documentId } = req.body;

    const EvidenceRequirement = require('../../../../models/EvidenceRequirement');
    const requirement = await EvidenceRequirement.findById(requirementId).lean();
    if (!requirement) return res.status(404).json({ error: 'Requirement not found' });
    
    if (!(await canManageEvidence(req, requirement.workspace))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const updated = await evidenceManagement.linkDocument(requirementId, documentId);
    res.json({ data: updated, meta: { requestId: req.id } });
  } catch (err) {
    next(err);
  }
});

/**
 * Unlink document
 * DELETE /api/v1/staff/evidence/requirements/:requirementId/documents/:documentId
 */
router.delete('/evidence/requirements/:requirementId/documents/:documentId', async (req, res, next) => {
  try {
    const { requirementId, documentId } = req.params;

    const EvidenceRequirement = require('../../../../models/EvidenceRequirement');
    const requirement = await EvidenceRequirement.findById(requirementId).lean();
    if (!requirement) return res.status(404).json({ error: 'Requirement not found' });
    
    if (!(await canManageEvidence(req, requirement.workspace))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const updated = await evidenceManagement.unlinkDocument(requirementId, documentId);
    res.json({ data: updated, meta: { requestId: req.id } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
