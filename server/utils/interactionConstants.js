/**
 * Centralized consultation-interaction vocabulary. Mirrored (not shared at
 * runtime) by src/lib/content/interaction-constants.ts — see
 * docs/architecture/ADR-003-consultation-interactions.md §5 and
 * server/test/interaction-schema-contract.test.js.
 */

const SCOPE_TYPES = ['consultation', 'case'];

const INTERACTION_TYPES = [
  'initial_consultation',
  'follow_up_query',
  'scheduled_consultation',
  'client_question',
  'document_question',
  'case_update_request',
];

const INTERACTION_STATUSES = [
  'submitted',
  'acknowledged',
  'scheduled',
  'in_progress',
  'answered',
  'awaiting_client',
  'rescheduled',
  'cancelled',
  'no_show',
  'closed',
];

// Statuses that still require employee action — the precise definition
// behind the "Unanswered" queue (module doc §19).
const ACTIVE_UNANSWERED_STATUSES = [
  'submitted',
  'acknowledged',
  'scheduled',
  'in_progress',
  'awaiting_client',
  'rescheduled',
];

const INTERACTION_PRIORITIES = ['low', 'normal', 'high', 'urgent'];

const CLIENT_RESOLUTION_STATUSES = ['unresolved', 'resolved', 'needs_more_help'];

const HISTORY_EVENT_TYPES = [
  'created',
  'acknowledged',
  'assigned',
  'scheduled',
  'rescheduled',
  'status_changed',
  'answered',
  'clarification_requested',
  'client_follow_up',
  'resolution_confirmed',
  'resolution_reopened',
  'cancelled',
  'no_show',
  'closed',
];

const UPDATE_TYPES = [
  'client_follow_up',
  'employee_clarification',
  'employee_note',
  'resolution_confirmation',
  'system',
];

const UPDATE_VISIBILITY = ['client_visible', 'internal'];

const INTERACTION_TYPE_LABELS = {
  initial_consultation: 'Initial Consultation',
  follow_up_query: 'Follow-up Query',
  scheduled_consultation: 'Scheduled Consultation',
  client_question: 'Question',
  document_question: 'Document Question',
  case_update_request: 'Case Update Request',
};

const INTERACTION_STATUS_LABELS = {
  submitted: 'Submitted',
  acknowledged: 'Acknowledged',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  answered: 'Answered',
  awaiting_client: 'Awaiting Your Response',
  rescheduled: 'Rescheduled',
  cancelled: 'Cancelled',
  no_show: 'No-Show',
  closed: 'Closed',
};

module.exports = {
  SCOPE_TYPES,
  INTERACTION_TYPES,
  INTERACTION_TYPE_LABELS,
  INTERACTION_STATUSES,
  INTERACTION_STATUS_LABELS,
  ACTIVE_UNANSWERED_STATUSES,
  INTERACTION_PRIORITIES,
  CLIENT_RESOLUTION_STATUSES,
  HISTORY_EVENT_TYPES,
  UPDATE_TYPES,
  UPDATE_VISIBILITY,
};
