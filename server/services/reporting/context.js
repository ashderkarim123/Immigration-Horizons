/**
 * Report request context (ADR-028): validates the bounded filters and turns the actor's scope into ONE set of case conditions
 * that every report section applies before it counts or groups anything. A filter only ever narrows authorized data.
 *
 * Scope: `accessible` is the actor's live case policy (view_all roles see the whole firm, everyone else their member cases);
 * `mine` is the actor's own cases as project manager, inside what they may already see; `firm` is an explicit request for the
 * whole firm and needs `cases.view_all`; without it the request is refused, never silently answered with firm totals.
 */
const ClientCase = require('../../models/ClientCase');
const { accessibleCaseIdFilter } = require('../casePolicy');
const { can } = require('../../utils/permissions');
const { CASE_TYPE_VALUES, CASE_STAGE_VALUES } = require('../../utils/caseConstants');
const T = require('../../utils/calendarTime');
const mongoose = require('mongoose');

const SCOPES = ['accessible', 'mine', 'firm'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const MAX_PERIOD_DAYS = 366;
const DEFAULT_PERIOD_DAYS = 90;

class ReportInputError extends Error {
  constructor(field, message, status = 422) {
    super(message);
    this.field = field;
    this.status = status;
  }
}

const oneOf = (field, value, allowed) => {
  if (value === undefined || value === '') return null;
  if (!allowed.includes(value)) throw new ReportInputError(field, `${field} must be one of: ${allowed.join(', ')}.`);
  return value;
};

/** Reads and validates the shared report filters. `period` is whether this report takes a from/to range. */
async function buildContext(req, query, { period }) {
  const scope = oneOf('scope', query.scope, SCOPES) || 'accessible';
  if (scope === 'firm' && !can(req, 'cases.view_all')) throw new ReportInputError('scope', 'Firm-wide reports need organization-wide case access.', 403);

  const { zone } = T.resolveTimeZone(req.staff && req.staff.timeZone);
  const today = T.todayInZone(zone);
  const filters = {
    caseType: oneOf('caseType', query.caseType, CASE_TYPE_VALUES),
    stage: oneOf('stage', query.stage, CASE_STAGE_VALUES),
    priority: oneOf('priority', query.priority, PRIORITIES),
    projectManager: null,
  };
  if (query.projectManager !== undefined && query.projectManager !== '') {
    if (!mongoose.Types.ObjectId.isValid(query.projectManager)) throw new ReportInputError('projectManager', 'Choose a valid employee.');
    filters.projectManager = String(query.projectManager);
  }

  let range = null;
  if (period) {
    const to = query.to === undefined || query.to === '' ? today : query.to;
    const from = query.from === undefined || query.from === '' ? T.addDays(to, -(DEFAULT_PERIOD_DAYS - 1)) : query.from;
    const window = T.queryWindow({ from, to, zone, maxDays: MAX_PERIOD_DAYS });
    if (window.error) throw new ReportInputError('from', window.error.replace('The range', 'The period'));
    range = { from, to, instantFrom: window.instantFrom, instantTo: window.instantTo };
  }

  const canCases = can(req, 'cases.view');
  const restriction = canCases ? await accessibleCaseIdFilter(req) : { _id: { $in: [] } };
  const conditions = [];
  if (restriction) conditions.push(restriction);
  if (scope === 'mine') conditions.push({ projectManager: req.staff._id });
  if (filters.caseType) conditions.push({ caseType: filters.caseType });
  if (filters.stage) conditions.push({ currentStage: filters.stage });
  if (filters.priority) conditions.push({ priority: filters.priority });
  if (filters.projectManager) conditions.push({ projectManager: new mongoose.Types.ObjectId(filters.projectManager) });

  /** Narrowed to a list of cases (mine, a filter, or a member-only actor) or unrestricted (a view_all actor with no filter). */
  const narrowed = conditions.length > 0;
  const anyCases = narrowed ? { $and: conditions } : {};
  const activeCases = { ...anyCases, archivedAt: null };
  let caseIds = null;
  let archivedIds = new Set();
  if (canCases) {
    if (narrowed) caseIds = await ClientCase.distinct('_id', activeCases);
    else archivedIds = new Set((await ClientCase.distinct('_id', { archivedAt: { $ne: null } })).map(String));
  } else {
    caseIds = [];
  }
  const idStrings = caseIds ? new Set(caseIds.map(String)) : null;

  return {
    scope,
    zone,
    today,
    todayUtc: T.dateStringToUtc(today),
    asOf: new Date(),
    range,
    filters,
    canCases,
    /** ClientCase match for ACTIVE cases in scope, and for any (incl. archived) case in scope. */
    activeCases,
    anyCases,
    /** Condition for a collection that points at a case through `field`: in-scope active, case-native rows only. */
    caseCond: (field = 'case') => (caseIds ? { [field]: { $in: caseIds } } : { [field]: { $nin: [...archivedIds].map((id) => new mongoose.Types.ObjectId(id)).concat([null]) } }),
    includesCase: (id) => (id ? (idStrings ? idStrings.has(String(id)) : !archivedIds.has(String(id))) : false),
    narrowed,
  };
}

const metaFor = (ctx, basis) => ({
  asOf: ctx.asOf.toISOString(),
  timeZone: ctx.zone,
  scope: ctx.scope,
  basis,
  ...(ctx.range ? { from: ctx.range.from, to: ctx.range.to } : {}),
});

module.exports = { SCOPES, PRIORITIES, MAX_PERIOD_DAYS, DEFAULT_PERIOD_DAYS, ReportInputError, buildContext, metaFor };
