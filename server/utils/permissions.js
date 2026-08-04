/**
 * Role-based permission helpers.
 *
 * Session shape is unchanged (`req.session.adminUser = { id, name, role }`,
 * already set by the existing login routes) — nothing here touches auth.
 *
 * Two layers live here:
 *   1. The original broad helpers (`blockReadOnly`, `requireManager`) — kept
 *      exactly as before, still used by leadOps.js, now fail-closed on a
 *      missing role instead of the old fail-open default.
 *   2. The Phase 2 capability system (`CAPABILITIES`, `can`, `requireCapability`)
 *      — additive, used to close the gap where most of routes/admin/index.js
 *      had no role check at all beyond "logged in."
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

const ALL_ROLES = Object.keys(ROLE_LABELS);

const SPECIALIST_ROLES = [
  'petition_writer',
  'business_plan_specialist',
  'recommendation_letter_specialist',
  'uscis_forms_specialist',
  'evidence_collector',
];

// Roles allowed to assign leads/tasks, create sprints, change delivery
// state, and delete records outright.
const MANAGER_ROLES = ['super_admin', 'admin', 'pm'];

// Every role except `viewer` can update tasks/notes/status on work that
// applies to them; `viewer` is read-only everywhere in this module.
const READ_ONLY_ROLES = ['viewer'];

// Roles that can legitimately be assigned a task via the lead Assignment
// panel (see ASSIGNMENT_SLOTS in leadOps.js) — i.e. roles for which "manage
// tasks assigned to them" is a real, checkable relationship (Task.assignee),
// not a guess. `reviewer` is included because it maps to the "QC Review"
// assignment slot.
const TASK_OWNERSHIP_ROLES = [...SPECIALIST_ROLES, 'reviewer'];

// ---------------------------------------------------------------------------
// Original broad helpers — unchanged behavior for every already-authenticated
// session; only the missing-role edge case changed (see getRole below).
// ---------------------------------------------------------------------------

/**
 * Missing role now returns `null`, not `'super_admin'`. This was a fail-open
 * default: a session with `isAdmin: true` but no `adminUser.role` (never
 * produced by the current login routes, but not something to leave as a
 * silent full-admin grant either) used to be treated as the highest
 * privilege available. Every real login path sets `adminUser` and `role`
 * together, so this only changes behavior for a session that was already
 * malformed.
 */
function getRole(req) {
  return (req.session && req.session.adminUser && req.session.adminUser.role) || null;
}

function isManager(req) {
  const role = getRole(req);
  return !!role && MANAGER_ROLES.includes(role);
}

function isReadOnly(req) {
  const role = getRole(req);
  return !!role && READ_ONLY_ROLES.includes(role);
}

/** Route guard: blocks read-only roles (and missing roles) from any mutating request. */
function blockReadOnly(req, res, next) {
  const role = getRole(req);
  if (!role) {
    return res.status(403).send('Your session has no assigned role. Please log in again.');
  }
  if (READ_ONLY_ROLES.includes(role)) {
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

// ---------------------------------------------------------------------------
// Phase 2 — capability map
//
// `super_admin` is listed explicitly in every capability for clarity/
// documentation, and `can()` additionally short-circuits to `true` for
// `super_admin` as a safety net — a capability entry accidentally left off
// an array must never lock out the super administrator.
// ---------------------------------------------------------------------------

const CAPABILITIES = {
  // Users & settings — admin-tier only.
  'users.manage': ['super_admin', 'admin'],
  'users.delete': ['super_admin'],
  'settings.manage': ['super_admin', 'admin'],

  // Leads.
  'leads.view': ALL_ROLES, // includes viewer — read-only browsing
  'leads.assign': MANAGER_ROLES,
  'leads.edit': MANAGER_ROLES, // status changes
  'leads.delete': ['super_admin', 'admin'], // pm intentionally excluded — see PHASE_2_AUTHORIZATION.md
  'notes.create': ['super_admin', 'admin', 'pm', ...SPECIALIST_ROLES, 'reviewer'], // editor & viewer excluded

  // Task/sprint/delivery — broad "manage anything" tier stays manager-only;
  // specialists/reviewer get ownership-scoped task access (see
  // canManageTask below), not blanket access.
  'tasks.manage': MANAGER_ROLES,
  'sprints.manage': MANAGER_ROLES,
  // No per-task-type ownership data exists on DeliveryRecord (see
  // PHASE_2_AUTHORIZATION.md "Known limitations") — role-level access is
  // preserved for everyone who legitimately does delivery-adjacent work
  // (managers, specialists, reviewer), excluding editor (CMS-only role)
  // and viewer (read-only).
  'deliveries.manage': ['super_admin', 'admin', 'pm', ...SPECIALIST_ROLES, 'reviewer'],

  // CMS — editor tier.
  'blog.manage': ['super_admin', 'admin', 'editor'],
  'faqs.manage': ['super_admin', 'admin', 'editor'],
  'testimonials.manage': ['super_admin', 'admin', 'editor'],
  'media.manage': ['super_admin', 'admin', 'editor'],

  // Reporting.
  'csv.export': MANAGER_ROLES,
  'reports.view': MANAGER_ROLES,

  // Cases/workspaces (Cycle 2). Conservative default matrix — see
  // 03_CLIENT_CASES_AND_WORKSPACES.md §12 and services/casePolicy.js for
  // how `cases.view_all` is used as the org-wide, membership-bypass signal.
  // Specialists/reviewer/editor/viewer intentionally excluded from every
  // case capability: the module document requires justifying read-only
  // access from actual product rules before granting it, and none exist
  // yet for this cycle.
  'cases.view': ['super_admin', 'admin', 'pm'],
  'cases.view_all': ['super_admin', 'admin'],
  'cases.create': ['super_admin', 'admin', 'pm'],
  'cases.manage': ['super_admin', 'admin', 'pm'],
  'cases.assign': ['super_admin', 'admin'], // reassigning the project manager is admin-tier, not self-service for a PM
  'cases.archive': ['super_admin', 'admin'],
  'workspace.members.manage': ['super_admin', 'admin', 'pm'],

  // Consultation/query tracking (Cycle 3). Same conservative-matrix
  // approach as cases.* above — see
  // 04_CONSULTATION_AND_QUERY_TRACKING.md §16 and services/interactionPolicy.js.
  // Specialists/reviewer/editor/viewer excluded: no product rule yet
  // justifies granting them query access.
  'queries.view': ['super_admin', 'admin', 'pm'],
  'queries.view_all': ['super_admin', 'admin'],
  'queries.create': ['super_admin', 'admin', 'pm'],
  'queries.triage': ['super_admin', 'admin', 'pm'],
  'queries.assign': ['super_admin', 'admin', 'pm'],
  'queries.schedule': ['super_admin', 'admin', 'pm'],
  'queries.answer': ['super_admin', 'admin', 'pm'],
  'queries.manage': ['super_admin', 'admin', 'pm'],
  'queries.close': ['super_admin', 'admin', 'pm'],

  // Document management (Cycle 5). Same conservative-matrix approach as
  // cases.*/queries.* above — see 05_DOCUMENT_MANAGEMENT.md §19 and
  // services/documentPolicy.js. Specialists/reviewer/editor/viewer
  // excluded: no product rule yet justifies granting them document access,
  // same reasoning already applied to cases.*/queries.* in prior cycles.
  'documents.view': ['super_admin', 'admin', 'pm'],
  'documents.view_all': ['super_admin', 'admin'],
  'documents.upload': ['super_admin', 'admin', 'pm'],
  'documents.review': ['super_admin', 'admin', 'pm'],
  'documents.archive': ['super_admin', 'admin', 'pm'],
  'document_categories.manage': ['super_admin', 'admin', 'pm'],
  'document_requests.manage': ['super_admin', 'admin', 'pm'],
  'document_versions.view': ['super_admin', 'admin', 'pm'],

  // Team collaboration (Cycle 6). Same conservative-matrix approach as
  // cases.*/queries.*/documents.* above — see
  // 06_TEAM_COLLABORATION_AND_CHAT.md §22 and services/collaborationPolicy.js.
  // Case specialists/reviewer get view+send+edit_own only (module doc's own
  // suggested narrower grant for that tier) — moderation and channel
  // management stay manager-tier.
  'channels.view': ['super_admin', 'admin', 'pm', ...SPECIALIST_ROLES, 'reviewer'],
  'channels.view_all': ['super_admin', 'admin'],
  'channels.create': ['super_admin', 'admin', 'pm'],
  'channels.manage': ['super_admin', 'admin', 'pm'],
  'channels.archive': ['super_admin', 'admin', 'pm'],
  'channel_members.manage': ['super_admin', 'admin', 'pm'],
  'messages.send': ['super_admin', 'admin', 'pm', ...SPECIALIST_ROLES, 'reviewer'],
  'messages.edit_own': ['super_admin', 'admin', 'pm', ...SPECIALIST_ROLES, 'reviewer'],
  'messages.moderate': ['super_admin', 'admin', 'pm'],
  'messages.view_revisions': ['super_admin', 'admin', 'pm'],
};

/** Fail-closed: no role → no access. Never defaults to a privileged role. */
function getCurrentRole(req) {
  return getRole(req);
}

/**
 * Fail-closed capability check.
 *   - Missing role       → false
 *   - Unknown role       → false (not present in any CAPABILITIES array)
 *   - Missing/unknown capability → false, for EVERY role, including
 *     `super_admin` — checked before the super_admin bypass below on
 *     purpose. A typo'd or not-yet-defined capability name must fail
 *     loudly for everyone, not silently succeed for super_admin while
 *     blocking everyone else (which would mask the bug rather than
 *     surface it, and — while not itself a privilege leak, since
 *     super_admin already has access to everything a real capability
 *     could name — is still the wrong failure mode to normalize).
 *   - `super_admin` + a real, known capability → true, always (see
 *     comment above CAPABILITIES).
 */
function can(req, capability) {
  const role = getCurrentRole(req);
  if (!role) return false;

  const allowedRoles = CAPABILITIES[capability];
  if (!Array.isArray(allowedRoles)) return false; // missing/unknown capability name

  if (role === 'super_admin') return true;
  return allowedRoles.includes(role);
}

/** Route guard for a named capability. Returns 403 (not a redirect) on denial — a denied mutation must never look like a silent success. */
function requireCapability(capability) {
  return function capabilityMiddleware(req, res, next) {
    if (!can(req, capability)) {
      return res
        .status(403)
        .send(`Forbidden: your role does not have the "${capability}" permission.`);
    }
    return next();
  };
}

/** True if `req`'s user is the assignee on `task` (Task.assignee, a real ObjectId ref — not a guess). */
function isTaskOwner(req, task) {
  const userId = req.session && req.session.adminUser && req.session.adminUser.id;
  if (!userId || !task || !task.assignee) return false;
  return String(task.assignee) === String(userId);
}

/**
 * Task mutation authorization: managers can manage any task; the roles that
 * can legitimately be assigned production work (specialists + reviewer, via
 * the lead Assignment panel) can manage only tasks assigned to them.
 * Everyone else (editor, viewer, or a role with no assignment relationship)
 * is denied — call sites must load the task first since ownership can only
 * be checked against the actual document.
 */
function canManageTask(req, task) {
  if (can(req, 'tasks.manage')) return true;
  const role = getCurrentRole(req);
  if (!role || !TASK_OWNERSHIP_ROLES.includes(role)) return false;
  return isTaskOwner(req, task);
}

module.exports = {
  ROLE_LABELS,
  ALL_ROLES,
  SPECIALIST_ROLES,
  MANAGER_ROLES,
  READ_ONLY_ROLES,
  TASK_OWNERSHIP_ROLES,
  getRole,
  isManager,
  isReadOnly,
  blockReadOnly,
  requireManager,
  CAPABILITIES,
  getCurrentRole,
  can,
  requireCapability,
  isTaskOwner,
  canManageTask,
};
