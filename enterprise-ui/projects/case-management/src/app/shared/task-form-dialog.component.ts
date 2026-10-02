import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api/api.service';
import { apiErrorMessage } from '../core/api/api-error';
import { CaseMember } from '../core/api/case.types';
import { TaskApi } from '../core/api/task-api.service';
import { TASK_PRIORITIES, TASK_TYPES, TaskItem, TaskPriority, TaskType } from '../core/api/task.types';
import { ToastService } from './toast.service';

/**
 * Create (task = null) or edit a case task. The assignee picker only appears when the
 * server says the actor may assign, and only offers active employees on the case team.
 */
@Component({
  selector: 'ih-task-form-dialog',
  standalone: true,
  imports: [FormsModule],
  template: `
    @if (open()) {
      <div class="modal-backdrop" (click)="closed.emit()">
        <div class="modal-card" role="dialog" aria-modal="true" [attr.aria-label]="heading()" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>{{ heading() }}</h3>
            <button type="button" class="btn-close" aria-label="Close" (click)="closed.emit()">×</button>
          </div>
          <div class="modal-body">
            @if (error()) { <p class="field-error" role="alert">{{ error() }}</p> }
            <label class="form-label" for="task-title">Title <span class="text-danger">*</span></label>
            <input id="task-title" class="form-control" maxlength="200" [ngModel]="title()" (ngModelChange)="title.set($event)" />

            <label class="form-label" for="task-type">Type</label>
            <select id="task-type" class="form-select" [ngModel]="type()" (ngModelChange)="type.set($event)">
              @for (t of types; track t) { <option [value]="t">{{ t }}</option> }
            </select>

            <label class="form-label" for="task-priority">Priority</label>
            <select id="task-priority" class="form-select" [ngModel]="priority()" (ngModelChange)="priority.set($event)">
              @for (p of priorities; track p) { <option [value]="p">{{ p }}</option> }
            </select>

            <label class="form-label" for="task-due">Due date</label>
            <input id="task-due" type="date" class="form-control" [ngModel]="dueDate()" (ngModelChange)="dueDate.set($event)" />

            @if (canAssign()) {
              <label class="form-label" for="task-assignee">Assignee</label>
              <select id="task-assignee" class="form-select" [ngModel]="assignee()" (ngModelChange)="assignee.set($event)">
                <option value="">Unassigned</option>
                @for (m of assignees(); track m.id) { <option [value]="m.id">{{ m.name }}</option> }
              </select>
            }

            <label class="form-label" for="task-description">Description</label>
            <textarea id="task-description" class="form-control" rows="3" [ngModel]="description()" (ngModelChange)="description.set($event)"></textarea>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" (click)="closed.emit()">Cancel</button>
            <button type="button" class="btn btn-primary" [disabled]="!title().trim() || saving()" (click)="submit()">
              {{ task() ? 'Save Task' : 'Create Task' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .modal-card { background: white; border-radius: .5rem; width: 100%; max-width: 30rem; max-height: 90vh; overflow: auto; box-shadow: 0 20px 25px -5px rgba(0,0,0,.1); }
    .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.25rem; border-bottom: 1px solid #e5e7eb; }
    .modal-header h3 { margin: 0; font-size: 1.125rem; font-weight: 600; }
    .btn-close { background: none; border: none; font-size: 1.25rem; cursor: pointer; color: #6b7280; }
    .modal-body { padding: 1.25rem; display: grid; gap: .25rem; }
    .modal-footer { display: flex; justify-content: flex-end; gap: .5rem; padding: 1rem 1.25rem; background: #f9fafb; border-top: 1px solid #e5e7eb; }
    .form-label { display: block; font-size: .875rem; font-weight: 500; margin: .5rem 0 .25rem; color: #374151; }
    .field-error { color: #b91c1c; margin: 0; }
  `]
})
export class TaskFormDialogComponent {
  private api = inject(ApiService);
  private tasks = inject(TaskApi);
  private toast = inject(ToastService);

  open = input.required<boolean>();
  caseId = input.required<string>();
  /** null = create a new task on `caseId`. */
  task = input<TaskItem | null>(null);
  /** Create only: whether the actor may assign (the case's `canCreate`). Edit uses task.actions.canAssign. */
  canAssignOnCreate = input(false);

  saved = output<TaskItem>();
  closed = output<void>();

  readonly types = TASK_TYPES;
  readonly priorities = TASK_PRIORITIES;

  title = signal('');
  type = signal<TaskType>('Other');
  priority = signal<TaskPriority>('medium');
  dueDate = signal('');
  description = signal('');
  assignee = signal('');
  assignees = signal<{ id: string; name: string }[]>([]);
  saving = signal(false);
  error = signal('');

  heading = computed(() => (this.task() ? 'Edit Task' : 'New Task'));
  canAssign = computed(() => (this.task() ? this.task()!.actions.canAssign : this.canAssignOnCreate()));

  constructor() {
    // Re-seed the form each time the dialog opens
    effect(() => {
      if (!this.open()) return;
      const t = this.task();
      this.title.set(t?.title ?? '');
      this.type.set(t?.type ?? 'Other');
      this.priority.set(t?.priority ?? 'medium');
      this.dueDate.set(t?.dueDate ? t.dueDate.slice(0, 10) : '');
      this.description.set(t?.description ?? '');
      this.assignee.set(t?.assignee?.id ?? '');
      this.error.set('');
      if (this.canAssign()) this.loadAssignees();
    });
  }

  private loadAssignees() {
    this.api.get<{ members: CaseMember[] }>(`/staff/cases/${this.caseId()}/members`).subscribe({
      next: ({ data }) =>
        this.assignees.set(
          data.members.filter((m) => m.employee && m.status === 'active').map((m) => ({ id: m.employee!.id, name: m.employee!.name }))
        ),
      error: () => this.assignees.set([])
    });
  }

  submit() {
    if (!this.title().trim() || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    const fields = {
      title: this.title().trim(),
      type: this.type(),
      priority: this.priority(),
      dueDate: this.dueDate() || null,
      description: this.description().trim(),
    };
    const existing = this.task();
    const assignee = this.assignee() || null;

    const request = existing
      ? this.tasks.update(existing.id, fields)
      : this.tasks.create(this.caseId(), { ...fields, assignee: this.canAssign() ? assignee : null });

    request.subscribe({
      next: ({ data }) => {
        // Edit: a changed assignee is its own server action (own permission), applied after the fields.
        if (existing && this.canAssign() && assignee !== (existing.assignee?.id ?? null)) {
          this.tasks.assign(existing.id, assignee).subscribe({
            next: (res) => this.finish(res.data),
            error: (err) => {
              this.saving.set(false);
              this.error.set(apiErrorMessage(err, 'Saved, but the assignee could not be changed.'));
            }
          });
        } else {
          this.finish(data);
        }
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(apiErrorMessage(err, 'Failed to save the task.'));
      }
    });
  }

  private finish(task: TaskItem) {
    this.saving.set(false);
    this.toast.success(this.task() ? 'Task updated.' : 'Task created.');
    this.saved.emit(task);
  }
}
