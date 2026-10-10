/**
 * DTOs for GET /api/v1/staff/reports/*, shaped exactly like server/services/reporting. Every metric is explicit about its basis:
 * a snapshot is the state right now, a period is events between from and to. `null` means "not available to you", never zero.
 */
export type ReportName = 'overview' | 'pipeline' | 'workload' | 'deadlines' | 'review-queues';
export type ReportScope = 'accessible' | 'mine' | 'firm';
export type ReportBasis = 'snapshot' | 'period' | 'mixed';

export const REPORT_TABS: { key: ReportName; label: string; exportable: boolean }[] = [
  { key: 'overview', label: 'Overview', exportable: false },
  { key: 'pipeline', label: 'Case pipeline', exportable: true },
  { key: 'workload', label: 'Workload', exportable: true },
  { key: 'deadlines', label: 'Deadlines', exportable: true },
  { key: 'review-queues', label: 'Review queues', exportable: true },
];

export interface ReportMeta {
  requestId: string;
  asOf: string;
  timeZone: string;
  scope: ReportScope;
  basis: ReportBasis;
  from?: string;
  to?: string;
}

export interface ReportFilters {
  scope: ReportScope;
  from: string | null;
  to: string | null;
  caseType: string | null;
  stage: string | null;
  priority: string | null;
  /** A deadline kind or a review-queue key, depending on the report. */
  source: string | null;
  granularity: 'week' | 'month' | null;
}

export interface Metric {
  key: string;
  label: string;
  basis: 'snapshot' | 'period';
  value: number | null;
  href: string;
}

export interface OverviewReport {
  snapshot: Metric[];
  period: { from: string; to: string; metrics: Metric[] };
}

export interface CountRow {
  key: string;
  label: string;
  count: number;
}

export interface PipelineReport {
  snapshot: { total: number; byStage: CountRow[]; byCaseType: CountRow[]; byPriority: CountRow[]; byProjectManager: CountRow[] };
  period: { from: string; to: string; granularity: 'week' | 'month'; series: { bucket: string; start: string; opened: number; closed: number }[]; totals: { opened: number; closed: number } };
}

export interface WorkloadReport {
  snapshot: {
    rows: { employeeId: string; name: string; openCases: number; openTasks: number; overdueTasks: number; dueSoonTasks: number }[];
    unassignedTasks: number | null;
    casesWithoutProjectManager: number;
    scopeNote: string;
  };
}

export interface DeadlineRow {
  date: string;
  kind: string;
  kindLabel: string;
  title: string;
  case: { id: string; caseNumber: string; title: string };
  status: string;
  person: string | null;
  overdue: boolean;
  link: { path: string; queryParams: Record<string, string> };
}

export interface DeadlinesReport {
  snapshot: {
    overdue: number;
    dueToday: number;
    dueWithin7Days: number;
    dueWithin30Days: number;
    bySource: { key: string; label: string; count: number }[];
    overdueLookbackDays: number;
    truncated: boolean;
    rows: DeadlineRow[];
    rowsShown: number;
    rowsTotal: number;
  };
}

export interface QueueRow {
  caseId: string | null;
  caseNumber: string | null;
  caseTitle: string;
  count: number;
  link: { path: string; queryParams: Record<string, string> };
}

export interface ReviewQueue {
  key: string;
  label: string;
  available: boolean;
  count: number | null;
  rows: QueueRow[];
  rowsTotal: number;
}

export interface ReviewQueuesReport {
  snapshot: { queues: ReviewQueue[]; rowLimit: number };
}

export interface Report<T> {
  data: T;
  meta: ReportMeta;
}

export const DEADLINE_SOURCES = [
  { value: 'target_filing', label: 'Target filing dates' },
  { value: 'task_due', label: 'Tasks' },
  { value: 'document_due', label: 'Document requests' },
  { value: 'query_due', label: 'Query responses' },
  { value: 'uscis_response', label: 'USCIS responses' },
  { value: 'manual_event', label: 'Deadline events' },
] as const;

export const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
] as const;
