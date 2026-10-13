/** DTO for GET /api/v1/staff/dashboard (server/routes/api/v1/staff/dashboard.js). */
import { TaskItem } from './task.types';

/** A case the way staff recognise it: the client first. The case number is a reference, never the headline. */
export interface DashboardClientCase {
  id: string;
  caseNumber: string;
  title: string;
  caseType: string;
  currentStage: string;
  priority: string;
  targetFilingDate: string | null;
  updatedAt: string;
  /** `id` is null for someone who may not open client records; the name is still shown. */
  client: { id: string | null; name: string } | null;
  projectManager: { id: string; name: string } | null;
  /** This employee's next open task on the case, or the case's next open task. */
  nextAction: { taskId: string; title: string; dueDate: string | null; assignee: string | null } | null;
  /** `documentRequests` is null for someone who cannot see documents. */
  pending: { openTasks: number; documentRequests: number | null };
}

export interface DashboardActivity {
  id: string;
  type: string;
  message: string;
  actorName: string;
  createdAt: string;
  case: { id: string; caseNumber: string; title: string; clientName?: string; caseType?: string | null };
}

export interface DashboardMetrics {
  workspaceLabel?: string;
  /** 'organization' for someone who sees every case; 'mine' for someone who sees their assigned cases. */
  scope?: 'organization' | 'mine';
  workQueues?: WorkQueue[];
  /** Null when the actor cannot see USCIS tracking (no card); otherwise filings needing action, same filter as the queue. */
  uscisActionRequired?: number | null;
  employeeWorkload?: { employeeId: string; name: string; openTasks: number; overdueTasks: number }[];
  role: string;
  myCases: number;
  activeClients?: number;
  tasksDueToday?: number;
  newAssignedCases?: number;
  /** Null when the actor has none of the queues behind the card. */
  casesAwaitingClientDocuments?: number | null;
  casesAwaitingReview?: number | null;
  upcomingDeadlines: number;
  unansweredQueries: number;
  queriesAwaitingScheduling: number;
  unreadClientMessages: number;
  myOpenTasks: number;
  myOverdueTasks: number;
  clientCases?: DashboardClientCase[];
  recentActivity?: DashboardActivity[];
  myTasks: TaskItem[];
}

export interface WorkQueue {
  key: string;
  label: string;
  tab: string;
  count: number;
  items: { caseId: string; title: string; caseNumber: string; clientName?: string; caseType?: string; count: number }[];
}
