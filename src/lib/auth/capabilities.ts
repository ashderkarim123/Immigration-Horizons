/**
 * Employee role/capability mirror (ADR-009).
 *
 * `server/utils/permissions.js` is the owner of this map; the Express
 * admin CMS has enforced it since Phase 2. This file mirrors it so the
 * SaaS app can make the *same* decisions for the *same* roles rather than
 * inventing a second permission vocabulary — the brief's "use the actual
 * role and capability identifiers already present in code".
 *
 * Both sides assert against `docs/architecture/employee-capability-contract.json`,
 * so a grant added to one and not the other fails tests on both.
 *
 * Deliberately dependency-free (no `server-only`, no Mongoose): the
 * navigation layer needs to reason about capabilities in components, and
 * this must stay importable from anywhere.
 */

export const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  pm: "PM / Project Manager",
  petition_writer: "Petition Writer",
  business_plan_specialist: "Business Plan Specialist",
  recommendation_letter_specialist: "Recommendation Letter Specialist",
  uscis_forms_specialist: "USCIS Forms Specialist",
  evidence_collector: "Evidence Collector",
  reviewer: "Reviewer / QA",
  editor: "Editor",
  viewer: "Viewer",
};

export const ALL_ROLES = Object.keys(ROLE_LABELS);

export const MANAGER_ROLES = ["super_admin", "admin", "pm"];

export const SPECIALIST_ROLES = [
  "petition_writer",
  "business_plan_specialist",
  "recommendation_letter_specialist",
  "uscis_forms_specialist",
  "evidence_collector",
];

export const READ_ONLY_ROLES = ["viewer"];

const CASE_WORKER_ROLES = [...MANAGER_ROLES, ...SPECIALIST_ROLES, "reviewer"];

/**
 * Mirrors server/utils/permissions.js CAPABILITIES exactly. Keep the
 * ordering and grouping aligned with that file so a diff between them is
 * readable.
 */
export const CAPABILITIES: Record<string, string[]> = {
  // --- Content / CMS (admin.* surfaces; listed so the contract test can
  // assert full parity, not because the SaaS app renders them) ---
  "blog.manage": ["super_admin", "admin", "editor"],
  "faqs.manage": ["super_admin", "admin", "editor"],
  "testimonials.manage": ["super_admin", "admin", "editor"],
  "media.manage": ["super_admin", "admin", "editor"],
  "settings.manage": ["super_admin", "admin"],
  "users.manage": ["super_admin", "admin"],
  "users.delete": ["super_admin"],

  // --- Leads ---
  "leads.view": [...MANAGER_ROLES, ...SPECIALIST_ROLES, "reviewer", "editor", "viewer"],
  "leads.edit": MANAGER_ROLES,
  "leads.assign": MANAGER_ROLES,
  "leads.delete": ["super_admin", "admin"],
  "notes.create": [...MANAGER_ROLES, ...SPECIALIST_ROLES, "reviewer"],
  "tasks.manage": MANAGER_ROLES,
  "sprints.manage": MANAGER_ROLES,
  "deliveries.manage": CASE_WORKER_ROLES,
  "csv.export": MANAGER_ROLES,
  "reports.view": MANAGER_ROLES,

  // --- Cases / workspaces (Cycle 2; view widened in Cycle 8B) ---
  // cases.view / documents.view / document_versions.view are view-only AND
  // membership-scoped: specialists and reviewer lack `*.view_all`, so the
  // row-level workspace check still limits them to assigned cases.
  "cases.view": CASE_WORKER_ROLES,
  "cases.view_all": ["super_admin", "admin"],
  "cases.create": ["super_admin", "admin", "pm"],
  "cases.manage": ["super_admin", "admin", "pm"],
  "cases.assign": ["super_admin", "admin"],
  "cases.archive": ["super_admin", "admin"],
  "workspace.members.manage": ["super_admin", "admin", "pm"],

  // --- Clients (Cycle 8) ---
  "clients.view": ["super_admin", "admin", "pm"],
  "clients.manage": ["super_admin", "admin"],
  "client_updates.publish": ["super_admin", "admin", "pm"],

  // --- Queries (Cycle 3) ---
  "queries.view": ["super_admin", "admin", "pm"],
  "queries.view_all": ["super_admin", "admin"],
  "queries.create": ["super_admin", "admin", "pm"],
  "queries.triage": ["super_admin", "admin", "pm"],
  "queries.assign": ["super_admin", "admin", "pm"],
  "queries.schedule": ["super_admin", "admin", "pm"],
  "queries.answer": ["super_admin", "admin", "pm"],
  "queries.manage": ["super_admin", "admin", "pm"],
  "queries.close": ["super_admin", "admin", "pm"],

  // --- Documents (Cycle 5) ---
  "documents.view": CASE_WORKER_ROLES,
  "documents.view_all": ["super_admin", "admin"],
  "documents.upload": ["super_admin", "admin", "pm"],
  "documents.review": ["super_admin", "admin", "pm"],
  "documents.archive": ["super_admin", "admin", "pm"],
  "document_categories.manage": ["super_admin", "admin", "pm"],
  "document_requests.manage": ["super_admin", "admin", "pm"],
  "document_versions.view": CASE_WORKER_ROLES,

  // --- Collaboration (Cycle 6) ---
  "channels.view": CASE_WORKER_ROLES,
  "channels.view_all": ["super_admin", "admin"],
  "channels.create": ["super_admin", "admin", "pm"],
  "channels.manage": ["super_admin", "admin", "pm"],
  "channels.archive": ["super_admin", "admin", "pm"],
  "channel_members.manage": ["super_admin", "admin", "pm"],
  "messages.send": CASE_WORKER_ROLES,
  "messages.edit_own": CASE_WORKER_ROLES,
  "messages.moderate": ["super_admin", "admin", "pm"],
  "messages.view_revisions": ["super_admin", "admin", "pm"],
};

/**
 * Does this role hold this capability?
 *
 * Fails closed on a missing/unknown role and on an unknown capability
 * name — mirroring `can()` in permissions.js. A typo'd capability grants
 * nothing rather than everything.
 */
export function roleHasCapability(role: string | null | undefined, capability: string): boolean {
  if (!role) return false;
  const allowed = CAPABILITIES[capability];
  if (!allowed) return false;
  return allowed.includes(role);
}

/** Every capability a role holds — used to build navigation, never to authorize. */
export function capabilitiesForRole(role: string | null | undefined): string[] {
  if (!role) return [];
  return Object.keys(CAPABILITIES).filter((c) => CAPABILITIES[c].includes(role));
}

export function roleLabel(role: string | null | undefined): string {
  if (!role) return "Unknown";
  return ROLE_LABELS[role] ?? role;
}
