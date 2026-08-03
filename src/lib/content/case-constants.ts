/**
 * Mirrors server/utils/caseConstants.js — same values, same shape. See
 * docs/architecture/ADR-002-case-workspace-domain.md §4: kept as two
 * independent files (not a shared package), cross-checked by
 * test/case-schema-contract.test.ts (root) and
 * server/test/case-schema-contract.test.js (server).
 */

export const CASE_TYPES = [
  { value: "eb2_niw", label: "EB-2 NIW" },
  { value: "eb1a", label: "EB-1A" },
  { value: "eb1b", label: "EB-1B" },
  { value: "eb1c", label: "EB-1C" },
  { value: "o1", label: "O-1" },
  { value: "rfe_response", label: "RFE Response" },
  { value: "noid_response", label: "NOID Response" },
  { value: "recommendation_letters", label: "Recommendation Letters" },
  { value: "expert_opinion_letters", label: "Expert Opinion Letters" },
  { value: "business_plan", label: "Business Plan" },
  { value: "evidence_packaging", label: "Evidence Packaging" },
  { value: "uscis_forms", label: "USCIS Forms Support" },
  { value: "other", label: "Other" },
] as const;
export const CASE_TYPE_VALUES = CASE_TYPES.map((t) => t.value);
export type CaseType = (typeof CASE_TYPES)[number]["value"];

export const CASE_STAGES = [
  { value: "intake", label: "Intake" },
  { value: "strategy", label: "Strategy" },
  { value: "document_collection", label: "Document Collection" },
  { value: "drafting", label: "Drafting" },
  { value: "review", label: "Internal Review" },
  { value: "client_review", label: "Client Review" },
  { value: "ready_to_file", label: "Ready to File" },
  { value: "filed", label: "Filed" },
  { value: "uscis_pending", label: "USCIS Pending" },
  { value: "approved", label: "Approved" },
  { value: "denied", label: "Denied" },
  { value: "closed", label: "Closed" },
  { value: "archived", label: "Archived" },
] as const;
export const CASE_STAGE_VALUES = CASE_STAGES.map((s) => s.value);
export type CaseStage = (typeof CASE_STAGES)[number]["value"];

/**
 * Client-visible stage labels — deliberately friendlier/vaguer than the
 * internal operational labels above for a few stages, since "the manager
 * is doing internal review" and "we're preparing your filing" read very
 * differently to a client (module doc: never expose internal-only detail
 * beyond what's client-facing by design).
 */
export const CLIENT_STAGE_LABELS: Record<CaseStage, string> = {
  intake: "Getting started",
  strategy: "Building your strategy",
  document_collection: "Collecting documents",
  drafting: "Preparing your case",
  review: "Preparing your case",
  client_review: "Awaiting your review",
  ready_to_file: "Ready to file",
  filed: "Filed with USCIS",
  uscis_pending: "Pending with USCIS",
  approved: "Approved",
  denied: "Denied",
  closed: "Closed",
  archived: "Archived",
};

export const WORKSPACE_STATUSES = ["active", "suspended", "archived"] as const;
export type WorkspaceStatus = (typeof WORKSPACE_STATUSES)[number];

export const WORKSPACE_TYPES = ["primary"] as const;

export const MEMBER_TYPES = ["client", "employee"] as const;
export type MemberType = (typeof MEMBER_TYPES)[number];

export const WORKSPACE_ROLES = [
  "client",
  "project_manager",
  "case_manager",
  "contributor",
  "reviewer",
  "observer",
] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const MEMBERSHIP_STATUSES = ["invited", "active", "removed", "suspended"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

// Mirrors server/utils/caseConstants.js's CLIENT_DISPLAY_ROLE_LABELS exactly.
const CLIENT_DISPLAY_ROLE_LABELS: Partial<Record<WorkspaceRole, string>> = {
  client: "Client",
  project_manager: "Project Manager",
};
const DEFAULT_CLIENT_DISPLAY_ROLE = "Team Member";

export function clientDisplayRoleLabel(workspaceRole: string): string {
  return CLIENT_DISPLAY_ROLE_LABELS[workspaceRole as WorkspaceRole] || DEFAULT_CLIENT_DISPLAY_ROLE;
}
