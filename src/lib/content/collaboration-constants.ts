/**
 * Mirrors server/utils/collaborationConstants.js — same values, same
 * shape. See docs/architecture/ADR-005-team-collaboration.md §3: kept as
 * two independent files (not a shared package), cross-checked by
 * test/collaboration-schema-contract.test.ts (root) and
 * server/test/collaboration-schema-contract.test.js (server).
 */

export const CHANNEL_TYPES = ["standard", "documents", "updates", "private", "internal"] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const CHANNEL_VISIBILITY = ["all_members", "clients_and_team", "employees_only", "restricted_members"] as const;
export type ChannelVisibility = (typeof CHANNEL_VISIBILITY)[number];

export const CLIENT_ACCESSIBLE_VISIBILITY = ["all_members", "clients_and_team"] as const;

export const CHANNEL_MEMBER_STATUSES = ["active", "removed", "suspended"] as const;
export type ChannelMemberStatus = (typeof CHANNEL_MEMBER_STATUSES)[number];

export const SENDER_TYPES = ["client", "employee", "system"] as const;
export type SenderType = (typeof SENDER_TYPES)[number];

export const MESSAGE_TYPES = [
  "text",
  "system_update",
  "document_update",
  "task_update",
  "consultation_update",
  "case_update",
] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const CLIENT_CREATABLE_MESSAGE_TYPES = ["text"] as const;

export const MENTION_MEMBER_TYPES = ["client", "employee"] as const;

export const DELETE_ACTOR_TYPES = ["client", "employee", "system"] as const;

export const MESSAGE_REVISION_ACTIONS = ["edited", "soft_deleted", "restored", "moderated"] as const;

export const MAX_MESSAGE_BODY_LENGTH = 8000;
export const MAX_MENTIONS_PER_MESSAGE = 20;
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;
export const MAX_MESSAGE_PAGE_SIZE = 50;
export const MESSAGE_EDIT_WINDOW_MS = 1000 * 60 * 60 * 24;

export type DefaultChannelTemplateEntry = {
  templateKey: string;
  name: string;
  slug: string;
  order: number;
  description: string;
  channelType: ChannelType;
  visibility: ChannelVisibility;
};

export const DEFAULT_CHANNEL_TEMPLATE: DefaultChannelTemplateEntry[] = [
  { templateKey: "general", name: "General", slug: "general", order: 1, description: "General case discussion.", channelType: "standard", visibility: "clients_and_team" },
  { templateKey: "case_updates", name: "Case Updates", slug: "case-updates", order: 2, description: "Automatic and manual case status updates.", channelType: "updates", visibility: "clients_and_team" },
  { templateKey: "documents", name: "Documents", slug: "documents", order: 3, description: "Document requests and uploads.", channelType: "documents", visibility: "clients_and_team" },
  { templateKey: "petition_strategy", name: "Petition Strategy", slug: "petition-strategy", order: 4, description: "Internal case strategy discussion.", channelType: "internal", visibility: "employees_only" },
  { templateKey: "recommendation_letters", name: "Recommendation Letters", slug: "recommendation-letters", order: 5, description: "Internal recommendation-letter drafting discussion.", channelType: "standard", visibility: "employees_only" },
  { templateKey: "uscis_forms", name: "USCIS Forms", slug: "uscis-forms", order: 6, description: "USCIS forms preparation discussion.", channelType: "standard", visibility: "clients_and_team" },
];
