/**
 * Read-time sales CRM projection over Consultation. Keep the separate
 * petition/delivery operational status completely unchanged.
 */
const STAGES = Object.freeze([
  ['new', 'New'], ['assigned', 'Assigned'], ['contacted', 'Contacted'],
  ['qualified', 'Qualified'], ['consultation_scheduled', 'Consultation scheduled'],
  ['proposal_sent', 'Proposal sent'], ['decision_pending', 'Decision pending'],
  ['won', 'Won'], ['lost', 'Lost'], ['client_created', 'Client created'],
].map(([value, label]) => ({ value, label })));
const LOST_REASONS = Object.freeze(['budget', 'ineligible', 'unresponsive', 'other_provider', 'timing', 'other']);
const LEGACY_STAGE = Object.freeze({
  new: 'new', assigned: 'assigned', contacted: 'contacted',
  qualified: 'qualified', consultation_scheduled: 'consultation_scheduled',
});
const STAGE_VALUES = STAGES.map((s) => s.value);

function resolveStage(lead) {
  return STAGE_VALUES.includes(lead.crmStage) ? lead.crmStage
    : lead.convertedCase ? 'client_created' : (LEGACY_STAGE[lead.status] || 'decision_pending');
}

/** Mongo aggregation counterpart of resolveStage (missing/null safe). */
function mongoStageExpression() {
  return { $ifNull: [
    '$crmStage',
    { $cond: [
      { $ne: [{ $ifNull: ['$convertedCase', null] }, null] },
      'client_created',
      { $switch: {
        branches: Object.entries(LEGACY_STAGE).map(([legacy, stage]) => ({
          case: { $eq: ['$status', legacy] }, then: stage,
        })),
        default: 'decision_pending',
      } },
    ] },
  ] };
}
function normalizeEmail(email) { return String(email || '').trim().toLowerCase(); }
module.exports = { STAGES, STAGE_VALUES, LOST_REASONS, resolveStage, mongoStageExpression, normalizeEmail };
