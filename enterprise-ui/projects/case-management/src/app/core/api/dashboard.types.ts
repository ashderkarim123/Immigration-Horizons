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
