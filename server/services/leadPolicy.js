const { memberCaseIds } = require('./casePolicy');
const { can } = require('../utils/permissions');

/**
 * Row scope for consultations/leads (shared by the Staff leads routes and Staff search). Unconverted leads follow
 * `leads.view`; a converted lead is only visible through live case membership (or `cases.view_all`), so it can never become
 * a second path around case access or membership removal.
 */
async function leadScope(req) {
  if (can(req, 'cases.view_all')) return {};
  return { $or: [{ convertedCase: null }, { convertedCase: { $in: await memberCaseIds(req) } }] };
}

module.exports = { leadScope };
