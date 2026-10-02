/** DTOs for /api/v1/staff/tasks* and /staff/cases/:id/tasks (server/services/taskDto.js). */

// Mirror Task.TYPES / STATUSES / PRIORITIES in server/models/admin/Task.js;
// staff-tasks.integration.test.js fails if they drift.
export const TASK_TYPES = [
  'Petition Writing', 'Business Plan', 'Recommendation Letters', 'Expert Opinion Letters', 'USCIS Forms',
  'Evidence Review', 'Client Follow-Up', 'QC Review', 'Package Assembly', 'Delivery', 'Other',
] as const;
export const TASK_STATUSES = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'waiting', label: 'Waiting on Client' },
  { value: 'review', label: 'In Review' },
  { value: 'completed', label: 'Completed' },
] as const;
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

export type TaskType = (typeof TASK_TYPES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number]['value'];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** Server-derived for this actor and this task; the UI never infers them from a role. */
export interface TaskActions {
  canEdit: boolean;
  canChangeStatus: boolean;
  canAssign: boolean;
}

export interface TaskItem {
  id: string;
  title: string;
  type: TaskType;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignee: { id: string; displayName: string } | null;
  case: { id: string; caseNumber: string; title: string } | null;
  lead: { id: string; displayName: string } | null;
  actions: TaskActions;
}

/** Body for create (POST /cases/:id/tasks) and edit (PATCH /tasks/:id). */
export interface TaskFields {
  title: string;
  type: TaskType;
  priority: TaskPriority;
  dueDate: string | null;
  description: string;
}
