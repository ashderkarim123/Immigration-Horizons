const { can } = require('../utils/permissions');
const { hasActiveEmployeeMembership } = require('./casePolicy');

/**
 * Petition authorization (ADR-022 §10, §32). Capability and row access are
 * separate halves, exactly as for Smart Forms: the route checks the
 * capability, this file adds the case-membership half and the section
 * ownership rule. Reuses casePolicy — no second membership query.
 */

/** Row access: org-wide `cases.view_all`, or an active employee WorkspaceMember on the case workspace. */
const canAccessCase = async (req, workspaceId) => can(req, 'cases.view_all') || hasActiveEmployeeMembership(req, workspaceId);

/** The five petition capabilities as a plain object, so services and DTOs never touch `req`. */
const capabilitiesOf = (req) => ({
  view: can(req, 'petitions.view'),
  manage: can(req, 'petitions.manage'),
  edit: can(req, 'petitions.edit'),
  review: can(req, 'petitions.review'),
  finalize: can(req, 'petitions.finalize'),
});

/**
 * Drafting a section needs `petitions.edit`, and unless the actor also manages
 * petitions it must be assigned to them. Reviewing never grants drafting.
 */
const canDraftSection = (caps, actorId, section) => caps.edit && (caps.manage || (!!section.assignedTo && String(section.assignedTo) === String(actorId)));

/** An employee may be given petition work if their role could draft or review it. */
const isEligibleAssignee = (role) => can({ staff: { role } }, 'petitions.edit') || can({ staff: { role } }, 'petitions.review');

module.exports = { canAccessCase, capabilitiesOf, canDraftSection, isEligibleAssignee };
