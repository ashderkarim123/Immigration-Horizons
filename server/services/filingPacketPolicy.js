const { can } = require('../utils/permissions');
const { canAccessCase } = require('./petitionPolicy');

/**
 * Filing packet authorization (ADR-023 §22). Capability and row access are
 * separate halves, as for petitions and Smart Forms: the route checks the
 * capability, `canAccessCase` adds the case-membership half (org-wide
 * `cases.view_all`, or an active employee WorkspaceMember) — reused from
 * petitionPolicy, which itself reuses casePolicy, so there is one membership
 * query. A packet role never grants access to a document.
 */

/** The packet capabilities as a plain object, so services and DTOs never touch `req`. */
const capabilitiesOf = (req) => ({
  view: can(req, 'filing_packets.view'),
  manage: can(req, 'filing_packets.manage'),
  review: can(req, 'filing_packets.review'),
  finalize: can(req, 'filing_packets.finalize'),
  // The packet serves no bytes: a download is the existing secure version route, which has its own capability.
  downloadVersions: can(req, 'document_versions.view'),
});

module.exports = { canAccessCase, capabilitiesOf };
