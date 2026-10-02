/** GET /api/v1/staff/inbox (server/services/staffChatService.js loadInbox). */
export interface InboxItem {
  channelId: string;
  channelName: string;
  audience: 'client_and_team' | 'staff_only' | 'restricted';
  case: { id: string; caseNumber: string; title: string } | null;
  latestMessage: {
    senderName: string;
    senderType: 'client' | 'employee' | 'system';
    preview: string;
    createdAt: string;
  };
  unreadCount: number;
}
