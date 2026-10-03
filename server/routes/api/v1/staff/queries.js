const router = require('express').Router();
const mongoose = require('mongoose');
const Interaction = require('../../../../models/ConsultationInteraction');
const History = require('../../../../models/InteractionHistory');
const Update = require('../../../../models/InteractionUpdate');
const AdminUser = require('../../../../models/admin/User');
const policy = require('../../../../services/interactionPolicy');
const service = require('../../../../services/interactionService');
const { isValidTimezone, zonedTimeToUtc } = require('../../../../utils/timezone');
const constants = require('../../../../utils/interactionConstants');
const { requireApiCapability } = require('../../../../middleware/api/staffAuth');
const { trustedOriginMiddleware } = require('../../../../middleware/api/trustedOrigin');
const { createApiError } = require('../../../../middleware/api/apiError');
const actor = req => ({ type: 'admin_user', id: req.staff._id, name: req.staff.name });
const respond = (req, res, data) => res.json({ data, meta: { requestId: req.id } });
const route = handler => async (req, res, next) => { try { await handler(req, res, next); } catch (error) { next(error.isVersionConflict ? createApiError(409, 'conflict', error.message) : error); } };
const dto = record => ({ id: record._id, interactionNumber: record.interactionNumber, subject: record.subject, type: record.type, typeLabel: constants.INTERACTION_TYPE_LABELS[record.type], status: record.status, statusLabel: constants.INTERACTION_STATUS_LABELS[record.status], priority: record.priority, scopeType: record.scopeType, caseId: record.case || null, scheduledFor: record.scheduledFor || null, timezone: record.timezone || '', assignedTo: record.assignedTo?._id || record.assignedTo || null, createdAt: record.createdAt, updatedAt: record.updatedAt, description: record.description || '', clientVisibleResponse: record.clientVisibleResponse || '', internalResponse: record.internalResponse || '', resolutionSummary: record.resolutionSummary || '' });
const scope = policy.accessibleInteractionFilter;
async function load(req, check = policy.canViewInteraction) {
  const record = mongoose.isValidObjectId(req.params.id) ? await Interaction.findById(req.params.id) : null;
  if (!record || !(await check(req, record))) throw createApiError(404, 'not_found', 'Consultation or query not found.');
  return record;
}
router.get('/', requireApiCapability('queries.view'), route(async (req, res) => {
  const filter = {};
  if (constants.INTERACTION_STATUSES.includes(req.query.status)) filter.status = req.query.status;
  if (constants.INTERACTION_TYPES.includes(req.query.type)) filter.type = req.query.type;
  if (req.query.queue === 'unanswered') filter.status = { $in: constants.ACTIVE_UNANSWERED_STATUSES };
  if (req.query.queue === 'scheduling') Object.assign(filter, { type: 'scheduled_consultation', scheduledFor: null, status: { $in: constants.ACTIVE_UNANSWERED_STATUSES } });
  if (req.query.queue === 'mine') filter.assignedTo = req.staff._id;
  if (typeof req.query.search === 'string' && req.query.search.trim()) {
    const pattern = new RegExp(req.query.search.slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ subject: pattern }, { interactionNumber: pattern }];
  }
  const match = { $and: [filter, await scope(req)] };
  const page = Math.max(1, Number.parseInt(req.query.page) || 1); const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit) || 25));
  const [items, total] = await Promise.all([Interaction.find(match).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), Interaction.countDocuments(match)]);
  respond(req, res, { items: items.map(dto), total, page, totalPages: Math.max(1, Math.ceil(total / limit)), pageSize: limit });
}));
router.get('/:id', requireApiCapability('queries.view'), route(async (req, res) => {
  const record = await load(req);
  const [history, updates, team] = await Promise.all([History.find({ interaction: record._id }).sort({ createdAt: -1 }).limit(100).lean(), Update.find({ interaction: record._id, deletedAt: null }).sort({ createdAt: 1 }).limit(100).lean(), AdminUser.find({ isActive: true, role: { $in: ['super_admin', 'admin', 'operations_admin', 'pm'] } }).select('name').sort({ name: 1 }).lean()]);
  const actions = {};
  for (const [name, check] of Object.entries({ triage: policy.canTriageInteraction, assign: policy.canAssignInteraction, schedule: policy.canScheduleInteraction, answer: policy.canAnswerInteraction, manage: policy.canManageInteraction, close: policy.canCloseInteraction })) actions[name] = await check(req, record);
  respond(req, res, { ...dto(record), actions, team: team.map(user => ({ id: user._id, name: user.name })), history: history.map(event => ({ id: event._id, eventType: event.eventType, newStatus: event.newStatus, actorName: event.actorName, createdAt: event.createdAt })), updates: updates.map(update => ({ id: update._id, body: update.body, authorName: update.authorName, visibility: update.visibility, createdAt: update.createdAt })) });
}));
const mutations = {
  acknowledge: ['queries.triage', policy.canTriageInteraction, (record, req) => service.acknowledgeInteraction(record, actor(req))],
  assign: ['queries.assign', policy.canAssignInteraction, (record, req) => service.assignInteraction(record, req.body.assignedTo, actor(req))],
  schedule: ['queries.schedule', policy.canScheduleInteraction, (record, req) => {
    const { timezone } = req.body;
    let { scheduledFor } = req.body;
    if (typeof scheduledFor === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/.test(scheduledFor)) {
      if (!isValidTimezone(timezone)) return { outcome: 'validation_error', errors: { timezone: 'Choose a valid IANA timezone.' } };
      scheduledFor = zonedTimeToUtc(scheduledFor, timezone);
    }
    return service.scheduleInteraction(record, { scheduledFor, timezone }, actor(req));
  }],
  status: ['queries.manage', policy.canManageInteraction, (record, req) => req.body.status === 'in_progress' ? service.startWork(record, actor(req)) : { outcome: 'validation_error', errors: { status: 'Choose In progress.' } }],
  answer: ['queries.answer', policy.canAnswerInteraction, (record, req) => service.answerInteraction(record, req.body, actor(req))],
  'request-clarification': ['queries.answer', policy.canAnswerInteraction, (record, req) => service.requestClarification(record, { clientVisibleQuestion: req.body.clientVisibleQuestion }, actor(req))],
  'no-show': ['queries.manage', policy.canManageInteraction, (record, req) => service.markNoShow(record, actor(req))],
  cancel: ['queries.manage', policy.canManageInteraction, (record, req) => service.cancelInteraction(record, { reason: req.body.reason }, actor(req))],
  close: ['queries.close', policy.canCloseInteraction, (record, req) => service.closeInteraction(record, actor(req))],
};
for (const [name, [capability, check, mutate]] of Object.entries(mutations)) {
  router.post(`/:id/${name}`, trustedOriginMiddleware, requireApiCapability(capability), route(async (req, res) => {
    const record = await load(req, check); const result = await mutate(record, req);
    if (result.outcome === 'validation_error') throw createApiError(400, 'validation_error', 'Check the consultation details.', result.errors);
    respond(req, res, { outcome: result.outcome, interaction: dto(result.interaction || record) });
  }));
}
router.post('/:id/notes', trustedOriginMiddleware, requireApiCapability('queries.view'), route(async (req, res) => {
  const record = await load(req, policy.canAddInteractionUpdate);
  if (typeof req.body.body !== 'string' || !req.body.body.trim() || req.body.body.length > 5000) throw createApiError(400, 'invalid_input', 'Enter a note of up to 5,000 characters.');
  const note = await Update.create({ interaction: record._id, authorType: 'admin', authorAdmin: req.staff._id, authorName: req.staff.name, updateType: 'employee_note', visibility: 'internal', body: req.body.body.trim() });
  respond(req, res, { id: note._id });
}));
module.exports = router;
