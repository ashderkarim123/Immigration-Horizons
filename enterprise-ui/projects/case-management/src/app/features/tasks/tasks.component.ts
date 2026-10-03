import { Component, inject, OnInit, signal } from '@angular/core';
import { ApiService } from '../../core/api/api.service';
import { apiErrorMessage } from '../../core/api/api-error';
import { Paginated } from '../../core/api/case.types';
import { TaskApi } from '../../core/api/task-api.service';
import { TASK_STATUSES, TaskItem, TaskStatus } from '../../core/api/task.types';
import { TaskFormDialogComponent } from '../../shared/task-form-dialog.component';
import { ToastService } from '../../shared/toast.service';
import { DatePipe } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import { PaginationComponent } from '../../shared/pagination.component';
import { SkeletonComponent } from '../../shared/skeleton.component';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state.component';

@Component({
  selector: 'ih-tasks',
  standalone: true,
  imports: [
    DatePipe,
    RouterLink,
    FormsModule,
    StatusBadgeComponent,
    PaginationComponent,
    SkeletonComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TaskFormDialogComponent
  ],
  templateUrl: './tasks.component.html',
  styleUrls: ['../dashboard/dashboard.scss', '../cases/cases.scss']
})
export class TasksComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private taskApi = inject(TaskApi);
  private toast = inject(ToastService);

  readonly statuses = TASK_STATUSES;
  tasks = signal<TaskItem[]>([]);
  editing = signal<TaskItem | null>(null);
  isLoading = signal(true);
  isError = signal(false);
  errorMessage = signal('');

  // Pagination state
  page = signal(1);
  pageSize = signal(10);
  totalItems = signal(0);
  totalPages = signal(1);

  // Filters
  searchQuery = signal('');
  selectedScope = signal('mine');
  selectedStatus = signal('');
  selectedPriority = signal('');
  selectedDue = signal('');
  selectedAssignee = signal('');

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.page.set(params['page'] ? parseInt(params['page'], 10) : 1);
      this.searchQuery.set(params['q'] || '');
      this.selectedScope.set(params['scope'] || 'mine');
      this.selectedStatus.set(params['status'] || '');
      this.selectedPriority.set(params['priority'] || '');
      this.selectedDue.set(params['due'] || '');
      this.selectedAssignee.set(params['assignee'] || '');
      this.loadTasks();
    });
  }

  loadTasks(): void {
    this.isLoading.set(true);
    this.isError.set(false);

    const queryParams: Record<string, any> = {
      page: this.page(),
      limit: this.pageSize(),
    };

    if (this.searchQuery()) queryParams['search'] = this.searchQuery();
    if (this.selectedScope() !== 'mine') queryParams['scope'] = this.selectedScope();
    if (this.selectedStatus()) queryParams['status'] = this.selectedStatus();
    if (this.selectedPriority()) queryParams['priority'] = this.selectedPriority();
    if (this.selectedDue()) queryParams['due'] = this.selectedDue();
    if (this.selectedAssignee()) queryParams['assignee'] = this.selectedAssignee();

    this.api.get<Paginated<TaskItem>>('/staff/tasks', queryParams).subscribe({
      next: ({ data }) => {
        this.tasks.set(data.items);
        this.totalItems.set(data.total);
        this.totalPages.set(Math.max(1, data.totalPages));
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isError.set(true);
        this.errorMessage.set(apiErrorMessage(err, 'Failed to load tasks.'));
        this.isLoading.set(false);
      }
    });
  }

  onFilterChange(): void {
    this.page.set(1);
    this.updateUrlAndLoad();
  }

  onPageChange(newPage: number): void {
    this.page.set(newPage);
    this.updateUrlAndLoad();
  }

  private updateUrlAndLoad(): void {
    const queryParams: Record<string, any> = {};

    if (this.page() > 1) queryParams['page'] = this.page();
    if (this.searchQuery()) queryParams['q'] = this.searchQuery();
    if (this.selectedScope() !== 'mine') queryParams['scope'] = this.selectedScope();
    if (this.selectedStatus()) queryParams['status'] = this.selectedStatus();
    if (this.selectedPriority()) queryParams['priority'] = this.selectedPriority();
    if (this.selectedDue()) queryParams['due'] = this.selectedDue();
    if (this.selectedAssignee()) queryParams['assignee'] = this.selectedAssignee();

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: ''
    });
  }

  /** Every mutation answers with the refreshed task, so the row is replaced rather than merged. */
  private replace(task: TaskItem): void {
    this.tasks.update((list) => list.map((t) => (t.id === task.id ? task : t)));
  }

  setStatus(task: TaskItem, select: HTMLSelectElement): void {
    this.taskApi.setStatus(task.id, select.value as TaskStatus).subscribe({
      next: ({ data }) => this.replace(data),
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to change the status.'));
        select.value = task.status; // show the real status again
      }
    });
  }

  onSaved(task: TaskItem): void {
    this.editing.set(null);
    this.replace(task);
  }

  isOverdue(task: TaskItem): boolean {
    if (!task.dueDate || task.status === 'completed') return false;
    return new Date(task.dueDate) < new Date();
  }
}
