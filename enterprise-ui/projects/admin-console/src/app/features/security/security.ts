import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminApi } from '../../core/api/admin-api.service';
import { SecurityEvent, SecurityEventList } from '../../core/api/admin.types';
import { apiErrorMessage, apiFieldErrors } from '../../core/errors/api-error';
import { ModalComponent } from '../../shared/modal.component';
import { EmptyStateComponent, ErrorStateComponent, SkeletonComponent } from '../../shared/staff-ui';
import { humanize } from '../../shared/widgets';

const RESULT_BADGE: Record<string, string> = { success: 'badge badge-success', failure: 'badge badge-warning', denied: 'badge badge-danger' };
const SURFACES: Record<string, string> = { portal: 'Client portal', staff: 'Staff application', admin_cms: 'Admin console' };
const ACTORS: Record<string, string> = { client: 'Client', admin_user: 'Employee', env_fallback: 'Break-glass login', anonymous: 'Not signed in', system: 'System' };

/** An append-only audit record: it can be filtered and read. Nothing here edits, deletes or clears an entry. */
@Component({
  selector: 'iha-security-events',
  imports: [FormsModule, DatePipe, ModalComponent, EmptyStateComponent, ErrorStateComponent, SkeletonComponent],
  template: `
    <div class="page-header">
      <div><h1>Security Events</h1><p class="page-subtitle">The audit record of sign-ins, refusals and administrative changes across the platform. Entries cannot be changed or removed.</p></div>
    </div>

    <form class="filter-bar" role="search" (ngSubmit)="load(1)">
      <div class="field">
        <label for="se-type">Event</label>
        <select id="se-type" name="type" [(ngModel)]="filter.type"><option value="">All events</option>@for (v of options().type; track v) { <option [value]="v">{{ label(v) }}</option> }</select>
      </div>
      <div class="field">
        <label for="se-result">Result</label>
        <select id="se-result" name="result" [(ngModel)]="filter.result"><option value="">Any</option>@for (v of options().result; track v) { <option [value]="v">{{ label(v) }}</option> }</select>
      </div>
      <div class="field">
        <label for="se-surface">Application</label>
        <select id="se-surface" name="surface" [(ngModel)]="filter.surface"><option value="">Any</option>@for (v of options().surface; track v) { <option [value]="v">{{ surface(v) }}</option> }</select>
      </div>
      <div class="field">
        <label for="se-actor">Actor</label>
        <select id="se-actor" name="actorType" [(ngModel)]="filter.actorType"><option value="">Any</option>@for (v of options().actorType; track v) { <option [value]="v">{{ actor(v) }}</option> }</select>
      </div>
      <div class="field"><label for="se-email">Account email (exact)</label><input id="se-email" name="subjectEmail" type="email" [(ngModel)]="filter.subjectEmail" /></div>
      <div class="field"><label for="se-from">From</label><input id="se-from" name="from" type="date" [(ngModel)]="filter.from" [attr.aria-invalid]="!!errors()['from']" /></div>
      <div class="field"><label for="se-to">To</label><input id="se-to" name="to" type="date" [(ngModel)]="filter.to" [attr.aria-invalid]="!!errors()['to']" /></div>
      <button type="submit" class="btn btn-primary">Apply filters</button>
      <button type="button" class="btn" (click)="clear()">Clear</button>
    </form>
    @if (filterError()) { <div class="alert alert-error" role="alert">{{ filterError() }}</div> }

    @if (error()) {
      <ih-error-state title="Security events could not be loaded" [message]="error()" (retry)="load(page())" />
    } @else if (loading() && !events().length) {
      <ih-skeleton [rows]="8" rowHeight="2.5rem" />
    } @else if (!events().length) {
      <ih-empty-state title="No events found" description="Nothing in the record matches these filters." />
    } @else {
      <div class="table-wrap" [attr.aria-busy]="loading()">
        <table class="data-table stacked">
          <caption class="sr-only">Security events, newest first</caption>
          <thead><tr><th scope="col">When</th><th scope="col">Event</th><th scope="col">Result</th><th scope="col">Application</th><th scope="col">Actor</th><th scope="col">Account</th><th scope="col"><span class="sr-only">Details</span></th></tr></thead>
          <tbody>
            @for (event of events(); track event.id) {
              <tr>
                <td data-label="When">{{ event.createdAt | date: 'medium' }}</td>
                <td data-label="Event"><span class="cell-title">{{ label(event.type) }}</span></td>
                <td data-label="Result"><span [class]="badge(event.result)">{{ label(event.result) }}</span></td>
                <td data-label="Application">{{ surface(event.surface) }}</td>
                <td data-label="Actor">{{ event.actorName || actor(event.actorType) }}</td>
                <td data-label="Account">{{ event.subjectEmail || '—' }}</td>
                <td class="actions"><button type="button" class="btn btn-sm" (click)="selected.set(event)">Details<span class="sr-only"> of {{ label(event.type) }} at {{ event.createdAt | date: 'medium' }}</span></button></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <nav class="pager" aria-label="Security event pages">
        <button type="button" class="btn" [disabled]="page() <= 1 || loading()" (click)="load(page() - 1)">Newer</button>
        <span>Page {{ page() }}</span>
        <button type="button" class="btn" [disabled]="!hasMore() || loading()" (click)="load(page() + 1)">Older</button>
      </nav>
    }

    <iha-modal [open]="!!selected()" title="Security event" (closed)="selected.set(null)">
      @if (selected(); as e) {
        <dl class="facts">
          <div><dt>Event</dt><dd>{{ label(e.type) }}</dd></div>
          <div><dt>Result</dt><dd>{{ label(e.result) }}</dd></div>
          <div><dt>When</dt><dd>{{ e.createdAt | date: 'full' }}</dd></div>
          <div><dt>Application</dt><dd>{{ surface(e.surface) }}</dd></div>
          <div><dt>Actor</dt><dd>{{ actor(e.actorType) }}{{ e.actorName ? ' — ' + e.actorName : '' }}</dd></div>
          <div><dt>Account</dt><dd>{{ e.subjectEmail || '—' }}</dd></div>
          <div><dt>Network (masked)</dt><dd>{{ e.ipMasked || '—' }}</dd></div>
          @for (entry of meta(e); track entry[0]) { <div><dt>{{ label(entry[0]) }}</dt><dd>{{ entry[1] }}</dd></div> }
        </dl>
      }
      <button modal-footer type="button" class="btn" (click)="selected.set(null)">Close</button>
    </iha-modal>
  `,
  styles: `
    .pager { display: flex; align-items: center; justify-content: center; gap: 1rem; margin-top: 1rem; }
    .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: 0.75rem 1.5rem; }
    dt { font-size: var(--ih-font-size-xs); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ih-text-secondary); }
    dd { overflow-wrap: anywhere; }
  `,
})
export class SecurityEventsComponent {
  private readonly api = inject(AdminApi);

  protected filter = { type: '', result: '', surface: '', actorType: '', subjectEmail: '', from: '', to: '' };
  protected readonly options = signal<SecurityEventList['filters']>({ type: [], result: [], surface: [], actorType: [] });
  protected readonly events = signal<SecurityEvent[]>([]);
  protected readonly page = signal(1);
  protected readonly hasMore = signal(false);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly filterError = signal('');
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly selected = signal<SecurityEvent | null>(null);

  protected readonly label = humanize;
  protected readonly badge = (result: string) => RESULT_BADGE[result] ?? 'badge badge-neutral';
  protected readonly surface = (code: string) => SURFACES[code] ?? humanize(code);
  protected readonly actor = (code: string) => ACTORS[code] ?? humanize(code);
  protected readonly meta = (event: SecurityEvent) => Object.entries(event.meta).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : String(value)] as const);

  constructor() {
    this.load(1);
  }

  protected clear(): void {
    this.filter = { type: '', result: '', surface: '', actorType: '', subjectEmail: '', from: '', to: '' };
    this.load(1);
  }

  protected load(page: number): void {
    this.loading.set(true);
    this.error.set('');
    this.filterError.set('');
    this.errors.set({});
    const { from, to, ...rest } = this.filter;
    // Whole local days: from the first instant of `from` to the last instant of `to`.
    const range = { from: from ? new Date(`${from}T00:00:00`).toISOString() : '', to: to ? new Date(`${to}T23:59:59.999`).toISOString() : '' };
    this.api.get<SecurityEventList>('/security-events', { page, ...rest, subjectEmail: rest.subjectEmail.trim(), ...range }).subscribe({
      next: (list) => {
        this.events.set(list.items);
        this.options.set(list.filters);
        this.page.set(list.page);
        this.hasMore.set(list.hasMore);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        // A refused filter is the admin's to correct; anything else is a failed load.
        if (err?.status === 422) {
          this.errors.set(apiFieldErrors(err));
          this.filterError.set(apiErrorMessage(err, 'Check the filters and try again.'));
        } else {
          this.error.set(apiErrorMessage(err, 'Please try again.'));
        }
      },
    });
  }
}
