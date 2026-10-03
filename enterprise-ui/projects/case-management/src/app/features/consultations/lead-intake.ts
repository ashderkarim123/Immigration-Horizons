import { Component, inject, signal, DestroyRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { combineLatest } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from '../../core/api/api.service';
import { apiErrorMessage } from '../../core/api/api-error';
interface Stage {
  value: string;
  label: string;
}
interface Lead {
  id: string;
  name: string;
  email: string;
  service: string;
  message: string;
  status: string;
  priority: string;
  ownerId: string | null;
  ownerName: string;
  assignees: { user: string; name: string; taskType: string }[];
  caseId: string | null;
}
interface LeadDetail extends Lead {
  team: { id: string; name: string; canManageCases: boolean }[];
  notes: { id: string; content: string; author: string; createdAt: string }[];
  activity: { id: string; message: string; actor: string; createdAt: string }[];
  delivery: {
    state: string;
    method: string;
    confirmationNote: string;
    files: { id: string; name: string; url: string; status: string }[];
  } | null;
  interactionId: string | null;
  stages: Stage[];
  taskTypes: string[];
  actions: {
    canEdit: boolean;
    canAssign: boolean;
    canNote: boolean;
    canDeliver: boolean;
    canInitialize: boolean;
    canConvert: boolean;
  };
}
@Component({
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe],
  template: `<div class="page-header">
      <h1>Lead intake</h1>
      <p class="page-subtitle">
        Review new inquiries, assign a team, and create a case when the client is ready.
      </p>
    </div>
    @if (error()) {
      <p role="alert" class="alert alert-error">
        {{ error() }} <button type="button" (click)="load()">Retry</button>
      </p>
    }
    @if (success()) {
      <p role="status" class="alert alert-success">{{ success() }}</p>
    }
    @if (loading()) {
      <p role="status">Loading intake…</p>
    } @else if (detail(); as lead) {
      <a routerLink="/intake">← All leads</a>
      <h2>{{ lead.name }}</h2>
      <p>{{ lead.email }} · {{ lead.service }}</p>
      <p>{{ lead.message }}</p>
      <div class="toolbar">
        @if (lead.caseId) {
          <a class="btn btn-primary" [routerLink]="['/cases', lead.caseId]">Open case</a>
        }
        @if (lead.actions.canConvert) {
          <a
            class="btn btn-primary"
            routerLink="/cases/new"
            [queryParams]="{ consultationId: lead.id }"
            >Create case from inquiry</a
          >
        }
        @if (lead.interactionId) {
          <a class="btn btn-secondary" [routerLink]="['/consultations', lead.interactionId]"
            >Open consultation</a
          >
        } @else if (lead.actions.canInitialize) {
          <button
            class="btn btn-secondary"
            type="button"
            [disabled]="busy()"
            (click)="mutate('initialize-interaction', {})"
          >
            Start consultation
          </button>
        }
      </div>
      @if (lead.actions.canEdit) {
        <form (ngSubmit)="saveLead()">
          <h3>Lead progress</h3>
          <label for="lead-status">Status</label
          ><select id="lead-status" name="status" [(ngModel)]="status">
            @for (stage of lead.stages; track stage.value) {
              <option [value]="stage.value">{{ stage.label }}</option>
            }</select
          ><label for="lead-priority">Priority</label
          ><select id="lead-priority" name="priority" [(ngModel)]="priority">
            <option>low</option>
            <option>medium</option>
            <option>high</option>
            <option>urgent</option></select
          ><button class="btn btn-primary" [disabled]="busy()">Save progress</button>
        </form>
      }
      @if (lead.actions.canAssign) {
        <form (ngSubmit)="saveTeam()">
          <h3>Lead team</h3>
          <label for="lead-owner">Owner</label
          ><select id="lead-owner" name="owner" [(ngModel)]="ownerId">
            <option value="">Unassigned</option>
            @for (employee of lead.team; track employee.id) {
              @if (employee.canManageCases) {
                <option [value]="employee.id">{{ employee.name }}</option>
              }
            }
          </select>
          @for (assignment of assignees; track $index; let index = $index) {
            <fieldset>
              <legend>Assignment {{ index + 1 }}</legend>
              <label [for]="'lead-person-' + index">Employee</label
              ><select
                [id]="'lead-person-' + index"
                [name]="'employee-' + index"
                [(ngModel)]="assignment.user"
                required
              >
                <option value="">Choose employee</option>
                @for (employee of lead.team; track employee.id) {
                  <option [value]="employee.id">{{ employee.name }}</option>
                }</select
              ><label [for]="'lead-area-' + index">Work area</label
              ><select
                [id]="'lead-area-' + index"
                [name]="'area-' + index"
                [(ngModel)]="assignment.taskType"
              >
                @for (type of lead.taskTypes; track type) {
                  <option>{{ type }}</option>
                }</select
              ><button type="button" (click)="assignees.splice(index, 1)">Remove assignment</button>
            </fieldset>
          }
          <button
            type="button"
            (click)="assignees.push({ user: '', taskType: 'Other' })"
            [disabled]="assignees.length >= 20"
          >
            Add assignment</button
          ><button class="btn btn-primary" [disabled]="busy()">Save lead team</button>
          <p>Case teams are managed separately after conversion.</p>
        </form>
      } @else {
        <h3>Lead team</h3>
        <p>Owner: {{ lead.ownerName || 'Unassigned' }}</p>
        @for (person of lead.assignees; track $index) {
          <p>{{ person.name }} · {{ person.taskType }}</p>
        }
      }
      <h3>Internal notes</h3>
      @if (lead.actions.canNote) {
        <form (ngSubmit)="addNote()">
          <label for="lead-note">Note for staff</label
          ><textarea
            id="lead-note"
            name="note"
            [(ngModel)]="note"
            maxlength="5000"
            required
          ></textarea
          ><button class="btn btn-primary" [disabled]="busy() || !note.trim()">
            Add internal note
          </button>
        </form>
      }
      @for (entry of lead.notes; track entry.id) {
        <article>
          <p>{{ entry.content }}</p>
          <small>{{ entry.author }} · {{ entry.createdAt | date: 'medium' }}</small>
        </article>
      } @empty {
        <p>No internal notes yet.</p>
      }
      @if (lead.actions.canDeliver || lead.delivery) {
        <h3>Delivery record</h3>
        <p>
          Record prepared files and delivery confirmation. Assemble and send the package through
          your approved delivery process.
        </p>
        @if (lead.actions.canDeliver) {
          <form (ngSubmit)="saveDelivery()">
            <label for="delivery-state">Delivery status</label
            ><select id="delivery-state" name="deliveryState" [(ngModel)]="deliveryState">
              <option value="drafting">Drafting</option>
              <option value="internal_review">Internal review</option>
              <option value="client_review">Client review</option>
              <option value="ready">Ready</option>
              <option value="delivered">Delivered</option></select
            ><label for="delivery-method">Method</label
            ><select id="delivery-method" name="method" [(ngModel)]="deliveryMethod">
              <option value="email">Email</option>
              <option value="dashboard">Client portal</option>
              <option value="both">Both</option></select
            ><label for="delivery-note">Confirmation note</label
            ><textarea
              id="delivery-note"
              name="confirmation"
              [(ngModel)]="confirmationNote"
              maxlength="2000"
            ></textarea
            ><button class="btn btn-primary" [disabled]="busy()">Save delivery</button>
          </form>
          <form (ngSubmit)="addFile()">
            <label for="delivery-file">Prepared file name</label
            ><input
              id="delivery-file"
              name="fileName"
              [(ngModel)]="fileName"
              required
              maxlength="200"
            /><label for="delivery-link">File link (optional)</label
            ><input id="delivery-link" name="fileUrl" type="url" [(ngModel)]="fileUrl" /><label
              for="delivery-file-status"
              >File status</label
            ><select id="delivery-file-status" name="fileStatus" [(ngModel)]="fileStatus">
              <option>pending</option>
              <option>ready</option>
              <option>sent</option></select
            ><button class="btn btn-primary" [disabled]="busy() || !fileName.trim()">
              Add prepared file
            </button>
          </form>
        }
        @for (file of lead.delivery?.files || []; track file.id) {
          <p>
            {{ file.name }} · {{ file.status }}
            @if (file.url) {
              <a [href]="file.url" target="_blank" rel="noopener noreferrer">Open prepared file</a>
            }
          </p>
        } @empty {
          <p>No prepared files recorded.</p>
        }
      }
      <h3>Recent activity</h3>
      @for (event of lead.activity; track event.id) {
        <p>
          {{ event.message }} <small>{{ event.createdAt | date: 'medium' }}</small>
        </p>
      } @empty {
        <p>No activity recorded.</p>
      }
    } @else {
      <form (ngSubmit)="filter()">
        <label for="lead-search">Search name or email</label
        ><input id="lead-search" name="search" [(ngModel)]="search" /><label for="lead-filter"
          >Status</label
        ><select id="lead-filter" name="filter" [(ngModel)]="status">
          <option value="">All statuses</option>
          @for (stage of stages(); track stage.value) {
            <option [value]="stage.value">{{ stage.label }}</option>
          }</select
        ><button class="btn btn-primary">Search leads</button>
      </form>
      @for (lead of items(); track lead.id) {
        <article>
          <h2>
            <a [routerLink]="['/intake', lead.id]">{{ lead.name }}</a>
          </h2>
          <p>
            {{ lead.service }} · {{ label(lead.status) }} ·
            {{ lead.ownerName || 'Unassigned owner' }}
          </p>
          <p>{{ lead.email }}</p>
        </article>
      } @empty {
        <p>No leads match your filters.</p>
      }
      <div class="toolbar">
        <button type="button" [disabled]="page() <= 1" (click)="goPage(page() - 1)">Previous</button
        ><span>Page {{ page() }} of {{ totalPages() }}</span
        ><button type="button" [disabled]="page() >= totalPages()" (click)="goPage(page() + 1)">
          Next
        </button>
      </div>
    }`,
  styles: [
    `
      form {
        display: grid;
        gap: 0.6rem;
        max-width: 42rem;
        margin: 1rem 0 2rem;
      }
      article {
        border-bottom: 1px solid var(--ih-border-light);
        padding: 1rem 0;
      }
      fieldset {
        display: grid;
        gap: 0.5rem;
      }
      .toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.7rem;
        margin: 1rem 0;
      }
      small {
        color: var(--ih-text-secondary);
      }
    `,
  ],
})
export class LeadIntake {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  detail = signal<LeadDetail | null>(null);
  items = signal<Lead[]>([]);
  stages = signal<Stage[]>([]);
  page = signal(1);
  totalPages = signal(1);
  loading = signal(false);
  busy = signal(false);
  error = signal('');
  success = signal('');
  private id = '';
  private sequence = 0;
  search = '';
  status = '';
  priority = 'medium';
  ownerId = '';
  assignees: { user: string; taskType: string }[] = [];
  note = '';
  deliveryState = 'drafting';
  deliveryMethod = 'email';
  confirmationNote = '';
  fileName = '';
  fileUrl = '';
  fileStatus = 'pending';
  constructor() {
    combineLatest([this.route.paramMap, this.route.queryParamMap])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([params, query]) => {
        this.id = params.get('id') || '';
        this.search = query.get('search') || '';
        this.status = query.get('status') || '';
        this.page.set(Math.max(1, Number(query.get('page')) || 1));
        this.success.set('');
        this.busy.set(false);
        this.load();
      });
  }
  label(value: string) {
    return this.stages().find((s) => s.value === value)?.label || value.replaceAll('_', ' ');
  }
  load() {
    const sequence = ++this.sequence;
    this.loading.set(true);
    this.error.set('');
    this.detail.set(null);
    if (this.id)
      this.api.get<LeadDetail>(`/staff/leads/${this.id}`).subscribe({
        next: ({ data }) => {
          if (sequence !== this.sequence) return;
          this.detail.set(data);
          this.status = data.status;
          this.priority = data.priority;
          this.ownerId = data.ownerId || '';
          this.assignees = data.assignees.map((a) => ({ user: a.user, taskType: a.taskType }));
          this.deliveryState = data.delivery?.state || 'drafting';
          this.deliveryMethod = data.delivery?.method || 'email';
          this.confirmationNote = data.delivery?.confirmationNote || '';
          this.loading.set(false);
        },
        error: (e) => this.fail(e, sequence),
      });
    else
      this.api
        .get<{ items: Lead[]; stages: Stage[]; page: number; totalPages: number }>('/staff/leads', {
          search: this.search,
          status: this.status,
          page: this.page(),
        })
        .subscribe({
          next: ({ data }) => {
            if (sequence !== this.sequence) return;
            this.items.set(data.items);
            this.stages.set(data.stages);
            this.totalPages.set(data.totalPages);
            this.loading.set(false);
          },
          error: (e) => this.fail(e, sequence),
        });
  }
  private fail(error: unknown, sequence = this.sequence) {
    if (sequence !== this.sequence) return;
    this.loading.set(false);
    this.busy.set(false);
    this.error.set(apiErrorMessage(error, 'Could not load or update this intake record.'));
  }
  filter() {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { search: this.search || null, status: this.status || null, page: 1 },
    });
  }
  goPage(page: number) {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page },
      queryParamsHandling: 'merge',
    });
  }
  mutate(action: string, body: object, patch = false) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.success.set('');
    const sequence = this.sequence;
    const path = `/staff/leads/${this.id}${action ? '/' + action : ''}`;
    const request = patch ? this.api.patch(path, body) : this.api.post(path, body);
    request.subscribe({
      next: () => {
        if (sequence !== this.sequence) return;
        if (action === 'notes') this.note = '';
        this.busy.set(false);
        this.success.set('Changes saved.');
        this.load();
      },
      error: (e) => this.fail(e, sequence),
    });
  }
  saveLead() {
    this.mutate('', { status: this.status, priority: this.priority }, true);
  }
  saveTeam() {
    this.mutate('assign', { ownerId: this.ownerId || null, assignees: this.assignees });
  }
  addNote() {
    this.mutate('notes', { content: this.note });
  }
  saveDelivery() {
    this.mutate('delivery', {
      state: this.deliveryState,
      method: this.deliveryMethod,
      confirmationNote: this.confirmationNote,
    });
  }
  addFile() {
    this.mutate('delivery/files', {
      name: this.fileName,
      url: this.fileUrl,
      status: this.fileStatus,
    });
  }
}
