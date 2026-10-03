import { Component, inject, input, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ApiService } from '../../../../core/api/api.service';
import { apiErrorMessage } from '../../../../core/api/api-error';
import { TaskApi } from '../../../../core/api/task-api.service';
import { TASK_STATUSES, TaskItem, TaskStatus } from '../../../../core/api/task.types';
import { StatusBadgeComponent } from '../../../../shared/status-badge.component';
import { SkeletonComponent } from '../../../../shared/skeleton.component';
import { EmptyStateComponent } from '../../../../shared/empty-state.component';
import { ErrorStateComponent } from '../../../../shared/error-state.component';
import { TaskFormDialogComponent } from '../../../../shared/task-form-dialog.component';
import { ToastService } from '../../../../shared/toast.service';

@Component({
  selector: 'ih-tasks-tab',
  standalone: true,
  imports: [DatePipe, StatusBadgeComponent, SkeletonComponent, EmptyStateComponent, ErrorStateComponent, TaskFormDialogComponent],
  template: `
    <div class="section-card card">
      <div class="tasks-head">
        <h3 class="card-title m-0">Case Tasks</h3>
        @if (canCreate()) {
          <button type="button" class="btn btn-primary" (click)="openCreate()">New Task</button>
        }
      </div>

      @if (isLoading()) {
        <ih-skeleton [rows]="3" rowHeight="2rem"></ih-skeleton>
      } @else if (isError()) {
        <ih-error-state title="Failed to load tasks" message="The case tasks could not be loaded." (retry)="load()"></ih-error-state>
      } @else if (tasks().length === 0) {
        <ih-empty-state title="No tasks yet" description="There are no tasks on this case."></ih-empty-state>
      } @else {
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr><th>Title</th><th>Assignee</th><th>Status</th><th>Priority</th><th>Due Date</th><th></th></tr>
            </thead>
            <tbody>
              @for (t of tasks(); track t.id) {
                <tr>
                  <td>
                    <div class="fw-medium">{{ t.title }}</div>
                    <div class="text-secondary small">{{ t.type }}</div>
                  </td>
                  <td>{{ t.assignee?.displayName || 'Unassigned' }}</td>
                  <td>
                    @if (t.actions.canChangeStatus) {
                      <select #sel class="form-select" [attr.aria-label]="'Status of ' + t.title" (change)="setStatus(t, sel)">
                        @for (s of statuses; track s.value) { <option [value]="s.value" [selected]="s.value === t.status">{{ s.label }}</option> }
                      </select>
                    } @else {
                      <ih-status-badge [status]="t.status"></ih-status-badge>
                    }
                  </td>
                  <td><ih-status-badge [status]="t.priority"></ih-status-badge></td>
                  <td>{{ t.dueDate ? (t.dueDate | date:'mediumDate':'UTC') : 'None' }}</td>
                  <td>
                    @if (t.actions.canEdit) {
                      <button type="button" class="btn btn-sm btn-secondary" (click)="openEdit(t)">Edit</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <ih-task-form-dialog
      [open]="dialogOpen()"
      [caseId]="caseId()"
      [task]="editing()"
      [canAssignOnCreate]="canCreate()"
      (saved)="onSaved($event)"
      (closed)="dialogOpen.set(false)"
    ></ih-task-form-dialog>
  `,
  styles: [`.tasks-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }`]
})
export class TasksTabComponent implements OnInit {
  private api = inject(ApiService);
  private taskApi = inject(TaskApi);
  private toast = inject(ToastService);
  private createRequested = false;
  createOnLoad = input(false);

  caseId = input.required<string>();

  readonly statuses = TASK_STATUSES;
  tasks = signal<TaskItem[]>([]);
  canCreate = signal(false);
  isLoading = signal(true);
  isError = signal(false);
  dialogOpen = signal(false);
  editing = signal<TaskItem | null>(null);

  ngOnInit() {
    this.load();
  }

  load() {
    this.isLoading.set(true);
    this.isError.set(false);
    this.api.get<{ tasks: TaskItem[]; canCreate: boolean }>(`/staff/cases/${this.caseId()}/tasks`).subscribe({
      next: ({ data }) => {
        this.tasks.set(data.tasks);
        this.canCreate.set(data.canCreate);
        this.isLoading.set(false);
        if (!this.createRequested && data.canCreate && this.createOnLoad()) {
          this.createRequested = true;
          this.openCreate();
        }
      },
      error: () => {
        this.isError.set(true);
        this.isLoading.set(false);
      }
    });
  }

  openCreate() {
    this.editing.set(null);
    this.dialogOpen.set(true);
  }

  openEdit(task: TaskItem) {
    this.editing.set(task);
    this.dialogOpen.set(true);
  }

  onSaved(task: TaskItem) {
    this.dialogOpen.set(false);
    this.tasks.update((list) => (list.some((t) => t.id === task.id) ? list.map((t) => (t.id === task.id ? task : t)) : [task, ...list]));
  }

  setStatus(task: TaskItem, select: HTMLSelectElement) {
    this.taskApi.setStatus(task.id, select.value as TaskStatus).subscribe({
      next: ({ data }) => this.onSaved(data),
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to change the status.'));
        select.value = task.status; // show the real status again
      }
    });
  }
}
