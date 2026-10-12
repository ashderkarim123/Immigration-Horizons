import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { ApiService } from '../../core/api/api.service';
import { apiErrorMessage } from '../../core/api/api-error';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DashboardClientCase, DashboardMetrics } from '../../core/api/dashboard.types';
import { TASK_STATUSES, TaskItem, TaskStatus } from '../../core/api/task.types';
import { AuthService } from '../../core/auth/auth.service';
import { CASE_STAGES } from '../../core/api/case-catalog';
import { CaseLabelComponent, caseTypeLabel } from '../../shared/case-label.component';
import { StatusBadgeComponent } from '../../shared/status-badge.component';

const REVIEW_QUEUES = ['document_review', 'forms_review', 'petition_review', 'packet_review'];

/**
 * The Staff home page. It answers, in this order: who are my clients, what do I have to do today, what is late or
 * blocked, and what changed. Every number and row comes from GET /staff/dashboard; nothing here is computed from a role.
 */
@Component({
  selector: 'ih-dashboard',
  standalone: true,
  imports: [DatePipe, RouterLink, FormsModule, CaseLabelComponent, StatusBadgeComponent],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss', './dashboard-home.scss'],
})
export class Dashboard implements OnInit {
  readonly auth = inject(AuthService);
  private api = inject(ApiService);

  metrics = signal<DashboardMetrics | null>(null);
  isLoading = signal(true);
  error = signal<string | null>(null);

  readonly statuses = TASK_STATUSES;
  readonly typeLabel = caseTypeLabel;
  /** Announced to screen readers and shown beside My tasks after a quick action. */
  taskNotice = signal('');
  taskError = signal('');
  savingTask = signal<string | null>(null);

  /** Narrows the client table as you type; the full, paged list lives on Cases. */
  clientFilter = signal('');

  readonly has = (capability: string) => this.auth.capabilities().includes(capability);
  /** "My …" for someone who sees their assigned cases; plain for someone who sees the whole firm. */
  readonly mine = computed(() => (this.metrics()?.scope === 'organization' ? '' : 'My '));
  readonly activeQueues = computed(() => (this.metrics()?.workQueues || []).filter((queue) => queue.count > 0));
  /** Where the "awaiting internal review" card goes: the first review queue that has anything in it. */
  readonly reviewQueue = computed(() => this.activeQueues().find((queue) => REVIEW_QUEUES.includes(queue.key))?.key || REVIEW_QUEUES[0]);
  readonly clientCases = computed<DashboardClientCase[]>(() => {
    const needle = this.clientFilter().trim().toLowerCase();
    const rows = this.metrics()?.clientCases || [];
    if (!needle) return rows;
    return rows.filter((c) => [c.client?.name, c.title, c.caseNumber, caseTypeLabel(c.caseType), c.nextAction?.title].some((v) => (v || '').toLowerCase().includes(needle)));
  });

  stageLabel(value: string): string {
    return CASE_STAGES.find((stage) => stage.value === value)?.label || value.replace(/_/g, ' ');
  }

  /** Date-only comparison in the viewer's own day, so "overdue" flips at their midnight. */
  isOverdue(date: string | null): boolean {
    if (!date) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(date).getTime() < today.getTime();
  }

  ngOnInit() {
    this.load();
  }

  load() {
    this.isLoading.set(true);
    this.error.set(null);
    this.api.get<DashboardMetrics>('/staff/dashboard').subscribe({
      next: (res) => {
        this.metrics.set(res.data);
        this.isLoading.set(false);
      },
      error: () => {
        this.error.set('Failed to load dashboard metrics.');
        this.isLoading.set(false);
      },
    });
  }

  /** Quick action from the dashboard. The server decides whether it is allowed; on success the numbers are re-read. */
  setTaskStatus(task: TaskItem, status: string) {
    if (status === task.status || this.savingTask()) return;
    this.savingTask.set(task.id);
    this.taskNotice.set('');
    this.taskError.set('');
    this.api.patch<TaskItem>(`/staff/tasks/${task.id}/status`, { status: status as TaskStatus }).subscribe({
      next: () => {
        this.savingTask.set(null);
        this.taskNotice.set(status === 'completed' ? `Completed: ${task.title}.` : `${task.title} is now ${this.statuses.find((s) => s.value === status)?.label || status}.`);
        this.refresh();
      },
      error: (err) => {
        this.savingTask.set(null);
        this.taskError.set(apiErrorMessage(err, 'The task could not be updated.'));
      },
    });
  }

  /** Re-reads the dashboard without blanking the page. */
  private refresh() {
    this.api.get<DashboardMetrics>('/staff/dashboard').subscribe({ next: (res) => this.metrics.set(res.data), error: () => undefined });
  }
}
