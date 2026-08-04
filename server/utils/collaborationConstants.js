/**
 * Centralized team-collaboration vocabulary. Mirrored (not shared at
 * runtime) by src/lib/content/collaboration-constants.ts — see
 * docs/architecture/ADR-005-team-collaboration.md §3 and
 * server/test/collaboration-schema-contract.test.js.
 */

const CHANNEL_TYPES = ['standard', 'documents', 'updates', 'private', 'internal'];

const CHANNEL_VISIBILITY = ['all_members', 'clients_and_team', 'employees_only', 'restricted_members'];

// Visibility values a client may ever see without an additional
// ChannelMember check (ADR-005 §4/§6). restricted_members channels are
// client-visible only when the client also holds an active ChannelMember
// row — handled separately in policy, not by this list.
const CLIENT_ACCESSIBLE_VISIBILITY = ['all_members', 'clients_and_team'];

const CHANNEL_MEMBER_STATUSES = ['active', 'removed', 'suspended'];

const SENDER_TYPES = ['client', 'employee', 'system'];

const MESSAGE_TYPES = [
  'text',
  'system_update',
  'document_update',
  'task_update',
  'consultation_update',
  'case_update',
];

// Clients may only ever create plain text messages — every other type is
// system/employee-originated (module doc §13: "Clients should normally
// create only text messages").
const CLIENT_CREATABLE_MESSAGE_TYPES = ['text'];

const MENTION_MEMBER_TYPES = ['client', 'employee'];

// Polymorphic actor type for deletion/moderation — mirrors
// actorSnapshot.js's shape. 'env_fallback' is deliberately excluded from
// ever being an accepted deleting/moderating actor at the service layer
// (same rule already applied to answerInteraction/requestClarification in
// Cycle 3 — see server/services/interactionService.js) since it has no
// persistent AdminUser id and deletedByAdmin is a required reference once
// deletedByType is 'employee'.
const DELETE_ACTOR_TYPES = ['client', 'employee', 'system'];

const MESSAGE_REVISION_ACTIONS = ['edited', 'soft_deleted', 'restored', 'moderated'];

const MAX_MESSAGE_BODY_LENGTH = 8000;
const MAX_MENTIONS_PER_MESSAGE = 20;
const MAX_ATTACHMENTS_PER_MESSAGE = 10;
const MAX_MESSAGE_PAGE_SIZE = 50;
const MESSAGE_EDIT_WINDOW_MS = 1000 * 60 * 60 * 24; // 24 hours, client/employee-own-message edits

/**
 * Default channel template — see ADR-005 §20 for the visibility-default
 * reasoning (Recommendation Letters is employees_only; the finished
 * letters themselves are already client-visible through Cycle 5's
 * document category of the same name).
 */
const DEFAULT_CHANNEL_TEMPLATE = [
  { templateKey: 'general', name: 'General', slug: 'general', order: 1, description: 'General case discussion.', channelType: 'standard', visibility: 'clients_and_team' },
  { templateKey: 'case_updates', name: 'Case Updates', slug: 'case-updates', order: 2, description: 'Automatic and manual case status updates.', channelType: 'updates', visibility: 'clients_and_team' },
  { templateKey: 'documents', name: 'Documents', slug: 'documents', order: 3, description: 'Document requests and uploads.', channelType: 'documents', visibility: 'clients_and_team' },
  { templateKey: 'petition_strategy', name: 'Petition Strategy', slug: 'petition-strategy', order: 4, description: 'Internal case strategy discussion.', channelType: 'internal', visibility: 'employees_only' },
  { templateKey: 'recommendation_letters', name: 'Recommendation Letters', slug: 'recommendation-letters', order: 5, description: 'Internal recommendation-letter drafting discussion.', channelType: 'standard', visibility: 'employees_only' },
  { templateKey: 'uscis_forms', name: 'USCIS Forms', slug: 'uscis-forms', order: 6, description: 'USCIS forms preparation discussion.', channelType: 'standard', visibility: 'clients_and_team' },
];

module.exports = {
  CHANNEL_TYPES,
  CHANNEL_VISIBILITY,
  CLIENT_ACCESSIBLE_VISIBILITY,
  CHANNEL_MEMBER_STATUSES,
  SENDER_TYPES,
  MESSAGE_TYPES,
  CLIENT_CREATABLE_MESSAGE_TYPES,
  MENTION_MEMBER_TYPES,
  DELETE_ACTOR_TYPES,
  MESSAGE_REVISION_ACTIONS,
  MAX_MESSAGE_BODY_LENGTH,
  MAX_MENTIONS_PER_MESSAGE,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_MESSAGE_PAGE_SIZE,
  MESSAGE_EDIT_WINDOW_MS,
  DEFAULT_CHANNEL_TEMPLATE,
};
