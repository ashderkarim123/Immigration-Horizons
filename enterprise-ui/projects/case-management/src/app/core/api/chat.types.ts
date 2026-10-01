/** Wire contract of /api/v1/staff chat endpoints (ADR-020 §22/§24). */

export type ChatAudience = 'client_and_team' | 'staff_only' | 'restricted';

export interface ChatChannel {
  id: string;
  name: string;
  description: string;
  audience: ChatAudience;
  clientVisible: boolean;
  unreadCount: number;
  canSend: boolean;
}

export interface ChatChannelList {
  case: { id: string; caseNumber: string; title: string };
  channels: ChatChannel[];
}

export interface ChatAttachmentRef {
  documentId: string;
  displayName: string;
  mimeType?: string | null;
  extension?: string | null;
  size?: number | null;
  downloadable?: boolean;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  senderType: 'client' | 'employee' | 'system';
  senderDisplayName: string;
  isOwn: boolean;
  body: string;
  threadRootId: string | null;
  replyCount: number;
  attachments: ChatAttachmentRef[];
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  canDelete: boolean;
  canRestore: boolean;
}

export interface ChatPage {
  messages: ChatMessage[];
  nextCursor: string | null;
  syncCursor: string | null;
}

export interface ChatChanges {
  messages: ChatMessage[];
  syncCursor: string | null;
  hasMore: boolean;
}

export interface ChatThread {
  root: ChatMessage;
  replies: ChatMessage[];
}
