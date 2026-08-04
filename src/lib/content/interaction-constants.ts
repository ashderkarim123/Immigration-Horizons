/**
 * Mirrors server/utils/interactionConstants.js — see
 * docs/architecture/ADR-003-consultation-interactions.md §5, cross-checked
 * by docs/architecture/interaction-schema-contract.json.
 */

export const SCOPE_TYPES = ["consultation", "case"] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];

export const INTERACTION_TYPES = [
  "initial_consultation",
  "follow_up_query",
  "scheduled_consultation",
  "client_question",
  "document_question",
  "case_update_request",
] as const;
export type InteractionType = (typeof INTERACTION_TYPES)[number];

export const INTERACTION_STATUSES = [
  "submitted",
  "acknowledged",
  "scheduled",
  "in_progress",
  "answered",
  "awaiting_client",
  "rescheduled",
  "cancelled",
  "no_show",
  "closed",
] as const;
export type InteractionStatus = (typeof INTERACTION_STATUSES)[number];

export const INTERACTION_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type InteractionPriority = (typeof INTERACTION_PRIORITIES)[number];

export const CLIENT_RESOLUTION_STATUSES = ["unresolved", "resolved", "needs_more_help"] as const;

export const UPDATE_TYPES = [
  "client_follow_up",
  "employee_clarification",
  "employee_note",
  "resolution_confirmation",
  "system",
] as const;

export const UPDATE_VISIBILITY = ["client_visible", "internal"] as const;

export const INTERACTION_TYPE_LABELS: Record<InteractionType, string> = {
  initial_consultation: "Initial Consultation",
  follow_up_query: "Follow-up Query",
  scheduled_consultation: "Scheduled Consultation",
  client_question: "Question",
  document_question: "Document Question",
  case_update_request: "Case Update Request",
};

export const INTERACTION_STATUS_LABELS: Record<InteractionStatus, string> = {
  submitted: "Submitted",
  acknowledged: "Acknowledged",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  answered: "Answered",
  awaiting_client: "Awaiting Your Response",
  rescheduled: "Rescheduled",
  cancelled: "Cancelled",
  no_show: "No-Show",
  closed: "Closed",
};

/** Statuses that still require employee action — mirrors the server's "Unanswered" queue definition. */
export const ACTIVE_UNANSWERED_STATUSES: InteractionStatus[] = [
  "submitted",
  "acknowledged",
  "scheduled",
  "in_progress",
  "awaiting_client",
  "rescheduled",
];
