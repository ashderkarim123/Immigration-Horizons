/**
 * DTOs for /api/v1/staff/cases*, shaped exactly like server/routes/api/v1/staff/cases.js.
 * The API returns `id`, never Mongo's `_id`; pagination is flat (total/totalPages).
 */

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
}

export interface CaseManagerRef {
  id: string;
  name: string;
  avatar: string | null;
}

export interface CaseClientRef {
  id: string;
  displayName: string;
  email: string;
}

export interface CaseListItem {
  id: string;
  caseNumber: string;
  title: string;
  caseType: string;
  currentStage: string;
  priority: string;
  targetFilingDate: string | null;
  archivedAt: string | null;
  updatedAt: string;
  projectManager: CaseManagerRef | null;
  primaryClient: CaseClientRef | null;
}

export interface CaseActions {
  canManageCase: boolean;
  canAssignManager: boolean;
  canArchive: boolean;
  canManageMembers: boolean;
  canPublishClientUpdate: boolean;
}

export interface CaseDetail extends Omit<CaseListItem, 'primaryClient'> {
  nextMilestone?: { label: string; date: string; tab: string } | null;
  overview?: { openTasks: number; unreadConversations: number; recentActivity: { id: string; message: string; createdAt: string }[] };
  availableTabs?: string[];
  workSummary?: import('./dashboard.types').WorkQueue[];
  createdAt: string;
  workspaceId: string;
  primaryClient: (CaseClientRef & { firstName: string; lastName: string }) | null;
  actions: CaseActions;
}

export interface CaseMemberEmployee {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar: string | null;
  jobTitle: string;
  department: string;
}

export interface CaseMember {
  id: string;
  memberType: 'employee' | 'client';
  workspaceRole: string;
  status: string;
  clientVisible: boolean;
  joinedAt: string;
  employee: CaseMemberEmployee | null;
  client: CaseClientRef | null;
}

export type MemberOption = CaseMemberEmployee & { canManageCases?: boolean };

export interface CaseActivityItem {
  id: string;
  type: string;
  message: string;
  actorName: string;
  createdAt: string;
  meta: Record<string, unknown> | null;
}
