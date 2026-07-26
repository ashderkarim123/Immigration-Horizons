/**
 * Lightweight role-based permission helpers for the lead-operations module.
 * Session shape is unchanged (`req.session.adminUser = { name, role }`,
 * already set by the existing login routes) — nothing here touches auth.
 */

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  pm: 'PM / Project Manager',
  petition_writer: 'Petition Writer',
  business_plan_specialist: 'Business Plan Specialist',
  recommendation_letter_specialist: 'Recommendation Letter Specialist',
  uscis_forms_specialist: 'USCIS Forms Specialist',
  evidence_collector: 'Evidence Collector',
  reviewer: 'Reviewer / QA',
  editor: 'Editor',
  viewer: 'Viewer',
};

// Roles allowed to assign leads/tasks, create sprints, change delivery
// state, and delete records outright.
const MANAGER_ROLES = ['super_admin', 'admin', 'pm'];

// Every role except `viewer` can update tasks/notes/status on work that
// applies to them; `viewer` is read-only everywhere in this module.
const READ_ONLY_ROLES = ['viewer'];

function getRole(req) {
  return (req.session && req.session.adminUser && req.session.adminUser.role) || 'super_admin';
}

function isManager(req) {
  return MANAGER_ROLES.includes(getRole(req));
}

function isReadOnly(req) {
  return READ_ONLY_ROLES.includes(getRole(req));
}

/** Route guard: blocks read-only roles from any mutating request. */
function blockReadOnly(req, res, next) {
  if (isReadOnly(req)) {
    return res.status(403).send('Your role (Viewer) has read-only access.');
  }
  next();
}

/** Route guard: requires one of the manager roles (assign/create/delete). */
function requireManager(req, res, next) {
  if (!isManager(req)) {
    return res.status(403).send('This action requires a PM or Admin role.');
  }
  next();
}

module.exports = {
  ROLE_LABELS,
  MANAGER_ROLES,
  getRole,
  isManager,
  isReadOnly,
  blockReadOnly,
  requireManager,
};
