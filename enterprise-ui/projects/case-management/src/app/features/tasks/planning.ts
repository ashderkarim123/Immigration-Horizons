import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { ApiService } from '../../core/api/api.service';
import { TaskItem } from '../../core/api/task.types';
import { apiErrorMessage } from '../../core/api/api-error';
interface Sprint {
  id: string;
  name: string;
  goal: string;
  startDate: string;
  endDate: string;
  status: string;
}
@Component({
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe],
  template: ` <div class="page-header">
      <h1>Team planning</h1>
      <p class="page-subtitle">
        Group authorized tasks into time periods and keep delivery work moving.
      </p>
    </div>
    <a routerLink="/tasks">← Tasks</a>
    @if (error()) {
      <p class="alert alert-error" role="alert">
        {{ error() }} <button type="button" (click)="load()">Retry</button>
      </p>
    }
    @if (success()) {
      <p role="status">{{ success() }}</p>
    }
    @if (loading()) {
      <p role="status">Loading planning…</p>
    } @else {
      @if (canManage()) {
        <form (ngSubmit)="create()">
          <h2>Plan a sprint</h2>
          <label for="sprint-name">Sprint name</label
          ><input id="sprint-name" name="name" [(ngModel)]="name" maxlength="200" required /><label
            for="sprint-goal"
            >Goal</label
          ><textarea id="sprint-goal" name="goal" [(ngModel)]="goal" maxlength="2000"></textarea
          ><label for="sprint-start">Start date</label
          ><input
            id="sprint-start"
            name="start"
            type="date"
            [(ngModel)]="startDate"
            required
          /><label for="sprint-end">End date</label
          ><input id="sprint-end" name="end" type="date" [(ngModel)]="endDate" required /><button
            class="btn btn-primary"
            [disabled]="busy() || !name.trim()"
          >
            Create sprint
          </button>
        </form>
      }
      @for (sprint of sprints(); track sprint.id) {
        <article>
          <h2>{{ sprint.name }}</h2>
          <p>{{ sprint.goal }}</p>
          <p>{{ sprint.startDate | date }} – {{ sprint.endDate | date }} · {{ sprint.status }}</p>
          @if (canManage()) {
            <label [for]="'sprint-state-' + sprint.id">Sprint status</label
            ><select
              [id]="'sprint-state-' + sprint.id"
              [ngModel]="sprint.status"
              (ngModelChange)="updateSprint(sprint.id, $event)"
              [disabled]="busy()"
            >
              <option>planning</option>
              <option>active</option>
              <option>completed</option>
            </select>
          }
          <p>{{ count(sprint.id) }} visible task(s)</p>
        </article>
      } @empty {
        <p>No sprints yet. Plan a time period to group tasks.</p>
      }
      <h2>Task planning</h2>
      <p>
        Only tasks you can access appear here. Open Tasks to edit, assign, or change their status.
      </p>
      @for (task of tasks(); track task.id) {
        <article>
          <h3>{{ task.title }}</h3>
          <p>
            {{ task.case?.caseNumber || task.lead?.displayName || 'General work' }} ·
            {{ task.assignee?.displayName || 'Unassigned' }} · {{ task.status }}
          </p>
          @if (canManage() && task.actions.canAssign) {
            <label [for]="'task-sprint-' + task.id">Sprint for {{ task.title }}</label
            ><select
              [id]="'task-sprint-' + task.id"
              [ngModel]="task.sprintId || ''"
              (ngModelChange)="assignSprint(task.id, $event)"
              [disabled]="busy()"
            >
              <option value="">Unscheduled</option>
              @for (sprint of sprints(); track sprint.id) {
                <option [value]="sprint.id">{{ sprint.name }}</option>
              }
            </select>
          }
        </article>
      } @empty {
        <p>No visible tasks to plan.</p>
      }
    }`,
  styles: [
    `
      form {
        display: grid;
        gap: 0.6rem;
        max-width: 36rem;
        margin: 1rem 0;
      }
      article {
        padding: 1rem 0;
        border-bottom: 1px solid var(--ih-border-light);
      }
      select {
        display: block;
        margin: 0.5rem 0;
      }
    `,
  ],
})
export class Planning {
  private api = inject(ApiService);
  sprints = signal<Sprint[]>([]);
  tasks = signal<(TaskItem & { sprintId: string | null })[]>([]);
  canManage = signal(false);
  loading = signal(true);
  busy = signal(false);
  error = signal('');
  success = signal('');
  name = '';
  goal = '';
  startDate = '';
  endDate = '';
  constructor() {
    this.load();
  }
  count(id: string) {
    return this.tasks().filter((t) => t.sprintId === id).length;
  }
  load() {
    this.loading.set(true);
    this.error.set('');
    this.api
      .get<{
        sprints: Sprint[];
        tasks: (TaskItem & { sprintId: string | null })[];
        canManage: boolean;
      }>('/staff/planning')
      .subscribe({
        next: ({ data }) => {
          this.sprints.set(data.sprints);
          this.tasks.set(data.tasks);
          this.canManage.set(data.canManage);
          this.loading.set(false);
        },
        error: (e) => this.fail(e),
      });
  }
  private fail(error: unknown) {
    this.error.set(apiErrorMessage(error, 'Could not load or save planning.'));
    this.loading.set(false);
    this.busy.set(false);
  }
  private save(path: string, body: object, post = false) {
    if (this.busy()) return;
    this.busy.set(true);
    this.success.set('');
    const request = post ? this.api.post(path, body) : this.api.patch(path, body);
    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.success.set('Planning saved.');
        this.load();
      },
      error: (e) => this.fail(e),
    });
  }
  create() {
    this.save(
      '/staff/planning/sprints',
      { name: this.name, goal: this.goal, startDate: this.startDate, endDate: this.endDate },
      true,
    );
  }
  updateSprint(id: string, status: string) {
    this.save(`/staff/planning/sprints/${id}`, { status });
  }
  assignSprint(id: string, sprintId: string) {
    this.save(`/staff/planning/tasks/${id}`, { sprintId: sprintId || null });
  }
}
