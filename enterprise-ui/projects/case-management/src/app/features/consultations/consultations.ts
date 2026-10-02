import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { apiErrorMessage } from '../../core/api/api-error';
import { Paginated } from '../../core/api/case.types';
interface ConsultationQuery {
  id: string; subject: string; interactionNumber: string; typeLabel: string; statusLabel: string; status: string;
  description: string; scheduledFor: string | null; timezone: string; assignedTo: string | null;
  clientVisibleResponse: string; internalResponse: string; resolutionSummary: string;
  actions?: Record<string, boolean>; team?: { id: string; name: string }[];
  history?: { id: string; eventType: string; actorName: string; createdAt: string }[];
  updates?: { id: string; body: string; visibility: string; authorName: string }[];
}
@Component({ selector: 'ih-consultations', standalone: true, imports: [FormsModule, DatePipe, RouterLink],
  template: `
    <h1>Consultations and questions</h1><p>Schedule consultations, respond to clients, and review the history of each request.</p>
    @if (error()) { <p class="alert alert-error" role="alert">{{ error() }}</p><button type="button" (click)="load()">Retry</button> }
    @if (detail(); as item) {
      <a routerLink="/consultations">← All consultations and questions</a><h2>{{ item.subject }}</h2>
      <p>{{ item.interactionNumber }} · {{ item.typeLabel }} · {{ item.statusLabel }}</p><p>{{ item.description }}</p>
      <p>Scheduled: {{ item.scheduledFor ? (item.scheduledFor | date:'medium') : 'Not scheduled' }} {{ item.timezone }}</p>
      @if (item.clientVisibleResponse) { <h3>Response shared with the client</h3><p class="plain-text">{{ item.clientVisibleResponse }}</p> }
      @if (item.internalResponse) { <h3>Staff notes</h3><p class="plain-text">{{ item.internalResponse }}</p> }
      <div class="query-actions">
        @if (item.actions?.['triage']) { <button type="button" (click)="act('acknowledge')" [disabled]="busy()">Acknowledge</button> }
        @if (item.actions?.['manage']) { <button type="button" (click)="act('status', { status: 'in_progress' })" [disabled]="busy()">Start work</button> }
        @if (item.actions?.['close']) { <button type="button" (click)="act('close')" [disabled]="busy()">Close request</button> }
      </div>
      @if (item.actions?.['assign']) { <form (ngSubmit)="act('assign', { assignedTo })"><label>Assigned staff<select name="assignedTo" [(ngModel)]="assignedTo" required><option value="">Choose staff</option>@for (person of item.team; track person.id) { <option [value]="person.id">{{ person.name }}</option> }</select></label><button type="submit" [disabled]="busy() || !assignedTo">Assign</button></form> }
      @if (item.actions?.['schedule']) { <form (ngSubmit)="schedule()"><label>Appointment date and time<input name="scheduledFor" type="datetime-local" [(ngModel)]="scheduledFor" required /></label><label>Timezone<input name="timezone" [(ngModel)]="timezone" required placeholder="For example, Asia/Karachi" /></label><p>Time is interpreted in the timezone shown above.</p><button type="submit" [disabled]="busy() || !scheduledFor || !timezone">Schedule</button></form> }
      @if (item.actions?.['answer']) {
        <form (ngSubmit)="act('answer', { clientVisibleResponse: response, internalResponse: internal, resolutionSummary: summary })"><label>Response visible to the client<textarea name="response" [(ngModel)]="response" required maxlength="5000"></textarea></label><label>Internal response (staff only)<textarea name="internal" [(ngModel)]="internal" maxlength="5000"></textarea></label><label>Resolution summary<input name="summary" [(ngModel)]="summary" maxlength="2000" /></label><button type="submit" [disabled]="busy() || !response.trim()">Send answer</button></form>
        <form (ngSubmit)="act('request-clarification', { clientVisibleQuestion: question })"><label>Ask the client for more information<textarea name="question" [(ngModel)]="question" required maxlength="5000"></textarea></label><button type="submit" [disabled]="busy() || !question.trim()">Request information</button></form>
      }
      @if (item.actions?.['manage']) { <form (ngSubmit)="act('cancel', { reason })"><label>Cancellation reason<input name="reason" [(ngModel)]="reason" maxlength="2000" required /></label><button type="submit" [disabled]="busy() || !reason.trim()">Cancel request</button>@if (item.scheduledFor) { <button type="button" (click)="act('no-show')" [disabled]="busy()">Mark no-show</button> }</form> }
      <form (ngSubmit)="act('notes', { body: note })"><label>Internal note<textarea name="note" [(ngModel)]="note" required maxlength="5000"></textarea></label><button type="submit" [disabled]="busy() || !note.trim()">Add staff note</button></form>
      <h3>Updates</h3>@for (update of item.updates; track update.id) { <p class="plain-text"><strong>{{ update.authorName }} · {{ update.visibility === 'internal' ? 'Staff only' : 'Client visible' }}</strong><br />{{ update.body }}</p> }
      <h3>History</h3><ul>@for (event of item.history; track event.id) { <li>{{ event.createdAt | date:'medium' }} · {{ event.eventType.replaceAll('_', ' ') }} · {{ event.actorName }}</li> }</ul>
    } @else if (!id) {
      <form class="query-filters" (ngSubmit)="load()"><label>Search<input name="search" [(ngModel)]="search" /></label><label>Queue<select name="queue" [(ngModel)]="queue"><option value="">All accessible requests</option><option value="mine">Assigned to me</option><option value="unanswered">Unanswered</option><option value="scheduling">Awaiting scheduling</option></select></label><button type="submit">Apply</button></form>
      <ul class="query-list">@for (item of items(); track item.id) { <li><a [routerLink]="['/consultations', item.id]"><strong>{{ item.subject }}</strong><span>{{ item.typeLabel }} · {{ item.statusLabel }} · {{ item.interactionNumber }}</span></a></li> } @empty { <li>{{ loading() ? 'Loading requests…' : 'No requests match this queue.' }}</li> }</ul>
      <div class="query-actions"><button type="button" [disabled]="page === 1 || loading()" (click)="page = page - 1; load()">Previous</button><span>Page {{ page }} of {{ pages() }}</span><button type="button" [disabled]="page >= pages() || loading()" (click)="page = page + 1; load()">Next</button></div>
    } @else if (loading()) { <p role="status">Loading request…</p> }
  `,
  styles: [`.query-list { padding: 0; list-style: none; } .query-list a { display: grid; gap: .3rem; padding: 1rem; background: var(--ih-bg-primary); border: 1px solid var(--ih-border-light); border-radius: .5rem; margin: .7rem 0; } form { display: grid; gap: .6rem; max-width: 44rem; margin: 1.5rem 0; padding: 1rem; background: var(--ih-bg-primary); border: 1px solid var(--ih-border-light); border-radius: .5rem; } label { display: grid; gap: .3rem; } input, select, textarea, button { padding: .6rem; font: inherit; border: 1px solid var(--ih-border-medium); border-radius: .3rem; } .query-actions { display: flex; flex-wrap: wrap; align-items: center; gap: .6rem; } .plain-text { white-space: pre-wrap; overflow-wrap: anywhere; }`],
})
export class Consultations implements OnInit {
  private api = inject(ApiService); private route = inject(ActivatedRoute);
  id = ''; search = ''; queue = ''; page = 1; pages = signal(1);
  items = signal<ConsultationQuery[]>([]); detail = signal<ConsultationQuery | null>(null); error = signal(''); loading = signal(false); busy = signal(false);
  assignedTo = ''; scheduledFor = ''; timezone = 'UTC'; response = ''; internal = ''; summary = ''; question = ''; reason = ''; note = '';
  ngOnInit() { this.route.paramMap.subscribe(params => { this.id = params.get('id') || ''; this.detail.set(null); this.queue = this.route.snapshot.queryParamMap.get('queue') || ''; this.load(); }); }
  load() {
    this.error.set(''); this.loading.set(true);
    if (this.id) this.api.get<ConsultationQuery>(`/staff/queries/${this.id}`).subscribe({ next: ({ data }) => { this.detail.set(data); this.assignedTo = data.assignedTo || ''; this.response = data.clientVisibleResponse; this.internal = data.internalResponse; this.summary = data.resolutionSummary; this.timezone = data.timezone || 'UTC'; this.loading.set(false); }, error: error => this.fail(error) });
    else this.api.get<Paginated<ConsultationQuery>>('/staff/queries', { search: this.search, queue: this.queue, page: this.page }).subscribe({ next: ({ data }) => { this.items.set(data.items); this.pages.set(data.totalPages); this.loading.set(false); }, error: error => this.fail(error) });
  }
  private fail(error: unknown) { this.error.set(apiErrorMessage(error, 'Could not load this request.')); this.loading.set(false); this.busy.set(false); }
  act(action: string, body: Record<string, unknown> = {}) { if (this.busy() || !this.id) return; this.busy.set(true); this.error.set(''); this.api.post(`/staff/queries/${this.id}/${action}`, body).subscribe({ next: () => { this.busy.set(false); this.note = ''; this.question = ''; this.load(); }, error: error => this.fail(error) }); }
  schedule() { this.act('schedule', { scheduledFor: this.scheduledFor, timezone: this.timezone }); }
}
