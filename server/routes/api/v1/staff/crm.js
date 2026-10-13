/**
 * Phase 15 CRM, mounted after Staff auth/password setup. This is a sales
 * projection only; no change to operational lead status or case workflow.
 */
const router = require('express').Router();
const mongoose = require('mongoose');
const Lead = require('../../../../models/Consultation');
const { requireApiCapability } = require('../../../../middleware/api/staffAuth');
const { trustedOriginMiddleware } = require('../../../../middleware/api/trustedOrigin');
const { createApiError } = require('../../../../middleware/api/apiError');
const { leadScope } = require('../../../../services/leadPolicy');
const { logActivity } = require('../../../../utils/activity');
const { STAGES, STAGE_VALUES, LOST_REASONS, resolveStage, mongoStageExpression, normalizeEmail } = require('../../../../services/crmPipeline');

const handle = (action) => async (req, res, next) => {
  try { await action(req, res); } catch (error) { next(error); }
};
const invalid = (message) => createApiError(422, 'validation_error', message);
const missing = () => createApiError(404, 'not_found', 'Lead not found or access denied.');
const reply = (req, res, data) => res.json({ data, meta: { requestId: req.id } });
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const escapeRegex = (s) => s.replace(/[^a-zA-Z0-9@_-]/g, '\\$&');

function dto(lead) {
  return {
    id: String(lead._id), name: lead.name, email: lead.email, service: lead.service,
    stage: resolveStage(lead), explicitStage: lead.crmStage || null,
    operationalStatus: lead.status, ownerName: lead.ownerName || '',
    caseId: lead.convertedCase || null, lostReason: lead.crmLostReason || null,
    followUpAt: lead.crmNextFollowUpAt || null, quote: lead.crmQuote || null,
    createdAt: lead.createdAt,
  };
}
async function scopedLead(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw missing();
  const lead = await Lead.findOne({ $and: [{ _id: req.params.id }, await leadScope(req)] });
  if (!lead) throw missing();
  return lead;
}

// Exact stage counts, with at most fifteen newest cards per column. Do NOT
// truncate the count; the board marks columns with additional older records.
router.get('/crm/board', requireApiCapability('leads.view'), handle(async (req, res) => {
  const expression = mongoStageExpression();
  const lanes = Object.fromEntries(STAGES.map(({ value }) => [value, [
    { $match: { $expr: { $eq: [expression, value] } } },
    { $sort: { createdAt: -1, _id: -1 } },
    { $limit: 15 },
    { $project: {
      name: 1, email: 1, service: 1, status: 1, crmStage: 1, convertedCase: 1,
      ownerName: 1, crmLostReason: 1, crmNextFollowUpAt: 1, crmQuote: 1, createdAt: 1,
    } },
  ]]));
  const [result] = await Lead.aggregate([
    { $match: await leadScope(req) },
    { $facet: { counts: [{ $group: { _id: expression, count: { $sum: 1 } } }], ...lanes } },
  ]);
  const totals = new Map(result.counts.map((row) => [row._id, row.count]));
  reply(req, res, {
    stages: STAGES.map(({ value, label }) => {
      const items = result[value].map(dto);
      const total = totals.get(value) || 0;
      return { value, label, total, truncated: total > items.length, items };
    }),
    total: result.counts.reduce((sum, row) => sum + row.count, 0),
  });
}));

router.get('/crm/leads/:id', requireApiCapability('leads.view'), handle(async (req, res) => {
  reply(req, res, { lead: dto(await scopedLead(req)), stages: STAGES, lostReasons: LOST_REASONS });
}));

// Normalized email only. Suggestions are never automatically merged, and the
// same live case-membership lead scope applies to target and matched records.
router.get('/crm/leads/:id/duplicates', requireApiCapability('leads.view'), handle(async (req, res) => {
  const lead = await scopedLead(req);
  const email = normalizeEmail(lead.email);
  if (!email || email.length > 254) return reply(req, res, { items: [] });
  const items = await Lead.find({ $and: [
    await leadScope(req),
    { _id: { $ne: lead._id } },
    { email: new RegExp('^' + escapeRegex(email) + '$', 'i') },
  ] }).select('name email status crmStage convertedCase createdAt ownerName').sort({ createdAt: -1 }).limit(5).lean();
  reply(req, res, { items: items.map(dto), truncatedPossible: items.length === 5 });
}));

router.patch('/crm/leads/:id', trustedOriginMiddleware, requireApiCapability('leads.edit'), handle(async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      !Object.keys(body).length ||
      Object.keys(body).some((key) => !['stage', 'lostReason', 'followUpAt', 'quote'].includes(key))) {
    throw invalid('Choose only CRM stage, loss reason, next follow-up, or quotation.');
  }
  const lead = await scopedLead(req);
  const previousStage = resolveStage(lead);
  const stage = own(body, 'stage') ? body.stage : previousStage;
  if (!STAGE_VALUES.includes(stage)) throw invalid('Choose a valid CRM stage.');
  if (stage === 'client_created' && !lead.convertedCase) throw invalid('A client-created stage needs a converted case.');
  const reason = own(body, 'lostReason') ? body.lostReason : lead.crmLostReason;
  if (stage === 'lost' && !LOST_REASONS.includes(reason)) throw invalid('Choose a loss reason.');
  if (stage !== 'lost' && own(body, 'lostReason') && reason !== null) throw invalid('Loss reason is only for lost leads.');

  let nextFollowUp = lead.crmNextFollowUpAt;
  if (own(body, 'followUpAt')) {
    const value = body.followUpAt;
    if (value === null) nextFollowUp = null;
    else if (typeof value === 'string' && value.length <= 40 &&
             /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value) &&
             !Number.isNaN(Date.parse(value))) nextFollowUp = new Date(value);
    else throw invalid('Follow-up must be an ISO date-time with timezone, or null.');
  }
  let nextQuote = lead.crmQuote;
  if (own(body, 'quote')) {
    const value = body.quote;
    if (value === null) nextQuote = null;
    else if (value && typeof value === 'object' && !Array.isArray(value) &&
             Object.keys(value).every((key) => ['amountMinor', 'currency', 'note'].includes(key)) &&
             Number.isSafeInteger(value.amountMinor) && value.amountMinor >= 0 && value.amountMinor <= 100000000000 &&
             ['USD', 'GBP', 'CAD', 'EUR', 'AUD', 'PKR'].includes(value.currency) &&
             (value.note === undefined || (typeof value.note === 'string' && value.note.length <= 500))) {
      nextQuote = { amountMinor: value.amountMinor, currency: value.currency, note: value.note || '' };
    } else throw invalid('Quotation needs a valid minor-unit amount, currency, and optional note.');
  }
  lead.crmStage = stage;
  lead.crmLostReason = stage === 'lost' ? reason : null;
  lead.crmNextFollowUpAt = nextFollowUp;
  lead.crmQuote = nextQuote;
  await lead.save();
  await logActivity(lead._id, 'status_changed', 'CRM lead details updated.', req.staff.name, {
    actorId: req.staff._id, previousCrmStage: previousStage, crmStage: stage,
  });
  reply(req, res, dto(lead));
}));
module.exports = router;
