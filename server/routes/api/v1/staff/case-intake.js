const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const AdminUser = require('../../../../models/admin/User');
const ClientUser = require('../../../../models/ClientUser');
const ClientCase = require('../../../../models/ClientCase');
const Consultation = require('../../../../models/Consultation');
const { createClientCase, convertConsultationToCase } = require('../../../../services/caseConversion');
const { accessibleCaseIdFilter } = require('../../../../services/casePolicy');
const { can, CAPABILITIES } = require('../../../../utils/permissions');
const { CASE_TYPES, CASE_STAGES } = require('../../../../utils/caseConstants');
const { requireApiCapability } = require('../../../../middleware/api/staffAuth');
const { trustedOriginMiddleware } = require('../../../../middleware/api/trustedOrigin');
const { createApiError } = require('../../../../middleware/api/apiError');

function leadScope(req) {
  return can(req, 'cases.view_all') ? {} : { $or: [{ owner: req.staff._id }, { 'assignees.user': req.staff._id }] };
}
async function clientScope(req) {
  if (can(req, 'cases.view_all')) return {};
  const restriction = await accessibleCaseIdFilter(req);
  const [caseClients, leadClients] = await Promise.all([
    ClientCase.distinct('primaryClient', restriction),
    Consultation.distinct('clientUser', leadScope(req)),
  ]);
  return { _id: { $in: [...caseClients, ...leadClients].filter(Boolean) } };
}
router.get('/catalog', (req, res) => res.json({ data: { caseTypes: CASE_TYPES, caseStages: CASE_STAGES }, meta: { requestId: req.id } }));

router.get('/case-intake', requireApiCapability('cases.create'), async (req, res, next) => {
  try {
    const filter = { ...(await clientScope(req)), status: { $ne: 'disabled' } };
    if (typeof req.query.search === 'string' && req.query.search.trim()) {
      const pattern = new RegExp(req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ firstName: pattern }, { lastName: pattern }, { email: pattern }];
    }
    const [clients, consultations, managers] = await Promise.all([
      ClientUser.find(filter).select('firstName lastName email').sort({ firstName: 1 }).limit(100).lean(),
      Consultation.find({ ...leadScope(req), clientUser: { $ne: null }, convertedCase: null }).select('name service clientUser').sort({ createdAt: -1 }).limit(100).lean(),
      AdminUser.find({ isActive: true, role: { $in: CAPABILITIES['cases.manage'] }, ...(!can(req, 'cases.assign') ? { _id: req.staff._id } : {}) }).select('name role').sort({ name: 1 }).lean(),
    ]);
    res.json({ data: {
      clients: clients.map(c => ({ id: c._id, label: [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email })),
      consultations: consultations.map(c => ({ id: c._id, label: `${c.name} — ${c.service}`, clientId: c.clientUser })),
      managers: managers.map(u => ({ id: u._id, label: u.name })),
      caseTypes: CASE_TYPES,
    }, meta: { requestId: req.id } });
  } catch (error) { next(error); }
});

router.post('/case-intake', trustedOriginMiddleware, requireApiCapability('cases.create'), async (req, res, next) => {
  try {
    const { clientId, consultationId, ...input } = req.body;
    if (!can(req, 'cases.assign') && String(input.projectManagerId) !== String(req.staff._id)) {
      return next(createApiError(403, 'forbidden', 'You can create cases assigned to yourself.'));
    }
    if (!CAPABILITIES['cases.manage'].includes((await AdminUser.findById(mongoose.isValidObjectId(input.projectManagerId) ? input.projectManagerId : null).select('role').lean())?.role)) {
      return next(createApiError(400, 'invalid_input', 'Choose an active project manager.'));
    }
    if (consultationId) {
      if (!mongoose.isValidObjectId(consultationId) || !(await Consultation.exists({ _id: consultationId, ...leadScope(req), convertedCase: null }))) {
        return next(createApiError(404, 'not_found', 'Consultation not found.'));
      }
    } else if (!mongoose.isValidObjectId(clientId) || !(await ClientUser.exists({ $and: [{ _id: clientId, status: { $ne: 'disabled' } }, await clientScope(req)] }))) {
      return next(createApiError(404, 'not_found', 'Client not found.'));
    }
    const actor = { type: 'admin_user', id: req.staff._id, name: req.staff.name };
    const result = consultationId
      ? await convertConsultationToCase({ consultationId, input, actor })
      : await createClientCase({ clientId, input, actor });
    if (result.outcome === 'validation_error') return next(createApiError(400, 'invalid_input', 'Check the case details.', Object.entries(result.errors).map(([field, message]) => ({ field, message }))));
    if (!result.case) return next(createApiError(404, 'not_found', 'Case source not found.'));
    res.status(result.outcome === 'already_converted' ? 200 : 201).json({ data: { id: result.case._id, caseNumber: result.case.caseNumber }, meta: { requestId: req.id } });
  } catch (error) { next(error); }
});
module.exports = router;
