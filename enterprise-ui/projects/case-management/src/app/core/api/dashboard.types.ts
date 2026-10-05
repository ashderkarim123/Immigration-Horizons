/** DTO for GET /api/v1/staff/dashboard (server/routes/api/v1/staff/dashboard.js). */

export interface DashboardRecentCase {
  id: string;
  caseNumber: string;
  title: string;
  caseType: string;
  currentStage: string;
  priority: string;
  targetFilingDate: string | null;
  updatedAt: string;
}

export interface DashboardTask {
  id: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  dueDate: string | null;
}

export interface DashboardMetrics {
  workspaceLabel?: string;
  workQueues?: WorkQueue[];
  /** Null when the actor cannot see USCIS tracking (no card); otherwise filings needing action, same filter as the queue. */
  uscisActionRequired?: number | null;
  employeeWorkload?: { employeeId: string; name: string; openTasks: number; overdueTasks: number }[];
  role: string;
  myCases: number;
  unassignedCases: number;
  upcomingDeadlines: number;
  documentsAwaitingReview: number;
  overdueDocumentRequests: number;
  unansweredQueries: number;
  queriesAwaitingScheduling: number;
  unreadClientMessages: number;
  myOpenTasks: number;
  myOverdueTasks: number;
  recentCases: DashboardRecentCase[];
  myTasks: DashboardTask[];
}

export interface WorkQueue {
  key: string;
  label: string;
  tab: string;
  count: number;
  items: { caseId: string; title: string; caseNumber: string; count: number }[];
}
